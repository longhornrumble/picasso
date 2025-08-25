"""
Bedrock Streaming Handler V2 - True Lambda Response Streaming
Implements real SSE streaming with awslambdaric.StreamingBody
No JWT required - uses simple tenant_hash/session_id
"""

import os
import json
import logging
import boto3
import hashlib
import time
import threading
from typing import Dict, Tuple, List, Any, Generator
from io import BytesIO

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
bedrock_agent = boto3.client("bedrock-agent-runtime")
bedrock = boto3.client("bedrock-runtime")
s3 = boto3.client("s3")

# In-memory cache for Lambda warm starts
KB_CACHE = {}
RESPONSE_CACHE = {}
CACHE_TTL = 300  # 5 minutes

# Try to import Lambda streaming capabilities
try:
    from awslambdaric import StreamingBody
    STREAMING_AVAILABLE = True
    logger.info("✅ Lambda streaming support available")
except ImportError:
    STREAMING_AVAILABLE = False
    logger.warning("⚠️ Lambda streaming not available, will return buffered response")

def get_cache_key(text: str, prefix: str = "") -> str:
    """Generate a cache key from text"""
    return f"{prefix}:{hashlib.md5(text.encode()).hexdigest()}"

def is_cache_valid(cache_entry: Dict) -> bool:
    """Check if a cache entry is still valid"""
    if not cache_entry:
        return False
    return time.time() - cache_entry.get('timestamp', 0) < CACHE_TTL

def retrieve_kb_chunks(user_input, config):
    """
    Retrieve KB chunks with caching for common queries
    """
    try:
        kb_id = config.get("aws", {}).get("knowledge_base_id")
        
        if not kb_id:
            logger.info("📝 No KB ID found in tenant config")
            return "", []

        # Check cache first
        cache_key = get_cache_key(user_input, f"kb:{kb_id}")
        if cache_key in KB_CACHE and is_cache_valid(KB_CACHE[cache_key]):
            logger.info(f"✅ KB Cache hit for: {user_input[:40]}...")
            return KB_CACHE[cache_key]['chunks'], KB_CACHE[cache_key]['sources']

        logger.info(f"📚 Retrieving KB chunks for input: {user_input[:40]}... using KB: {kb_id}")
        
        # Time the KB retrieval
        start_time = time.time()
        
        response = bedrock_agent.retrieve(
            knowledgeBaseId=kb_id,  
            retrievalQuery={"text": user_input},
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": 5
                }
            }
        )
        
        kb_duration = time.time() - start_time
        logger.info(f"⏱️ KB retrieval took {kb_duration:.2f} seconds")
        
        results = response.get("retrievalResults", [])
        
        formatted_chunks = []
        sources = []
        
        for idx, result in enumerate(results, 1):
            content = result["content"]["text"]
            metadata = result.get("metadata", {})
            
            formatted_chunk = f"**Knowledge Base Result {idx}:**\n{content}"
            formatted_chunks.append(formatted_chunk)
            
            source_info = metadata.get("source", f"Knowledge Base Result {idx}")
            sources.append(source_info)
        
        if not formatted_chunks:
            logger.warning(f"⚠️ No relevant information found in knowledge base")
            return "", []
        
        logger.info(f"✅ Retrieved {len(formatted_chunks)} chunks from KB")
        
        # Cache the results
        chunks_text = "\n\n---\n\n".join(formatted_chunks)
        KB_CACHE[cache_key] = {
            'chunks': chunks_text,
            'sources': sources,
            'timestamp': time.time()
        }
        
        return chunks_text, sources
        
    except Exception as e:
        logger.error(f"❌ KB retrieval failed: {str(e)}")
        return "", []

def build_prompt(user_input, query_results, tenant_tone, conversation_context=None):
    """
    Build prompt with KB context and conversation history
    """
    prompt_parts = [tenant_tone]
    
    # Add conversation context if available
    if conversation_context and conversation_context.get('recentMessages'):
        recent_messages = conversation_context['recentMessages'][-5:]
        if recent_messages:
            prompt_parts.append("\n**Previous Conversation:**")
            for msg in recent_messages:
                role = msg.get('type', 'user')
                content = msg.get('content', '')
                if content:
                    prompt_parts.append(f"{role.capitalize()}: {content[:200]}...")
    
    # Add KB context if available
    if query_results:
        prompt_parts.append("\n**Relevant Information from Knowledge Base:**")
        prompt_parts.append(query_results)
        prompt_parts.append("\n**Instructions:**")
        prompt_parts.append("Use the knowledge base information above to answer the user's question accurately.")
        prompt_parts.append("If the information doesn't fully answer the question, acknowledge what you know and what you don't.")
    
    # Add the current user input
    prompt_parts.append(f"\n**Current User Question:**\n{user_input}")
    prompt_parts.append("\n**Your Response:**")
    
    return "\n".join(prompt_parts)

