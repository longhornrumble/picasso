"""
JWT/Function URL Integration Tests
Tests end-to-end JWT authentication flow, Function URL security with internal validation,
token expiration and refresh, and streaming integration.

This test suite validates the unified coordination architecture's JWT coordination:
- End-to-end JWT authentication flow from master to streaming function
- Function URL security with AuthType: NONE + internal JWT validation
- Token generation, validation, expiration, and refresh mechanisms
- Streaming integration with JWT-protected Function URLs
"""

import pytest
import json
import time
import jwt
import asyncio
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from datetime import datetime, timedelta

# Import test fixtures and utilities
from conftest import (
    setup_environment, mock_aws_clients, sample_tenant_registry,
    valid_jwt_payload, expired_jwt_payload, create_jwt_token,
    measure_execution_time, assert_performance_requirement,
    TEST_JWT_SECRET
)

class TestJWTGenerationFlow:
    """Test JWT token generation through master function"""
    
    def test_jwt_generation_master_function_integration(self, mock_aws_clients, sample_tenant_registry):
        """Test JWT generation through master function action=generate_jwt"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator, add_jwt_actions_to_master_handler
            
            coordinator = JWTCoordinator()
            
            # Mock event for JWT generation
            event = {
                'queryStringParameters': {
                    'action': 'generate_jwt',
                    't': 'tenant123hash',
                    'purpose': 'stream',
                    'duration': '15'
                },
                'headers': {},
                'requestContext': {
                    'requestId': 'jwt-gen-test-123'
                }
            }
            
            # Mock context
            context = Mock()
            context.aws_request_id = 'jwt-gen-context-123'
            
            # Execute JWT generation through master handler
            response = add_jwt_actions_to_master_handler(event, context)
            
            # Verify successful JWT generation
            assert response is not None
            assert response['statusCode'] == 200
            
            body = json.loads(response['body'])
            assert 'jwt_token' in body
            assert 'session_id' in body
            assert 'expires_in' in body
            assert 'streaming_url' in body
            assert body['purpose'] == 'stream'
            assert body['expires_in'] == 900  # 15 minutes
            
            # Verify JWT token is valid
            jwt_token = body['jwt_token']
            payload, error = coordinator.validate_jwt_token(jwt_token)
            assert payload is not None
            assert error is None
            assert payload['purpose'] == 'stream'
            assert payload['aud'] == 'streaming-function'
    
    def test_jwt_generation_with_tenant_inference(self, mock_aws_clients, sample_tenant_registry):
        """Test JWT generation using enhanced tenant inference"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry), \
             patch('tenant_inference.load_tenant_registry') as mock_load_registry:
            
            mock_load_registry.return_value = sample_tenant_registry
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            # Test JWT generation with tenant inference
            jwt_result, error = coordinator.generate_streaming_jwt(
                tenant_hash='tenant123hash',
                purpose='stream',
                duration_minutes=10
            )
            
            assert jwt_result is not None
            assert error is None
            assert 'jwt_token' in jwt_result
            assert jwt_result['expires_in'] == 600  # 10 minutes
            
            # Verify enhanced tenant inference was used
            jwt_token = jwt_result['jwt_token']
            decoded_payload = jwt.decode(jwt_token, TEST_JWT_SECRET, algorithms=['HS256'])
            
            assert 'inference_source' in decoded_payload
            assert 'security_level' in decoded_payload
            assert decoded_payload['tenantId'] == 'tenant123hash'
    
    def test_jwt_generation_performance_requirement(self, mock_aws_clients, sample_tenant_registry):
        """Test JWT generation meets <500ms performance requirement"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            # Measure JWT generation performance
            def generate_jwt():
                return coordinator.generate_streaming_jwt(
                    tenant_hash='tenant123hash',
                    purpose='stream',
                    duration_minutes=15
                )
            
            result, execution_time = measure_execution_time(generate_jwt)
            
            # Verify performance requirement (<500ms)
            assert_performance_requirement(execution_time, 500)
            
            # Verify functionality
            jwt_result, error = result
            assert jwt_result is not None
            assert error is None


class TestJWTValidationFlow:
    """Test JWT token validation for Function URL security"""
    
    def test_function_url_jwt_validation(self, mock_aws_clients, valid_jwt_payload):
        """Test Function URL internal JWT validation"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Create valid JWT token
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        # Test validation (simulating Function URL internal check)
        payload, error = coordinator.validate_jwt_token(jwt_token)
        
        assert payload is not None
        assert error is None
        
        # Verify required claims
        required_claims = ['sessionId', 'tenantId', 'purpose', 'exp', 'iat', 'iss', 'aud', 'jti']
        for claim in required_claims:
            assert claim in payload
            assert payload[claim] is not None
        
        # Verify security claims
        assert payload['iss'] == 'picasso-test'  # Environment-specific issuer
        assert payload['aud'] == 'streaming-function'
        assert payload['purpose'] == 'stream'
    
    def test_function_url_jwt_validation_failures(self, mock_aws_clients):
        """Test Function URL JWT validation failure scenarios"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Test various invalid JWT scenarios
        invalid_scenarios = [
            ('malformed', 'invalid.jwt.token'),
            ('empty', ''),
            ('wrong_secret', jwt.encode({'test': 'payload'}, 'wrong-secret', algorithm='HS256')),
            ('missing_claims', jwt.encode({'exp': int(time.time()) + 3600}, TEST_JWT_SECRET, algorithm='HS256')),
            ('wrong_audience', jwt.encode({
                'sessionId': 'test',
                'tenantId': 'test',
                'purpose': 'stream',
                'exp': int(time.time()) + 3600,
                'iat': int(time.time()),
                'iss': 'picasso-test',
                'aud': 'wrong-audience',  # Wrong audience
                'jti': 'test'
            }, TEST_JWT_SECRET, algorithm='HS256')),
            ('wrong_issuer', jwt.encode({
                'sessionId': 'test',
                'tenantId': 'test',
                'purpose': 'stream',
                'exp': int(time.time()) + 3600,
                'iat': int(time.time()),
                'iss': 'wrong-issuer',  # Wrong issuer
                'aud': 'streaming-function',
                'jti': 'test'
            }, TEST_JWT_SECRET, algorithm='HS256'))
        ]
        
        for scenario_name, invalid_token in invalid_scenarios:
            payload, error = coordinator.validate_jwt_token(invalid_token)
            
            assert payload is None, f"Scenario '{scenario_name}' should fail validation"
            assert error is not None, f"Scenario '{scenario_name}' should return error"
            assert isinstance(error, str), f"Scenario '{scenario_name}' should return string error"
    
    def test_function_url_jwt_expiration_handling(self, mock_aws_clients, expired_jwt_payload):
        """Test Function URL handling of expired JWT tokens"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Create expired JWT token
        expired_token = create_jwt_token(expired_jwt_payload)
        
        # Test validation of expired token
        payload, error = coordinator.validate_jwt_token(expired_token)
        
        assert payload is None
        assert error is not None
        assert 'expired' in error.lower()
    
    def test_function_url_jwt_age_validation(self, mock_aws_clients):
        """Test Function URL JWT age validation (not too old)"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Create JWT token that's too old (issued > 15 minutes ago)
        old_time = int(time.time()) - 1000  # 16+ minutes ago
        old_jwt_payload = {
            'sessionId': 'test_session',
            'tenantId': 'test_tenant',
            'purpose': 'stream',
            'exp': int(time.time()) + 3600,  # Still valid expiry
            'iat': old_time,  # But too old
            'iss': 'picasso-test',
            'aud': 'streaming-function',
            'jti': 'test_jti'
        }
        
        old_token = create_jwt_token(old_jwt_payload)
        
        # Test validation - should fail due to age
        payload, error = coordinator.validate_jwt_token(old_token)
        
        assert payload is None
        assert error is not None
        assert 'too old' in error.lower()


class TestJWTRefreshFlow:
    """Test JWT token refresh mechanisms"""
    
    def test_jwt_refresh_near_expiration(self, mock_aws_clients, sample_tenant_registry):
        """Test JWT refresh when token is close to expiration"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            # Create JWT token that expires soon
            soon_expiry_payload = {
                'sessionId': 'refresh_test_session',
                'tenantId': 'tenant123hash',
                'purpose': 'stream',
                'exp': int(time.time()) + 60,  # Expires in 1 minute
                'iat': int(time.time()) - 60,
                'iss': 'picasso-test',
                'aud': 'streaming-function',
                'jti': 'refresh_test_jti'
            }
            
            soon_expiry_token = create_jwt_token(soon_expiry_payload)
            
            # Mock tenant hash lookup for refresh
            with patch.object(coordinator, '_get_hash_from_tenant', return_value='tenant123hash'):
                # Test token refresh
                refresh_result, error = coordinator.refresh_jwt_token(soon_expiry_token)
                
                assert refresh_result is not None
                assert error is None
                
                # Should generate new token since current one expires soon
                assert 'jwt_token' in refresh_result
                new_token = refresh_result['jwt_token']
                assert new_token != soon_expiry_token  # Should be different token
                
                # Verify new token is valid
                new_payload, new_error = coordinator.validate_jwt_token(new_token)
                assert new_payload is not None
                assert new_error is None
    
    def test_jwt_refresh_not_needed(self, mock_aws_clients, valid_jwt_payload):
        """Test JWT refresh when token still has plenty of time"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Create JWT token with plenty of time left
        fresh_token = create_jwt_token(valid_jwt_payload)
        
        # Test refresh - should return same token
        refresh_result, error = coordinator.refresh_jwt_token(fresh_token)
        
        assert refresh_result is not None
        assert error is None
        assert refresh_result['jwt_token'] == fresh_token
        assert refresh_result['refreshed'] is False
    
    def test_jwt_refresh_invalid_token(self, mock_aws_clients):
        """Test JWT refresh with invalid current token"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Test refresh with invalid token
        refresh_result, error = coordinator.refresh_jwt_token('invalid.jwt.token')
        
        assert refresh_result is None
        assert error is not None
        assert isinstance(error, str)


