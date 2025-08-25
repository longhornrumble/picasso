import json
import logging
import time
import boto3
import os
import uuid
from botocore.exceptions import ClientError, ConnectTimeoutError, ReadTimeoutError

# Initialize logger first
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Configuration
CLOUDFRONT_DOMAIN = os.environ.get("CLOUDFRONT_DOMAIN", "chat.myrecruiter.ai")
S3_BUCKET = os.environ.get("S3_BUCKET", "myrecruiter-picasso")
MAPPINGS_PREFIX = "mappings"
TENANTS_PREFIX = "tenants"

# Import AWS client manager for timeout protection
try:
    from aws_client_manager import (
        protected_s3_operation,
        protected_secrets_operation,
        timeout_handler,
        CircuitBreakerError,
        aws_client_manager,
        graceful_degradation
    )
    AWS_CLIENT_MANAGER_AVAILABLE = True
    logger.info("✅ AWS client manager loaded with timeout protection")
except ImportError as e:
    logger.warning(f"⚠️ AWS client manager not available, using legacy clients: {e}")
    AWS_CLIENT_MANAGER_AVAILABLE = False

# Initialize AWS clients (fallback for legacy support)
s3 = boto3.client("s3")

# Rate Limiting Configuration (consistent with conversation_handler.py)
RATE_LIMIT_REQUESTS = 10
RATE_LIMIT_WINDOW = 10  # seconds
MAX_ENDPOINT_RATE_LIMIT_SESSIONS = 1000  # Maximum sessions to track for endpoint rate limiting
ENDPOINT_CLEANUP_INTERVAL_SECONDS = 30  # Time-based cleanup interval
ENDPOINT_MEMORY_WARNING_THRESHOLD = 800  # Warn when approaching max sessions

# Global state for endpoint rate limiting
endpoint_rate_limit_store = {}
last_endpoint_cleanup_time = 0  # Track last cleanup for time-based approach

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

try:
    from conversation_handler import handle_conversation_action
    CONVERSATION_HANDLER_AVAILABLE = True
    logger.info("✅ conversation_handler module loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️ conversation_handler not available: {e}")
    CONVERSATION_HANDLER_AVAILABLE = False

try:
    from token_blacklist import add_token_to_blacklist, revoke_tenant_tokens, TokenBlacklistError, verify_blacklist_integration
    TOKEN_BLACKLIST_AVAILABLE = True
    logger.info("✅ token_blacklist module loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️ token_blacklist not available: {e}")
    TOKEN_BLACKLIST_AVAILABLE = False

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
            headers = event.get("headers", {}) or {}
            # Extract tenant hash from query parameters for CORS validation
            query_params = event.get("queryStringParameters") or {}
            tenant_hash = query_params.get("t")
            return cors_response(200, "", request_headers=headers, tenant_hash=tenant_hash)
        
        # Enhanced tenant inference (replaces simple hash extraction)
        tenant_info = None
        if TENANT_INFERENCE_AVAILABLE:
            tenant_result = resolveTenant(event)
            if tenant_result and not tenant_result.get('error'):
                tenant_info = tenant_result
                logger.info(f"✅ Tenant inferred via {tenant_info.get('source', 'unknown')}")
            elif tenant_result and tenant_result.get('error'):
                logger.error(f"🚨 Tenant inference failed: {tenant_result.get('error')}")
                headers = event.get("headers", {}) or {}
                return cors_response(tenant_result.get('status_code', 403), {
                    "error": tenant_result.get('error'),
                    "failure_id": tenant_result.get('failure_id')
                }, request_headers=headers)
        
        # Backward compatibility - fall back to query parameter
        query_params = event.get("queryStringParameters") or {}
        action = query_params.get("action")
        tenant_hash = tenant_info.get('tenant_hash') if tenant_info else query_params.get("t")
        
        logger.info(f"🔍 Request details - Method: {http_method}, Action: {action}, Hash: {tenant_hash[:8] + '...' if tenant_hash else 'None'}")
        
        # ENHANCED ACTION ROUTING SYSTEM with Tenant Inference
        headers = event.get("headers", {}) or {}
        
        if action == "get_config":
            logger.info("✅ Handling action=get_config")
            return handle_get_config_action(tenant_hash, security_context, tenant_info, headers)
        
        elif action == "health_check":
            logger.info("✅ Handling action=health_check")
            return handle_health_check_action(tenant_hash, headers)
        
        elif action == "cache_status":
            logger.info("✅ Handling action=cache_status")
            return handle_cache_status_action(headers)
        
        elif action == "clear_cache":
            logger.info("✅ Handling action=clear_cache")
            return handle_cache_clear_action(tenant_hash, headers)
        
        elif action == "chat":
            logger.info("✅ Handling action=chat")
            return handle_chat_action(event, tenant_hash, tenant_info, headers)
            
        elif action == "generate_jwt":
            logger.info("✅ Handling action=generate_jwt")
            return handle_generate_jwt_action(tenant_hash, query_params, tenant_info)
        
        elif action == "state_clear":
            logger.info("✅ Handling action=state_clear")
            return handle_state_clear_action_wrapper(event, tenant_hash, security_context)
        
        elif action == "conversation":
            logger.info("✅ Handling action=conversation")
            return handle_conversation_action_wrapper(event, context, security_context)
        
        elif action == "init_session":
            logger.info("✅ Handling action=init_session")
            return handle_init_session_action(event, tenant_hash, tenant_info, security_context)
        
        elif action == "revoke_token":
            logger.info("✅ Handling action=revoke_token")
            return handle_revoke_token_action(event, tenant_hash, tenant_info, security_context)
        
        elif action == "blacklist_status":
            logger.info("✅ Handling action=blacklist_status")
            return handle_blacklist_status_action(tenant_hash, security_context)
        
        elif action == "timeout_status":
            logger.info("✅ Handling action=timeout_status")
            return handle_timeout_status_action(security_context)
        
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
                "valid_actions": ["get_config", "chat", "health_check", "cache_status", "clear_cache", "state_clear", "conversation", "init_session", "revoke_token", "blacklist_status", "timeout_status"],
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

