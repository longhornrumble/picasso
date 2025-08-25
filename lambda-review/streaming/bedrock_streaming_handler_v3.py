"""
Bedrock Streaming Handler V3 - Lambda Function URL Response Streaming
Uses Lambda's native response streaming capability
No JWT required - uses simple tenant_hash/session_id
"""

import os
import json
import logging
import boto3
import hashlib
import time
from typing import Dict, Any, Generator

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
bedrock_agent = boto3.client("bedrock-agent-runtime")
bedrock = boto3.client("bedrock-runtime")
s3 = boto3.client("s3")

# In-memory cache for Lambda warm starts
KB_CACHE = {}
CACHE_TTL = 300  # 5 minutes

def get_cache_key(text: str, prefix: str = "") -> str:
    """Generate a cache key from text"""
    return f"{prefix}:{hashlib.md5(text.encode()).hexdigest()}"

def is_cache_valid(cache_entry: Dict) -> bool:
    """Check if a cache entry is still valid"""
    if not cache_entry:
        return False
    return time.time() - cache_entry.get('timestamp', 0) < CACHE_TTL

def retrieve_kb_chunks(user_input, config):
    """Retrieve KB chunks with caching"""
    try:
        kb_id = config.get("aws", {}).get("knowledge_base_id")
        
        if not kb_id:
            return "", []

        # Check cache first
        cache_key = get_cache_key(user_input, f"kb:{kb_id}")
        if cache_key in KB_CACHE and is_cache_valid(KB_CACHE[cache_key]):
            logger.info(f"✅ KB Cache hit")
            return KB_CACHE[cache_key]['chunks'], KB_CACHE[cache_key]['sources']

        logger.info(f"📚 Retrieving KB chunks")
        
        response = bedrock_agent.retrieve(
            knowledgeBaseId=kb_id,  
            retrievalQuery={"text": user_input},
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": 3
                }
            }
        )
        
        results = response.get("retrievalResults", [])
        
        formatted_chunks = []
        sources = []
        
        for idx, result in enumerate(results, 1):
            content = result["content"]["text"]
            formatted_chunks.append(f"**Context {idx}:**\n{content}")
            sources.append(result.get("metadata", {}).get("source", f"Source {idx}"))
        
        if formatted_chunks:
            chunks_text = "\n\n".join(formatted_chunks)
            KB_CACHE[cache_key] = {
                'chunks': chunks_text,
                'sources': sources,
                'timestamp': time.time()
            }
            return chunks_text, sources
        
        return "", []
        
    except Exception as e:
        logger.error(f"KB retrieval failed: {str(e)}")
        return "", []

def build_prompt(user_input, kb_context, tone):
    """Build prompt with KB context"""
    parts = [tone]
    
    if kb_context:
        parts.extend([
            "\n**Relevant Information:**",
            kb_context,
            "\n**Instructions:** Use the information above to answer accurately."
        ])
    
    parts.append(f"\n**User Question:** {user_input}")
    parts.append("\n**Response:**")
    
    return "\n".join(parts)