def stream_bedrock_response(prompt, config, session_id) -> Generator[bytes, None, None]:
    """
    Stream response from Bedrock as SSE format
    Yields bytes for Lambda streaming response
    """
    try:
        model_id = config.get('model_id', 'anthropic.claude-3-haiku-20240307-v1:0')
        logger.info(f"🚀 Invoking Bedrock streaming with model: {model_id}")
        
        streaming_config = config.get('streaming', {})
        
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": streaming_config.get('max_tokens', 1000),
            "temperature": streaming_config.get('temperature', 0.2)
        }
        
        # Send prelude to establish connection
        yield b":ok\n\n"
        
        # Start timing
        start_time = time.time()
        first_token_time = None
        token_count = 0
        
        # Invoke Bedrock with streaming
        response = bedrock.invoke_model_with_response_stream(
            modelId=model_id,
            accept="application/json",
            contentType="application/json",
            body=json.dumps(request_body)
        )
        
        # Set up heartbeat thread
        last_activity = time.time()
        heartbeat_event = threading.Event()
        
        def heartbeat_worker():
            """Send heartbeat every 10 seconds to keep connection alive"""
            while not heartbeat_event.is_set():
                if time.time() - last_activity > 10:
                    try:
                        yield b":hb\n\n"
                        logger.debug("💓 Heartbeat sent")
                    except:
                        break
                heartbeat_event.wait(1)
        
        heartbeat_thread = threading.Thread(target=heartbeat_worker)
        heartbeat_thread.daemon = True
        heartbeat_thread.start()
        
        # Stream the response
        for event in response['body']:
            if 'chunk' in event:
                chunk = event['chunk']
                if 'bytes' in chunk:
                    last_activity = time.time()
                    chunk_data = json.loads(chunk['bytes'].decode('utf-8'))
                    
                    # Handle different chunk types from Claude
                    if chunk_data.get('type') == 'content_block_delta':
                        delta = chunk_data.get('delta', {})
                        if delta.get('type') == 'text_delta':
                            text_content = delta.get('text', '')
                            if text_content:
                                token_count += 1
                                if first_token_time is None:
                                    first_token_time = time.time() - start_time
                                    # Send performance metric as SSE comment
                                    yield f": x-first-token-ms={int(first_token_time * 1000)}\n\n".encode()
                                
                                # Send text chunk as SSE data
                                sse_data = json.dumps({
                                    'type': 'text',
                                    'content': text_content,
                                    'session_id': session_id
                                })
                                yield f"data: {sse_data}\n\n".encode()
                    
                    elif chunk_data.get('type') == 'message_stop':
                        logger.info("✅ Bedrock streaming completed")
                        break
        
        # Stop heartbeat
        heartbeat_event.set()
        
        # Send completion marker
        total_time = time.time() - start_time
        yield f": x-total-tokens={token_count}\n".encode()
        yield f": x-total-time-ms={int(total_time * 1000)}\n".encode()
        yield b"data: [DONE]\n\n"
        
        logger.info(f"⚡ Streaming complete - First token: {first_token_time:.3f}s, Total: {total_time:.3f}s, Tokens: {token_count}")
        
    except Exception as e:
        logger.error(f"❌ Bedrock streaming failed: {str(e)}")
        error_data = json.dumps({
            "type": "error",
            "error": str(e),
            "session_id": session_id
        })
        yield f"data: {error_data}\n\n".encode()
        yield b"data: [DONE]\n\n"

