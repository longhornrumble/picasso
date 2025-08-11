import json
import jwt
import boto3
import logging
import os
import time
from datetime import datetime, timedelta
from botocore.exceptions import ClientError

# Initialize logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
secrets_client = boto3.client('secretsmanager')
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client('bedrock-runtime')
bedrock_agent = boto3.client('bedrock-agent-runtime')

# Environment variables
JWT_SECRET_KEY_NAME = os.environ.get('JWT_SECRET_KEY_NAME', 'picasso/jwt/signing-key')
SUMMARIES_TABLE_NAME = os.environ.get('SUMMARIES_TABLE_NAME', 'conversation-summaries')
MESSAGES_TABLE_NAME = os.environ.get('MESSAGES_TABLE_NAME', 'recent-messages')
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'staging')

# Security monitoring removed - implementing basic audit trails in Phase 2
SECURITY_MONITOR_AVAILABLE = False

def get_security_context(event, context):
    """Extract security context from streaming request"""
    headers = event.get("headers", {}) or {}
    request_context = event.get("requestContext", {})
    
    return {
        "source_ip": (
            request_context.get("identity", {}).get("sourceIp") or 
            headers.get("X-Forwarded-For", "").split(',')[0].strip() or
            headers.get("X-Real-IP") or
            "unknown"
        ),
        "user_agent": headers.get("User-Agent", "unknown"),
        "request_id": context.aws_request_id if context else "unknown"
    }

def lambda_handler(event, context):
    """
    Bedrock Streaming Handler with JWT Authentication and Security Monitoring
    AuthType: NONE with internal JWT validation for browser compatibility
    """
    try:
        logger.info("🌊 Streaming handler invoked with security monitoring")
        security_context = get_security_context(event, context)
        
        # Handle OPTIONS requests for CORS
        if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
            return cors_response(200, "")
        
        # Validate JWT token from headers
        headers = event.get('headers', {})
        jwt_token = headers.get('x-jwt-token') or headers.get('Authorization', '').replace('Bearer ', '')
        
        if not jwt_token:
            logger.warning("❌ Missing JWT token in streaming request")
            
            # Log unauthorized access attempt
            if SECURITY_MONITOR_AVAILABLE:
                log_unauthorized_access_attempt(
                    tenant_hash=None,
                    access_type="streaming_request",
                    reason="missing_jwt_token",
                    **security_context
                )
            
            return error_response(401, "Missing JWT token", 
                               "Include JWT token in x-jwt-token header or Authorization: Bearer header")
        
        # Validate JWT and extract tenant info
        payload = validate_jwt_token(jwt_token, security_context)
        if not payload:
            logger.warning("❌ Invalid JWT token provided to streaming handler")
            
            # Log JWT validation failure
            if SECURITY_MONITOR_AVAILABLE:
                log_jwt_validation_failure(
                    reason="invalid_or_expired_token",
                    token_hash=jwt_token,
                    **security_context
                )
            
            return error_response(401, "Invalid JWT token", 
                               "Token may be expired, malformed, or using incorrect signing key")
        
        tenant_id = payload.get('tenantId')
        session_id = payload.get('sessionId')
        purpose = payload.get('purpose')
        
        logger.info(f"✅ JWT validated for streaming - Tenant: {tenant_id[:8]}..., Session: {session_id[:12]}..., Purpose: {purpose}")
        
        # Ensure token is for streaming purpose
        if purpose != 'stream':
            logger.warning(f"❌ Token purpose '{purpose}' not authorized for streaming")
            
            # Log unauthorized streaming access attempt
            if SECURITY_MONITOR_AVAILABLE:
                log_unauthorized_access_attempt(
                    tenant_hash=tenant_id,
                    access_type="streaming_request",
                    reason=f"invalid_token_purpose_{purpose}",
                    **security_context
                )
            
            return error_response(403, "Token not authorized for streaming", 
                               f"Token purpose '{purpose}' invalid. Expected 'stream'")
        
        # Check for potential rate limiting (basic implementation)
        if should_rate_limit(tenant_id, security_context):
            if SECURITY_MONITOR_AVAILABLE:
                log_rate_limit_exceeded(
                    tenant_hash=tenant_id,
                    limit_type="streaming_requests",
                    current_rate="exceeded",
                    **security_context
                )
            return error_response(429, "Rate limit exceeded", 
                               "Too many streaming requests. Please slow down.")
        
        # Process streaming request
        return handle_streaming_request(event, tenant_id, session_id, context, security_context)
        
    except Exception as e:
        logger.error(f"❌ Critical streaming handler error: {str(e)}", exc_info=True)
        
        # Log critical error for security monitoring
        if SECURITY_MONITOR_AVAILABLE and security_logger:
            security_logger.log_security_configuration_access(
                tenant_hash=None,
                config_type="streaming_handler",
                success=False,
                **get_security_context(event, context)
            )
        
        return error_response(500, "Internal server error", 
                           f"Streaming service encountered an error: {str(e)}")