def handle_get_config_action(tenant_hash, security_context, tenant_info=None, request_headers=None):
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
            }, request_headers=request_headers)
        
        logger.info(f"[{tenant_hash[:8]}...] 🔍 Processing get_config action")
        
        if not TENANT_CONFIG_AVAILABLE:
            logger.warning("tenant_config module not available, using S3 fallback")
            return handle_s3_config_fallback(tenant_hash, security_context, request_headers)
        
        # Use tenant config module
        try:
            config = get_config_for_tenant_by_hash(tenant_hash)
            
            if config:
                logger.info(f"[{tenant_hash[:8]}...] ✅ Config loaded successfully")
                
                # Log successful config access
                logger.info(f"SECURITY_ACCESS: Successful config access for {tenant_hash[:8]}... from {security_context.get('source_ip', 'unknown')}")
                
                return cors_response(200, config, request_headers=request_headers, tenant_hash=tenant_hash, tenant_config=config)
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
                }, request_headers=request_headers, tenant_hash=tenant_hash)
        except ValueError as e:
            # Handle invalid tenant hash validation errors as 404
            if "Invalid tenant hash" in str(e):
                logger.error(f"[{tenant_hash[:8]}...] ❌ SECURITY: Invalid tenant hash format")
                
                # Log invalid hash attempt
                logger.error(f"SECURITY_EVENT: Invalid hash attempt {tenant_hash[:8]}... from {security_context.get('source_ip', 'unknown')}")
                
                return cors_response(404, {
                    "error": "Tenant configuration not found",
                    "message": "The requested tenant hash is not authorized or does not exist"
                }, request_headers=request_headers, tenant_hash=tenant_hash)
            else:
                raise  # Re-raise other ValueError types
            
    except Exception as e:
        logger.error(f"[{tenant_hash[:8]}...] ❌ get_config action failed: {str(e)}")
        
        # Log security configuration access failure
        logger.error(f"SECURITY_EVENT: Config access failed for {tenant_hash[:8]}... from {security_context.get('source_ip', 'unknown')}: {str(e)}")
        
        return cors_response(500, {
            "error": "Config loading failed",
            "details": str(e)
        }, request_headers=request_headers, tenant_hash=tenant_hash)

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

def handle_health_check_action(tenant_hash, request_headers=None):
    """Handle action=health_check with comprehensive timeout protection monitoring"""
    try:
        logger.info("🏥 Processing enhanced health_check action")
        
        health_status = {
            "status": "healthy",
            "timestamp": int(time.time()),
            "modules": {
                "tenant_config_loader": TENANT_CONFIG_AVAILABLE,
                "intent_router": INTENT_ROUTER_AVAILABLE,
                "aws_client_manager": AWS_CLIENT_MANAGER_AVAILABLE,
                "token_blacklist": TOKEN_BLACKLIST_AVAILABLE,
                "audit_logger": AUDIT_LOGGER_AVAILABLE,
                "conversation_handler": CONVERSATION_HANDLER_AVAILABLE
            },
            "environment": {
                "cloudfront_domain": CLOUDFRONT_DOMAIN,
                "s3_bucket": S3_BUCKET
            }
        }
        
        # Add circuit breaker status if available
        if AWS_CLIENT_MANAGER_AVAILABLE:
            try:
                from aws_client_manager import log_service_health_metrics
                service_health = log_service_health_metrics()
                health_status["aws_services"] = {
                    "circuit_breakers": service_health.get('service_status', {}),
                    "healthy_services": service_health.get('healthy_services', 0),
                    "total_services": service_health.get('total_services', 0),
                    "cache_statistics": service_health.get('cache_statistics', {})
                }
                
                # Overall health is degraded if any circuit breakers are open
                if service_health.get('healthy_services', 0) < service_health.get('total_services', 0):
                    health_status["status"] = "degraded"
                    
            except Exception as e:
                health_status["aws_services_error"] = str(e)
                health_status["status"] = "degraded"
        
        # Test config loading with timeout protection if hash provided
        if tenant_hash and TENANT_CONFIG_AVAILABLE:
            try:
                config = get_config_for_tenant_by_hash(tenant_hash)
                health_status["config_test"] = {
                    "status": "healthy" if config else "failed",
                    "has_config": bool(config),
                    "tenant_hash": tenant_hash[:8] + "..." if tenant_hash else None,
                    "timeout_protection": AWS_CLIENT_MANAGER_AVAILABLE
                }
            except (ConnectTimeoutError, ReadTimeoutError, CircuitBreakerError) as e:
                health_status["config_test"] = {
                    "status": "timeout",
                    "error": "Service timeout - circuit breaker may be open",
                    "timeout_protection": True
                }
                health_status["status"] = "degraded"
            except Exception as e:
                health_status["config_test"] = {
                    "status": "failed",
                    "error": str(e)[:100],
                    "timeout_protection": AWS_CLIENT_MANAGER_AVAILABLE
                }
                health_status["status"] = "degraded"
        
        # Test blacklist system if available
        if TOKEN_BLACKLIST_AVAILABLE:
            try:
                from token_blacklist import verify_blacklist_integration
                blacklist_status = verify_blacklist_integration()
                health_status["blacklist_system"] = blacklist_status
                
                if not blacklist_status.get('overall_status', False):
                    health_status["status"] = "degraded"
                    
            except Exception as e:
                health_status["blacklist_system"] = {
                    "status": "failed",
                    "error": str(e)[:100]
                }
                health_status["status"] = "degraded"
        
        # Determine final status code based on health
        if health_status["status"] == "healthy":
            status_code = 200
        elif health_status["status"] == "degraded":
            status_code = 200  # Still operational but with warnings
        else:
            status_code = 503  # Unhealthy
            
        return cors_response(status_code, health_status, request_headers=request_headers, tenant_hash=tenant_hash)
        
    except Exception as e:
        logger.error(f"❌ Health check failed: {str(e)}")
        return cors_response(500, {
            "error": "Health check failed",
            "details": str(e)
        }, request_headers=request_headers, tenant_hash=tenant_hash)

def handle_cache_status_action(request_headers=None):
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