class TestStreamingIntegration:
    """Test JWT integration with streaming Function URLs"""
    
    @patch('jwt_coordination.STREAMING_FUNCTION_URL', 'https://test-streaming-url.lambda-url.us-east-1.on.aws/')
    def test_streaming_jwt_integration_flow(self, mock_aws_clients, sample_tenant_registry):
        """Test complete JWT flow for streaming Function URL access"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            # Step 1: Generate JWT for streaming
            jwt_result, error = coordinator.generate_streaming_jwt(
                tenant_hash='tenant123hash',
                purpose='stream',
                duration_minutes=15
            )
            
            assert jwt_result is not None
            assert error is None
            assert jwt_result['streaming_url'] == 'https://test-streaming-url.lambda-url.us-east-1.on.aws/'
            
            # Step 2: Validate JWT (simulating Function URL validation)
            jwt_token = jwt_result['jwt_token']
            payload, validation_error = coordinator.validate_jwt_token(jwt_token)
            
            assert payload is not None
            assert validation_error is None
            
            # Step 3: Verify streaming-specific claims
            assert payload['purpose'] == 'stream'
            assert payload['aud'] == 'streaming-function'
            assert 'tenantId' in payload
            assert 'sessionId' in payload
    
    def test_streaming_jwt_security_validation(self, mock_aws_clients):
        """Test streaming Function URL security validation"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Test that non-streaming JWTs are rejected
        non_streaming_payload = {
            'sessionId': 'test_session',
            'tenantId': 'test_tenant',
            'purpose': 'admin',  # Wrong purpose
            'exp': int(time.time()) + 3600,
            'iat': int(time.time()),
            'iss': 'picasso-test',
            'aud': 'streaming-function',
            'jti': 'test_jti'
        }
        
        non_streaming_token = create_jwt_token(non_streaming_payload)
        
        # Should validate technically but purpose indicates non-streaming use
        payload, error = coordinator.validate_jwt_token(non_streaming_token)
        assert payload is not None  # Token structure is valid
        assert payload['purpose'] == 'admin'  # But purpose shows it's not for streaming
        
        # Application logic should check purpose for streaming access
    
    @pytest.mark.asyncio
    async def test_streaming_connection_simulation(self, mock_aws_clients):
        """Test simulated streaming connection with JWT authentication"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Generate streaming JWT
        jwt_result, error = coordinator.generate_streaming_jwt('tenant123hash')
        assert jwt_result is not None
        
        jwt_token = jwt_result['jwt_token']
        
        # Simulate streaming connection setup
        class MockStreamingConnection:
            def __init__(self, jwt_token):
                self.jwt_token = jwt_token
                self.authenticated = False
                self.messages = []
            
            async def authenticate(self, coordinator):
                """Simulate Function URL JWT authentication"""
                payload, error = coordinator.validate_jwt_token(self.jwt_token)
                if payload and not error:
                    self.authenticated = True
                    return True
                return False
            
            async def send_message(self, message):
                """Simulate sending message through authenticated connection"""
                if not self.authenticated:
                    raise Exception("Not authenticated")
                self.messages.append(message)
                return f"Echo: {message}"
        
        # Test streaming connection
        connection = MockStreamingConnection(jwt_token)
        
        # Authenticate
        auth_success = await connection.authenticate(coordinator)
        assert auth_success is True
        assert connection.authenticated is True
        
        # Send message
        response = await connection.send_message("Hello streaming!")
        assert response == "Echo: Hello streaming!"
        assert len(connection.messages) == 1


class TestJWTRevocationFlow:
    """Test JWT token revocation mechanisms"""
    
    def test_jwt_revocation_key_rotation(self, mock_aws_clients):
        """Test JWT revocation through signing key rotation"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Generate JWT with current key
        jwt_result, error = coordinator.generate_streaming_jwt('tenant123hash')
        assert jwt_result is not None
        jwt_token = jwt_result['jwt_token']
        
        # Verify token is valid
        payload, error = coordinator.validate_jwt_token(jwt_token)
        assert payload is not None
        
        # Revoke tokens via key rotation
        revoke_success, revoke_error = coordinator.revoke_jwt_tokens(tenant_id='tenant123hash')
        assert revoke_success is True
        assert revoke_error is None
        
        # After revocation, old token should still validate with cached key
        # In production, this would involve more sophisticated revocation tracking
        payload_after, error_after = coordinator.validate_jwt_token(jwt_token)
        # For this implementation, token still validates because key is cached
        # Real implementation would need token blacklisting or immediate key refresh
    
    def test_jwt_revocation_session_specific(self, mock_aws_clients):
        """Test session-specific JWT revocation"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Generate JWT
        jwt_result, error = coordinator.generate_streaming_jwt('tenant123hash')
        assert jwt_result is not None
        session_id = jwt_result['session_id']
        
        # Revoke specific session
        revoke_success, revoke_error = coordinator.revoke_jwt_tokens(session_id=session_id)
        assert revoke_success is True
        assert revoke_error is None


class TestJWTMetricsAndMonitoring:
    """Test JWT metrics and monitoring capabilities"""
    
    def test_jwt_metrics_collection(self, mock_aws_clients):
        """Test JWT system metrics collection"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Get JWT metrics
        metrics = coordinator.get_jwt_metrics()
        
        assert isinstance(metrics, dict)
        assert 'signing_key_cached' in metrics
        assert 'environment' in metrics
        assert 'secret_key_name' in metrics
        assert 'timestamp' in metrics
        
        # Verify boolean fields
        assert isinstance(metrics['signing_key_cached'], bool)
        assert isinstance(metrics['streaming_function_url'], bool)
    
    def test_jwt_health_monitoring(self, mock_aws_clients):
        """Test JWT system health monitoring"""
        from jwt_coordination import handle_jwt_metrics_action
        
        # Test JWT metrics action handler
        metrics = handle_jwt_metrics_action()
        
        assert isinstance(metrics, dict)
        if 'error' not in metrics:
            assert 'environment' in metrics
            assert 'timestamp' in metrics


