import json
import logging
import time
import boto3
import os
from botocore.exceptions import ClientError

# Initialize logger first
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Configuration
CLOUDFRONT_DOMAIN = os.environ.get("CLOUDFRONT_DOMAIN", "chat.myrecruiter.ai")
S3_BUCKET = os.environ.get("S3_BUCKET", "myrecruiter-picasso")
MAPPINGS_PREFIX = "mappings"
TENANTS_PREFIX = "tenants"

# Initialize AWS clients
s3 = boto3.client("s3")

# Safe module imports
try:
    from tenant_config_loader import get_config_for_tenant_by_hash, clear_config_cache, get_cache_status
    TENANT_CONFIG_AVAILABLE = True
    logger.info("✅ tenant_config_loader module loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️ tenant_config_loader not available: {e}")
    TENANT_CONFIG_AVAILABLE = False

try:
    from intent_router import route_intent
    INTENT_ROUTER_AVAILABLE = True
    logger.info("✅ intent_router module loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️ intent_router not available: {e}")
    INTENT_ROUTER_AVAILABLE = False

def lambda_handler(event, context):
    """
    Master Lambda Handler - Pure Hash + Action System
    NO parameters, NO tenant IDs, NO hardcoded customer names
    """
    try:
        logger.info("📥 Master Function triggered with Universal Widget support")
        
        # Handle OPTIONS requests first (CORS preflight)
        http_method = get_http_method(event)
        if http_method == "OPTIONS":
            logger.info("🚀 Handling OPTIONS preflight request")
            return cors_response(200, "")
        
        # Get query parameters
        query_params = event.get("queryStringParameters") or {}
        action = query_params.get("action")
        tenant_hash = query_params.get("t")
        
        logger.info(f"🔍 Request details - Method: {http_method}, Action: {action}, Hash: {tenant_hash[:8] + '...' if tenant_hash else 'None'}")
        
        # PURE ACTION ROUTING SYSTEM
        if action == "get_config":
            logger.info("✅ Handling action=get_config")
            return handle_get_config_action(tenant_hash)
        
        elif action == "health_check":
            logger.info("✅ Handling action=health_check")
            return handle_health_check_action(tenant_hash)
        
        elif action == "cache_status":
            logger.info("✅ Handling action=cache_status")
            return handle_cache_status_action()
        
        elif action == "clear_cache":
            logger.info("✅ Handling action=clear_cache")
            return handle_cache_clear_action(tenant_hash)
        
        elif action == "chat":
            logger.info("✅ Handling action=chat")
            return handle_chat_action(event, tenant_hash)
        
        # Legacy support: hash without action (defaults to get_config)
        elif http_method == "GET" and tenant_hash and not action:
            logger.info("✅ Handling legacy hash request (defaulting to get_config)")
            return handle_get_config_action(tenant_hash)
        
        # POST without action (defaults to chat)
        elif http_method == "POST" and not action:
            logger.info("✅ Handling POST request (defaulting to chat)")
            return handle_chat_action(event, tenant_hash)
        
        else:
            logger.warning(f"❌ Unknown request pattern")
            return cors_response(400, {
                "error": "Invalid request format",
                "expected_format": "?action=ACTION&t=HASH",
                "valid_actions": ["get_config", "chat", "health_check", "cache_status", "clear_cache"],
                "received": {
                    "method": http_method,
                    "action": action,
                    "has_hash": bool(tenant_hash)
                }
            })
            
    except Exception as e:
        logger.exception("❌ Critical error in lambda_handler")
        return cors_response(500, {
            "error": "Internal server error",
            "details": str(e),
            "request_id": context.aws_request_id if context else "unknown"
        })

