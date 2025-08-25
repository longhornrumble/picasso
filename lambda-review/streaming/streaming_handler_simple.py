import json
import logging
import os
import time
import boto3

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
bedrock = boto3.client('bedrock-runtime')
bedrock_agent = boto3.client('bedrock-agent-runtime')

# Import the optimized bedrock handler functions
try:
    import sys
    sys.path.append('/var/task')
    from bedrock_handler_optimized import retrieve_kb_chunks, build_prompt
    logger.info("✅ Using optimized bedrock handler with caching")
except ImportError:
    from bedrock_handler import retrieve_kb_chunks, build_prompt
    logger.info("⚠️ Using standard bedrock handler")

def lambda_handler(event, context):
    """
    Simplified Streaming Handler for EventSource/SSE
    No JWT required - works like the chat endpoint
    """
    try:
        logger.info("🌊 Streaming handler invoked")
        
        # Handle OPTIONS requests for CORS
        http_method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'text/plain'
                },
                'body': ''
            }
        
        # Extract parameters from query string (EventSource uses GET)
        query_params = event.get('queryStringParameters', {}) or {}
        tenant_hash = query_params.get('t') or query_params.get('tenant_hash')
        session_id = query_params.get('session_id', f'session_{int(time.time())}')
        
        # For POST requests, also check body
        if http_method == 'POST':
            body = event.get('body', '{}')
            if isinstance(body, str):
                body = json.loads(body) if body else {}
            user_input = body.get('user_input', '') or body.get('message', '')
            tenant_hash = tenant_hash or body.get('tenant_hash')
        else:
            # For GET requests (EventSource), get message from query params
            user_input = query_params.get('message', '') or query_params.get('user_input', '')
        
        if not tenant_hash:
            return sse_error(400, "Missing tenant_hash parameter")
        
        if not user_input:
            # Return a health check response for EventSource connections
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                'body': f'data: {json.dumps({"type": "ready", "message": "Streaming endpoint ready"})}\n\n'
            }
        
        logger.info(f"📝 Processing streaming request for tenant {tenant_hash[:8]}...")
        
        # Load tenant config (simplified - would normally load from S3)
        config = {
            "tenant_hash": tenant_hash,
            "model_id": "us.anthropic.claude-3-5-haiku-20241022-v1:0",
            "aws": {
                "knowledge_base_id": "0BQBWFYDMT",  # Default KB
                "aws_region": "us-east-1"
            },
            "tone_prompt": "You are a helpful assistant."
        }
        
        # Generate streaming response
        return generate_streaming_response(user_input, tenant_hash, session_id, config)
        
    except Exception as e:
        logger.error(f"❌ Streaming handler error: {str(e)}", exc_info=True)
        return sse_error(500, f"Internal server error: {str(e)}")

def generate_streaming_response(user_input, tenant_hash, session_id, config):
    """Generate SSE streaming response using Bedrock"""
    try:
        # Retrieve knowledge base chunks
        kb_context, sources = retrieve_kb_chunks(user_input, config)
        
        # Build prompt
        tone = config.get("tone_prompt", "You are a helpful assistant.")
        prompt = build_prompt(user_input, kb_context, tone, conversation_context=None)
        
        # Call Bedrock with streaming
        model_id = config.get("model_id", "us.anthropic.claude-3-5-haiku-20241022-v1:0")
        
        logger.info(f"🚀 Calling Bedrock model {model_id} with streaming...")
        
        # Prepare the request - Bedrock doesn't use 'stream' parameter
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1000,
            "temperature": 0.1
            # Stream is enabled by using invoke_model_with_response_stream
        }
        
        # Make streaming request to Bedrock
        response = bedrock.invoke_model_with_response_stream(
            modelId=model_id,
            accept="application/json",
            contentType="application/json",
            body=json.dumps(request_body)
        )
        
        # Stream the response as SSE
        sse_data = []
        token_count = 0
        first_token_time = None
        start_time = time.time()
        
        # Send initial connection message
        sse_data.append(f'data: {json.dumps({"type": "start", "session_id": session_id})}\n\n')
        
        # Process streaming chunks
        accumulated_text = ""
        for event in response['body']:
            chunk = json.loads(event['chunk']['bytes'].decode())
            
            if chunk.get('type') == 'content_block_delta':
                text = chunk.get('delta', {}).get('text', '')
                if text:
                    if first_token_time is None:
                        first_token_time = time.time() - start_time
                        logger.info(f"⚡ First token received in {first_token_time:.2f}s")
                    
                    accumulated_text += text
                    token_count += 1
                    
                    # Send chunk as SSE
                    sse_data.append(f'data: {json.dumps({"type": "chunk", "content": text})}\n\n')
            
            elif chunk.get('type') == 'message_stop':
                # Send completion message
                sse_data.append(f'data: {json.dumps({"type": "done", "total": accumulated_text})}\n\n')
                logger.info(f"✅ Streaming completed - {token_count} tokens in {time.time() - start_time:.2f}s")
        
        # Return SSE response
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Session-Id': session_id,
                'X-First-Token-Ms': str(int(first_token_time * 1000)) if first_token_time else '0'
            },
            'body': ''.join(sse_data)
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to generate streaming response: {str(e)}", exc_info=True)
        return sse_error(500, f"Streaming generation failed: {str(e)}")

def sse_error(status_code, message):
    """Return error in SSE format"""
    error_data = {
        "type": "error",
        "error": message,
        "status": status_code
    }
    
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache'
        },
        'body': f'data: {json.dumps(error_data)}\n\n'
    }