def handle_cache_clear_action(tenant_hash, request_headers=None):
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
            
            # Dynamic S3 mapping file validation with graceful degradation
            if format_valid:
                try:
                    mapping_key = f"{MAPPINGS_PREFIX}/{tenant_hash}.json"
                    if AWS_CLIENT_MANAGER_AVAILABLE:
                        try:
                            def validate_tenant_operation():
                                protected_s3_operation('head_object', Bucket=S3_BUCKET, Key=mapping_key)
                                return True
                            
                            hash_is_valid = graceful_degradation.handle_tenant_validation_with_cache(
                                tenant_hash, validate_tenant_operation
                            )
                            logger.info(f"[{tenant_hash[:8]}...] ✅ Hash validation passed via enhanced method")
                            
                        except (ConnectTimeoutError, ReadTimeoutError, CircuitBreakerError) as e:
                            logger.error(f"⏰ S3 timeout during hash validation for {tenant_hash[:8]}... (no cache): {e}")
                            hash_is_valid = False
                            return cors_response(503, {
                                "error": "Configuration service temporarily unavailable",
                                "message": "Tenant validation service is experiencing high latency",
                                "retry_after": 30
                            })
                    else:
                        # Fallback to legacy client
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
        
        # Resolve hash to get tenant information with timeout protection and caching
        mapping_key = f"{MAPPINGS_PREFIX}/{tenant_hash}.json"
        
        logger.info(f"[{tenant_hash[:8]}...] 🔍 Resolving hash via S3")
        
        if AWS_CLIENT_MANAGER_AVAILABLE:
            try:
                def get_mapping_operation():
                    return protected_s3_operation('get_object', Bucket=S3_BUCKET, Key=mapping_key)
                
                response = graceful_degradation.handle_s3_config_with_cache(
                    S3_BUCKET, mapping_key, get_mapping_operation
                )
                
                # Handle both fresh and cached responses
                if hasattr(response["Body"], 'read'):
                    body_content = response["Body"].read()
                else:
                    body_content = response["Body"]
                    
                mapping_data = json.loads(body_content)
                mapped_tenant = mapping_data.get("tenant_id")
                
            except (ConnectTimeoutError, ReadTimeoutError, CircuitBreakerError) as e:
                logger.error(f"⏰ S3 timeout resolving tenant hash {tenant_hash[:8]}... (no cache): {e}")
                return cors_response(503, {
                    "error": "Configuration service temporarily unavailable",
                    "message": "Tenant resolution service is experiencing high latency",
                    "retry_after": 20
                })
        else:
            # Fallback to legacy client
            response = s3.get_object(Bucket=S3_BUCKET, Key=mapping_key)
            mapping_data = json.loads(response["Body"].read())
            mapped_tenant = mapping_data.get("tenant_id")
        
        if not mapped_tenant:
            raise ValueError("Invalid mapping data")
        
        # Load config using mapped information with timeout protection and caching
        config_key = f"{TENANTS_PREFIX}/{mapped_tenant}/{mapped_tenant}-config.json"
        logger.info(f"[{tenant_hash[:8]}...] 🔍 Loading config via S3")
        
        if AWS_CLIENT_MANAGER_AVAILABLE:
            try:
                def get_config_operation():
                    return protected_s3_operation('get_object', Bucket=S3_BUCKET, Key=config_key)
                
                response = graceful_degradation.handle_s3_config_with_cache(
                    S3_BUCKET, config_key, get_config_operation
                )
                
                # Handle both fresh and cached responses
                if hasattr(response["Body"], 'read'):
                    body_content = response["Body"].read()
                else:
                    body_content = response["Body"]
                    
                config = json.loads(body_content)
                
            except (ConnectTimeoutError, ReadTimeoutError, CircuitBreakerError) as e:
                logger.error(f"⏰ S3 timeout loading config for {tenant_hash[:8]}... (no cache): {e}")
                return cors_response(503, {
                    "error": "Configuration service temporarily unavailable",
                    "message": "Configuration loading service is experiencing high latency",
                    "retry_after": 20
                })
        else:
            # Fallback to legacy client
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

def handle_conversation_action_wrapper(event, context, security_context):
    """Wrapper for conversation action with audit integration"""
    # Extract tenant hash and headers for CORS (outside try block for exception handler access)
    query_params = event.get("queryStringParameters") or {}
    tenant_hash = query_params.get("t")
    request_headers = event.get("headers", {}) or {}
    
    try:
        if not CONVERSATION_HANDLER_AVAILABLE:
            logger.error("conversation_handler module not available")
            return cors_response(503, {
                "error": "Conversation service unavailable",
                "details": "Conversation handler module not available"
            }, request_headers=request_headers, tenant_hash=tenant_hash)
        
        logger.info("💬 Processing conversation action")
        
        # Call conversation handler
        response = handle_conversation_action(event, context)
        return ensure_cors_headers(response, request_headers=request_headers, tenant_hash=tenant_hash)
        
    except Exception as e:
        logger.error(f"❌ Conversation action failed: {str(e)}")
        
        # Audit failure if possible
        if AUDIT_LOGGER_AVAILABLE:
            audit_logger.log_audit_event(
                tenant_id="unknown",
                event_type='CONVERSATION_ERROR',
                session_id=security_context.get('request_id'),
                context={'error': str(e)[:200]}
            )
        
        return cors_response(500, {
            "error": "Conversation processing failed",
            "details": str(e)
        }, request_headers=request_headers, tenant_hash=tenant_hash)

def handle_init_session_action(event, tenant_hash, tenant_info, security_context):
    """
    Initialize new conversation session with JWT token generation
    Creates initial state token for conversation handler authentication
    """
    try:
        if not tenant_hash:
            # Audit unauthorized access attempt
            if AUDIT_LOGGER_AVAILABLE:
                audit_logger.log_unauthorized_access(
                    tenant_id="unknown",
                    session_id=security_context.get('request_id'),
                    resource="init_session",
                    action="init_session",
                    source_ip=security_context.get('source_ip'),
                    reason="missing_tenant_hash"
                )
            
            return cors_response(400, {
                "error": "Missing tenant hash",
                "usage": "POST ?action=init_session&t=TENANT_HASH"
            })
        
        logger.info(f"[{tenant_hash[:8]}...] 🔐 Initializing new conversation session")
        
        # 1. Rate limiting check (using tenant_hash + session context as identifier)
        identifier = f"{tenant_hash}+{security_context.get('source_ip', 'unknown')}"
        rate_limit_response = _check_endpoint_rate_limit("init_session", identifier)
        if rate_limit_response:
            logger.warning(f"[{tenant_hash[:8]}...] Rate limit exceeded for init_session endpoint")
            return rate_limit_response
        
        # 2. Validate tenant authorization
        tenant_id = _validate_tenant_for_session(tenant_hash, tenant_info, security_context)
        if not tenant_id:
            return cors_response(403, {
                "error": "Tenant not authorized",
                "message": "The provided tenant hash is not authorized for session initialization"
            })
        
        # 3. Parse optional request body for session context
        session_context = {}
        try:
            body_str = event.get("body", "{}")
            if body_str and body_str != "{}":
                body = json.loads(body_str)
                # Extract safe session context fields
                session_context = {
                    "user_agent": body.get("user_agent", security_context.get('user_agent', 'unknown'))[:200],
                    "session_metadata": body.get("session_context", {})
                }
        except json.JSONDecodeError:
            # Non-critical - continue with empty context
            logger.warning(f"[{tenant_hash[:8]}...] ⚠️ Invalid JSON in session init body, using defaults")
        
        # 4. Generate new session components
        session_id = _generate_session_id()
        initial_token = _generate_conversation_state_token(
            session_id=session_id,
            tenant_id=tenant_id,
            turn=0
        )
        
        if not initial_token:
            logger.error(f"[{tenant_hash[:8]}...] ❌ Failed to generate initial state token")
            return cors_response(500, {
                "error": "Session initialization failed",
                "message": "Unable to generate authentication token"
            })
        
        # 5. Calculate token expiry
        from datetime import datetime, timedelta
        expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat() + 'Z'
        
        # 6. Audit successful session initialization
        if AUDIT_LOGGER_AVAILABLE:
            audit_logger.log_audit_event(
                tenant_id=tenant_id,
                event_type='SESSION_INITIALIZED',
                session_id=session_id,
                context={
                    'tenant_hash': tenant_hash[:8] + '...',
                    'source_ip': security_context.get('source_ip'),
                    'user_agent': session_context.get('user_agent', 'unknown')[:100]
                }
            )
        
        # 7. Return session initialization response
        response_data = {
            "session_id": session_id,
            "state_token": initial_token,
            "expires_at": expires_at,
            "turn": 0,
            "tenant_id": tenant_id,
            "initialized_at": datetime.utcnow().isoformat() + 'Z'
        }
        
        logger.info(f"[{tenant_hash[:8]}...] ✅ Session {session_id[:12]}... initialized successfully")
        return cors_response(200, response_data)
        
    except Exception as e:
        logger.error(f"❌ Session initialization failed: {str(e)}")
        
        # Audit failure if possible
        if AUDIT_LOGGER_AVAILABLE:
            audit_logger.log_audit_event(
                tenant_id=tenant_hash if tenant_hash else "unknown",
                event_type='SESSION_INIT_FAILED',
                session_id=security_context.get('request_id'),
                context={'error': str(e)[:200], 'source_ip': security_context.get('source_ip')}
            )
        
        return cors_response(500, {
            "error": "Session initialization failed",
            "details": str(e)
        })