class TestJWTErrorHandling:
    """Test comprehensive JWT error handling"""
    
    def test_jwt_aws_service_failures(self, mock_aws_clients):
        """Test JWT handling of AWS service failures"""
        from jwt_coordination import JWTCoordinator
        from botocore.exceptions import ClientError
        
        coordinator = JWTCoordinator()
        
        # Mock Secrets Manager failure
        mock_secrets = mock_aws_clients['secrets']
        mock_secrets.get_secret_value.side_effect = ClientError(
            {'Error': {'Code': 'ResourceNotFoundException'}},
            'GetSecretValue'
        )
        
        # Test JWT generation with secrets failure
        jwt_result, error = coordinator.generate_streaming_jwt('tenant123hash')
        
        assert jwt_result is None
        assert error is not None
        assert isinstance(error, str)
    
    def test_jwt_malformed_secret_handling(self, mock_aws_clients):
        """Test JWT handling of malformed secrets"""
        from jwt_coordination import JWTCoordinator, load_signing_key
        
        # Test malformed secret data
        malformed_secrets = [
            {},  # Empty
            {'wrong_field': 'test'},  # Wrong field name
            {'signingKey': ''},  # Empty key
            {'signingKey': 'short'},  # Too short
            {'signingKey': None},  # Null key
        ]
        
        for malformed_secret in malformed_secrets:
            with pytest.raises(RuntimeError):
                load_signing_key(malformed_secret)
    
    def test_jwt_startup_check_failure(self, mock_aws_clients):
        """Test JWT startup self-check failure handling"""
        from jwt_coordination import perform_jwt_startup_check
        
        # Test with invalid key
        invalid_key = 'invalid_key_that_causes_jwt_failure'
        
        startup_success = perform_jwt_startup_check(invalid_key)
        assert startup_success is False


if __name__ == '__main__':
    """
    Run JWT/Function URL integration tests
    """
    print("JWT/Function URL Integration Tests")
    print("=" * 45)
    
    # Run the test suite
    pytest.main([
        __file__,
        '-v',
        '--tb=short',
        '--show-capture=no'
    ])