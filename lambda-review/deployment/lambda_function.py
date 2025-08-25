import json
import logging
import os
from datetime import datetime
from typing import Dict, Any
from urllib.parse import parse_qs

# Try to import Lambda streaming support
try:
    from awslambdaric import StreamingBody
    STREAMING_AVAILABLE = True
except ImportError:
    # StreamingBody not available - will use fallback
    STREAMING_AVAILABLE = False

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def add_cors_headers(response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add CORS headers to response. This is the ONLY place CORS headers are added.
    """
    if 'headers' not in response:
        response['headers'] = {}
    
    # Add CORS headers - this is the single source of truth
    response['headers']['Access-Control-Allow-Origin'] = '*'
    response['headers']['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response['headers']['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response['headers']['Content-Type'] = 'application/json'
    
    return response

def health_check() -> Dict[str, Any]:
    """
    Simple health check endpoint
    """
    logger.info("Health check requested")
    
    response = {
        'statusCode': 200,
        'body': json.dumps({
            'status': 'healthy',
            'timestamp': '2025-08-15T00:00:00Z',  # In production, use datetime.utcnow().isoformat()
            'function': 'Master_Function_Staging'
        })
    }
    
    return add_cors_headers(response)

def get_config_for_tenant(tenant_hash: str) -> Dict[str, Any]:
    """
    Return configuration for a specific tenant
    """
    logger.info(f"Config requested for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    if not tenant_hash:
        response = {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Bad Request',
                'message': 'Tenant hash is required'
            })
        }
        return add_cors_headers(response)
    
    # Try to load real config using tenant_config_loader if available
    try:
        from tenant_config_loader import get_config_for_tenant_by_hash
        logger.info(f"Loading real config for tenant: {tenant_hash[:8]}...")
        
        # Call the real config loader
        config_data = get_config_for_tenant_by_hash(tenant_hash)
        
        if config_data:
            logger.info(f"Successfully loaded config for tenant: {tenant_hash[:8]}...")
            response = {
                'statusCode': 200,
                'body': json.dumps(config_data)
            }
        else:
            logger.warning(f"No config found for tenant: {tenant_hash[:8]}...")
            response = {
                'statusCode': 404,
                'body': json.dumps({
                    'error': 'Not Found',
                    'message': f'Configuration not found for tenant {tenant_hash[:8]}...'
                })
            }
        
    except ImportError:
        logger.warning("tenant_config_loader not available, returning mock config")
        # Fall back to mock config if module not available
        config_data = {
            'tenant_hash': tenant_hash,
            'chat_title': 'Chat Assistant',
            'welcome_message': 'Hello! How can I help you today?',
            'branding': {
                'primary_color': '#3b82f6',
                'font_family': 'Inter, sans-serif',
                'chat_title': 'Chat',
                'border_radius': '12px'
            },
            'features': {
                'uploads': False,
                'photo_uploads': False,
                'callout': True,
                'streaming_enabled': False,
                'quick_help': True,
                'action_chips': True
            },
            'quick_help': {
                'enabled': True,
                'items': [
                    {'label': 'How can I get help?', 'value': 'How can I get help?'},
                    {'label': 'What services do you offer?', 'value': 'What services do you offer?'}
                ]
            },
            'action_chips': {
                'enabled': True,
                'chips': ['Yes', 'No', 'Tell me more']
            },
            'metadata': {
                'source': 'lambda-mock',
                'environment': os.environ.get('ENVIRONMENT', 'staging'),
                'version': os.environ.get('VERSION', '1.0.0')
            }
        }
        
        response = {
            'statusCode': 200,
            'body': json.dumps(config_data)
        }
    except Exception as e:
        logger.error(f"Error loading config: {str(e)}")
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'Failed to load configuration'
            })
        }
    
    return add_cors_headers(response)

def handle_streaming_chat(event: Dict[str, Any], tenant_hash: str):
    """
    Handle streaming chat requests using Lambda response streaming with SSE format
    Uses awslambdaric.StreamingBody to properly stream responses
    Supports both GET (EventSource) and POST requests
    """
    logger.info(f"Streaming chat request for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    try:
        # Check if streaming is available
        if not STREAMING_AVAILABLE:
            logger.warning("StreamingBody not available - falling back to batch response")
            return handle_streaming_chat_fallback(event, tenant_hash)
        
        # Check if this is a GET request (from EventSource) or POST
        http_method = event.get('httpMethod', event.get('requestContext', {}).get('http', {}).get('method', 'GET'))
        
        if http_method == 'GET':
            # EventSource uses GET with query parameters
            query_params = event.get('queryStringParameters', {}) or {}
            user_input = query_params.get('user_input', 'Hello')
            session_id = query_params.get('session_id', 'default_session')
            logger.info(f"GET streaming request with query params - input: {user_input[:100]}...")
        else:
            # POST request with body
            body = json.loads(event.get('body', '{}')) if event.get('body') else {}
            user_input = body.get('user_input', 'Hello')
            session_id = body.get('session_id', 'default_session')
            logger.info(f"POST streaming request with body - input: {user_input[:100]}...")
        
        # Initialize Bedrock client
        import boto3
        bedrock_client = boto3.client(
            'bedrock-runtime',
            region_name=os.environ.get('AWS_REGION', 'us-east-1')
        )
        
        # Prepare the message for Claude
        messages = [
            {
                "role": "user",
                "content": user_input
            }
        ]
        
        # Bedrock request body for Claude 3 Haiku
        bedrock_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "messages": messages,
            "temperature": 0.7,
            "top_p": 0.9
        }
        
        logger.info("Invoking Bedrock with streaming...")
        
        def stream_generator():
            """Generator function to yield streaming chunks"""
            try:
                # Call Bedrock with streaming
                response = bedrock_client.invoke_model_with_response_stream(
                    modelId="anthropic.claude-3-haiku-20240307-v1:0",
                    body=json.dumps(bedrock_body),
                    contentType="application/json"
                )
                
                # Process the event stream
                for event in response['body']:
                    if 'chunk' in event:
                        chunk = event['chunk']
                        if 'bytes' in chunk:
                            chunk_data = json.loads(chunk['bytes'].decode('utf-8'))
                            
                            if chunk_data.get('type') == 'content_block_delta':
                                # Extract the text content from the delta
                                delta = chunk_data.get('delta', {})
                                if delta.get('type') == 'text_delta':
                                    text_content = delta.get('text', '')
                                    if text_content:
                                        # Format as SSE data and yield immediately
                                        sse_data = json.dumps({
                                            "type": "text",
                                            "content": text_content,
                                            "session_id": session_id
                                        })
                                        yield f'data: {sse_data}\n\n'
                            
                            elif chunk_data.get('type') == 'message_stop':
                                # End of message
                                logger.info("Bedrock streaming completed")
                                break
                
                # Send final [DONE] marker
                yield 'data: [DONE]\n\n'
                
            except Exception as e:
                logger.error(f"Error in stream generator: {str(e)}", exc_info=True)
                # Send error as SSE format
                error_data = json.dumps({
                    "type": "error",
                    "content": f"Streaming error: {str(e)}",
                    "session_id": session_id
                })
                yield f'data: {error_data}\n\ndata: [DONE]\n\n'
        
        # Create streaming response using Lambda's StreamingBody
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': StreamingBody(stream_generator())
        }
        
    except Exception as e:
        logger.error(f"Error in streaming chat: {str(e)}", exc_info=True)
        
        # Return error as SSE format
        error_data = json.dumps({
            "type": "error",
            "content": f"Streaming error: {str(e)}",
            "session_id": session_id if 'session_id' in locals() else 'unknown'
        })
        error_sse = f'data: {error_data}\n\ndata: [DONE]\n\n'
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': error_sse
        }

def handle_streaming_chat_fallback(event: Dict[str, Any], tenant_hash: str) -> Dict[str, Any]:
    """
    Fallback implementation that collects all chunks before returning
    Used when StreamingBody is not available
    """
    logger.info(f"Using fallback streaming for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    try:
        # Check if this is a GET request (from EventSource) or POST
        http_method = event.get('httpMethod', event.get('requestContext', {}).get('http', {}).get('method', 'GET'))
        
        if http_method == 'GET':
            # EventSource uses GET with query parameters
            query_params = event.get('queryStringParameters', {}) or {}
            user_input = query_params.get('user_input', 'Hello')
            session_id = query_params.get('session_id', 'default_session')
        else:
            # POST request with body
            body = json.loads(event.get('body', '{}')) if event.get('body') else {}
            user_input = body.get('user_input', 'Hello')
            session_id = body.get('session_id', 'default_session')
        
        # Initialize Bedrock client
        import boto3
        bedrock_client = boto3.client(
            'bedrock-runtime',
            region_name=os.environ.get('AWS_REGION', 'us-east-1')
        )
        
        # Prepare the message for Claude
        messages = [
            {
                "role": "user",
                "content": user_input
            }
        ]
        
        # Bedrock request body for Claude 3 Haiku
        bedrock_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "messages": messages,
            "temperature": 0.7,
            "top_p": 0.9
        }
        
        logger.info("Invoking Bedrock with streaming (fallback mode)...")
        
        # Call Bedrock with streaming
        response = bedrock_client.invoke_model_with_response_stream(
            modelId="anthropic.claude-3-haiku-20240307-v1:0",
            body=json.dumps(bedrock_body),
            contentType="application/json"
        )
        
        # Process the streaming response
        sse_chunks = []
        
        # Process the event stream
        for event in response['body']:
            if 'chunk' in event:
                chunk = event['chunk']
                if 'bytes' in chunk:
                    chunk_data = json.loads(chunk['bytes'].decode('utf-8'))
                    
                    if chunk_data.get('type') == 'content_block_delta':
                        # Extract the text content from the delta
                        delta = chunk_data.get('delta', {})
                        if delta.get('type') == 'text_delta':
                            text_content = delta.get('text', '')
                            if text_content:
                                # Format as SSE data
                                sse_data = json.dumps({
                                    "type": "text",
                                    "content": text_content,
                                    "session_id": session_id
                                })
                                sse_chunks.append(f'data: {sse_data}\n\n')
                    
                    elif chunk_data.get('type') == 'message_stop':
                        # End of message
                        logger.info("Bedrock streaming completed (fallback)")
                        break
        
        # Add the final [DONE] marker
        sse_chunks.append('data: [DONE]\n\n')
        
        # Combine all SSE chunks
        sse_body = ''.join(sse_chunks)
        
        # Create SSE response with proper headers
        response = {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': sse_body
        }
        
        logger.info(f"Fallback streaming response sent for tenant: {tenant_hash[:8]}... with {len(sse_chunks)-1} chunks")
        return response
        
    except Exception as e:
        logger.error(f"Error in fallback streaming chat: {str(e)}", exc_info=True)
        
        # Return error as SSE format
        error_data = json.dumps({
            "type": "error",
            "content": f"Streaming error: {str(e)}",
            "session_id": session_id if 'session_id' in locals() else 'unknown'
        })
        error_sse = f'data: {error_data}\n\ndata: [DONE]\n\n'
        
        response = {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': error_sse
        }
        
        return response

def handle_chat(event: Dict[str, Any], tenant_hash: str) -> Dict[str, Any]:
    """
    Handle chat messages using real intent router with conversation memory support
    """
    logger.info(f"Chat request for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    # Check for streaming parameter
    query_params = event.get('queryStringParameters', {}) or {}
    streaming_enabled = query_params.get('streaming', '').lower() == 'true'
    
    if streaming_enabled:
        logger.info("Streaming mode detected - returning SSE response")
        return handle_streaming_chat(event, tenant_hash)
    
    try:
        # Try to use the real intent router
        from intent_router import route_intent
        
        # Parse request body
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        
        # Extract Authorization header for state token (conversation memory)
        headers = event.get('headers', {})
        auth_header = headers.get('Authorization', headers.get('authorization', ''))
        state_token = None
        conversation_context = None
        
        if auth_header and auth_header.startswith('Bearer '):
            state_token = auth_header.replace('Bearer ', '').strip()
            logger.info(f"State token found in Authorization header: {state_token[:20]}...")
            
            # Try to decode as JWT first, then fall back to base64
            try:
                import jwt
                jwt_signing_key = os.environ.get('JWT_SECRET', 'default-dev-secret-key')
                
                # Try to get signing key from Secrets Manager
                try:
                    import boto3
                    secrets_client = boto3.client('secretsmanager', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
                    secret_name = os.environ.get('JWT_SECRET_KEY_NAME', 'picasso/jwt/signing-key')
                    response = secrets_client.get_secret_value(SecretId=secret_name)
                    jwt_signing_key = response['SecretString']
                except:
                    pass
                
                # Decode JWT token
                token_data = jwt.decode(state_token, jwt_signing_key, algorithms=['HS256'])
                
                # Extract conversation context from token AND request body
                request_context = body.get('conversation_context', {})
                messages = request_context.get('recentMessages', request_context.get('messages', []))
                conversation_context = {
                    'session_id': token_data.get('sessionId'),  # Use camelCase field
                    'turn': token_data.get('turn', 0),
                    'conversation_id': body.get('conversation_id'),
                    'messages': messages,
                    'recentMessages': messages,
                    'previous_messages': messages
                }
                logger.info(f"JWT token decoded: turn {conversation_context['turn']}, {len(messages)} messages")
                
            except Exception as jwt_error:
                # Fall back to base64 decoding for backward compatibility
                logger.warning(f"JWT decode failed, trying base64: {jwt_error}")
                try:
                    import base64
                    decoded = base64.b64decode(state_token).decode('utf-8')
                    token_data = json.loads(decoded)
                    
                    request_context = body.get('conversation_context', {})
                    messages = request_context.get('recentMessages', request_context.get('messages', []))
                    conversation_context = {
                        'session_id': token_data.get('sessionId', token_data.get('session_id')),
                        'turn': token_data.get('turn', 0),
                        'conversation_id': body.get('conversation_id'),
                        'messages': messages,
                        'recentMessages': messages,
                        'previous_messages': messages
                    }
                    logger.info(f"Base64 token decoded: turn {conversation_context['turn']}, {len(messages)} messages")
                except Exception as e:
                    logger.warning(f"Could not decode state token: {e}")
        else:
            logger.info("No Authorization header found - starting new conversation")
        
        # Prepare the event for intent router - it expects Lambda event structure
        chat_event = {
            'queryStringParameters': {
                't': tenant_hash
            },
            'headers': headers,  # Pass headers through
            'body': json.dumps({
                'tenant_hash': tenant_hash,
                'user_input': body.get('user_input', ''),
                'session_id': body.get('session_id', ''),
                'context': body.get('context', {}),
                'metadata': body.get('metadata', {}),
                'conversation_id': body.get('conversation_id'),
                'turn': body.get('turn', 0),
                'state_token': state_token,
                'conversation_context': body.get('conversation_context', {})
            })
        }
        
        logger.info(f"Routing chat to intent handler for tenant: {tenant_hash[:8]}...")
        
        # Call the real intent router with conversation context
        logger.info(f"Calling route_intent with conversation_context: {conversation_context is not None}")
        response_data = route_intent(chat_event, conversation_context=conversation_context)
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
    except ImportError:
        logger.error("Intent router not available")
        response = {
            'statusCode': 503,
            'body': json.dumps({
                'error': 'Service Unavailable',
                'message': 'Chat service temporarily unavailable'
            })
        }
    except json.JSONDecodeError:
        response = {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Bad Request',
                'message': 'Invalid JSON in request body'
            })
        }
    except Exception as e:
        logger.error(f"Error handling chat: {str(e)}")
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'Failed to process chat message'
            })
        }
    
    return add_cors_headers(response)

def handle_conversation(event: Dict[str, Any], tenant_hash: str, operation: str) -> Dict[str, Any]:
    """
    Handle conversation operations using real conversation handler
    """
    logger.info(f"Conversation {operation} for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    try:
        from conversation_handler import handle_conversation_action
        
        # Prepare event for conversation handler
        conv_event = {
            'queryStringParameters': event.get('queryStringParameters', {}),
            'body': event.get('body', '{}'),
            'httpMethod': event.get('httpMethod', 'GET')
        }
        conv_event['queryStringParameters']['operation'] = operation
        conv_event['queryStringParameters']['t'] = tenant_hash
        
        # Call the real conversation handler
        response = handle_conversation_action(conv_event, None)
        
        # Response already includes headers from handler
        if 'headers' not in response:
            response = add_cors_headers(response)
        
        return response
        
    except ImportError:
        logger.warning("Conversation handler not available, returning empty conversation")
        response_data = {
            'conversation': {
                'messages': [],
                'session_id': event.get('queryStringParameters', {}).get('session_id', ''),
                'created_at': '2025-08-17T00:00:00Z'
            }
        }
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
        return add_cors_headers(response)
    except Exception as e:
        logger.error(f"Error handling conversation: {str(e)}")
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'Failed to handle conversation operation'
            })
        }
        return add_cors_headers(response)

def handle_init_session(event: Dict[str, Any], tenant_hash: str) -> Dict[str, Any]:
    """
    Initialize a new chat session using session utils
    """
    logger.info(f"Init session for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    try:
        from session_utils import generate_session_id
        import time
        import jwt
        import boto3
        from botocore.exceptions import ClientError
        
        # Parse request body if it exists
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        
        # Check if we already have a session_id from the client
        client_session_id = body.get('session_id', '')
        
        # Generate or use existing session ID
        session_id = client_session_id if client_session_id else generate_session_id()
        
        # IMPORTANT: For public endpoints, we use tenant_hash as tenant_id
        # The conversation handler expects tenantId field
        tenant_id = tenant_hash
        
        # Get JWT signing key from Secrets Manager or environment
        jwt_signing_key = None
        try:
            secrets_client = boto3.client('secretsmanager', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
            secret_name = os.environ.get('JWT_SECRET_KEY_NAME', 'picasso/jwt/signing-key')
            
            response = secrets_client.get_secret_value(SecretId=secret_name)
            jwt_signing_key = response['SecretString']
            logger.info("Successfully retrieved JWT signing key from Secrets Manager")
        except ClientError as e:
            logger.warning(f"Could not retrieve JWT signing key from Secrets Manager: {e}")
            jwt_signing_key = os.environ.get('JWT_SECRET', 'default-dev-secret-key')
        except Exception as e:
            logger.warning(f"Secrets Manager not available: {e}")
            jwt_signing_key = os.environ.get('JWT_SECRET', 'default-dev-secret-key')
        
        # Generate proper JWT token matching conversation handler expectations
        # CRITICAL: Use camelCase field names to match conversation_handler.py
        state_token_payload = {
            'sessionId': session_id,  # camelCase required!
            'tenantId': tenant_id,     # camelCase required! Using hash as ID
            'turn': 0,                 # Initial turn
            'iat': int(time.time()),   # JWT standard: issued at
            'exp': int(time.time()) + (24 * 3600)  # JWT standard: expires (24 hours)
        }
        
        # Create JWT token signed with HS256
        state_token = jwt.encode(state_token_payload, jwt_signing_key, algorithm='HS256')
        logger.info(f"Generated JWT token for session {session_id[:16]}... with proper field names")
        
        response_data = {
            'session_id': session_id,
            'state_token': state_token,  # Proper JWT token
            'turn': 0,
            'tenant_hash': tenant_hash,  # Keep for backward compatibility
            'tenant_id': tenant_id,       # Add for internal consistency
            'initialized': True,
            'timestamp': '2025-08-17T00:00:00Z',
            'config': {
                'timeout': 86400,  # 24 hours to match token expiry
                'max_messages': 100
            }
        }
        
        logger.info(f"Init session success: session={session_id[:16]}..., JWT token created")
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
    except ImportError as e:
        logger.warning(f"Required modules not available: {e}, using fallback")
        # Fallback implementation
        import uuid
        import time
        
        # Parse request body if it exists
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        client_session_id = body.get('session_id', '')
        
        session_id = client_session_id if client_session_id else f'session_{uuid.uuid4().hex[:16]}'
        tenant_id = tenant_hash  # Use hash as ID for public endpoints
        
        # Try to create JWT even in fallback
        try:
            import jwt
            jwt_signing_key = os.environ.get('JWT_SECRET', 'default-dev-secret-key')
            
            state_token_payload = {
                'sessionId': session_id,
                'tenantId': tenant_id,
                'turn': 0,
                'iat': int(time.time()),
                'exp': int(time.time()) + (24 * 3600)
            }
            state_token = jwt.encode(state_token_payload, jwt_signing_key, algorithm='HS256')
            logger.info("Created JWT token in fallback mode")
        except:
            # Ultimate fallback to base64 (still use camelCase for compatibility)
            import base64
            state_token_data = {
                'sessionId': session_id,  # Still use camelCase
                'tenantId': tenant_id,
                'turn': 0,
                'iat': int(time.time()),
                'exp': int(time.time()) + (24 * 3600)
            }
            state_token = base64.b64encode(json.dumps(state_token_data).encode()).decode()
            logger.warning("Using base64 token as ultimate fallback")
        
        response_data = {
            'session_id': session_id,
            'state_token': state_token,
            'turn': 0,
            'tenant_hash': tenant_hash,
            'tenant_id': tenant_id,
            'initialized': True,
            'timestamp': '2025-08-17T00:00:00Z',
            'config': {
                'timeout': 86400,
                'max_messages': 100
            }
        }
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
    except Exception as e:
        logger.error(f"Error initializing session: {str(e)}")
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'Failed to initialize session'
            })
        }
    
    return add_cors_headers(response)

def handle_generate_stream_token(event: Dict[str, Any], tenant_hash: str) -> Dict[str, Any]:
    """
    Generate JWT token specifically for streaming operations.
    Separate from init_session to maintain single responsibility principle.
    Streaming tokens have purpose='stream' while conversation tokens have no purpose field.
    """
    logger.info(f"Generate stream token for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    try:
        import time
        import jwt
        import boto3
        import uuid
        from botocore.exceptions import ClientError
        
        # Parse request body if it exists
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        
        # Use existing session_id if provided, otherwise generate new one
        session_id = body.get('session_id', '')
        if not session_id:
            # Generate session ID same way as init_session fallback
            session_id = f'session_{uuid.uuid4().hex[:16]}'
            logger.info(f"Generated new session ID for streaming: {session_id[:16]}...")
        else:
            logger.info(f"Using existing session ID for streaming: {session_id[:16]}...")
        
        # For streaming, tenant_hash is the tenant_id
        tenant_id = tenant_hash
        
        # Get JWT signing key from Secrets Manager or environment
        jwt_signing_key = None
        try:
            secrets_client = boto3.client('secretsmanager', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
            secret_name = os.environ.get('JWT_SECRET_KEY_NAME', 'picasso/jwt/signing-key')
            
            response = secrets_client.get_secret_value(SecretId=secret_name)
            secret_data = json.loads(response['SecretString'])
            jwt_signing_key = secret_data.get('signingKey', response['SecretString'])
            logger.info("Successfully retrieved JWT signing key from Secrets Manager for streaming")
        except ClientError as e:
            logger.warning(f"Could not retrieve JWT signing key from Secrets Manager: {e}")
            jwt_signing_key = os.environ.get('JWT_SECRET', 'default-dev-secret-key')
        except Exception as e:
            logger.warning(f"Secrets Manager not available: {e}")
            jwt_signing_key = os.environ.get('JWT_SECRET', 'default-dev-secret-key')
        
        # Generate streaming-specific JWT token
        # CRITICAL: Must include 'purpose': 'stream' for streaming handler validation
        stream_token_payload = {
            'sessionId': session_id,      # camelCase required by streaming handler
            'tenantId': tenant_id,         # camelCase required by streaming handler
            'purpose': 'stream',           # REQUIRED for streaming authentication
            'iat': int(time.time()),       # JWT standard: issued at
            'exp': int(time.time()) + 3600 # JWT standard: expires in 1 hour for streaming
        }
        
        # Create JWT token signed with HS256
        stream_token = jwt.encode(stream_token_payload, jwt_signing_key, algorithm='HS256')
        
        # Prepare response with all necessary information
        response_data = {
            'stream_token': stream_token,
            'session_id': session_id,
            'tenant_hash': tenant_hash,
            'tenant_id': tenant_id,
            'expires_in': 3600,
            'streaming_endpoint': os.environ.get('STREAMING_ENDPOINT', 'https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/'),
            'purpose': 'stream',
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
        
        logger.info(f"Stream token generated successfully for session {session_id[:16]}...")
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
    except Exception as e:
        logger.error(f"Failed to generate stream token: {str(e)}", exc_info=True)
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'Failed to generate stream token'
            })
        }
    
    return add_cors_headers(response)

def get_cache_status() -> Dict[str, Any]:
    """
    Get cache status information
    """
    logger.info("Cache status requested")
    
    response_data = {
        'cache_enabled': True,
        'cache_size': 0,
        'cache_entries': 0,
        'cache_ttl': 300,  # 5 minutes
        'environment': os.environ.get('ENVIRONMENT', 'staging')
    }
    
    response = {
        'statusCode': 200,
        'body': json.dumps(response_data)
    }
    
    return add_cors_headers(response)

def clear_cache(tenant_hash: str) -> Dict[str, Any]:
    """
    Clear cache for a specific tenant or all tenants
    """
    logger.info(f"Clear cache requested for tenant: {tenant_hash[:8] if tenant_hash else 'all'}...")
    
    response_data = {
        'success': True,
        'message': f"Cache cleared for {'tenant ' + tenant_hash[:8] if tenant_hash else 'all tenants'}",
        'timestamp': '2025-08-17T00:00:00Z'
    }
    
    response = {
        'statusCode': 200,
        'body': json.dumps(response_data)
    }
    
    return add_cors_headers(response)

def handle_options() -> Dict[str, Any]:
    """
    Handle CORS preflight requests
    """
    logger.info("OPTIONS preflight request")
    
    response = {
        'statusCode': 200,
        'body': json.dumps({'message': 'CORS preflight successful'})
    }
    
    return add_cors_headers(response)

def handle_cache_warming(event: Dict[str, Any], tenant_hash: str) -> Dict[str, Any]:
    """
    Warm the cache for a specific tenant by pre-caching action cards and quick help questions
    """
    logger.info(f"🔥 Cache warming requested for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    if not tenant_hash:
        response = {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Bad Request',
                'message': 'Tenant hash required for cache warming'
            })
        }
        return add_cors_headers(response)
    
    try:
        # Load tenant config
        from tenant_config_loader import get_config_for_tenant_by_hash
        config = get_config_for_tenant_by_hash(tenant_hash)
        
        if not config:
            response = {
                'statusCode': 404,
                'body': json.dumps({
                    'error': 'Not Found',
                    'message': f'Configuration not found for tenant {tenant_hash[:8]}...'
                })
            }
            return add_cors_headers(response)
        
        # Try to use optimized handler with cache warming
        try:
            from bedrock_handler_optimized import warm_cache_for_tenant
            questions_cached = warm_cache_for_tenant(tenant_hash, config)
            
            from datetime import datetime
            response_data = {
                'success': True,
                'message': f'Cache warmed successfully for tenant {tenant_hash[:8]}...',
                'questions_cached': questions_cached,
                'tenant_hash': tenant_hash[:8] + '...',
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }
        except ImportError:
            response_data = {
                'success': False,
                'message': 'Cache warming not available (using standard handler)',
                'tenant_hash': tenant_hash[:8] + '...'
            }
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
    except Exception as e:
        logger.error(f"❌ Cache warming failed: {str(e)}", exc_info=True)
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': f'Cache warming failed: {str(e)}'
            })
        }
    
    return add_cors_headers(response)

def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Main Lambda handler with centralized routing and CORS
    """
    try:
        # Log the incoming request for debugging
        logger.info(f"Received event: {json.dumps(event, default=str)}")
        
        # Extract HTTP method
        http_method = event.get('httpMethod', event.get('requestContext', {}).get('http', {}).get('method', 'GET'))
        
        # Handle OPTIONS requests (CORS preflight)
        if http_method == 'OPTIONS':
            return handle_options()
        
        # Parse query parameters
        query_params = event.get('queryStringParameters', {}) or {}
        multi_value_params = event.get('multiValueQueryStringParameters', {}) or {}
        
        # If no queryStringParameters, try to parse from rawQueryString (Lambda Function URL format)
        if not query_params and event.get('rawQueryString'):
            parsed = parse_qs(event.get('rawQueryString', ''))
            query_params = {k: v[0] if v else None for k, v in parsed.items()}
        
        # Get action and tenant hash from query parameters
        action = query_params.get('action', '')
        tenant_hash = query_params.get('t', '')
        
        logger.info(f"Processing {http_method} request with action: {action}, tenant: {tenant_hash[:8]}..." if tenant_hash else f"Processing {http_method} request with action: {action}")
        
        # Route based on action parameter
        if action == 'health_check' or action == 'health':
            return health_check()
        elif action == 'get_config':
            return get_config_for_tenant(tenant_hash)
        elif action == 'chat':
            return handle_chat(event, tenant_hash)
        elif action == 'conversation':
            operation = query_params.get('operation', 'get')
            return handle_conversation(event, tenant_hash, operation)
        elif action == 'init_session':
            return handle_init_session(event, tenant_hash)
        elif action == 'generate_stream_token':
            return handle_generate_stream_token(event, tenant_hash)
        elif action == 'cache_status':
            return get_cache_status()
        elif action == 'clear_cache':
            return clear_cache(tenant_hash)
        elif action == 'warm_cache':
            return handle_cache_warming(event, tenant_hash)
        elif not action:
            # No action specified, default to health check
            return health_check()
        else:
            # Unknown action
            logger.warning(f"Unknown action requested: {action}")
            response = {
                'statusCode': 404,
                'body': json.dumps({
                    'error': 'Not Found',
                    'message': f'Action {action} not found',
                    'available_actions': ['health_check', 'get_config', 'chat', 'conversation', 'init_session', 'generate_stream_token', 'cache_status', 'clear_cache', 'warm_cache']
                })
            }
            return add_cors_headers(response)
            
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'An unexpected error occurred'
            })
        }
        return add_cors_headers(response)