def _validate_tenant_for_session(tenant_hash, tenant_info, security_context):
    """
    Validate tenant authorization for session initialization
    Returns tenant_id if valid, None if invalid
    """
    try:
        # Use enhanced tenant inference if available
        if tenant_info and tenant_info.get('tenant_id'):
            logger.info(f"[{tenant_hash[:8]}...] ✅ Using validated tenant from inference: {tenant_info.get('source')}")
            return tenant_info.get('tenant_id')
        
        # Fallback to config validation
        if not TENANT_CONFIG_AVAILABLE:
            logger.error("Tenant validation service unavailable")
            return None
        
        try:
            config = get_config_for_tenant_by_hash(tenant_hash)
            if config and config.get('tenant_id'):
                logger.info(f"[{tenant_hash[:8]}...] ✅ Tenant validated via config service")
                return config.get('tenant_id')
            else:
                logger.error(f"[{tenant_hash[:8]}...] ❌ SECURITY: Invalid tenant hash for session init")
                
                # Audit unauthorized access attempt
                if AUDIT_LOGGER_AVAILABLE:
                    audit_logger.log_unauthorized_access(
                        tenant_id=tenant_hash,
                        session_id=security_context.get('request_id'),
                        resource="session_init",
                        action="init_session",
                        source_ip=security_context.get('source_ip'),
                        reason="tenant_not_authorized"
                    )
                return None
                
        except ValueError as e:
            if "Invalid tenant hash" in str(e):
                logger.error(f"[{tenant_hash[:8]}...] ❌ SECURITY: Invalid tenant hash format")
                return None
            else:
                raise
                
    except Exception as e:
        logger.error(f"[{tenant_hash[:8]}...] ❌ Tenant validation error: {str(e)}")
        return None

def _generate_session_id():
    """Generate secure UUID session identifier"""
    return str(uuid.uuid4())

def _generate_conversation_state_token(session_id, tenant_id, turn):
    """
    Generate conversation state token compatible with conversation_handler.py
    Uses same signing key and format as conversation handler
    """
    try:
        # Import required modules
        import jwt
        import time
        from datetime import datetime, timedelta
        
        # Get JWT signing key (same as conversation_handler)
        signing_key = _get_conversation_jwt_signing_key()
        if not signing_key:
            logger.error("❌ Unable to retrieve JWT signing key")
            return None
        
        # Build payload with exact same fields as conversation_handler expects
        current_time = datetime.utcnow()
        payload = {
            'sessionId': session_id,
            'tenantId': tenant_id,
            'turn': turn,
            'iat': int(current_time.timestamp()),
            'exp': int((current_time + timedelta(hours=24)).timestamp())  # 24-hour expiry
        }
        
        # Generate token using HS256 algorithm (same as conversation_handler)
        token = jwt.encode(payload, signing_key, algorithm='HS256')
        
        logger.info(f"[{tenant_id[:8]}...] 🔑 Generated state token for session {session_id[:12]}... turn={turn}")
        return token
        
    except Exception as e:
        logger.error(f"❌ State token generation failed: {str(e)}")
        return None

def _get_conversation_jwt_signing_key():
    """
    Get JWT signing key from AWS Secrets Manager
    Compatible with conversation_handler.py key retrieval
    """
    try:
        # Use same secret key name as conversation_handler
        JWT_SECRET_KEY_NAME = os.environ.get('JWT_SECRET_KEY_NAME', 'picasso/jwt/signing-key')
        
        # Get secret from AWS Secrets Manager with timeout protection and graceful degradation
        if AWS_CLIENT_MANAGER_AVAILABLE:
            try:
                def get_secret_operation():
                    return protected_secrets_operation(
                        'get_secret_value',
                        SecretId=JWT_SECRET_KEY_NAME
                    )
                
                response = graceful_degradation.handle_secrets_with_cache(
                    JWT_SECRET_KEY_NAME, get_secret_operation
                )
                key = response['SecretString']
                
            except (ConnectTimeoutError, ReadTimeoutError, CircuitBreakerError) as e:
                logger.error(f"⏰ Secrets Manager timeout getting JWT key (no cache available): {e}")
                return None
        else:
            # Fallback to legacy client
            secrets_client = boto3.client('secretsmanager')
            response = secrets_client.get_secret_value(SecretId=JWT_SECRET_KEY_NAME)
            key = response['SecretString']
        
        # Validate key format
        if not key or len(key) < 32:
            logger.error("❌ Invalid JWT signing key format")
            return None
            
        return key
        
    except ClientError as e:
        logger.error(f"❌ Failed to get JWT signing key: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ JWT key retrieval error: {str(e)}")
        return None

