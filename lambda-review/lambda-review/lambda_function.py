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
    from tenant_inference import resolveTenant, handle_inference_failure, generate_streaming_token
    TENANT_INFERENCE_AVAILABLE = True
    logger.info("✅ tenant_inference module loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️ tenant_inference not available: {e}")
    TENANT_INFERENCE_AVAILABLE = False

try:
    from intent_router import route_intent
    INTENT_ROUTER_AVAILABLE = True
    logger.info("✅ intent_router module loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️ intent_router not available: {e}")
    INTENT_ROUTER_AVAILABLE = False

# Initialize audit logger
try:
    from audit_logger import audit_logger
    AUDIT_LOGGER_AVAILABLE = True
    logger.info("✅ audit_logger module loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️ audit_logger not available: {e}")
    AUDIT_LOGGER_AVAILABLE = False

def get_security_context(event, context):
    """Extract security context from request for monitoring"""
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
    Master Lambda Handler - Enhanced with Tenant Inference System
    Bulletproof security with backward compatibility
    """
    try:
        logger.info("📥 Master Function triggered with Enhanced Tenant Inference")
        security_context = get_security_context(event, context)
        
        # Handle OPTIONS requests first (CORS preflight)
        http_method = get_http_method(event)
        if http_method == "OPTIONS":
            logger.info("🚀 Handling OPTIONS preflight request")
            return cors_response(200, "")
        
        # Enhanced tenant inference (replaces simple hash extraction)
        tenant_info = None
        if TENANT_INFERENCE_AVAILABLE:
            tenant_result = resolveTenant(event)
            if tenant_result and not tenant_result.get('error'):
                tenant_info = tenant_result
                logger.info(f"✅ Tenant inferred via {tenant_info.get('source', 'unknown')}")
            elif tenant_result and tenant_result.get('error'):
                logger.error(f"🚨 Tenant inference failed: {tenant_result.get('error')}")
                return cors_response(tenant_result.get('status_code', 403), {
                    "error": tenant_result.get('error'),
                    "failure_id": tenant_result.get('failure_id')
                })
        
        # Backward compatibility - fall back to query parameter
        query_params = event.get("queryStringParameters") or {}
        action = query_params.get("action")
        tenant_hash = tenant_info.get('tenant_hash') if tenant_info else query_params.get("t")
        
        logger.info(f"🔍 Request details - Method: {http_method}, Action: {action}, Hash: {tenant_hash[:8] + '...' if tenant_hash else 'None'}")
        
        # ENHANCED ACTION ROUTING SYSTEM with Tenant Inference
        if action == "get_config":
            logger.info("✅ Handling action=get_config")
            return handle_get_config_action(tenant_hash, security_context, tenant_info)
        
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
            return handle_chat_action(event, tenant_hash, tenant_info)
            
        elif action == "generate_jwt":
            logger.info("✅ Handling action=generate_jwt")
            return handle_generate_jwt_action(tenant_hash, query_params, tenant_info)
        
        elif action == "state_clear":
            logger.info("✅ Handling action=state_clear")
            return handle_state_clear_action_wrapper(event, tenant_hash, security_context)
        
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
                "valid_actions": ["get_config", "chat", "health_check", "cache_status", "clear_cache", "state_clear"],
                "received": {
                    "method": http_method,
                    "action": action,
                    "has_hash": bool(tenant_hash)
                }
            })
            
    except Exception as e:
        logger.exception("❌ Critical error in lambda_handler")
        # Enhanced error handling with tenant inference fallback
        if TENANT_INFERENCE_AVAILABLE:
            failure_result = handle_inference_failure("system_error", {
                "error": str(e),
                "request_id": context.aws_request_id if context else "unknown"
            })
            return cors_response(failure_result.get('status_code', 500), {
                "error": failure_result.get('error'),
                "failure_id": failure_result.get('failure_id')
            })
        else:
            return cors_response(500, {
                "error": "Internal server error",
                "details": str(e),
                "request_id": context.aws_request_id if context else "unknown"
            })

def handle_get_config_action(tenant_hash, security_context, tenant_info=None):
    """Handle action=get_config - pure hash-based with security monitoring"""
    try:
        if not tenant_hash:
            # Log invalid request attempt
            logger.warning(f"SECURITY_EVENT: Missing tenant hash in config request from {security_context.get('source_ip', 'unknown')}")
            
            # Audit unauthorized access attempt
            if AUDIT_LOGGER_AVAILABLE:
                audit_logger.log_unauthorized_access(
                    tenant_id="unknown",
                    session_id=security_context.get('request_id'),
                    resource="config",
                    action="get_config",
                    source_ip=security_context.get('source_ip'),
                    reason="missing_tenant_hash"
                )
            
            return cors_response(400, {
                "error": "Missing tenant hash",
                "usage": "GET ?action=get_config&t=HASH"
            })
        
        logger.info(f"[{tenant_hash[:8]}...] 🔍 Processing get_config action")
        
        if not TENANT_CONFIG_AVAILABLE:
            logger.warning("tenant_config module not available, using S3 fallback")
            return handle_s3_config_fallback(tenant_hash, security_context)
        
        # Use tenant config module
        try:
            config = get_config_for_tenant_by_hash(tenant_hash)
            
            if config:
                logger.info(f"[{tenant_hash[:8]}...] ✅ Config loaded successfully")
                
                # Log successful config access
                logger.info(f"SECURITY_ACCESS: Successful config access for {tenant_hash[:8]}... from {security_context.get('source_ip', 'unknown')}")
                
                return cors_response(200, config)
            else:
                # 🛡️ SECURITY: No fallback for security - return 404 for invalid tenant hash
                logger.error(f"[{tenant_hash[:8]}...] ❌ SECURITY: Tenant hash not authorized")
                
                # Log unauthorized access attempt
                logger.error(f"SECURITY_EVENT: Unauthorized config request for {tenant_hash[:8]}... from {security_context.get('source_ip', 'unknown')}")
                
                # Audit unauthorized access attempt
                if AUDIT_LOGGER_AVAILABLE:
                    audit_logger.log_unauthorized_access(
                        tenant_id=tenant_hash,
                        session_id=security_context.get('request_id'),
                        resource="config",
                        action="get_config",
                        source_ip=security_context.get('source_ip'),
                        reason="tenant_not_authorized"
                    )
                
                return cors_response(404, {
                    "error": "Tenant configuration not found",
                    "message": "The requested tenant hash is not authorized or does not exist"
                })
        except ValueError as e:
            # Handle invalid tenant hash validation errors as 404
            if "Invalid tenant hash" in str(e):
                logger.error(f"[{tenant_hash[:8]}...] ❌ SECURITY: Invalid tenant hash format")
                
                # Log invalid hash attempt
                logger.error(f"SECURITY_EVENT: Invalid hash attempt {tenant_hash[:8]}... from {security_context.get('source_ip', 'unknown')}")
                
                return cors_response(404, {
                    "error": "Tenant configuration not found",
                    "message": "The requested tenant hash is not authorized or does not exist"
                })
            else:
                raise  # Re-raise other ValueError types
            
    except Exception as e:
        logger.error(f"[{tenant_hash[:8]}...] ❌ get_config action failed: {str(e)}")
        
        # Log security configuration access failure
        logger.error(f"SECURITY_EVENT: Config access failed for {tenant_hash[:8]}... from {security_context.get('source_ip', 'unknown')}: {str(e)}")
        
        return cors_response(500, {
            "error": "Config loading failed",
            "details": str(e)
        })

def handle_chat_action(event, tenant_hash, tenant_info=None):
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
        
        # 🛡️ SECURITY: Validate tenant hash for chat requests
        try:
            from tenant_config_loader import is_valid_tenant_hash, log_security_event
            
            if not is_valid_tenant_hash(tenant_hash):
                logger.error(f"[{tenant_hash[:8]}...] ❌ SECURITY: Invalid tenant hash in chat request")
                log_security_event("chat_invalid_hash", tenant_hash)
                return cors_response(403, {
                    "error": "Unauthorized tenant access",
                    "message": "The provided tenant hash is not authorized"
                })
        except ImportError:
            # Fallback validation if tenant_config_loader not available
            if not tenant_hash or len(tenant_hash) < 10:
                return cors_response(400, {"error": "Invalid tenant hash format"})
        
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

def handle_generate_jwt_action(tenant_hash, query_params, tenant_info=None):
    """Handle action=generate_jwt with enhanced tenant inference"""
    try:
        if not tenant_hash:
            return cors_response(400, {
                "error": "Missing tenant hash",
                "usage": "GET ?action=generate_jwt&t=HASH&purpose=PURPOSE"
            })
        
        logger.info(f"[{tenant_hash[:8]}...] 🔑 Processing generate_jwt action")
        
        # Enhanced security validation using tenant inference
        if tenant_info:
            # Tenant already validated through inference system
            logger.info(f"[{tenant_hash[:8]}...] ✅ Using validated tenant from inference: {tenant_info.get('source')}")
        else:
            # Fallback validation for backward compatibility
            if not TENANT_CONFIG_AVAILABLE:
                return cors_response(503, {
                    "error": "Tenant validation service unavailable"
                })
            
            try:
                config = get_config_for_tenant_by_hash(tenant_hash)
                if not config:
                    logger.error(f"[{tenant_hash[:8]}...] ❌ SECURITY: Invalid tenant hash for JWT generation")
                    return cors_response(404, {
                        "error": "Tenant configuration not found",
                        "message": "The requested tenant hash is not authorized"
                    })
            except Exception as e:
                logger.error(f"[{tenant_hash[:8]}...] ❌ Tenant validation failed: {str(e)}")
                return cors_response(403, {
                    "error": "Tenant validation failed",
                    "message": "Unable to validate tenant authorization"
                })
        
        # Generate JWT using enhanced system
        if TENANT_INFERENCE_AVAILABLE:
            jwt_result = generate_streaming_token()
            if jwt_result:
                # Add tenant context to JWT result
                jwt_result['tenant_hash'] = tenant_hash[:8] + '...'  # Partial for logging
                jwt_result['inference_source'] = tenant_info.get('source') if tenant_info else 'config_fallback'
                
                logger.info(f"[{tenant_hash[:8]}...] ✅ JWT generated via enhanced system")
                return cors_response(200, jwt_result)
            else:
                logger.error(f"[{tenant_hash[:8]}...] ❌ JWT generation failed")
                return cors_response(500, {
                    "error": "JWT generation failed",
                    "message": "Unable to generate streaming token"
                })
        else:
            # Fallback to basic JWT generation
            logger.warning(f"[{tenant_hash[:8]}...] ⚠️ Using fallback JWT generation")
            return cors_response(503, {
                "error": "Enhanced JWT service unavailable",
                "message": "Tenant inference system not available"
            })
        
    except Exception as e:
        logger.error(f"❌ JWT generation action failed: {str(e)}")
        return cors_response(500, {
            "error": "JWT generation failed",
            "details": str(e)
        })

def handle_s3_config_fallback(tenant_hash, security_context):
    """Direct S3 config loading fallback - pure hash-based with security monitoring"""
    try:
        # 🛡️ SECURITY: Apply strict validation (with fallback if import fails)
        hash_is_valid = False
        try:
            from tenant_config_loader import is_valid_tenant_hash, log_security_event
            hash_is_valid = is_valid_tenant_hash(tenant_hash)
            if not hash_is_valid:
                logger.error(f"[{tenant_hash[:8]}...] ❌ SECURITY: Invalid tenant hash in S3 fallback")
                log_security_event("s3_fallback_invalid_hash", tenant_hash)
        except ImportError:
            # 🛡️ SECURITY: Fallback validation if tenant_config_loader unavailable
            logger.warning("tenant_config_loader not available for validation, using strict fallback")
            # Apply same validation logic as tenant_config_loader with dynamic S3 check
            import re
            TENANT_HASH_PATTERN = re.compile(r'^[a-zA-Z0-9]{10,20}$')
            
            # Basic format validation
            format_valid = (
                tenant_hash and 
                isinstance(tenant_hash, str) and 
                len(tenant_hash) >= 10 and len(tenant_hash) <= 20 and
                TENANT_HASH_PATTERN.match(tenant_hash)
            )
            
            # Dynamic S3 mapping file validation
            if format_valid:
                try:
                    mapping_key = f"{MAPPINGS_PREFIX}/{tenant_hash}.json"
                    s3.head_object(Bucket=S3_BUCKET, Key=mapping_key)
                    hash_is_valid = True
                    logger.info(f"[{tenant_hash[:8]}...] ✅ Hash validation passed via fallback method")
                except ClientError as e:
                    if e.response['Error']['Code'] == 'NoSuchKey':
                        logger.warning(f"[{tenant_hash[:8]}...] ⚠️ Hash validation failed - no mapping file (fallback)")
                    hash_is_valid = False
                except Exception as e:
                    logger.error(f"[{tenant_hash[:8]}...] ❌ Error during fallback hash validation: {str(e)}")
                    hash_is_valid = False
            else:
                hash_is_valid = False
        
        if not hash_is_valid:
            return cors_response(404, {
                "error": "Tenant configuration not found", 
                "message": "The requested tenant hash is not authorized or does not exist"
            })
        
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

def handle_state_clear_action_wrapper(event, tenant_hash, security_context):
    """Wrapper for state clear action with audit integration"""
    try:
        if not tenant_hash:
            # Audit unauthorized access attempt
            if AUDIT_LOGGER_AVAILABLE:
                audit_logger.log_unauthorized_access(
                    tenant_id="unknown",
                    session_id=security_context.get('request_id'),
                    resource="state_clear",
                    action="state_clear",
                    source_ip=security_context.get('source_ip'),
                    reason="missing_tenant_hash"
                )
            
            return cors_response(400, {
                "error": "Missing tenant hash",
                "usage": "POST ?action=state_clear&t=HASH with body: {\"clear_type\": \"full|cache_only|session\"}"
            })
        
        logger.info(f"[{tenant_hash[:8]}...] 🧹 Processing state_clear action")
        
        # Import state clear handler
        try:
            from state_clear_handler import handle_state_clear_action
            response = handle_state_clear_action(event, None)
            return ensure_cors_headers(response)
            
        except ImportError:
            logger.error("state_clear_handler module not available")
            return cors_response(503, {
                "error": "State clear service unavailable",
                "details": "State clear handler module not available"
            })
        
    except Exception as e:
        logger.error(f"❌ State clear action failed: {str(e)}")
        return cors_response(500, {
            "error": "State clear processing failed",
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
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Cache-Control": "no-cache" if status_code >= 400 else "public, max-age=300",
            "CloudFront-Domain": CLOUDFRONT_DOMAIN
        },
        "body": json.dumps(body) if not isinstance(body, str) else body
    }

def ensure_cors_headers(response):
    """Ensure response has CORS headers"""
    if isinstance(response, dict) and "headers" in response:
        response["headers"].update({
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "CloudFront-Domain": CLOUDFRONT_DOMAIN
        })
    return response