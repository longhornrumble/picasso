"""
Phase 1 JWT Authentication Roundtrip Testing

This module provides comprehensive testing specifically for Phase 1 JWT authentication 
remediation fixes to ensure no HTTP 403 authentication failures occur.

Phase 1 Fixes Validated:
- JWT token generation and validation roundtrip works end-to-end
- Tolerant key loader handles different secret formats gracefully
- Startup self-check validates authentication system integrity
- No HTTP 403 authentication failures under normal operation
- JWT key caching and performance optimization
- Error handling for JWT validation failures

Critical Success Criteria:
- JWT roundtrip authentication success rate: 100%
- JWT validation latency: <100ms
- Key retrieval and caching: <50ms
- Zero HTTP 403 errors for valid tokens
- Graceful handling of invalid tokens
"""

import pytest
import json
import time
import uuid
import jwt
import os
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
import boto3
from moto import mock_secretsmanager
from botocore.exceptions import ClientError

# Test markers
pytestmark = [
    pytest.mark.unit,
    pytest.mark.integration,
    pytest.mark.phase1,
    pytest.mark.jwt,
    pytest.mark.critical
]


class TestPhase1JWTRoundtripAuthentication:
    """
    Comprehensive testing for Phase 1 JWT authentication roundtrip fixes
    """

    @pytest.fixture(autouse=True)
    def setup_jwt_environment(self):
        """Setup JWT testing environment"""
        os.environ.update({
            'ENVIRONMENT': 'test',
            'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key',
            'AWS_REGION': 'us-east-1'
        })
        yield
        
        # Cleanup
        env_vars = ['ENVIRONMENT', 'JWT_SECRET_KEY_NAME', 'AWS_REGION']
        for var in env_vars:
            os.environ.pop(var, None)

    @pytest.fixture
    def jwt_test_secret_key(self):
        """Standard test secret key for JWT operations"""
        return "jwt-test-secret-key-32-characters-long-for-security-validation"

    @pytest.fixture
    def jwt_test_session_id(self):
        """Generate unique session ID for JWT testing"""
        return f"jwt-test-session-{int(time.time())}-{uuid.uuid4().hex[:8]}"