def handle_revoke_token_action(event, tenant_hash, tenant_info, security_context):
    """
    Handle action=revoke_token - Blacklist JWT tokens for immediate revocation
    Security: Validates requester authorization and implements rate limiting
    """
    try:
        if not tenant_hash:
            # Audit unauthorized access attempt
            if AUDIT_LOGGER_AVAILABLE:
                audit_logger.log_unauthorized_access(
                    tenant_id="unknown",
                    session_id=security_context.get('request_id'),
                    resource="token_revocation",
                    action="revoke_token",
                    source_ip=security_context.get('source_ip'),
                    reason="missing_tenant_hash"
                )
            
            return cors_response(400, {
                "error": "Missing tenant hash",
                "usage": "POST ?action=revoke_token&t=TENANT_HASH with body: {\"token\": \"JWT_TO_REVOKE\", \"reason\": \"REASON\"}"
            })
        
        if not TOKEN_BLACKLIST_AVAILABLE:
            logger.error("Token blacklist system not available")
            return cors_response(503, {
                "error": "Token revocation service unavailable",
                "details": "Token blacklist module not available"
            })
        
        logger.info(f"[{tenant_hash[:8]}...] 🚫 Processing token revocation request")
        
        # Rate limiting check (using tenant_hash + source_ip as identifier)
        identifier = f"{tenant_hash}+{security_context.get('source_ip', 'unknown')}"
        rate_limit_response = _check_endpoint_rate_limit("revoke_token", identifier)
        if rate_limit_response:
            logger.warning(f"[{tenant_hash[:8]}...] Rate limit exceeded for revoke_token endpoint")
            return rate_limit_response
        
        # Validate tenant authorization for revocation
        tenant_id = _validate_tenant_for_session(tenant_hash, tenant_info, security_context)
        if not tenant_id:
            return cors_response(403, {
                "error": "Tenant not authorized",
                "message": "The provided tenant hash is not authorized for token revocation"
            })
        
        # Parse request body
        try:
            body_str = event.get("body", "{}")
            if not body_str or body_str == "{}":
                return cors_response(400, {
                    "error": "Missing request body",
                    "usage": "POST with body: {\"token\": \"JWT_TO_REVOKE\", \"reason\": \"user_logout|security_incident|admin_revoke\"}"
                })
            
            body = json.loads(body_str)
            token_to_revoke = body.get("token")
            revocation_reason = body.get("reason", "manual_revocation")
            revocation_type = body.get("type", "single")  # single or tenant_wide
            
            if not token_to_revoke and revocation_type != "tenant_wide":
                return cors_response(400, {
                    "error": "Missing token",
                    "message": "JWT token to revoke is required unless using tenant_wide revocation"
                })
                
        except json.JSONDecodeError:
            return cors_response(400, {
                "error": "Invalid JSON in request body",
                "usage": "POST with valid JSON body"
            })
        
        # Validate revocation reason
        valid_reasons = ["user_logout", "security_incident", "admin_revoke", "session_timeout", "manual_revocation"]
        if revocation_reason not in valid_reasons:
            return cors_response(400, {
                "error": "Invalid revocation reason",
                "valid_reasons": valid_reasons
            })
        
        # Process revocation based on type
        try:
            if revocation_type == "tenant_wide":
                # Revoke all tokens for the tenant
                logger.info(f"[{tenant_hash[:8]}...] 🚨 Performing tenant-wide token revocation")
                
                revocation_result = revoke_tenant_tokens(
                    tenant_id=tenant_id,
                    reason=revocation_reason,
                    requester_context={
                        'requester_id': security_context.get('request_id'),
                        'source_ip': security_context.get('source_ip'),
                        'user_agent': security_context.get('user_agent')
                    }
                )
                
                logger.info(f"[{tenant_hash[:8]}...] ✅ Tenant-wide revocation completed: {revocation_result.get('revocation_id')}")
                
                return cors_response(200, {
                    "success": True,
                    "revocation_type": "tenant_wide",
                    "revocation_id": revocation_result.get('revocation_id'),
                    "tenant_id": tenant_id,
                    "reason": revocation_reason,
                    "revoked_at": revocation_result.get('revoked_at'),
                    "message": "All tenant tokens have been revoked"
                })
                
            else:
                # Revoke single token
                logger.info(f"[{tenant_hash[:8]}...] 🚫 Performing single token revocation")
                
                # Extract token expiry for TTL optimization
                try:
                    import jwt
                    from datetime import datetime
                    # Decode token without verification to get expiry
                    token_payload = jwt.decode(token_to_revoke, options={"verify_signature": False})
                    token_expires_at = datetime.fromtimestamp(token_payload.get('exp', time.time() + 86400))
                except Exception:
                    # Fallback to 24 hours if we can't decode
                    from datetime import datetime, timedelta
                    token_expires_at = datetime.utcnow() + timedelta(hours=24)
                
                revocation_result = add_token_to_blacklist(
                    token=token_to_revoke,
                    reason=revocation_reason,
                    expires_at=token_expires_at,
                    tenant_id=tenant_id
                )
                
                logger.info(f"[{tenant_hash[:8]}...] ✅ Token revocation completed: {revocation_result.get('token_hash')}")
                
                return cors_response(200, {
                    "success": True,
                    "revocation_type": "single",
                    "token_hash": revocation_result.get('token_hash'),
                    "tenant_id": tenant_id,
                    "reason": revocation_reason,
                    "blacklisted_at": revocation_result.get('blacklisted_at'),
                    "message": "Token has been successfully revoked"
                })
                
        except TokenBlacklistError as e:
            logger.error(f"[{tenant_hash[:8]}...] ❌ Token revocation failed: {e.message}")
            return cors_response(e.status_code, {
                "error": e.error_type,
                "message": e.message
            })
        
    except Exception as e:
        logger.error(f"❌ Token revocation action failed: {str(e)}")
        
        # Audit failure
        if AUDIT_LOGGER_AVAILABLE:
            audit_logger.log_audit_event(
                tenant_id=tenant_hash if tenant_hash else "unknown",
                event_type='TOKEN_REVOCATION_FAILED',
                session_id=security_context.get('request_id'),
                context={'error': str(e)[:200], 'source_ip': security_context.get('source_ip')}
            )
        
        return cors_response(500, {
            "error": "Token revocation failed",
            "details": str(e)
        })

