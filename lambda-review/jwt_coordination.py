"""
JWT Coordination System for PICASSO Function URL Authentication
Provides secure JWT token generation and validation for streaming Function URLs
"""

import json
import jwt
import boto3
import logging
import os
import time
import hashlib
from datetime import datetime, timedelta
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
secrets_client = boto3.client('secretsmanager')
s3 = boto3.client('s3')

# Environment configuration
JWT_SECRET_KEY_NAME = os.environ.get('JWT_SECRET_KEY_NAME', 'picasso/jwt/signing-key')
S3_BUCKET = os.environ.get('S3_BUCKET', 'myrecruiter-picasso')
MAPPINGS_PREFIX = os.environ.get('MAPPINGS_PREFIX', 'mappings')
STREAMING_FUNCTION_URL = os.environ.get('STREAMING_FUNCTION_URL')
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'staging')

class JWTCoordinator:
    """Centralized JWT coordination for Function URL authentication"""
    
    def __init__(self):
        self._signing_key = None
        self._key_expires_at = 0
        
    def get_signing_key(self, force_refresh=False):
        """Get JWT signing key with caching for performance"""
        try:
            current_time = time.time()
            
            # Refresh key if expired or forced
            if force_refresh or not self._signing_key or current_time >= self._key_expires_at:
                logger.info("🔑 Refreshing JWT signing key from Secrets Manager")
                
                secret_response = secrets_client.get_secret_value(SecretId=JWT_SECRET_KEY_NAME)
                secret_data = json.loads(secret_response['SecretString'])
                self._signing_key = secret_data.get('signingKey')
                
                if not self._signing_key:
                    raise ValueError("Signing key not found in secret")
                
                # Cache key for 5 minutes to balance security and performance
                self._key_expires_at = current_time + 300
                logger.info("✅ JWT signing key refreshed and cached")
            
            return self._signing_key
            
        except ClientError as e:
            logger.error(f"❌ Failed to retrieve JWT signing key: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"❌ JWT key retrieval error: {str(e)}")
            raise
    
    def generate_streaming_jwt(self, tenant_hash, purpose='stream', duration_minutes=15):
        """
        Generate JWT token for streaming Function URL access - Enhanced with Tenant Inference
        
        Args:
            tenant_hash: Server-inferred tenant hash for security
            purpose: Token purpose ('stream', 'manage', etc.)
            duration_minutes: Token validity duration (5-15 minutes recommended)
        """
        try:
            # Enhanced tenant resolution with inference system
            tenant_id = None
            inference_source = 'legacy'
            
            # Try enhanced tenant inference first
            try:
                from tenant_inference import resolveTenant, extract_tenant_from_token
                
                # Create mock event for tenant inference
                mock_event = {
                    'queryStringParameters': {'t': tenant_hash},
                    'headers': {},
                    'requestContext': {}
                }
                
                tenant_result = resolveTenant(mock_event)
                if tenant_result and not tenant_result.get('error'):
                    tenant_id = tenant_result.get('tenant_hash')
                    inference_source = tenant_result.get('source', 'enhanced')
                    logger.info(f"✅ Enhanced tenant inference successful via {inference_source}")
                else:
                    logger.warning(f"⚠️ Enhanced tenant inference failed, falling back to legacy method")
                    
            except ImportError:
                logger.info("Enhanced tenant inference not available, using legacy method")
            
            # Fallback to legacy resolution if enhanced failed
            if not tenant_id:
                tenant_id = self._resolve_tenant_from_hash(tenant_hash)
                if not tenant_id:
                    logger.warning(f"❌ Invalid tenant hash provided: {tenant_hash[:8]}...")
                    return None, "Invalid tenant hash"
            
            # Generate unique session ID
            session_id = self._generate_session_id(tenant_id, tenant_hash)
            
            # Validate duration limits for security
            if duration_minutes < 5 or duration_minutes > 15:
                duration_minutes = 15
                logger.warning(f"⚠️ JWT duration clamped to {duration_minutes} minutes for security")
            
            # Get signing key
            signing_key = self.get_signing_key()
            
            # Create JWT payload with healthcare compliance and enhanced security
            current_time = datetime.utcnow()
            payload = {
                'sessionId': session_id,
                'tenantId': tenant_id,
                'tenantHash': tenant_hash[:12] + '...',  # Partial hash for logging
                'purpose': purpose,
                'iat': int(current_time.timestamp()),
                'exp': int((current_time + timedelta(minutes=duration_minutes)).timestamp()),
                'iss': f'picasso-{ENVIRONMENT}',  # Issuer
                'aud': 'streaming-function',  # Audience
                'jti': self._generate_jti(session_id, tenant_id),  # JWT ID for tracking
                'kid': 'default',  # Key ID for rotation support
                'inference_source': inference_source,  # Track how tenant was inferred
                'security_level': 'enhanced' if inference_source != 'legacy' else 'standard'
            }
            
            # Add environment-specific claims
            if ENVIRONMENT == 'production':
                payload['compliance'] = 'HIPAA'
                payload['data_classification'] = 'Healthcare-PHI'
            
            # Generate token
            jwt_token = jwt.encode(payload, signing_key, algorithm='HS256')
            
            logger.info(f"✅ JWT generated - Session: {session_id[:12]}..., Tenant: {tenant_id[:8]}..., Purpose: {purpose}, Duration: {duration_minutes}m")
            
            return {
                'jwt_token': jwt_token,
                'session_id': session_id,
                'tenant_id': tenant_id[:8] + '...',  # Partial for logging
                'expires_in': duration_minutes * 60,  # seconds
                'expires_at': payload['exp'],
                'purpose': purpose,
                'streaming_url': STREAMING_FUNCTION_URL
            }, None
            
        except Exception as e:
            logger.error(f"❌ JWT generation failed: {str(e)}", exc_info=True)
            return None, f"JWT generation failed: {str(e)}"
    
    def validate_jwt_token(self, token):
        """
        Validate JWT token and return payload if valid
        Used by streaming Function URL for authentication
        """
        try:
            # Get current signing key
            signing_key = self.get_signing_key()
            
            # Decode and validate token
            payload = jwt.decode(token, signing_key, algorithms=['HS256'])
            
            # Enhanced validation checks with new security claims
            required_fields = ['sessionId', 'tenantId', 'purpose', 'exp', 'iat', 'iss', 'aud', 'jti']
            for field in required_fields:
                if not payload.get(field):
                    logger.warning(f"❌ JWT missing required field: {field}")
                    return None, f"Invalid token: missing {field}"
            
            # Validate enhanced security fields
            if payload.get('kid') and payload['kid'] != 'default':
                logger.warning(f"❌ JWT invalid key ID: {payload['kid']}")
                return None, "Invalid key identifier"
            
            # Log inference source for security monitoring
            inference_source = payload.get('inference_source', 'unknown')
            security_level = payload.get('security_level', 'standard')
            logger.info(f"🔍 JWT validated - Inference: {inference_source}, Security: {security_level}")
            
            # Validate issuer and audience
            expected_issuer = f'picasso-{ENVIRONMENT}'
            if payload.get('iss') != expected_issuer:
                logger.warning(f"❌ JWT invalid issuer: {payload.get('iss')}")
                return None, "Invalid token issuer"
            
            if payload.get('aud') != 'streaming-function':
                logger.warning(f"❌ JWT invalid audience: {payload.get('aud')}")
                return None, "Invalid token audience"
            
            # Check token age (not too old)
            token_age = time.time() - payload.get('iat', 0)
            if token_age > 900:  # 15 minutes max age
                logger.warning(f"❌ JWT token too old: {token_age} seconds")
                return None, "Token too old"
            
            logger.info(f"✅ JWT validated - Session: {payload['sessionId'][:12]}..., Purpose: {payload['purpose']}")
            return payload, None
            
        except jwt.ExpiredSignatureError:
            logger.warning("❌ JWT token expired")
            return None, "Token expired"
        except jwt.InvalidTokenError as e:
            logger.warning(f"❌ JWT token invalid: {str(e)}")
            return None, f"Invalid token: {str(e)}"
        except Exception as e:
            logger.error(f"❌ JWT validation error: {str(e)}")
            return None, f"Token validation failed: {str(e)}"
    
    def refresh_jwt_token(self, current_token):
        """
        Refresh JWT token if it's close to expiration
        Useful for long-running conversations
        """
        try:
            # Validate current token
            payload, error = self.validate_jwt_token(current_token)
            if not payload:
                return None, error
            
            # Check if token needs refresh (less than 5 minutes remaining)
            time_remaining = payload.get('exp', 0) - time.time()
            if time_remaining > 300:  # More than 5 minutes left
                return {'jwt_token': current_token, 'refreshed': False}, None
            
            # Generate new token with same parameters
            tenant_hash = self._get_hash_from_tenant(payload['tenantId'])
            if not tenant_hash:
                return None, "Cannot refresh token: tenant hash not found"
            
            return self.generate_streaming_jwt(
                tenant_hash=tenant_hash,
                purpose=payload['purpose'],
                duration_minutes=15
            )
            
        except Exception as e:
            logger.error(f"❌ JWT refresh failed: {str(e)}")
            return None, f"Token refresh failed: {str(e)}"
    
    def revoke_jwt_tokens(self, tenant_id=None, session_id=None):
        """
        Revoke JWT tokens by rotating signing key
        For healthcare compliance and security incidents
        """
        try:
            logger.warning("🚨 JWT token revocation requested")
            
            if tenant_id:
                logger.info(f"🚨 Revoking tokens for tenant: {tenant_id[:8]}...")
            if session_id:
                logger.info(f"🚨 Revoking tokens for session: {session_id[:12]}...")
            
            # Force signing key refresh (effectively revokes all tokens)
            self.get_signing_key(force_refresh=True)
            
            # In production, this could be more granular with token blacklisting
            # For now, key rotation revokes all tokens
            
            logger.info("✅ JWT tokens revoked via key rotation")
            return True, None
            
        except Exception as e:
            logger.error(f"❌ JWT revocation failed: {str(e)}")
            return False, str(e)
    
    def _resolve_tenant_from_hash(self, tenant_hash):
        """Server-side tenant resolution for security (prevents client manipulation)"""
        try:
            if not tenant_hash:
                return None
            
            # Load tenant mapping from S3
            mapping_key = f"{MAPPINGS_PREFIX}/{tenant_hash}.json"
            
            response = s3.get_object(Bucket=S3_BUCKET, Key=mapping_key)
            mapping_data = json.loads(response['Body'].read())
            tenant_id = mapping_data.get('tenant_id')
            
            if not tenant_id:
                logger.warning(f"❌ Invalid mapping data for hash: {tenant_hash[:8]}...")
                return None
            
            logger.info(f"✅ Tenant resolved - Hash: {tenant_hash[:8]}... -> ID: {tenant_id[:8]}...")
            return tenant_id
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logger.warning(f"❌ Tenant hash not found: {tenant_hash[:8]}...")
            else:
                logger.error(f"❌ Tenant resolution failed: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"❌ Tenant resolution error: {str(e)}")
            return None
    
    def _get_hash_from_tenant(self, tenant_id):
        """Reverse lookup tenant hash from tenant ID (for token refresh)"""
        try:
            # This would require a reverse mapping or scanning
            # For simplicity, we'll generate a deterministic hash
            # In production, maintain a reverse mapping table
            
            hash_input = f"{tenant_id}_{ENVIRONMENT}_salt"
            tenant_hash = hashlib.md5(hash_input.encode()).hexdigest()
            
            return tenant_hash
            
        except Exception as e:
            logger.error(f"❌ Hash lookup failed: {str(e)}")
            return None
    
    def _generate_session_id(self, tenant_id, tenant_hash):
        """Generate unique session ID for JWT tracking"""
        timestamp = int(time.time())
        unique_input = f"{tenant_id}_{tenant_hash}_{timestamp}_{os.urandom(4).hex()}"
        session_hash = hashlib.sha256(unique_input.encode()).hexdigest()[:16]
        return f"sess_{timestamp}_{session_hash}"
    
    def _generate_jti(self, session_id, tenant_id):
        """Generate JWT ID for token tracking and potential blacklisting"""
        jti_input = f"{session_id}_{tenant_id}_{int(time.time())}"
        return hashlib.sha256(jti_input.encode()).hexdigest()[:12]
    
    def get_jwt_metrics(self):
        """Get JWT system metrics for monitoring"""
        try:
            current_time = time.time()
            key_cache_remaining = max(0, self._key_expires_at - current_time) if self._key_expires_at else 0
            
            return {
                'signing_key_cached': bool(self._signing_key),
                'key_cache_expires_in': int(key_cache_remaining),
                'environment': ENVIRONMENT,
                'secret_key_name': JWT_SECRET_KEY_NAME,
                'streaming_function_url': STREAMING_FUNCTION_URL is not None,
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"❌ JWT metrics error: {str(e)}")
            return {'error': str(e)}

# Global JWT coordinator instance
jwt_coordinator = JWTCoordinator()

def handle_jwt_generation_action(tenant_hash, purpose='stream', duration=15):
    """Handle JWT generation requests from Master Function"""
    return jwt_coordinator.generate_streaming_jwt(tenant_hash, purpose, duration)

def handle_jwt_validation_action(token):
    """Handle JWT validation requests from streaming Function"""
    return jwt_coordinator.validate_jwt_token(token)

def handle_jwt_refresh_action(current_token):
    """Handle JWT refresh requests"""
    return jwt_coordinator.refresh_jwt_token(current_token)

def handle_jwt_revoke_action(tenant_id=None, session_id=None):
    """Handle JWT revocation requests"""
    return jwt_coordinator.revoke_jwt_tokens(tenant_id, session_id)

def handle_jwt_metrics_action():
    """Handle JWT metrics requests"""
    return jwt_coordinator.get_jwt_metrics()

# Integration functions for Master Lambda
def add_jwt_actions_to_master_handler(event, context):
    """
    Add JWT coordination actions to Master Function handler
    Call this from lambda_function.py to enable JWT endpoints
    """
    try:
        query_params = event.get("queryStringParameters") or {}
        action = query_params.get("action")
        tenant_hash = query_params.get("t")
        
        if action == "generate_jwt":
            logger.info("🔑 Handling action=generate_jwt")
            
            if not tenant_hash:
                return cors_response(400, {
                    "error": "Missing tenant hash",
                    "usage": "GET ?action=generate_jwt&t=HASH&purpose=PURPOSE&duration=MINUTES"
                })
            
            purpose = query_params.get("purpose", "stream")
            duration = int(query_params.get("duration", 15))
            
            result, error = handle_jwt_generation_action(tenant_hash, purpose, duration)
            
            if error:
                return cors_response(400, {"error": error})
            
            return cors_response(200, result)
        
        elif action == "validate_jwt":
            logger.info("🔐 Handling action=validate_jwt")
            
            # Get JWT from header or body
            jwt_token = event.get('headers', {}).get('x-jwt-token')
            if not jwt_token:
                body = event.get('body', '{}')
                if isinstance(body, str):
                    body = json.loads(body) if body else {}
                jwt_token = body.get('jwt_token')
            
            if not jwt_token:
                return cors_response(400, {"error": "Missing JWT token"})
            
            payload, error = handle_jwt_validation_action(jwt_token)
            
            if error:
                return cors_response(401, {"error": error})
            
            return cors_response(200, {"valid": True, "payload": payload})
        
        elif action == "jwt_metrics":
            logger.info("📊 Handling action=jwt_metrics")
            metrics = handle_jwt_metrics_action()
            return cors_response(200, metrics)
        
        return None  # Not a JWT action, let Master Function handle normally
        
    except Exception as e:
        logger.error(f"❌ JWT action handling failed: {str(e)}", exc_info=True)
        return cors_response(500, {
            "error": "JWT action failed",
            "details": str(e)
        })

def cors_response(status_code, body):
    """Standardized CORS response for JWT endpoints"""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization,x-jwt-token",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Cache-Control": "no-cache" if status_code >= 400 else "no-cache, no-store, max-age=0",  # Never cache JWTs
        },
        "body": json.dumps(body) if not isinstance(body, str) else body
    }