def handle_get_config_action(tenant_hash):
    """Handle action=get_config - pure hash-based"""
    try:
        if not tenant_hash:
            return cors_response(400, {
                "error": "Missing tenant hash",
                "usage": "GET ?action=get_config&t=HASH"
            })
        
        logger.info(f"[{tenant_hash[:8]}...] 🔍 Processing get_config action")
        
        if not TENANT_CONFIG_AVAILABLE:
            logger.warning("tenant_config module not available, using S3 fallback")
            return handle_s3_config_fallback(tenant_hash)
        
        # Use tenant config module
        config = get_config_for_tenant_by_hash(tenant_hash)
        
        if config:
            logger.info(f"[{tenant_hash[:8]}...] ✅ Config loaded successfully")
            return cors_response(200, config)
        else:
            logger.warning(f"[{tenant_hash[:8]}...] Config not found, using S3 fallback")
            return handle_s3_config_fallback(tenant_hash)
            
    except Exception as e:
        logger.error(f"[{tenant_hash[:8]}...] ❌ get_config action failed: {str(e)}")
        return cors_response(500, {
            "error": "Config loading failed",
            "details": str(e)
        })

def handle_chat_action(event, tenant_hash):
    """Handle action=chat - pure hash-based"""
    try:
        # Extract tenant hash from body if not in query params
        if not tenant_hash:
            try:
                body = event.get("body", "{}")
                if isinstance(body, str):
                    body = json.loads(body)
                tenant_hash = body.get("tenant_hash")
            except:
                pass
        
        if not tenant_hash:
            return cors_response(400, {
                "error": "Missing tenant hash",
                "usage": "POST ?action=chat&t=HASH or include tenant_hash in body"
            })
        
        logger.info(f"[{tenant_hash[:8]}...] 💬 Processing chat action")
        
        if not INTENT_ROUTER_AVAILABLE:
            return cors_response(500, {
                "error": "Chat service unavailable",
                "details": "Intent router module not available"
            })
        
        # Load config for context
        config = None
        if TENANT_CONFIG_AVAILABLE:
            try:
                config = get_config_for_tenant_by_hash(tenant_hash)
                logger.info(f"[{tenant_hash[:8]}...] ✅ Config loaded for chat context")
            except Exception as e:
                logger.warning(f"[{tenant_hash[:8]}...] ⚠️ Could not load config: {e}")
        
        # Route to intent handler
        response = route_intent(event, config)
        logger.info(f"[{tenant_hash[:8]}...] ✅ Chat response generated")
        
        return ensure_cors_headers(response)
        
    except Exception as e:
        logger.error(f"❌ Chat action failed: {str(e)}")
        return cors_response(500, {
            "error": "Chat processing failed",
            "details": str(e)
        })

def handle_health_check_action(tenant_hash):
    """Handle action=health_check"""
    try:
        logger.info("🏥 Processing health_check action")
        
        health_status = {
            "status": "healthy",
            "timestamp": int(time.time()),
            "modules": {
                "tenant_config_loader": TENANT_CONFIG_AVAILABLE,
                "intent_router": INTENT_ROUTER_AVAILABLE
            },
            "environment": {
                "cloudfront_domain": CLOUDFRONT_DOMAIN,
                "s3_bucket": S3_BUCKET
            }
        }
        
        # Test config loading if hash provided
        if tenant_hash and TENANT_CONFIG_AVAILABLE:
            try:
                config = get_config_for_tenant_by_hash(tenant_hash)
                health_status["config_test"] = {
                    "status": "healthy" if config else "failed",
                    "has_config": bool(config),
                    "tenant_hash": tenant_hash[:8] + "..." if tenant_hash else None
                }
            except Exception as e:
                health_status["config_test"] = {
                    "status": "failed",
                    "error": str(e)[:100]
                }
                health_status["status"] = "degraded"
        
        status_code = 200 if health_status["status"] != "unhealthy" else 503
        return cors_response(status_code, health_status)
        
    except Exception as e:
        logger.error(f"❌ Health check failed: {str(e)}")
        return cors_response(500, {
            "error": "Health check failed",
            "details": str(e)
        })

def handle_cache_status_action():
    """Handle action=cache_status"""
    try:
        if not TENANT_CONFIG_AVAILABLE:
            return cors_response(503, {
                "error": "Cache service unavailable"
            })
        
        cache_status = get_cache_status()
        return cors_response(200, {
            "cache_status": cache_status,
            "timestamp": int(time.time())
        })
        
    except Exception as e:
        logger.error(f"❌ Cache status failed: {str(e)}")
        return cors_response(500, {
            "error": "Cache status failed",
            "details": str(e)
        })