def handle_blacklist_status_action(tenant_hash, security_context):
    """
    Handle action=blacklist_status - Get blacklist system status and statistics
    """
    try:
        if not TOKEN_BLACKLIST_AVAILABLE:
            return cors_response(503, {
                "error": "Token blacklist service unavailable",
                "details": "Token blacklist module not available"
            })
        
        logger.info(f"[{tenant_hash[:8] if tenant_hash else 'global'}...] 📊 Getting blacklist status")
        
        # Rate limiting check (using tenant_hash or 'global' + source_ip as identifier)
        identifier = f"{tenant_hash or 'global'}+{security_context.get('source_ip', 'unknown')}"
        rate_limit_response = _check_endpoint_rate_limit("blacklist_status", identifier)
        if rate_limit_response:
            logger.warning(f"[{tenant_hash[:8] if tenant_hash else 'global'}...] Rate limit exceeded for blacklist_status endpoint")
            return rate_limit_response
        
        # Verify blacklist system integration
        system_status = verify_blacklist_integration()
        
        # Get basic statistics (tenant-specific if hash provided)
        stats = {}
        if tenant_hash:
            # Validate tenant first
            tenant_id = None
            if TENANT_CONFIG_AVAILABLE:
                try:
                    config = get_config_for_tenant_by_hash(tenant_hash)
                    tenant_id = config.get('tenant_id') if config else None
                except Exception:
                    pass
            
            if tenant_id:
                # Get tenant-specific stats (this is an expensive operation)
                from token_blacklist import get_blacklist_stats
                stats = get_blacklist_stats(tenant_id)
            else:
                stats = {"error": "Invalid tenant hash or tenant not found"}
        else:
            # Get global stats
            from token_blacklist import get_blacklist_stats
            stats = get_blacklist_stats()
        
        status_response = {
            "blacklist_system": {
                "available": TOKEN_BLACKLIST_AVAILABLE,
                "table_accessible": system_status.get('table_accessible', False),
                "cache_functional": system_status.get('cache_functional', False),
                "audit_logger_available": system_status.get('audit_logger_available', False),
                "overall_status": system_status.get('overall_status', False)
            },
            "statistics": stats,
            "timestamp": datetime.utcnow().isoformat() + 'Z'
        }
        
        if tenant_hash:
            status_response["tenant_hash"] = tenant_hash[:8] + "..."
        
        return cors_response(200, status_response)
        
    except Exception as e:
        logger.error(f"❌ Blacklist status action failed: {str(e)}")
        return cors_response(500, {
            "error": "Blacklist status check failed",
            "details": str(e)
        })

def handle_timeout_status_action(security_context):
    """
    Handle action=timeout_status - Get comprehensive timeout protection status
    Provides monitoring for circuit breakers, caches, and service health
    """
    try:
        logger.info("📋 Getting comprehensive timeout protection status")
        
        if not AWS_CLIENT_MANAGER_AVAILABLE:
            return cors_response(503, {
                "error": "Timeout protection service unavailable",
                "details": "AWS client manager not available"
            })
        
        # Get comprehensive status from all systems
        from aws_client_manager import log_service_health_metrics, get_cache_stats, aws_client_manager
        
        service_health = log_service_health_metrics()
        cache_stats = get_cache_stats()
        
        timeout_status = {
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "timeout_protection": {
                "enabled": AWS_CLIENT_MANAGER_AVAILABLE,
                "healthy_services": service_health.get('healthy_services', 0),
                "total_services": service_health.get('total_services', 0),
                "overall_health": "healthy" if service_health.get('healthy_services', 0) == service_health.get('total_services', 0) else "degraded"
            },
            "circuit_breakers": {},
            "graceful_degradation": {
                "cache_enabled": True,
                "cache_statistics": cache_stats.get('cache_types', {})
            }
        }
        
        # Add detailed circuit breaker status
        for service_name, breaker_status in service_health.get('service_status', {}).items():
            timeout_status["circuit_breakers"][service_name] = {
                "state": breaker_status['state'],
                "failure_count": breaker_status['failure_count'],
                "healthy": breaker_status['state'] == 'CLOSED',
                "last_failure": breaker_status.get('last_failure_time', 0)
            }
        
        # Calculate cache health
        total_cache_entries = 0
        active_cache_entries = 0
        
        for cache_type, stats in cache_stats.get('cache_types', {}).items():
            total_cache_entries += stats.get('total_entries', 0)
            active_cache_entries += stats.get('active_entries', 0)
        
        timeout_status["graceful_degradation"]["cache_health"] = {
            "total_entries": total_cache_entries,
            "active_entries": active_cache_entries,
            "cache_hit_potential": active_cache_entries > 0
        }
        
        # Service-specific timeout configuration
        timeout_status["timeout_configuration"] = {
            "dynamodb": "5s read, 3s connect",
            "secretsmanager": "3s read, 2s connect",
            "s3": "3s read, 2s connect",
            "circuit_breaker": "5 failures trigger, 60s timeout"
        }
        
        # Performance metrics
        timeout_status["performance_targets"] = {
            "blacklist_check": "<10ms (with cache)",
            "config_load": "<500ms (with cache fallback)",
            "jwt_validation": "<100ms (with cache fallback)",
            "max_lambda_runtime": "30s (timeout protection prevents)"
        }
        
        # Overall system status
        if timeout_status["timeout_protection"]["overall_health"] == "healthy" and active_cache_entries > 0:
            overall_status = "optimal"
            status_code = 200
        elif timeout_status["timeout_protection"]["overall_health"] == "degraded":
            overall_status = "degraded_but_functional"
            status_code = 200
        else:
            overall_status = "impaired"
            status_code = 503
        
        timeout_status["overall_status"] = overall_status
        
        return cors_response(status_code, timeout_status)
        
    except Exception as e:
        logger.error(f"❌ Timeout status check failed: {str(e)}")
        return cors_response(500, {
            "error": "Timeout status check failed",
            "details": str(e)
        })