def lambda_handler(event, context):
    """
    Main handler for true Lambda Response Streaming
    Uses awslambdaric.StreamingBody for real SSE streaming
    """
    try:
        logger.info("🌊 Bedrock streaming handler V2 invoked")
        
        # Handle OPTIONS requests for CORS
        http_method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'POST')
        
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
                    'Content-Type': 'text/plain'
                },
                'body': ''
            }
        
        # Parse request body
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        
        # Extract parameters
        tenant_hash = body.get('tenant_hash', '')
        session_id = body.get('session_id', 'default_session')
        user_input = body.get('user_input', '')
        conversation_context = body.get('conversation_context')
        
        # Validate required parameters
        if not tenant_hash:
            error_response = b'data: {"type": "error", "error": "Missing tenant_hash"}\n\ndata: [DONE]\n\n'
            if STREAMING_AVAILABLE:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*',
                        'X-Accel-Buffering': 'no'
                    },
                    'body': StreamingBody(BytesIO(error_response))
                }
            else:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'text/event-stream',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': error_response.decode()
                }
        
        if not user_input:
            error_response = b'data: {"type": "error", "error": "Missing user_input"}\n\ndata: [DONE]\n\n'
            if STREAMING_AVAILABLE:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*',
                        'X-Accel-Buffering': 'no'
                    },
                    'body': StreamingBody(BytesIO(error_response))
                }
            else:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'text/event-stream',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': error_response.decode()
                }
        
        logger.info(f"📝 Processing streaming request - Tenant: {tenant_hash[:8]}..., Session: {session_id[:12]}...")
        
        # Load tenant configuration
        config = {}
        try:
            bucket = os.environ.get('CONFIG_BUCKET', 'myrecruiter-picasso')
            
            # First try to get the mapping file to find tenant_id
            try:
                mapping_key = f"mappings/{tenant_hash}.json"
                mapping_response = s3.get_object(Bucket=bucket, Key=mapping_key)
                mapping_data = json.loads(mapping_response['Body'].read())
                tenant_id = mapping_data.get('tenant_id')
                
                if tenant_id:
                    # Now get the actual config
                    config_key = f"tenants/{tenant_id}/config.json"
                    config_response = s3.get_object(Bucket=bucket, Key=config_key)
                    config = json.loads(config_response['Body'].read())
                    logger.info(f"✅ Config loaded from S3 for tenant: {tenant_hash[:8]}...")
            except Exception as e:
                logger.warning(f"⚠️ Could not load config from S3: {str(e)}")
                
        except Exception as e:
            logger.warning(f"⚠️ S3 client error: {str(e)}")
        
        # Use defaults if no config loaded
        if not config:
            logger.info("📝 Using default configuration")
            config = {
                'model_id': 'anthropic.claude-3-haiku-20240307-v1:0',
                'streaming': {
                    'max_tokens': 1000,
                    'temperature': 0.2
                },
                'aws': {}
            }
        
        # Get tenant tone
        tenant_tone = config.get("tone_prompt", "You are a helpful and friendly assistant.")
        
        # Retrieve KB chunks if KB is configured
        kb_context = ""
        sources = []
        if config.get("aws", {}).get("knowledge_base_id"):
            kb_context, sources = retrieve_kb_chunks(user_input, config)
            if kb_context:
                logger.info(f"📚 Using KB context ({len(kb_context)} chars)")
        
        # Build the enhanced prompt
        enhanced_prompt = build_prompt(user_input, kb_context, tenant_tone, conversation_context)
        
        # Stream the response
        if STREAMING_AVAILABLE:
            # Use Lambda Response Streaming
            def response_generator():
                yield from stream_bedrock_response(enhanced_prompt, config, session_id)
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
                    'X-Accel-Buffering': 'no',
                    'x-session-id': session_id
                },
                'body': StreamingBody(response_generator())
            }
        else:
            # Fallback to buffered response if streaming not available
            logger.warning("⚠️ Streaming not available, returning buffered response")
            
            # Collect all chunks
            chunks = []
            for chunk in stream_bedrock_response(enhanced_prompt, config, session_id):
                chunks.append(chunk)
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*',
                    'x-session-id': session_id
                },
                'body': b''.join(chunks).decode()
            }
        
    except Exception as e:
        logger.error(f"❌ Streaming handler error: {str(e)}", exc_info=True)
        
        error_data = json.dumps({
            "type": "error",
            "error": str(e),
            "session_id": session_id if 'session_id' in locals() else 'unknown'
        })
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            },
            'body': f'data: {error_data}\n\ndata: [DONE]\n\n'
        }

# For local testing
if __name__ == "__main__":
    test_event = {
        'httpMethod': 'POST',
        'body': json.dumps({
            'tenant_hash': 'my87674d777bf9',
            'session_id': 'test_session',
            'user_input': 'What services do you offer?'
        })
    }
    
    result = lambda_handler(test_event, None)
    print(f"Status: {result['statusCode']}")
    print(f"Headers: {json.dumps(result['headers'], indent=2)}")
    if hasattr(result.get('body'), '__iter__'):
        print("Streaming response...")
        for chunk in result['body']:
            print(chunk.decode(), end='')
    else:
        print(f"Body: {result['body'][:500]}...")