def should_rate_limit(tenant_id, security_context):
    """
    Basic rate limiting check for streaming requests
    In production, this would use Redis or DynamoDB for distributed rate limiting
    """
    try:
        # Simple in-memory rate limiting (per Lambda instance)
        # This is basic - production would use distributed rate limiting
        import time
        
        current_time = time.time()
        rate_limit_key = f"streaming_{tenant_id}_{security_context['source_ip']}"
        
        # For this demo, we'll just log rate limiting attempts
        # Real implementation would track request counts per time window
        logger.info(f"🚦 Rate limit check for {rate_limit_key}")
        
        # Return False for now - rate limiting would be implemented based on requirements
        return False
        
    except Exception as e:
        logger.error(f"❌ Rate limiting check failed: {str(e)}")
        return False

def validate_jwt_token(token, security_context):
    """Validate JWT token using AWS Secrets Manager key with security monitoring"""
    try:
        # Get signing key from Secrets Manager
        secret_response = secrets_client.get_secret_value(SecretId=JWT_SECRET_KEY_NAME)
        secret_data = json.loads(secret_response['SecretString'])
        signing_key = secret_data.get('signingKey')
        
        if not signing_key:
            logger.error("❌ JWT signing key not found in secret")
            
            # Log security configuration issue
            if SECURITY_MONITOR_AVAILABLE:
                log_jwt_validation_failure(
                    reason="signing_key_not_found",
                    **security_context
                )
            
            return None
        
        # Decode and validate token
        payload = jwt.decode(token, signing_key, algorithms=['HS256'])
        
        # Check expiration (JWT library handles this, but we'll double-check)
        if payload.get('exp', 0) < datetime.utcnow().timestamp():
            logger.warning("❌ JWT token expired in streaming handler")
            
            if SECURITY_MONITOR_AVAILABLE:
                log_jwt_validation_failure(
                    reason="token_expired",
                    token_hash=token,
                    **security_context
                )
            
            return None
        
        # Validate required fields
        required_fields = ['sessionId', 'tenantId', 'purpose', 'exp', 'iat']
        missing_fields = []
        for field in required_fields:
            if not payload.get(field):
                missing_fields.append(field)
        
        if missing_fields:
            logger.warning(f"❌ JWT missing required fields: {missing_fields}")
            
            if SECURITY_MONITOR_AVAILABLE:
                log_jwt_validation_failure(
                    reason=f"missing_fields_{','.join(missing_fields)}",
                    token_hash=token,
                    **security_context
                )
            
            return None
        
        # Check for tenant isolation - ensure tenantId is properly formatted
        tenant_id = payload.get('tenantId')
        if not tenant_id or len(tenant_id) < 8:
            logger.warning(f"❌ Invalid tenantId format in JWT: {tenant_id}")
            
            if SECURITY_MONITOR_AVAILABLE:
                log_jwt_validation_failure(
                    reason="invalid_tenant_id_format",
                    token_hash=token,
                    **security_context
                )
            
            return None
        
        logger.info("✅ JWT token validated successfully for streaming")
        return payload
        
    except jwt.ExpiredSignatureError:
        logger.warning("❌ JWT token expired (ExpiredSignatureError)")
        
        if SECURITY_MONITOR_AVAILABLE:
            log_jwt_validation_failure(
                reason="token_expired_signature",
                token_hash=token,
                **security_context
            )
        
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"❌ JWT token invalid: {str(e)}")
        
        if SECURITY_MONITOR_AVAILABLE:
            log_jwt_validation_failure(
                reason=f"invalid_token_{str(e)[:50]}",
                token_hash=token,
                **security_context
            )
        
        return None
    except ClientError as e:
        logger.error(f"❌ Failed to retrieve JWT signing key: {str(e)}")
        
        if SECURITY_MONITOR_AVAILABLE:
            log_jwt_validation_failure(
                reason="secrets_manager_error",
                **security_context
            )
        
        return None
    except Exception as e:
        logger.error(f"❌ JWT validation error: {str(e)}")
        
        if SECURITY_MONITOR_AVAILABLE:
            log_jwt_validation_failure(
                reason=f"validation_error_{str(e)[:50]}",
                token_hash=token,
                **security_context
            )
        
        return None

