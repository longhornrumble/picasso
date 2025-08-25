"""
Bedrock Streaming Handler - Combined optimized version
Handles streaming responses from Bedrock with KB retrieval and caching
No JWT required - uses simple tenant_hash/session_id like regular chat
"""

import os
import json
import logging
import boto3
import hashlib
import time
from typing import Dict, Tuple, List, Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
bedrock_agent = boto3.client("bedrock-agent-runtime")
bedrock = boto3.client("bedrock-runtime")
s3 = boto3.client("s3")

# In-memory cache for Lambda warm starts
# This cache persists between invocations in the same container
KB_CACHE = {}
RESPONSE_CACHE = {}
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
    """
    Retrieve KB chunks with caching for common queries
    """
    try:
        kb_id = config.get("aws", {}).get("knowledge_base_id")
        
        if not kb_id:
            logger.error("❌ No KB ID found in tenant config")
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
                    "numberOfResults": 5  # Reduced from 8 for faster response
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
            
            logger.info(f"🔍 Result {idx} - Content length: {len(content)} chars")
            
            # Simple formatting - no manipulation of content
            formatted_chunk = f"**Knowledge Base Result {idx}:**\n{content}"
            
            formatted_chunks.append(formatted_chunk)
            
            # Get source info if available
            source_info = metadata.get("source", f"Knowledge Base Result {idx}")
            sources.append(source_info)
        
        if not formatted_chunks:
            logger.warning(f"⚠️ No relevant information found in knowledge base for: {user_input[:40]}...")
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
    
    # Start with the tenant tone
    prompt_parts = [tenant_tone]
    
    # Add conversation context if available
    if conversation_context and conversation_context.get('recentMessages'):
        recent_messages = conversation_context['recentMessages'][-5:]  # Last 5 messages
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
    
    # Add response instruction
    prompt_parts.append("\n**Your Response:**")
    
    return "\n".join(prompt_parts)

def invoke_bedrock_streaming(prompt, config):
    """
    Invoke Bedrock with streaming enabled
    Returns a stream generator
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

def warm_cache_for_tenant(tenant_hash, config):
    """
    Pre-warm the cache with common queries for a tenant
    """
    common_queries = [
        "What services do you offer?",
        "How can I contact you?",
        "What are your hours?",
        "Tell me about your company",
        "How do I get started?"
    ]
    
    warmed_count = 0
    for query in common_queries:
        try:
            chunks, sources = retrieve_kb_chunks(query, config)
            if chunks:
                warmed_count += 1
                logger.info(f"🔥 Warmed cache for: {query[:30]}...")
        except Exception as e:
            logger.warning(f"⚠️ Failed to warm cache for query: {query[:30]}... - {str(e)}")
    
    logger.info(f"✅ Cache warming complete for tenant {tenant_hash[:8]}... - {warmed_count}/{len(common_queries)} queries cached")
    return warmed_count

def lambda_handler(event, context):
    """
    Main handler for streaming requests
    Accepts simple tenant_hash/session_id like regular chat
    """
    try:
        logger.info("🌊 Bedrock streaming handler invoked")
        
        # Handle OPTIONS requests for CORS
        http_method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'POST')
        
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Content-Type': 'text/plain'
                },
                'body': ''
            }
        
        # Parse request body
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        
        # Extract parameters (same as regular chat)
        tenant_hash = body.get('tenant_hash', '')
        session_id = body.get('session_id', 'default_session')
        user_input = body.get('user_input', '')
        conversation_context = body.get('conversation_context')
        
        if not tenant_hash:
            logger.error("❌ Missing tenant_hash")
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'text/event-stream',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': 'data: {"type": "error", "error": "Missing tenant_hash"}\n\ndata: [DONE]\n\n'
            }
        
        if not user_input:
            logger.error("❌ Missing user_input")
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'text/event-stream',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': 'data: {"type": "error", "error": "Missing user_input"}\n\ndata: [DONE]\n\n'
            }
        
        logger.info(f"📝 Processing streaming request - Tenant: {tenant_hash[:8]}..., Session: {session_id[:12]}...")
        
        # Load tenant configuration - simplified approach
        config = {}
        try:
            # Try to get config from S3 directly (simpler than full tenant_config_loader)
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
                else:
                    logger.warning(f"⚠️ No tenant_id found in mapping for hash: {tenant_hash[:8]}...")
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
                'aws': {}  # Empty AWS config
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
        
        # Get the streaming response from Bedrock
        start_time = time.time()
        response_stream = invoke_bedrock_streaming(enhanced_prompt, config)
        
        # Process the streaming response and collect SSE chunks
        sse_chunks = []
        token_count = 0
        first_token_time = None
        
        for event in response_stream:
            if 'chunk' in event:
                chunk = event['chunk']
                if 'bytes' in chunk:
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
                                
                                # Format as SSE
                                sse_data = json.dumps({
                                    'type': 'text',
                                    'content': text_content,
                                    'session_id': session_id
                                })
                                sse_chunks.append(f'data: {sse_data}\n\n')
                    
                    elif chunk_data.get('type') == 'message_stop':
                        # End of message
                        logger.info("✅ Bedrock streaming completed")
                        break
        
        # Add completion marker
        sse_chunks.append('data: [DONE]\n\n')
        
        # Combine all SSE chunks
        sse_body = ''.join(sse_chunks)
        
        # Log performance metrics
        total_time = time.time() - start_time
        logger.info(f"⚡ Streaming complete - First token: {first_token_time:.3f}s, Total: {total_time:.3f}s, Tokens: {token_count}")
        
        # Return SSE response
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'X-Accel-Buffering': 'no',  # Prevent nginx buffering
                'x-session-id': session_id,
                'x-first-token-ms': str(int(first_token_time * 1000)) if first_token_time else '0',
                'x-total-tokens': str(token_count)
            },
            'body': sse_body
        }
        
    except Exception as e:
        logger.error(f"❌ Streaming handler error: {str(e)}", exc_info=True)
        
        # Return error as SSE format
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
            'tenant_hash': 'test_tenant',
            'session_id': 'test_session',
            'user_input': 'What services do you offer?'
        })
    }
    
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))