class TestJWTRoundtripSuccess:
    """Test successful JWT authentication roundtrip scenarios"""

    def test_jwt_generation_and_validation_roundtrip(self, setup_jwt_environment, 
                                                    jwt_test_secret_key, jwt_test_session_id):
        """
        CRITICAL: Test complete JWT generation and validation roundtrip succeeds
        
        This is the core test that validates Phase 1 fixes prevent HTTP 403 errors
        """
        with mock_secretsmanager():
            # Setup AWS Secrets Manager
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            # Import modules after environment setup
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Clear any cached keys to test fresh roundtrip
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                start_time = time.perf_counter()
                
                # Step 1: Key retrieval (Phase 1 tolerant key loader)
                retrieved_key = tenant_inference._get_signing_key()
                key_retrieval_time = (time.perf_counter() - start_time) * 1000
                
                assert retrieved_key == jwt_test_secret_key, "Key retrieval should return correct signing key"
                assert key_retrieval_time < 50, f"Key retrieval should be <50ms, got {key_retrieval_time:.2f}ms"
                
                # Step 2: JWT token generation
                current_time = int(time.time())
                jwt_payload = {
                    'iss': 'picasso-test',
                    'aud': 'streaming-function',
                    'purpose': 'stream',
                    'tenantId': 'test_tenant_hash',
                    'sessionId': jwt_test_session_id,
                    'jti': f'roundtrip-{uuid.uuid4().hex}',
                    'iat': current_time - 60,  # Issued 1 minute ago to avoid clock skew
                    'exp': current_time + (15 * 60)  # Expires in 15 minutes
                }
                
                jwt_token = jwt.encode(jwt_payload, jwt_test_secret_key, algorithm='HS256')
                assert isinstance(jwt_token, str), "JWT token should be generated as string"
                assert len(jwt_token.split('.')) == 3, "JWT token should have 3 parts (header.payload.signature)"
                
                # Step 3: JWT token validation roundtrip
                event = {
                    'headers': {'authorization': f'Bearer {jwt_token}'},
                    'requestContext': {
                        'requestId': 'jwt-roundtrip-test',
                        'identity': {'sourceIp': '192.168.1.100'}
                    }
                }
                
                validation_start = time.perf_counter()
                result = tenant_inference.extract_tenant_from_token(event)
                validation_time = (time.perf_counter() - validation_start) * 1000
                
                # Validate successful roundtrip
                assert result is not None, "JWT validation should succeed - no HTTP 403 error"
                assert result['tenant_id'] == 'test_tenant_hash', "Tenant ID should be correctly extracted"
                assert result['session_id'] == jwt_test_session_id, "Session ID should be correctly extracted"
                assert result['source'] == 'jwt_token', "Source should indicate JWT token"
                assert result['purpose'] == 'stream', "Purpose should be correctly extracted"
                assert result['jti'] == jwt_payload['jti'], "JTI should be correctly extracted"
                
                # Validate performance requirements
                total_time = (time.perf_counter() - start_time) * 1000
                assert validation_time < 100, f"JWT validation should be <100ms, got {validation_time:.2f}ms"
                assert total_time < 150, f"Complete roundtrip should be <150ms, got {total_time:.2f}ms"
                
                # Step 4: Validate caching works for subsequent requests
                cache_start = time.perf_counter()
                cached_result = tenant_inference.extract_tenant_from_token(event)
                cache_time = (time.perf_counter() - cache_start) * 1000
                
                assert cached_result is not None, "Cached JWT validation should succeed"
                assert cached_result['tenant_id'] == result['tenant_id'], "Cached result should match original"
                assert cache_time < 50, f"Cached validation should be <50ms, got {cache_time:.2f}ms"

    def test_jwt_multiple_token_formats_roundtrip(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test JWT roundtrip works with multiple token formats and header variations
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Test JWT token with different header formats
                current_time = int(time.time())
                jwt_payload = {
                    'iss': 'picasso-test',
                    'aud': 'streaming-function',
                    'purpose': 'stream',
                    'tenantId': 'format_test_tenant',
                    'sessionId': 'format-test-session',
                    'jti': f'format-{uuid.uuid4().hex}',
                    'iat': current_time,
                    'exp': current_time + (15 * 60)
                }
                
                jwt_token = jwt.encode(jwt_payload, jwt_test_secret_key, algorithm='HS256')
                
                # Test different header formats
                header_formats = [
                    {'authorization': f'Bearer {jwt_token}'},  # Standard format
                    {'Authorization': f'Bearer {jwt_token}'},  # Capital A
                    {'x-jwt-token': jwt_token},  # Alternative header
                    {'X-JWT-Token': jwt_token}   # Capital alternative
                ]
                
                for i, headers in enumerate(header_formats):
                    event = {
                        'headers': headers,
                        'requestContext': {
                            'requestId': f'format-test-{i}',
                            'identity': {'sourceIp': '192.168.1.101'}
                        }
                    }
                    
                    result = tenant_inference.extract_tenant_from_token(event)
                    assert result is not None, f"Format {i} should succeed: {headers}"
                    assert result['tenant_id'] == 'format_test_tenant', f"Format {i} should extract correct tenant"
                
                # Test query parameter format
                query_event = {
                    'queryStringParameters': {'token': jwt_token},
                    'requestContext': {
                        'requestId': 'query-format-test',
                        'identity': {'sourceIp': '192.168.1.102'}
                    }
                }
                
                query_result = tenant_inference.extract_tenant_from_token(query_event)
                assert query_result is not None, "Query parameter format should succeed"
                assert query_result['tenant_id'] == 'format_test_tenant', "Query format should extract correct tenant"

    def test_jwt_audience_variations_roundtrip(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test JWT roundtrip works with different valid audience values
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Test valid audiences
                valid_audiences = ['streaming-function', 'master-function']
                
                for audience in valid_audiences:
                    current_time = int(time.time())
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': audience,
                        'purpose': 'stream',
                        'tenantId': f'audience_test_{audience.replace("-", "_")}',
                        'sessionId': f'audience-test-{audience}',
                        'jti': f'aud-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    jwt_token = jwt.encode(jwt_payload, jwt_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {'authorization': f'Bearer {jwt_token}'},
                        'requestContext': {
                            'requestId': f'audience-{audience}',
                            'identity': {'sourceIp': '192.168.1.103'}
                        }
                    }
                    
                    result = tenant_inference.extract_tenant_from_token(event)
                    assert result is not None, f"Audience {audience} should be valid"
                    assert result['tenant_id'] == f'audience_test_{audience.replace("-", "_")}', f"Should extract correct tenant for audience {audience}"

    def test_jwt_purpose_variations_roundtrip(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test JWT roundtrip works with different valid purpose values
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Test valid purposes
                valid_purposes = ['stream', 'manage', 'config', 'chat']
                
                for purpose in valid_purposes:
                    current_time = int(time.time())
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': purpose,
                        'tenantId': f'purpose_test_{purpose}',
                        'sessionId': f'purpose-test-{purpose}',
                        'jti': f'purpose-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    jwt_token = jwt.encode(jwt_payload, jwt_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {'authorization': f'Bearer {jwt_token}'},
                        'requestContext': {
                            'requestId': f'purpose-{purpose}',
                            'identity': {'sourceIp': '192.168.1.104'}
                        }
                    }
                    
                    result = tenant_inference.extract_tenant_from_token(event)
                    assert result is not None, f"Purpose {purpose} should be valid"
                    assert result['purpose'] == purpose, f"Should extract correct purpose {purpose}"


class TestJWTTolerantKeyLoader:
    """Test Phase 1 tolerant key loader handles different secret formats"""

    def test_tolerant_key_loader_standard_format(self, setup_jwt_environment):
        """
        Test tolerant key loader handles standard JWT secret format
        """
        test_key = "standard-format-test-key-for-jwt-validation"
        
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': test_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Clear cache to test fresh retrieval
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                retrieved_key = tenant_inference._get_signing_key()
                assert retrieved_key == test_key, "Should retrieve key from standard format"

    def test_tolerant_key_loader_alternative_formats(self, setup_jwt_environment):
        """
        Test tolerant key loader handles various secret formats gracefully
        """
        test_formats = [
            # Alternative field name
            {'signing_key': 'alternative-field-key'},
            # Nested format
            {'jwt': {'signingKey': 'nested-format-key'}},
            # Uppercase format
            {'SIGNING_KEY': 'uppercase-format-key'},
            # Multiple possible keys (should pick first valid)
            {'signingKey': 'primary-key', 'signing_key': 'secondary-key'},
        ]
        
        import sys
        import os
        lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
        if lambda_review_path not in sys.path:
            sys.path.insert(0, lambda_review_path)
        
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                for i, secret_format in enumerate(test_formats):
                    secret_name = f'test-format-{i}'
                    
                    # Create secret with specific format
                    secrets_client.create_secret(
                        Name=secret_name,
                        SecretString=json.dumps(secret_format)
                    )
                    
                    # Test tolerant key extraction
                    with patch.dict(os.environ, {'JWT_SECRET_KEY_NAME': secret_name}):
                        tenant_inference.signing_key_cache = None
                        tenant_inference.key_cache_expires = 0
                        
                        retrieved_key = tenant_inference._get_signing_key()
                        assert retrieved_key is not None, f"Should extract key from format {i}: {secret_format}"
                        assert len(retrieved_key) > 0, f"Extracted key should not be empty for format {i}"

    def test_tolerant_key_loader_direct_string_format(self, setup_jwt_environment):
        """
        Test tolerant key loader handles direct string secret format
        """
        test_key = "direct-string-secret-key"
        
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=test_key  # Direct string, not JSON
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                retrieved_key = tenant_inference._get_signing_key()
                assert retrieved_key == test_key, "Should handle direct string format"

    def test_tolerant_key_loader_error_handling(self, setup_jwt_environment):
        """
        Test tolerant key loader graceful error handling
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                # Test with non-existent secret
                with pytest.raises(Exception):
                    tenant_inference._get_signing_key()


class TestJWTStartupSelfCheck:
    """Test Phase 1 startup self-check validates authentication system"""

    def test_startup_self_check_validates_key_retrieval(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test startup self-check successfully validates JWT key retrieval
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Simulate startup - clear all caches
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                # Startup self-check: validate key retrieval works
                start_time = time.perf_counter()
                retrieved_key = tenant_inference._get_signing_key()
                check_time = (time.perf_counter() - start_time) * 1000
                
                assert retrieved_key == jwt_test_secret_key, "Startup self-check should retrieve correct key"
                assert check_time < 100, f"Startup self-check should be fast: {check_time:.2f}ms"
                
                # Validate caching is setup correctly
                assert tenant_inference.signing_key_cache == jwt_test_secret_key, "Key should be cached after retrieval"
                assert tenant_inference.key_cache_expires > time.time(), "Cache should have valid expiration"

    def test_startup_self_check_caching_performance(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test startup self-check establishes proper caching for performance
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # First call (startup) - should retrieve and cache
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                start_time = time.perf_counter()
                first_key = tenant_inference._get_signing_key()
                first_time = (time.perf_counter() - start_time) * 1000
                
                # Second call - should use cache
                start_time = time.perf_counter()
                second_key = tenant_inference._get_signing_key()
                second_time = (time.perf_counter() - start_time) * 1000
                
                assert first_key == second_key == jwt_test_secret_key, "Both calls should return same key"
                assert second_time < first_time / 2, f"Cached call should be much faster: {second_time:.2f}ms vs {first_time:.2f}ms"
                assert second_time < 10, f"Cached retrieval should be <10ms: {second_time:.2f}ms"


class TestJWTFailureScenarios:
    """Test JWT validation failure scenarios - should NOT return HTTP 403"""

    def test_jwt_expired_token_handling(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test expired JWT tokens are handled gracefully (no HTTP 403)
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Create expired JWT token
                current_time = int(time.time())
                expired_payload = {
                    'iss': 'picasso-test',
                    'aud': 'streaming-function',
                    'purpose': 'stream',
                    'tenantId': 'expired_test_tenant',
                    'sessionId': 'expired-test-session',
                    'jti': f'expired-{uuid.uuid4().hex}',
                    'iat': current_time - (20 * 60),  # Issued 20 minutes ago
                    'exp': current_time - (5 * 60)   # Expired 5 minutes ago
                }
                
                expired_token = jwt.encode(expired_payload, jwt_test_secret_key, algorithm='HS256')
                
                event = {
                    'headers': {'authorization': f'Bearer {expired_token}'},
                    'requestContext': {
                        'requestId': 'expired-token-test',
                        'identity': {'sourceIp': '192.168.1.105'}
                    }
                }
                
                result = tenant_inference.extract_tenant_from_token(event)
                
                # Should return None, not raise HTTP 403 exception
                assert result is None, "Expired token should return None, not HTTP 403"

    def test_jwt_invalid_signature_handling(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test invalid JWT signatures are handled gracefully (no HTTP 403)
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Create JWT with wrong secret (invalid signature)
                current_time = int(time.time())
                valid_payload = {
                    'iss': 'picasso-test',
                    'aud': 'streaming-function',
                    'purpose': 'stream',
                    'tenantId': 'invalid_sig_tenant',
                    'sessionId': 'invalid-sig-session',
                    'jti': f'invalid-{uuid.uuid4().hex}',
                    'iat': current_time,
                    'exp': current_time + (15 * 60)
                }
                
                invalid_token = jwt.encode(valid_payload, 'wrong-secret-key', algorithm='HS256')
                
                event = {
                    'headers': {'authorization': f'Bearer {invalid_token}'},
                    'requestContext': {
                        'requestId': 'invalid-signature-test',
                        'identity': {'sourceIp': '192.168.1.106'}
                    }
                }
                
                result = tenant_inference.extract_tenant_from_token(event)
                
                # Should return None, not raise HTTP 403 exception
                assert result is None, "Invalid signature should return None, not HTTP 403"

    def test_jwt_malformed_token_handling(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test malformed JWT tokens are handled gracefully (no HTTP 403)
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                malformed_tokens = [
                    'not.a.jwt',
                    'invalid.jwt.token.structure',
                    'header.payload',  # Missing signature
                    'header.payload.signature.extra',  # Too many parts
                    '',
                    'completely-invalid-string'
                ]
                
                for malformed_token in malformed_tokens:
                    event = {
                        'headers': {'authorization': f'Bearer {malformed_token}'},
                        'requestContext': {
                            'requestId': f'malformed-{malformed_token[:10]}',
                            'identity': {'sourceIp': '192.168.1.107'}
                        }
                    }
                    
                    result = tenant_inference.extract_tenant_from_token(event)
                    
                    # Should return None, not raise HTTP 403 exception
                    assert result is None, f"Malformed token {malformed_token} should return None, not HTTP 403"

    def test_jwt_missing_required_claims_handling(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test JWT tokens missing required claims are handled gracefully (no HTTP 403)
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Test missing each required claim
                required_claims = ['iss', 'aud', 'purpose', 'tenantId', 'jti']
                
                for missing_claim in required_claims:
                    current_time = int(time.time())
                    incomplete_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': 'incomplete_test_tenant',
                        'jti': f'incomplete-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    # Remove the claim being tested
                    del incomplete_payload[missing_claim]
                    
                    incomplete_token = jwt.encode(incomplete_payload, jwt_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {'authorization': f'Bearer {incomplete_token}'},
                        'requestContext': {
                            'requestId': f'missing-{missing_claim}',
                            'identity': {'sourceIp': '192.168.1.108'}
                        }
                    }
                    
                    result = tenant_inference.extract_tenant_from_token(event)
                    
                    # Should return None, not raise HTTP 403 exception
                    assert result is None, f"Token missing {missing_claim} should return None, not HTTP 403"


class TestJWTPerformanceOptimization:
    """Test JWT performance optimization from Phase 1"""

    def test_jwt_validation_performance_under_load(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test JWT validation performance under load scenarios
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Create multiple JWT tokens
                jwt_tokens = []
                for i in range(20):
                    current_time = int(time.time())
                    payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': f'load_test_tenant_{i}',
                        'sessionId': f'load-test-session-{i}',
                        'jti': f'load-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    token = jwt.encode(payload, jwt_test_secret_key, algorithm='HS256')
                    jwt_tokens.append((token, f'load_test_tenant_{i}'))
                
                # Test validation performance under load
                validation_times = []
                
                for token, expected_tenant in jwt_tokens:
                    event = {
                        'headers': {'authorization': f'Bearer {token}'},
                        'requestContext': {
                            'requestId': f'load-test-{expected_tenant}',
                            'identity': {'sourceIp': '192.168.1.109'}
                        }
                    }
                    
                    start_time = time.perf_counter()
                    result = tenant_inference.extract_tenant_from_token(event)
                    validation_time = (time.perf_counter() - start_time) * 1000
                    
                    validation_times.append(validation_time)
                    
                    assert result is not None, f"Load test token should validate successfully"
                    assert result['tenant_id'] == expected_tenant, f"Should extract correct tenant under load"
                    assert validation_time < 100, f"Load test validation should be <100ms: {validation_time:.2f}ms"
                
                # Statistical performance analysis
                import statistics
                avg_time = statistics.mean(validation_times)
                max_time = max(validation_times)
                
                assert avg_time < 50, f"Average validation time under load should be <50ms: {avg_time:.2f}ms"
                assert max_time < 100, f"Maximum validation time under load should be <100ms: {max_time:.2f}ms"

    def test_jwt_key_caching_optimization(self, setup_jwt_environment, jwt_test_secret_key):
        """
        Test JWT key caching provides significant performance optimization
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': jwt_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Clear cache for baseline measurement
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                # First call - should retrieve from AWS Secrets Manager
                start_time = time.perf_counter()
                first_key = tenant_inference._get_signing_key()
                first_time = (time.perf_counter() - start_time) * 1000
                
                # Subsequent calls - should use cache
                cache_times = []
                for i in range(10):
                    start_time = time.perf_counter()
                    cached_key = tenant_inference._get_signing_key()
                    cache_time = (time.perf_counter() - start_time) * 1000
                    cache_times.append(cache_time)
                    
                    assert cached_key == first_key, f"Cached key should match original"
                
                avg_cache_time = sum(cache_times) / len(cache_times)
                
                # Cache should provide significant performance improvement
                assert avg_cache_time < first_time / 5, f"Cached access should be 5x faster: {avg_cache_time:.2f}ms vs {first_time:.2f}ms"
                assert avg_cache_time < 5, f"Cached access should be <5ms: {avg_cache_time:.2f}ms"


if __name__ == "__main__":
    pytest.main([
        __file__,
        "-v",
        "--tb=short",
        "--show-capture=no"
    ])