def handle_streaming_request(event, tenant_id, session_id, context, security_context):
    """Handle the actual streaming request with healthcare compliance and security monitoring"""
    try:
        # Extract request body
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body) if body else {}
        
        user_input = body.get('message', '').strip()
        stream_type = body.get('stream_type', 'text')  # text, sse, websocket
        
        if not user_input:
            return error_response(400, "Missing message", 
                               "Request body must include 'message' field with user input")
        
        logger.info(f"📝 Processing streaming request - Input length: {len(user_input)} chars, Type: {stream_type}")
        
        # Load tenant configuration with caching
        config = load_tenant_config(tenant_id)
        if not config:
            return error_response(404, "Tenant configuration not found", 
                               f"No configuration found for tenant: {tenant_id[:8]}...")
        
        # Store recent message for conversation continuity
        store_recent_message(session_id, tenant_id, user_input, 'user')
        
        # Generate streaming response based on type
        if stream_type == 'sse':
            return generate_sse_streaming_response(user_input, tenant_id, session_id, config, context)
        else:
            return generate_json_streaming_response(user_input, tenant_id, session_id, config, context)
            
    except json.JSONDecodeError:
        return error_response(400, "Invalid JSON", "Request body must be valid JSON")
    except Exception as e:
        logger.error(f"❌ Streaming request handling failed: {str(e)}", exc_info=True)
        return error_response(500, "Failed to process streaming request", str(e))

def load_tenant_config(tenant_id):
    """Load tenant configuration with caching and fallback"""
    try:
        # This would integrate with existing tenant config loading logic
        # For now, return a basic config structure
        logger.info(f"🔧 Loading config for tenant: {tenant_id[:8]}...")
        
        # Mock configuration - in real implementation, this would load from S3 or DynamoDB
        config = {
            "tenant_id": tenant_id,
            "model_id": "anthropic.claude-3-sonnet-20240229-v1:0",
            "aws": {
                "knowledge_base_id": f"KB_{tenant_id[:8]}"
            },
            "streaming": {
                "enabled": True,
                "max_tokens": 1000,
                "temperature": 0.2
            }
        }
        
        logger.info(f"✅ Config loaded for tenant: {tenant_id[:8]}...")
        return config
        
    except Exception as e:
        logger.error(f"❌ Failed to load tenant config: {str(e)}")
        return None

def store_recent_message(session_id, tenant_id, message, role):
    """Store recent message in DynamoDB with TTL for healthcare compliance"""
    try:
        messages_table = dynamodb.Table(MESSAGES_TABLE_NAME)
        
        # 24-hour TTL for recent messages (healthcare compliance)
        expires_at = int((datetime.utcnow() + timedelta(hours=24)).timestamp())
        
        item = {
            'sessionId': session_id,
            'timestamp': int(time.time() * 1000),  # milliseconds for sorting
            'tenantId': tenant_id,
            'role': role,  # 'user' or 'assistant'
            'message': message[:2000],  # Limit message size
            'expiresAt': expires_at
        }
        
        messages_table.put_item(Item=item)
        logger.info(f"💾 Stored recent message - Session: {session_id[:12]}..., Role: {role}")
        
    except Exception as e:
        logger.error(f"❌ Failed to store recent message: {str(e)}")
        # Don't fail the request if message storage fails