def stream_handler(event, context):
    """
    Lambda handler with response streaming for Function URLs
    Returns an iterator that yields SSE chunks
    """
    
    def response_stream():
        """Generator function that yields SSE chunks"""
        start_time = time.time()
        session_id = "unknown"
        
        try:
            # Parse request
            body = json.loads(event.get('body', '{}')) if event.get('body') else {}
            tenant_hash = body.get('tenant_hash', '')
            session_id = body.get('session_id', 'default_session')
            user_input = body.get('user_input', '')
            
            # Send initial SSE prelude
            yield b":ok\n\n"
            # Explicit open event + tiny data ping to defeat buffering
            yield b"event: open\n\n"
            yield b"data: {\"type\":\"start\"}\n\n"
            
            if not tenant_hash or not user_input:
                error_msg = "Missing required parameters"
                yield f'data: {{"type": "error", "error": "{error_msg}"}}\n\n'.encode()
                yield b"data: [DONE]\n\n"
                return
            
            logger.info(f"Processing request - Tenant: {tenant_hash[:8]}..., Session: {session_id[:12]}...")
            
            # Load config (simplified)
            config = {
                'model_id': 'anthropic.claude-3-haiku-20240307-v1:0',
                'streaming': {'max_tokens': 1000, 'temperature': 0.2},
                'aws': {}
            }
            
            # Try to load real config from S3
            try:
                bucket = os.environ.get('CONFIG_BUCKET', 'myrecruiter-picasso')
                mapping_key = f"mappings/{tenant_hash}.json"
                mapping_response = s3.get_object(Bucket=bucket, Key=mapping_key)
                mapping_data = json.loads(mapping_response['Body'].read())
                tenant_id = mapping_data.get('tenant_id')
                
                if tenant_id:
                    config_key = f"tenants/{tenant_id}/config.json"
                    config_response = s3.get_object(Bucket=bucket, Key=config_key)
                    config = json.loads(config_response['Body'].read())
            except:
                pass  # Use defaults
            
            # Get KB context if available
            kb_context, _ = retrieve_kb_chunks(user_input, config)
            
            # Build prompt
            tone = config.get("tone_prompt", "You are a helpful assistant.")
            prompt = build_prompt(user_input, kb_context, tone)
            
            # Prepare Bedrock request
            model_id = config.get('model_id', 'anthropic.claude-3-haiku-20240307-v1:0')
            streaming_config = config.get('streaming', {})
            
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": streaming_config.get('max_tokens', 1000),
                "temperature": streaming_config.get('temperature', 0.2)
            }
            
            # Invoke Bedrock with streaming
            response = bedrock.invoke_model_with_response_stream(
                modelId=model_id,
                accept="application/json",
                contentType="application/json",
                body=json.dumps(request_body)
            )
            
            first_token_time = None
            token_count = 0
            last_heartbeat = time.time()
            
            # Stream the response
            for event_chunk in response['body']:
                # Send heartbeat frequently to keep buffers flushing
                if time.time() - last_heartbeat > 1:
                    # SSE comment + empty data event (some browsers flush only on data frames)
                    yield b":hb\n\n"
                    yield b"data: \n\n"
                    last_heartbeat = time.time()
                
                if 'chunk' in event_chunk:
                    chunk = event_chunk['chunk']

                    # Nudge client rendering as soon as content phase starts
                    if chunk_data := json.loads(chunk['bytes'].decode('utf-8')):
                        if chunk_data.get('type') == 'content_block_start' and first_token_time is None:
                            first_token_time = time.time() - start_time
                            yield f": x-first-token-ms={int(first_token_time * 1000)}\n\n".encode()
                            yield b"data: \n\n"

                        if chunk_data.get('type') == 'content_block_delta':
                            delta = chunk_data.get('delta', {})
                            if delta.get('type') == 'text_delta':
                                text = delta.get('text', '')
                                if text:
                                    token_count += 1
                                    if first_token_time is None:
                                        first_token_time = time.time() - start_time
                                        yield f": x-first-token-ms={int(first_token_time * 1000)}\n\n".encode()
                                    
                                    # Send text chunk as SSE data
                                    sse_data = json.dumps({
                                        'type': 'text',
                                        'content': text,
                                        'session_id': session_id
                                    })
                                    yield f"data: {sse_data}\n\n".encode()
                        
                        elif chunk_data.get('type') == 'message_stop':
                            break
            
            # Send completion
            total_time = time.time() - start_time
            yield f": x-total-tokens={token_count}\n\n".encode()
            yield f": x-total-time-ms={int(total_time * 1000)}\n\n".encode()
            # Final tiny data frame to force last flush before DONE
            yield b"data: \n\n"
            yield b"data: [DONE]\n\n"
            
            logger.info(f"✅ Completed - Tokens: {token_count}, Time: {total_time:.2f}s")
            
        except Exception as e:
            logger.error(f"Stream error: {str(e)}", exc_info=True)
            # Fallback to standard HTTP error response with JSON body
            error_data = json.dumps({
                "type": "error",
                "error": str(e),
                "session_id": session_id
            })
            yield f"data: {error_data}\n\n".encode()
            yield b"data: \n\n"
            yield b"data: [DONE]\n\n"
    
    # Handle OPTIONS for CORS
    if event.get('httpMethod') == 'OPTIONS' or event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
                'Cache-Control': 'no-cache, no-transform'
            },
            'body': ''
        }
    
    # For streaming response, we return the generator directly
    # Lambda Function URL with RESPONSE_STREAM will handle it
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
            'Access-Control-Expose-Headers': 'Content-Type',
            'X-Accel-Buffering': 'no'
        },
        'body': response_stream(),
        'isBase64Encoded': False
    }

# Lambda uses this handler name for Function URL streaming
lambda_handler = stream_handler

if __name__ == "__main__":
    # Test locally
    test_event = {
        'httpMethod': 'POST',
        'body': json.dumps({
            'tenant_hash': 'my87674d777bf9',
            'session_id': 'test_v3',
            'user_input': 'Hello V3'
        })
    }
    
    result = lambda_handler(test_event, None)
    print(f"Status: {result['statusCode']}")
    print("Streaming response:")
    for chunk in result['body']:
        print(chunk.decode(), end='')