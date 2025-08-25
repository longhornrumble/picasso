import json
import logging
from session_utils import extract_session_data, build_session_attributes
from bedrock_handler import fetch_tenant_tone, retrieve_kb_chunks, build_prompt, call_claude_with_prompt
from response_formatter import format_lex_markdown_response, format_http_response, format_http_error

# Import hash-based config loader
try:
    from tenant_config_loader import get_config_for_tenant_by_hash
    TENANT_CONFIG_AVAILABLE = True
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    logger.info("✅ tenant_config_loader imported successfully")
except ImportError as e:
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    logger.warning(f"⚠️ tenant_config_loader not available: {e}")
    TENANT_CONFIG_AVAILABLE = False

def route_intent(event, config=None):
    try:
        logger.info("📨 Routing intent request")
        
        # Extract hash from event (pure hash system)
        tenant_hash = extract_tenant_hash(event)
        user_input = extract_user_input(event)
        session_id = extract_session_id(event)

        logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Session ID: {session_id}")
        logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] User input: {user_input[:40]}...")

        if not tenant_hash or not user_input:
            logger.warning(f"❌ Missing tenant_hash or user_input")
            if "sessionState" in event:
                return format_lex_markdown_response("Missing tenant information or user input", {})
            else:
                return format_http_error(400, "Missing tenant information or user input")

        # Load config using hash-based system
        if not config and TENANT_CONFIG_AVAILABLE:
            try:
                config = get_config_for_tenant_by_hash(tenant_hash)
                logger.info(f"[{tenant_hash[:8]}...] ✅ Config loaded using hash")
            except Exception as e:
                logger.warning(f"[{tenant_hash[:8]}...] ⚠️ Could not load config: {e}")
        
        # Fallback config if none available
        if not config:
            logger.warning(f"[{tenant_hash[:8]}...] Using fallback config")
            config = get_fallback_config(tenant_hash)
        
        tone = config.get("tone_prompt", "You are a helpful assistant.")
        logger.info(f"[{tenant_hash[:8]}...] 🎨 Using tone: {tone[:40]}...")

        kb_context, sources = retrieve_kb_chunks(user_input, config)
        prompt = build_prompt(user_input, kb_context, tone)
        logger.info(f"[{tenant_hash[:8]}...] 🧠 Prompt built. Submitting to Claude...")

        response_text = call_claude_with_prompt(prompt, config)
        logger.info(f"[{tenant_hash[:8]}...] ✅ Claude response received")

        # Build session attributes using hash-based system
        if "sessionState" in event:
            return format_lex_markdown_response(
                response_text,
                build_session_attributes_hash(
                    tenant_hash,
                    extract_session_data(event).get("prompt_index", "0"),
                    extract_session_data(event).get("topic", "")
                )
            )
        else:
            return format_http_response(
                response_text,
                session_id,
                context={
                    "x-amz-lex:qna-search-response": response_text,
                    "x-amz-lex:qna-search-response-source": ", ".join(sources) or "unknown",
                    "tenant_hash": tenant_hash
                }
            )

    except Exception as e:
        logger.error(f"❌ Intent routing failed: {str(e)}", exc_info=True)
        return format_http_error(500, "Internal server error", str(e))

def extract_tenant_hash(event):
    """Extract tenant hash from event (hash-only system)"""
    
    tenant_hash = None
    
    # Method 1: From query parameters (action-based requests)
    query_params = event.get("queryStringParameters") or {}
    tenant_hash = query_params.get("t")
    
    # Method 2: From request body (chat requests)
    if not tenant_hash:
        try:
            body = event.get("body", "{}")
            if isinstance(body, str):
                body = json.loads(body)
            tenant_hash = body.get("tenant_hash")
        except:
            pass
    
    # Method 3: From Lex session attributes
    if not tenant_hash:
        session_attrs = event.get("sessionState", {}).get("sessionAttributes", {})
        tenant_hash = session_attrs.get("tenant_hash")
    
    # Method 4: Extract from session data utility
    if not tenant_hash:
        try:
            session = extract_session_data(event)
            tenant_hash = session.get("tenant_hash")
        except:
            pass
    
    return tenant_hash

def extract_user_input(event):
    """Extract user input from various event formats"""
    
    # Lex format
    if "inputTranscript" in event:
        return event["inputTranscript"]
    
    # HTTP API format
    try:
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body)
        return body.get("user_input", "")
    except:
        pass
    
    # Fallback
    return event.get("user_input", "")

def extract_session_id(event):
    """Extract session ID from event"""
    
    # From Lex
    session_id = event.get("sessionId")
    if session_id:
        return session_id
    
    # From HTTP body
    try:
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body)
        context = body.get("context", {})
        return context.get("session_id", f"session_{int(time.time())}")
    except:
        pass
    
    # From session utils
    try:
        session = extract_session_data(event)
        return session.get("session_id", f"session_{int(time.time())}")
    except:
        pass
    
    # Generate fallback
    import time
    return f"session_{int(time.time())}"

def build_session_attributes_hash(tenant_hash, prompt_index, topic):
    """Build session attributes for hash-based system"""
    
    return {
        "tenant_hash": tenant_hash,
        "prompt_index": str(prompt_index),
        "topic": str(topic),
        "cloudfront_domain": "chat.myrecruiter.ai"
    }

def get_fallback_config(tenant_hash):
    """Generate fallback config - dynamic, no hardcoded customer names"""
    
    return {
        "tenant_hash": tenant_hash,
        "tone_prompt": "You are a helpful and friendly assistant.",
        "chat_title": "Chat",
        "welcome_message": "Hello! How can I help you today?",
        "aws": {
            "model_id": "anthropic.claude-3-sonnet-20240229-v1:0",
            "aws_region": "us-east-1"
        }
    }