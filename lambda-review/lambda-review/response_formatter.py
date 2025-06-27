import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# CloudFront Configuration
CLOUDFRONT_DOMAIN = "chat.myrecruiter.ai"

def format_lex_markdown_response(response_text, session_attributes):
    """Format Lex markdown response with CloudFront context"""
    logger.info("📝 Formatting Lex markdown response with CloudFront integration")
    
    # Add CloudFront context to session attributes if not present
    if "cloudfront_domain" not in session_attributes:
        session_attributes["cloudfront_domain"] = CLOUDFRONT_DOMAIN
    
    return {
        "sessionState": {
            "sessionAttributes": session_attributes,
            "dialogAction": {"type": "Close"}
        },
        "messages": [
            {
                "contentType": "CustomPayload",
                "content": json.dumps({
                    "x-amz-lex:response-format": "markdown",
                    "message": response_text,
                    "cloudfront_domain": CLOUDFRONT_DOMAIN,
                    "delivery_method": "cloudfront"
                })
            }
        ]
    }

def format_http_response(message, session_id, context=None):
    """Format HTTP response with CloudFront optimization headers"""
    logger.info(f"📦 Formatting HTTP response for session_id: {session_id} via CloudFront")
    
    # Enhance context with CloudFront information
    enhanced_context = context or {}
    enhanced_context.update({
        "cloudfront_domain": CLOUDFRONT_DOMAIN,
        "delivery_method": "cloudfront",
        "cache_strategy": "no-cache"  # Chat responses should not be cached
    })
    
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
            "Cache-Control": "no-cache, must-revalidate",  # Chat responses are dynamic
            "CloudFront-Domain": CLOUDFRONT_DOMAIN,
            "X-Delivery-Method": "cloudfront",
            "X-Response-Type": "chat"
        },
        "body": json.dumps({
            "type": "text",
            "content": message,
            "session_id": session_id,
            "context": enhanced_context,
            "_cloudfront": {
                "domain": CLOUDFRONT_DOMAIN,
                "response_time": "server-generated",
                "cache_status": "no-cache"
            }
        })
    }

def format_http_error(status_code, message, details=None):
    """Format error response with CloudFront-appropriate headers"""
    logger.warning(f"⚠️ Formatting error response: {status_code} - {message} via CloudFront")
    
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
            "Cache-Control": "no-cache, must-revalidate",  # Errors should not be cached
            "CloudFront-Domain": CLOUDFRONT_DOMAIN,
            "X-Delivery-Method": "cloudfront",
            "X-Response-Type": "error"
        },
        "body": json.dumps({
            "error": message,
            "details": details,
            "status_code": status_code,
            "_cloudfront": {
                "domain": CLOUDFRONT_DOMAIN,
                "error_source": "lambda",
                "cache_status": "no-cache"
            }
        })
    }

def format_config_response(config_data, tenant_id):
    """Format config response optimized for CloudFront caching"""
    logger.info(f"⚙️ Formatting config response for {tenant_id} via CloudFront")
    
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
            "Cache-Control": "no-cache, must-revalidate",  # Configs change frequently
            "CloudFront-Domain": CLOUDFRONT_DOMAIN,
            "X-Delivery-Method": "cloudfront",
            "X-Response-Type": "config",
            "X-Tenant-ID": tenant_id
        },
        "body": json.dumps({
            **config_data,
            "_delivery": {
                "cloudfront_domain": CLOUDFRONT_DOMAIN,
                "delivery_method": "cloudfront",
                "cache_policy": "no-cache",
                "tenant_id": tenant_id
            }
        })
    }

def format_static_asset_response(asset_content, content_type, tenant_id=None):
    """Format static asset response for CloudFront caching (e.g., embed scripts)"""
    logger.info(f"📄 Formatting static asset response via CloudFront")
    
    cache_control = "public, max-age=3600"  # Cache static assets for 1 hour
    if content_type == "application/javascript":
        cache_control = "public, max-age=3600, immutable"  # JavaScript can be cached longer
    
    headers = {
        "Content-Type": content_type,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": cache_control,
        "CloudFront-Domain": CLOUDFRONT_DOMAIN,
        "X-Delivery-Method": "cloudfront",
        "X-Response-Type": "static-asset"
    }
    
    if tenant_id:
        headers["X-Tenant-ID"] = tenant_id
    
    return {
        "statusCode": 200,
        "headers": headers,
        "body": asset_content
    }