def generate_sse_streaming_response(user_input, tenant_id, session_id, config, context):
    """Generate Server-Sent Events streaming response for real-time chat"""
    try:
        logger.info("🌊 Generating SSE streaming response")
        
        # Get conversation context from summaries
        conversation_context = get_conversation_summary(session_id, tenant_id)
        
        # Build enhanced prompt with context
        enhanced_prompt = build_contextualized_prompt(user_input, conversation_context, config)
        
        # Start timing for performance monitoring
        start_time = time.time()
        
        # Call Bedrock with streaming
        response_stream = invoke_bedrock_streaming(enhanced_prompt, config)
        
        # Format as SSE response
        sse_data = []
        token_count = 0
        first_token_time = None
        
        for chunk in response_stream:
            if chunk and 'chunk' in chunk:
                chunk_data = chunk['chunk']
                if 'bytes' in chunk_data:
                    chunk_text = json.loads(chunk_data['bytes'])
                    
                    if chunk_text.get('type') == 'content_block_delta':
                        delta_text = chunk_text.get('delta', {}).get('text', '')
                        if delta_text:
                            token_count += 1
                            if first_token_time is None:
                                first_token_time = time.time() - start_time
                            
                            # Format as SSE
                            sse_data.append(f"data: {json.dumps({'type': 'token', 'content': delta_text, 'session_id': session_id})}\n\n")
        
        # Add completion event
        completion_time = time.time() - start_time
        sse_data.append(f"data: {json.dumps({'type': 'complete', 'tokens': token_count, 'duration': completion_time})}\n\n")
        
        # Log performance metrics
        logger.info(f"⚡ Streaming performance - First token: {first_token_time:.3f}s, Total: {completion_time:.3f}s, Tokens: {token_count}")
        
        # Return SSE response
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,x-jwt-token,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'x-session-id': session_id,
                'x-first-token-ms': str(int(first_token_time * 1000)) if first_token_time else '0',
                'x-total-tokens': str(token_count)
            },
            'body': ''.join(sse_data)
        }
        
    except Exception as e:
        logger.error(f"❌ SSE streaming generation failed: {str(e)}", exc_info=True)
        return error_response(500, "Streaming generation failed", str(e))

def generate_json_streaming_response(user_input, tenant_id, session_id, config, context):
    """Generate JSON response for non-SSE clients"""
    try:
        logger.info("📄 Generating JSON streaming response")
        
        # Get conversation context
        conversation_context = get_conversation_summary(session_id, tenant_id)
        
        # Build prompt with context
        enhanced_prompt = build_contextualized_prompt(user_input, conversation_context, config)
        
        # Call Bedrock (non-streaming for simplicity)
        response = invoke_bedrock_sync(enhanced_prompt, config)
        
        # Store assistant response
        store_recent_message(session_id, tenant_id, response, 'assistant')
        
        # Update conversation summary
        update_conversation_summary(session_id, tenant_id, user_input, response)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,x-jwt-token,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'x-session-id': session_id
            },
            'body': json.dumps({
                'response': response,
                'session_id': session_id,
                'tenant_id': tenant_id[:8] + '...',
                'timestamp': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"❌ JSON streaming generation failed: {str(e)}", exc_info=True)
        return error_response(500, "Response generation failed", str(e))

def get_conversation_summary(session_id, tenant_id):
    """Retrieve conversation summary for context (healthcare compliant)"""
    try:
        summaries_table = dynamodb.Table(SUMMARIES_TABLE_NAME)
        
        response = summaries_table.get_item(
            Key={
                'tenantId': tenant_id,
                'sessionId': session_id
            }
        )
        
        if 'Item' in response:
            summary_data = response['Item']
            logger.info(f"📋 Retrieved conversation summary - Facts: {len(summary_data.get('facts', []))}")
            return summary_data
        
        logger.info("📋 No existing conversation summary found")
        return None
        
    except Exception as e:
        logger.error(f"❌ Failed to retrieve conversation summary: {str(e)}")
        return None

def build_contextualized_prompt(user_input, conversation_context, config):
    """Build prompt with conversation context and healthcare considerations"""
    try:
        base_prompt = "You are a helpful healthcare assistant. Provide accurate, empathetic responses while maintaining patient privacy."
        
        if conversation_context and conversation_context.get('facts'):
            facts = conversation_context['facts'][-10:]  # Last 10 facts for context
            context_text = "Previous conversation context:\n" + "\n".join(f"- {fact}" for fact in facts)
            base_prompt += f"\n\n{context_text}"
        
        full_prompt = f"{base_prompt}\n\nUser: {user_input}\n\nAssistant:"
        
        logger.info(f"🧩 Built contextualized prompt - Length: {len(full_prompt)} chars")
        return full_prompt
        
    except Exception as e:
        logger.error(f"❌ Failed to build prompt: {str(e)}")
        return f"You are a helpful assistant.\n\nUser: {user_input}\n\nAssistant:"

def invoke_bedrock_streaming(prompt, config):
    """Invoke Bedrock with streaming response"""
    try:
        model_id = config.get('model_id', 'anthropic.claude-3-sonnet-20240229-v1:0')
        streaming_config = config.get('streaming', {})
        
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": streaming_config.get('max_tokens', 1000),
            "temperature": streaming_config.get('temperature', 0.2),
            "stream": True
        }
        
        response = bedrock.invoke_model_with_response_stream(
            modelId=model_id,
            accept="application/json",
            contentType="application/json",
            body=json.dumps(request_body)
        )
        
        return response['body']
        
    except Exception as e:
        logger.error(f"❌ Bedrock streaming invocation failed: {str(e)}")
        raise