def handle_cache_clear_action(tenant_hash):
    """Handle action=clear_cache"""
    try:
        if not TENANT_CONFIG_AVAILABLE:
            return cors_response(503, {
                "error": "Cache service unavailable"
            })
        
        clear_config_cache(tenant_hash)
        return cors_response(200, {
            "success": True,
            "message": f"Cache cleared for {tenant_hash[:8] + '...' if tenant_hash else 'all'}",
            "timestamp": int(time.time())
        })
        
    except Exception as e:
        logger.error(f"❌ Cache clear failed: {str(e)}")
        return cors_response(500, {
            "error": "Cache clear failed",
            "details": str(e)
        })

def handle_s3_config_fallback(tenant_hash):
    """Direct S3 config loading fallback - pure hash-based"""
    try:
        # Resolve hash to get tenant information
        mapping_key = f"{MAPPINGS_PREFIX}/{tenant_hash}.json"
        
        logger.info(f"[{tenant_hash[:8]}...] 🔍 Resolving hash via S3")
        response = s3.get_object(Bucket=S3_BUCKET, Key=mapping_key)
        mapping_data = json.loads(response["Body"].read())
        mapped_tenant = mapping_data.get("tenant_id")
        
        if not mapped_tenant:
            raise ValueError("Invalid mapping data")
        
        # Load config using mapped information
        config_key = f"{TENANTS_PREFIX}/{mapped_tenant}/{mapped_tenant}-config.json"
        logger.info(f"[{tenant_hash[:8]}...] 🔍 Loading config via S3")
        response = s3.get_object(Bucket=S3_BUCKET, Key=config_key)
        config = json.loads(response["Body"].read())
        
        # Add CloudFront metadata
        config = ensure_cloudfront_metadata(config, tenant_hash)
        
        logger.info(f"[{tenant_hash[:8]}...] ✅ Config loaded via S3 fallback")
        return cors_response(200, config)
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            logger.warning(f"[{tenant_hash[:8]}...] ⚠️ Hash or config not found")
            return cors_response(404, {
                "error": "Configuration not found",
                "tenant_hash": tenant_hash[:8] + "..."
            })
        raise
    except Exception as e:
        logger.error(f"[{tenant_hash[:8]}...] ❌ S3 fallback failed: {str(e)}")
        return cors_response(500, {
            "error": "Config loading failed",
            "details": str(e)
        })

def ensure_cloudfront_metadata(config, tenant_hash):
    """Add CloudFront metadata to config - pure hash-based"""
    config["_cloudfront"] = {
        "domain": CLOUDFRONT_DOMAIN,
        "enabled": True,
        "urls": {
            "config_endpoint": f"https://{CLOUDFRONT_DOMAIN}/Master_Function?action=get_config&t={tenant_hash}",
            "chat_endpoint": f"https://{CLOUDFRONT_DOMAIN}/Master_Function?action=chat&t={tenant_hash}",
            "health_endpoint": f"https://{CLOUDFRONT_DOMAIN}/Master_Function?action=health_check&t={tenant_hash}",
            "widget_js": f"https://{CLOUDFRONT_DOMAIN}/widget.js"
        }
    }
    return config

def get_http_method(event):
    """Extract HTTP method from event"""
    methods = [
        event.get("requestContext", {}).get("http", {}).get("method"),
        event.get("httpMethod"),
        event.get("requestContext", {}).get("httpMethod")
    ]
    
    for method in methods:
        if method:
            return method.upper()
    
    return "GET"

def cors_response(status_code, body):
    """Standardized CORS response"""
    # Note: CORS headers are now handled by Lambda Function URL configuration
    # to avoid duplicate headers. Only include non-CORS headers here.
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache" if status_code >= 400 else "public, max-age=300",
            "CloudFront-Domain": CLOUDFRONT_DOMAIN
        },
        "body": json.dumps(body) if not isinstance(body, str) else body
    }

def ensure_cors_headers(response):
    """Ensure response has CORS headers"""
    # Note: CORS headers are now handled by Lambda Function URL configuration
    # Only add non-CORS headers that might be missing
    if isinstance(response, dict) and "headers" in response:
        response["headers"].update({
            "CloudFront-Domain": CLOUDFRONT_DOMAIN
        })
    return response