def _check_endpoint_rate_limit(endpoint, identifier):
    """
    Rate limiting for endpoints: 10 requests per 10 seconds per identifier
    Security hardener: Prevent abuse with memory leak protection and bounds
    Similar to conversation_handler._check_rate_limit() but for endpoints
    """
    current_time = time.time()
    window_start = current_time - RATE_LIMIT_WINDOW
    
    # Time-based cleanup to prevent memory leak
    _cleanup_endpoint_rate_limits(current_time)
    
    # Create composite key for endpoint + identifier
    rate_limit_key = f"{endpoint}:{identifier}"
    
    # Memory protection: enforce maximum sessions limit
    if len(endpoint_rate_limit_store) >= MAX_ENDPOINT_RATE_LIMIT_SESSIONS and rate_limit_key not in endpoint_rate_limit_store:
        # LRU eviction: remove oldest session
        _evict_oldest_endpoint_session(current_time)
        logger.warning(f"Rate limit store at capacity ({MAX_ENDPOINT_RATE_LIMIT_SESSIONS}), evicted oldest session")
    
    # Clean old entries for this key
    if rate_limit_key in endpoint_rate_limit_store:
        endpoint_rate_limit_store[rate_limit_key] = [
            timestamp for timestamp in endpoint_rate_limit_store[rate_limit_key]
            if timestamp > window_start
        ]
    else:
        endpoint_rate_limit_store[rate_limit_key] = []
    
    # Check if limit exceeded
    if len(endpoint_rate_limit_store[rate_limit_key]) >= RATE_LIMIT_REQUESTS:
        # Audit rate limit violation for security monitoring
        if AUDIT_LOGGER_AVAILABLE:
            try:
                audit_logger._log_audit_event(
                    tenant_id=identifier.split('+')[0] if '+' in identifier else identifier,
                    event_type='ENDPOINT_RATE_LIMIT_VIOLATION',
                    session_id=identifier.split('+')[1] if '+' in identifier else 'unknown',
                    context={
                        'endpoint': endpoint,
                        'identifier': identifier,
                        'request_count': len(endpoint_rate_limit_store[rate_limit_key]),
                        'window_seconds': RATE_LIMIT_WINDOW
                    }
                )
            except Exception as e:
                logger.error(f"Failed to audit rate limit violation: {e}")
        
        logger.warning(f"Rate limit exceeded for {endpoint} with identifier {identifier[:12]}...")
        return cors_response(429, {
            "error": "RATE_LIMITED",
            "message": "Too many requests",
            "retry_after": RATE_LIMIT_WINDOW
        })
    
    # Add current request
    endpoint_rate_limit_store[rate_limit_key].append(current_time)
    
    # Memory usage monitoring
    _monitor_endpoint_memory_usage()
    
    # Rate limit check passed
    return None

def _cleanup_endpoint_rate_limits(current_time):
    """
    Time-based cleanup of expired endpoint rate limit entries to prevent memory leak
    Security fix: Prevent unbounded memory growth with predictable cleanup
    """
    global endpoint_rate_limit_store, last_endpoint_cleanup_time
    
    # Time-based cleanup instead of request-count based to handle low-traffic scenarios
    if current_time - last_endpoint_cleanup_time < ENDPOINT_CLEANUP_INTERVAL_SECONDS:
        return
    
    last_endpoint_cleanup_time = current_time
    window_start = current_time - RATE_LIMIT_WINDOW
    keys_to_remove = []
    
    for rate_limit_key, timestamps in endpoint_rate_limit_store.items():
        # Remove expired timestamps
        active_timestamps = [ts for ts in timestamps if ts > window_start]
        if active_timestamps:
            endpoint_rate_limit_store[rate_limit_key] = active_timestamps
        else:
            keys_to_remove.append(rate_limit_key)
    
    # Remove empty keys
    for rate_limit_key in keys_to_remove:
        del endpoint_rate_limit_store[rate_limit_key]
    
    logger.info(f"Time-based endpoint rate limit cleanup: removed {len(keys_to_remove)} expired keys, {len(endpoint_rate_limit_store)} active keys remain")

def _evict_oldest_endpoint_session(current_time):
    """
    LRU eviction: remove the endpoint session with the oldest timestamp
    Memory protection: prevent unbounded growth under high load
    """
    global endpoint_rate_limit_store
    
    if not endpoint_rate_limit_store:
        return
    
    # Find key with oldest timestamp
    oldest_key = None
    oldest_timestamp = current_time
    
    for rate_limit_key, timestamps in endpoint_rate_limit_store.items():
        if timestamps and min(timestamps) < oldest_timestamp:
            oldest_timestamp = min(timestamps)
            oldest_key = rate_limit_key
    
    # Remove oldest key
    if oldest_key:
        del endpoint_rate_limit_store[oldest_key]
        logger.info(f"LRU evicted endpoint rate limit key {oldest_key} (oldest timestamp: {oldest_timestamp})")

def _monitor_endpoint_memory_usage():
    """
    Monitor endpoint rate limit store memory usage and log warnings
    Memory protection: proactive monitoring for DoS prevention
    """
    key_count = len(endpoint_rate_limit_store)
    
    if key_count >= ENDPOINT_MEMORY_WARNING_THRESHOLD:
        total_timestamps = sum(len(timestamps) for timestamps in endpoint_rate_limit_store.values())
        logger.warning(f"Endpoint rate limit memory usage high: {key_count}/{MAX_ENDPOINT_RATE_LIMIT_SESSIONS} keys, {total_timestamps} total timestamps")
    
    # Log memory stats every 100 keys for monitoring
    if key_count > 0 and key_count % 100 == 0:
        total_timestamps = sum(len(timestamps) for timestamps in endpoint_rate_limit_store.values())
        avg_timestamps = total_timestamps / key_count if key_count > 0 else 0
        logger.info(f"Endpoint rate limit memory stats: {key_count} keys, {total_timestamps} timestamps, {avg_timestamps:.1f} avg/key")

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