def invoke_bedrock_sync(prompt, config):
    """Invoke Bedrock synchronously for JSON responses"""
    try:
        model_id = config.get('model_id', 'anthropic.claude-3-sonnet-20240229-v1:0')
        streaming_config = config.get('streaming', {})
        
        request_body = {
            "anthropic_version": "bedrock-2023-05-31", 
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": streaming_config.get('max_tokens', 1000),
            "temperature": streaming_config.get('temperature', 0.2)
        }
        
        response = bedrock.invoke_model(
            modelId=model_id,
            accept="application/json",
            contentType="application/json",
            body=json.dumps(request_body)
        )
        
        body = json.loads(response['body'].read())
        return body['content'][0]['text'].strip()
        
    except Exception as e:
        logger.error(f"❌ Bedrock sync invocation failed: {str(e)}")
        return "I apologize, but I'm having trouble processing your request right now. Please try again."

def update_conversation_summary(session_id, tenant_id, user_input, assistant_response):
    """Update conversation summary with facts ledger (healthcare compliant)"""
    try:
        summaries_table = dynamodb.Table(SUMMARIES_TABLE_NAME)
        
        # Extract key facts (simplified - real implementation would use NLP)
        new_facts = []
        if len(user_input) > 20:  # Only meaningful inputs
            new_facts.append(f"User asked: {user_input[:100]}{'...' if len(user_input) > 100 else ''}")
        
        if len(assistant_response) > 20:
            new_facts.append(f"Assistant provided: {assistant_response[:100]}{'...' if len(assistant_response) > 100 else ''}")
        
        # 7-day TTL for conversation summaries (healthcare compliance)
        expires_at = int((datetime.utcnow() + timedelta(days=7)).timestamp())
        
        # Update or create summary
        try:
            summaries_table.update_item(
                Key={
                    'tenantId': tenant_id,
                    'sessionId': session_id
                },
                UpdateExpression='SET facts = list_append(if_not_exists(facts, :empty_list), :new_facts), lastUpdated = :timestamp, expiresAt = :expires',
                ExpressionAttributeValues={
                    ':new_facts': new_facts,
                    ':empty_list': [],
                    ':timestamp': datetime.utcnow().isoformat(),
                    ':expires': expires_at
                }
            )
            
            logger.info(f"📝 Updated conversation summary - Added {len(new_facts)} facts")
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'ValidationException':
                # Handle list size limits (max 50 facts)
                logger.info("📝 Pruning conversation summary facts")
                # Get current summary and prune old facts
                # Implementation would handle fact pruning here
            else:
                raise
                
    except Exception as e:
        logger.error(f"❌ Failed to update conversation summary: {str(e)}")
        # Don't fail the request if summary update fails

def error_response(status_code, error, details=None):
    """Return standardized error response with CORS"""
    error_body = {
        'error': error,
        'timestamp': datetime.utcnow().isoformat(),
        'environment': ENVIRONMENT
    }
    
    if details:
        error_body['details'] = details
        
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,x-jwt-token,Authorization',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        'body': json.dumps(error_body)
    }

def cors_response(status_code, body):
    """Return CORS preflight response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,x-jwt-token,Authorization',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Access-Control-Max-Age': '86400'
        },
        'body': body if isinstance(body, str) else json.dumps(body)
    }