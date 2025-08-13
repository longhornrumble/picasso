"""
Cross-Tenant Isolation Validation Tests
Tests tenant boundary enforcement, JWT token isolation, and Function URL access controls
to ensure 0% cross-tenant access success rate.

This test suite validates the unified coordination architecture's security requirements:
- JWT tokens with tenant context boundary enforcement  
- Server-side tenant inference isolation
- DynamoDB tenant data isolation
- Function URL access controls with internal JWT validation
"""

import pytest
import json
import time
import hashlib
import jwt
from unittest.mock import Mock, patch, MagicMock
from uuid import uuid4

# Import test fixtures and utilities
from conftest import (
    setup_environment, mock_aws_clients, sample_tenant_registry,
    valid_jwt_payload, expired_jwt_payload, invalid_jwt_payload,
    create_jwt_token, assert_security_audit_logged, assert_fail_closed_behavior,
    TEST_JWT_SECRET, TEST_S3_BUCKET
)

class TestCrossTenantJWTIsolation:
    """Test JWT token boundary enforcement between tenants"""
    
    def test_jwt_token_tenant_isolation_valid_tenant(self, mock_aws_clients, sample_tenant_registry, valid_jwt_payload):
        """Test that valid JWT tokens are properly isolated to their tenant"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry), \
             patch('tenant_inference.load_tenant_registry') as mock_load_registry:
            
            # Mock registry loading
            mock_load_registry.return_value = sample_tenant_registry
            
            from tenant_inference import resolveTenant, validate_jwt_token
            
            # Create JWT token for tenant123hash
            jwt_payload = {**valid_jwt_payload, 'tenantId': 'tenant123hash'}
            jwt_token = create_jwt_token(jwt_payload)
            
            # Create test event with JWT token
            event = {
                'headers': {
                    'authorization': f'Bearer {jwt_token}',
                    'Host': 'example.com'
                },
                'requestContext': {
                    'requestId': 'test-request-123',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'queryStringParameters': {}
            }
            
            # Resolve tenant with JWT
            result = resolveTenant(event)
            
            # Verify successful tenant resolution
            assert result is not None
            assert 'error' not in result
            assert result['tenant_hash'] == 'tenant123hash'
            assert result['source'] == 'jwt_token'
            
            # Verify JWT validation worked correctly
            payload, error = validate_jwt_token(jwt_token)
            assert payload is not None
            assert error is None
            assert payload['tenantId'] == 'tenant123hash'
    
    def test_jwt_token_cross_tenant_access_blocked(self, mock_aws_clients, sample_tenant_registry, valid_jwt_payload):
        """Test that JWT tokens cannot access other tenants' data"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry), \
             patch('tenant_inference.load_tenant_registry') as mock_load_registry:
            
            mock_load_registry.return_value = sample_tenant_registry
            
            from tenant_inference import resolveTenant
            
            # Create JWT token for tenant123hash
            jwt_payload = {**valid_jwt_payload, 'tenantId': 'tenant123hash'}
            jwt_token = create_jwt_token(jwt_payload)
            
            # Try to use token with different tenant in host header
            event = {
                'headers': {
                    'authorization': f'Bearer {jwt_token}',
                    'Host': 'secure.example.org'  # This belongs to tenant456hash
                },
                'requestContext': {
                    'requestId': 'test-cross-access',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'queryStringParameters': {}
            }
            
            # Resolve tenant - should use JWT tenant, not host
            result = resolveTenant(event)
            
            # Verify JWT takes precedence and enforces correct tenant
            assert result is not None
            assert 'error' not in result
            assert result['tenant_hash'] == 'tenant123hash'  # JWT tenant wins
            assert result['source'] == 'jwt_token'
            
            # This validates that JWT tokens properly isolate tenant access
    
    def test_jwt_token_invalid_tenant_blocked(self, mock_aws_clients, sample_tenant_registry, valid_jwt_payload):
        """Test that JWT tokens with invalid tenant IDs are blocked"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry), \
             patch('tenant_inference.load_tenant_registry') as mock_load_registry:
            
            mock_load_registry.return_value = sample_tenant_registry
            
            from tenant_inference import resolveTenant
            
            # Create JWT token with invalid tenant
            jwt_payload = {**valid_jwt_payload, 'tenantId': 'invalid_tenant_hash'}
            jwt_token = create_jwt_token(jwt_payload)
            
            event = {
                'headers': {
                    'authorization': f'Bearer {jwt_token}',
                    'Host': 'example.com'
                },
                'requestContext': {
                    'requestId': 'test-invalid-tenant',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'queryStringParameters': {}
            }
            
            # Should fail with invalid tenant
            result = resolveTenant(event)
            
            # Verify access is denied
            assert result is not None
            assert 'error' in result
            assert result['status_code'] == 403
            assert 'failure_id' in result
            assert_fail_closed_behavior(result)


class TestTenantDataIsolation:
    """Test DynamoDB and S3 tenant data isolation"""
    
    def test_dynamodb_tenant_data_isolation(self, mock_aws_clients, sample_tenant_registry):
        """Test that DynamoDB operations are properly isolated by tenant"""
        from state_clear_handler import StateClearHandler
        
        # Mock DynamoDB client to track operations
        mock_dynamodb = Mock()
        mock_aws_clients['dynamodb'] = mock_dynamodb
        
        handler = StateClearHandler()
        handler.dynamodb = mock_dynamodb
        
        # Test tenant isolation - tenant A operations
        tenant_a = 'tenant123hash'
        session_a = 'session_a_123'
        
        # Simulate state clear for tenant A
        result_a = handler.handle_state_clear_request(
            tenant_id=tenant_a,
            session_id=session_a,
            clear_type='full',
            requester_ip='192.168.1.100'
        )
        
        assert result_a['success'] is True
        assert tenant_a[:8] in result_a['tenant_id']
        
        # Test tenant isolation - tenant B operations  
        tenant_b = 'tenant456hash'
        session_b = 'session_b_456'
        
        result_b = handler.handle_state_clear_request(
            tenant_id=tenant_b,
            session_id=session_b,
            clear_type='full',
            requester_ip='192.168.1.200'
        )
        
        assert result_b['success'] is True
        assert tenant_b[:8] in result_b['tenant_id']
        
        # Verify operations are isolated (different tenant IDs in results)
        assert result_a['tenant_id'] != result_b['tenant_id']
    
    def test_s3_tenant_mapping_isolation(self, mock_aws_clients, sample_tenant_registry):
        """Test that S3 tenant mappings are properly isolated"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from tenant_inference import _resolve_tenant_from_hash_s3
            
            # Mock S3 responses for different tenants
            mock_s3 = mock_aws_clients['s3']
            
            def mock_get_object(Bucket, Key):
                if Key.startswith('mappings/tenant123hash'):
                    return {
                        'Body': Mock(read=lambda: json.dumps({
                            'tenant_id': 'tenant123hash',
                            'host': 'example.com'
                        }).encode())
                    }
                elif Key.startswith('mappings/tenant456hash'):
                    return {
                        'Body': Mock(read=lambda: json.dumps({
                            'tenant_id': 'tenant456hash', 
                            'host': 'secure.example.org'
                        }).encode())
                    }
                else:
                    from botocore.exceptions import ClientError
                    raise ClientError({'Error': {'Code': 'NoSuchKey'}}, 'GetObject')
            
            mock_s3.get_object.side_effect = mock_get_object
            
            # Test tenant A mapping resolution
            tenant_a_result = _resolve_tenant_from_hash_s3('tenant123hash')
            assert tenant_a_result == 'tenant123hash'
            
            # Test tenant B mapping resolution
            tenant_b_result = _resolve_tenant_from_hash_s3('tenant456hash')
            assert tenant_b_result == 'tenant456hash'
            
            # Test invalid tenant mapping
            invalid_result = _resolve_tenant_from_hash_s3('invalid_hash')
            assert invalid_result is None
            
            # Verify S3 calls were isolated per tenant
            s3_calls = mock_s3.get_object.call_args_list
            assert len(s3_calls) == 3  # One for each test
            
            # Extract the Key arguments and verify isolation
            keys_called = [call[1]['Key'] for call in s3_calls]
            assert 'mappings/tenant123hash.json' in keys_called
            assert 'mappings/tenant456hash.json' in keys_called
            assert 'mappings/invalid_hash.json' in keys_called


class TestFunctionURLAccessControls:
    """Test Function URL access controls with internal JWT validation"""
    
    def test_function_url_authtype_none_with_jwt_validation(self, mock_aws_clients, valid_jwt_payload):
        """Test Function URL with AuthType: NONE + internal JWT validation"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Test JWT generation for streaming Function URL
        jwt_result, error = coordinator.generate_streaming_jwt(
            tenant_hash='tenant123hash',
            purpose='stream',
            duration_minutes=15
        )
        
        assert jwt_result is not None
        assert error is None
        assert 'jwt_token' in jwt_result
        assert 'streaming_url' in jwt_result
        assert jwt_result['expires_in'] == 900  # 15 minutes
        
        # Test JWT validation (simulating Function URL internal validation)
        jwt_token = jwt_result['jwt_token']
        payload, validation_error = coordinator.validate_jwt_token(jwt_token)
        
        assert payload is not None
        assert validation_error is None
        assert payload['purpose'] == 'stream'
        assert payload['aud'] == 'streaming-function'
    
    def test_function_url_invalid_jwt_blocked(self, mock_aws_clients):
        """Test that Function URL blocks invalid JWT tokens"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Test various invalid JWT scenarios
        invalid_tokens = [
            'invalid.jwt.token',
            '',
            None,
            'Bearer invalid-token',
            jwt.encode({'invalid': 'payload'}, 'wrong-secret', algorithm='HS256')
        ]
        
        for invalid_token in invalid_tokens:
            if invalid_token is None:
                continue
                
            payload, error = coordinator.validate_jwt_token(invalid_token)
            
            assert payload is None
            assert error is not None
            assert isinstance(error, str)
    
    def test_function_url_expired_jwt_blocked(self, mock_aws_clients, expired_jwt_payload):
        """Test that Function URL blocks expired JWT tokens"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Create expired JWT token
        expired_token = create_jwt_token(expired_jwt_payload)
        
        # Validate expired token
        payload, error = coordinator.validate_jwt_token(expired_token)
        
        assert payload is None
        assert error is not None
        assert 'expired' in error.lower()
    
    def test_function_url_jwt_audience_validation(self, mock_aws_clients, valid_jwt_payload):
        """Test JWT audience validation for Function URL security"""
        from jwt_coordination import JWTCoordinator
        
        coordinator = JWTCoordinator()
        
        # Create JWT with wrong audience
        wrong_audience_payload = {**valid_jwt_payload, 'aud': 'wrong-audience'}
        wrong_audience_token = create_jwt_token(wrong_audience_payload)
        
        # Validate token - should fail due to wrong audience
        payload, error = coordinator.validate_jwt_token(wrong_audience_token)
        
        assert payload is None
        assert error is not None
        assert 'audience' in error.lower() or 'invalid' in error.lower()


class TestZeroCrossTenantAccess:
    """Comprehensive tests to ensure 0% cross-tenant access success rate"""
    
    def test_zero_cross_tenant_access_jwt_precedence(self, mock_aws_clients, sample_tenant_registry):
        """Test that JWT tokens always take precedence over other tenant inference methods"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry), \
             patch('tenant_inference.load_tenant_registry') as mock_load_registry:
            
            mock_load_registry.return_value = sample_tenant_registry
            
            from tenant_inference import resolveTenant
            
            # Create JWT for tenant A
            jwt_payload = {'tenantId': 'tenant123hash', 'exp': int(time.time()) + 900, 'iat': int(time.time())}
            jwt_token = create_jwt_token(jwt_payload)
            
            # Event with JWT for tenant A but host/origin/path for tenant B
            event = {
                'headers': {
                    'authorization': f'Bearer {jwt_token}',
                    'Host': 'secure.example.org',  # tenant456hash
                    'Origin': 'https://healthcare.ai'  # medical789hash
                },
                'requestContext': {
                    'http': {'path': '/secure/dashboard'}  # tenant456hash
                },
                'path': '/healthcare/portal',  # medical789hash
                'queryStringParameters': {'t': 'emergency999hash'}  # different tenant
            }
            
            result = resolveTenant(event)
            
            # JWT should win - ensuring 0% cross-tenant access
            assert result is not None
            assert 'error' not in result
            assert result['tenant_hash'] == 'tenant123hash'  # JWT tenant only
            assert result['source'] == 'jwt_token'
    
    def test_zero_cross_tenant_access_comprehensive_matrix(self, mock_aws_clients, sample_tenant_registry):
        """Comprehensive matrix test for all tenant inference methods"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry), \
             patch('tenant_inference.load_tenant_registry') as mock_load_registry:
            
            mock_load_registry.return_value = sample_tenant_registry
            
            from tenant_inference import resolveTenant
            
            # Test matrix: every valid tenant against every other tenant context
            valid_tenants = ['tenant123hash', 'tenant456hash', 'medical789hash']
            
            cross_access_attempts = 0
            successful_cross_access = 0
            
            for jwt_tenant in valid_tenants:
                for host_tenant in valid_tenants:
                    for query_tenant in valid_tenants:
                        if jwt_tenant == host_tenant == query_tenant:
                            continue  # Skip same-tenant scenarios
                        
                        cross_access_attempts += 1
                        
                        # Create JWT for one tenant
                        jwt_payload = {'tenantId': jwt_tenant, 'exp': int(time.time()) + 900, 'iat': int(time.time())}
                        jwt_token = create_jwt_token(jwt_payload)
                        
                        # Use different tenant in host/query
                        host_mapping = {
                            'tenant123hash': 'example.com',
                            'tenant456hash': 'secure.example.org', 
                            'medical789hash': 'healthcare.ai'
                        }
                        
                        event = {
                            'headers': {
                                'authorization': f'Bearer {jwt_token}',
                                'Host': host_mapping[host_tenant]
                            },
                            'requestContext': {
                                'requestId': f'test-{jwt_tenant}-{host_tenant}-{query_tenant}',
                                'identity': {'sourceIp': '192.168.1.100'}
                            },
                            'queryStringParameters': {'t': query_tenant}
                        }
                        
                        result = resolveTenant(event)
                        
                        # Should resolve to JWT tenant only
                        if result and 'error' not in result:
                            if result['tenant_hash'] == jwt_tenant and result['source'] == 'jwt_token':
                                # Correct - JWT tenant enforced
                                pass
                            else:
                                # Incorrect - cross-tenant access occurred
                                successful_cross_access += 1
                                pytest.fail(f"Cross-tenant access detected: JWT={jwt_tenant}, Result={result['tenant_hash']}")
            
            # Verify 0% cross-tenant access success rate
            cross_access_rate = (successful_cross_access / cross_access_attempts) * 100 if cross_access_attempts > 0 else 0
            
            assert cross_access_rate == 0.0, f"Cross-tenant access rate: {cross_access_rate}% (should be 0%)"
            assert successful_cross_access == 0, f"Detected {successful_cross_access} successful cross-tenant access attempts"
    
    def test_zero_cross_tenant_access_with_failures(self, mock_aws_clients, sample_tenant_registry, healthcare_audit_logger):
        """Test that failed tenant inference doesn't leak cross-tenant information"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry), \
             patch('tenant_inference.load_tenant_registry') as mock_load_registry:
            
            mock_load_registry.return_value = sample_tenant_registry
            
            from tenant_inference import resolveTenant
            
            # Test with invalid JWT and valid fallback to different tenant
            invalid_jwt = 'invalid.jwt.token'
            
            event = {
                'headers': {
                    'authorization': f'Bearer {invalid_jwt}',
                    'Host': 'secure.example.org'  # Valid tenant456hash
                },
                'requestContext': {
                    'requestId': 'test-invalid-jwt-fallback',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'queryStringParameters': {}
            }
            
            result = resolveTenant(event)
            
            # Should fail closed - no cross-tenant data leak through fallback
            assert result is not None
            if 'error' in result:
                # Fail-closed behavior is acceptable
                assert_fail_closed_behavior(result)
                assert_security_audit_logged(healthcare_audit_logger, 'SECURITY_AUDIT')
            else:
                # If it succeeds, it should be through valid fallback only
                assert result['tenant_hash'] == 'tenant456hash'  # Host fallback
                assert result['source'] in ['host', 'origin']  # Valid fallback source


class TestSecurityAuditLogging:
    """Test security audit logging for cross-tenant access attempts"""
    
    def test_cross_tenant_access_audit_logging(self, mock_aws_clients, sample_tenant_registry, healthcare_audit_logger):
        """Test that cross-tenant access attempts are properly audited"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from tenant_inference import resolveTenant
            
            # Attempt with invalid JWT
            event = {
                'headers': {
                    'authorization': 'Bearer invalid.jwt.token',
                    'Host': 'example.com'
                },
                'requestContext': {
                    'requestId': 'test-audit-log',
                    'identity': {'sourceIp': '192.168.1.100'}
                }
            }
            
            result = resolveTenant(event)
            
            # Verify audit logging occurred
            assert_security_audit_logged(healthcare_audit_logger, 'jwt_validation_failed')
    
    def test_rate_limiting_cross_tenant_attempts(self, mock_aws_clients, sample_tenant_registry, healthcare_audit_logger):
        """Test that repeated cross-tenant access attempts trigger rate limiting"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from tenant_inference import resolveTenant
            
            # Make multiple invalid attempts from same IP
            source_ip = '192.168.1.100'
            
            for attempt in range(12):  # Exceed rate limit threshold
                event = {
                    'headers': {
                        'authorization': f'Bearer invalid.jwt.token.{attempt}',
                        'Host': f'invalid-host-{attempt}.com'
                    },
                    'requestContext': {
                        'requestId': f'test-rate-limit-{attempt}',
                        'identity': {'sourceIp': source_ip}
                    }
                }
                
                result = resolveTenant(event)
                
                if attempt >= 10:  # Should be rate limited after 10 failures
                    assert result is not None
                    assert 'error' in result
                    assert 'rate' in result['error'].lower() or result['status_code'] == 403


# Performance validation for cross-tenant isolation
class TestCrossTenantIsolationPerformance:
    """Test performance requirements for cross-tenant isolation"""
    
    def test_jwt_validation_performance(self, mock_aws_clients, valid_jwt_payload):
        """Test JWT validation performance (<500ms requirement)"""
        from jwt_coordination import JWTCoordinator
        from conftest import measure_execution_time, assert_performance_requirement
        
        coordinator = JWTCoordinator()
        
        # Generate test JWT
        jwt_result, _ = coordinator.generate_streaming_jwt('tenant123hash')
        jwt_token = jwt_result['jwt_token']
        
        # Measure JWT validation performance
        def validate_jwt():
            return coordinator.validate_jwt_token(jwt_token)
        
        result, execution_time = measure_execution_time(validate_jwt)
        
        # Verify performance requirement
        assert_performance_requirement(execution_time, 500)  # <500ms
        
        # Verify functionality
        payload, error = result
        assert payload is not None
        assert error is None
    
    def test_tenant_inference_performance(self, mock_aws_clients, sample_tenant_registry, valid_jwt_payload):
        """Test tenant inference performance (<50ms requirement)"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from tenant_inference import resolveTenant
            from conftest import measure_execution_time, assert_performance_requirement
            
            jwt_token = create_jwt_token(valid_jwt_payload)
            
            event = {
                'headers': {
                    'authorization': f'Bearer {jwt_token}',
                    'Host': 'example.com'
                },
                'requestContext': {
                    'requestId': 'perf-test',
                    'identity': {'sourceIp': '192.168.1.100'}
                }
            }
            
            def resolve_tenant():
                return resolveTenant(event)
            
            result, execution_time = measure_execution_time(resolve_tenant)
            
            # Verify performance requirement
            assert_performance_requirement(execution_time, 50)  # <50ms
            
            # Verify functionality
            assert result is not None
            assert 'error' not in result


if __name__ == '__main__':
    """
    Run cross-tenant isolation tests
    """
    print("Cross-Tenant Isolation Validation Tests")
    print("=" * 50)
    
    # Run the test suite
    pytest.main([
        __file__,
        '-v',
        '--tb=short',
        '--show-capture=no'
    ])