def get_tenant_allowed_origins(tenant_hash, tenant_config=None):
    """
    Get allowed CORS origins for a tenant from configuration
    Security: Validates tenant and returns approved domains only
    """
    try:
        # If tenant config not provided, load it
        if not tenant_config and TENANT_CONFIG_AVAILABLE and tenant_hash:
            try:
                tenant_config = get_config_for_tenant_by_hash(tenant_hash)
            except Exception as e:
                logger.warning(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Could not load tenant config for CORS: {e}")
                return []
        
        if not tenant_config:
            return []
        
        # Extract allowed origins from tenant config
        allowed_origins = []
        
        # Check for explicit CORS configuration
        cors_config = tenant_config.get('cors_origins', [])
        if cors_config and isinstance(cors_config, list):
            allowed_origins.extend(cors_config)
        
        # Check for domain configurations
        domain_config = tenant_config.get('domains', [])
        if domain_config and isinstance(domain_config, list):
            for domain in domain_config:
                if isinstance(domain, str):
                    # Add both http and https variants
                    allowed_origins.append(f"https://{domain}")
                    allowed_origins.append(f"http://{domain}")
                elif isinstance(domain, dict) and 'domain' in domain:
                    domain_name = domain['domain']
                    allowed_origins.append(f"https://{domain_name}")
                    allowed_origins.append(f"http://{domain_name}")
        
        # Check for legacy domain field
        if 'domain' in tenant_config:
            domain = tenant_config['domain']
            if isinstance(domain, str):
                allowed_origins.append(f"https://{domain}")
                allowed_origins.append(f"http://{domain}")
        
        # Add CloudFront domain as fallback for legitimate requests
        allowed_origins.append(f"https://{CLOUDFRONT_DOMAIN}")
        
        # TEMPORARY: Add localhost origins for development (remove after production)
        development_origins = [
            "http://localhost:3000",
            "http://localhost:5173", 
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173"
        ]
        allowed_origins.extend(development_origins)
        logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Added development CORS origins for staging testing")
        
        # Remove duplicates and validate format
        unique_origins = list(set(allowed_origins))
        validated_origins = []
        
        for origin in unique_origins:
            if _is_valid_origin(origin):
                validated_origins.append(origin)
            else:
                logger.warning(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Invalid origin format rejected: {origin}")
        
        logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Loaded {len(validated_origins)} allowed CORS origins")
        return validated_origins
        
    except Exception as e:
        logger.error(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Error loading tenant CORS origins: {e}")
        return []

def _is_valid_origin(origin):
    """
    Validate origin URL format for security
    Security: Prevents injection and ensures valid HTTP(S) URLs
    """
    if not origin or not isinstance(origin, str):
        return False
    
    # Must start with http:// or https://
    if not (origin.startswith('https://') or origin.startswith('http://')):
        return False
    
    # Basic length check
    if len(origin) > 253:  # Max domain length + protocol
        return False
    
    # Must not contain suspicious characters
    suspicious_chars = [' ', '<', '>', '"', "'", '\\', '\n', '\r', '\t']
    if any(char in origin for char in suspicious_chars):
        return False
    
    return True

def validate_cors_origin(request_headers, tenant_hash, tenant_config=None):
    """
    Validate CORS origin against tenant-specific allowed domains
    Security: Implements tenant-specific CORS validation with fail-closed approach
    Returns: (allowed_origin_or_none, is_valid)
    """
    try:
        # Extract origin from request headers
        origin = None
        if request_headers:
            # Check different header name variations (case-insensitive)
            for header_name in ['Origin', 'origin', 'ORIGIN']:
                if header_name in request_headers:
                    origin = request_headers[header_name]
                    break
        
        # If no origin header (direct API access), allow for specific cases
        if not origin:
            logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] No Origin header - direct API access")
            # For direct API access (no browser), don't set CORS headers
            return None, True
        
        # Get tenant-specific allowed origins
        allowed_origins = get_tenant_allowed_origins(tenant_hash, tenant_config)
        
        # STAGING OVERRIDE: Always allow localhost in staging environment
        if ENVIRONMENT == 'staging' and origin and origin.startswith('http://localhost:'):
            logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] STAGING OVERRIDE: Allowing localhost origin {origin}")
            return origin, True
        
        # If no allowed origins configured, fail closed
        if not allowed_origins:
            logger.warning(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] CORS REJECTED: No allowed origins configured for tenant")
            
            # Audit CORS violation
            if AUDIT_LOGGER_AVAILABLE:
                try:
                    audit_logger.log_unauthorized_access(
                        tenant_id=tenant_hash or "unknown",
                        session_id="cors_validation",
                        resource="cors_validation",
                        action="cors_check",
                        source_ip="unknown",
                        reason="no_allowed_origins_configured"
                    )
                except Exception:
                    pass  # Don't fail the request if audit fails
            
            return None, False
        
        # Check if origin is in allowed list
        if origin in allowed_origins:
            logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] CORS ALLOWED: {origin}")
            return origin, True
        
        # CORS violation detected
        logger.warning(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] CORS REJECTED: {origin} not in allowed origins")
        logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Allowed origins: {allowed_origins}")
        
        # Audit CORS violation
        if AUDIT_LOGGER_AVAILABLE:
            try:
                audit_logger.log_unauthorized_access(
                    tenant_id=tenant_hash or "unknown",
                    session_id="cors_validation",
                    resource="cors_validation",
                    action="cors_check",
                    source_ip="unknown",
                    reason=f"origin_not_allowed_{origin}"
                )
            except Exception:
                pass  # Don't fail the request if audit fails
        
        return None, False
        
    except Exception as e:
        logger.error(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Error validating CORS origin: {e}")
        # Fail closed on error
        return None, False

def cors_response(status_code, body, request_headers=None, tenant_hash=None, tenant_config=None):
    """
    Standardized CORS response with tenant-specific origin validation
    Security: Replaces wildcard CORS with validated tenant-specific origins
    """
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Cache-Control": "no-cache" if status_code >= 400 else "public, max-age=300",
        "CloudFront-Domain": CLOUDFRONT_DOMAIN
    }
    
    # Apply secure CORS validation
    allowed_origin, is_valid = validate_cors_origin(request_headers, tenant_hash, tenant_config)
    
    if allowed_origin:
        # Set specific validated origin
        headers["Access-Control-Allow-Origin"] = allowed_origin
        headers["Access-Control-Allow-Credentials"] = "true"
        logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] SECURE CORS: Set origin to {allowed_origin}")
    elif not is_valid:
        # CORS violation - do not set Access-Control-Allow-Origin header
        # This will cause the browser to reject the request
        logger.warning(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] CORS VIOLATION: Origin rejected, no CORS headers set")
    else:
        # No origin header (direct API access) - don't set CORS headers
        logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Direct API access - no CORS headers needed")
    
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body) if not isinstance(body, str) else body
    }

def ensure_cors_headers(response, request_headers=None, tenant_hash=None, tenant_config=None):
    """
    Ensure response has secure CORS headers with tenant-specific validation
    Security: Replaces wildcard CORS with validated tenant-specific origins
    """
    if isinstance(response, dict) and "headers" in response:
        # Apply secure CORS validation
        allowed_origin, is_valid = validate_cors_origin(request_headers, tenant_hash, tenant_config)
        
        # Update with secure headers
        secure_headers = {
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "CloudFront-Domain": CLOUDFRONT_DOMAIN
        }
        
        if allowed_origin:
            # Set specific validated origin
            secure_headers["Access-Control-Allow-Origin"] = allowed_origin
            secure_headers["Access-Control-Allow-Credentials"] = "true"
            logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] SECURE CORS: Updated headers with origin {allowed_origin}")
        elif not is_valid:
            # CORS violation - do not set Access-Control-Allow-Origin header
            logger.warning(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] CORS VIOLATION: Origin rejected in header update")
            # Remove any existing Access-Control-Allow-Origin header
            response["headers"].pop("Access-Control-Allow-Origin", None)
        else:
            # No origin header (direct API access) - don't set CORS headers
            logger.info(f"[{tenant_hash[:8] if tenant_hash else 'unknown'}...] Direct API access - skipping CORS headers")
        
        response["headers"].update(secure_headers)
    
    return response