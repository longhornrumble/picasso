"""
Error handling and edge case tests for PICASSO tenant inference system
Healthcare-grade error resilience and graceful degradation testing
"""

import pytest
import json
import time
from unittest.mock import Mock, patch, side_effect
from botocore.exceptions import ClientError, NoCredentialsError, BotoCoreError

import tenant_inference
from conftest import (
    assert_fail_closed_behavior, assert_security_audit_logged,
    create_jwt_token, TEST_JWT_SECRET
)


class TestAWSServiceFailures:
    """Test handling of AWS service failures"""

    def test_s3_service_unavailable(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling when S3 service is unavailable"""
        # Mock S3 service unavailable
        mock_aws_clients['s3'].list_objects_v2.side_effect = ClientError(
            {'Error': {'Code': 'ServiceUnavailable', 'Message': 'Service temporarily unavailable'}},
            'ListObjectsV2'
        )
        
        event = {
            'headers': {'host': 'test.com'},
            'requestContext': {
                'requestId': 's3-unavailable-test',
                'identity': {'sourceIp': '192.168.1.100'}
            }
        }
        
        result = tenant_inference.resolveTenant(event)
        
        # Should fail closed gracefully
        assert_fail_closed_behavior(result)
        
        # Should log error but not crash
        error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
        assert any('Failed to load tenant registry' in call for call in error_calls)

    def test_s3_access_denied(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling when S3 access is denied"""
        mock_aws_clients['s3'].list_objects_v2.side_effect = ClientError(
            {'Error': {'Code': 'AccessDenied', 'Message': 'Access denied to bucket'}},
            'ListObjectsV2'
        )
        
        event = {
            'headers': {'host': 'access-denied-test.com'},
            'requestContext': {
                'requestId': 's3-access-denied-test',
                'identity': {'sourceIp': '10.0.0.1'}
            }
        }
        
        result = tenant_inference.resolveTenant(event)
        
        # Should fail closed
        assert_fail_closed_behavior(result)
        
        # Should use degraded registry
        registry = tenant_inference.loadTenantRegistry()
        assert registry.get('degraded') is True

    def test_s3_network_timeout(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of S3 network timeouts"""
        import socket
        
        mock_aws_clients['s3'].list_objects_v2.side_effect = socket.timeout("Connection timed out")
        
        event = {
            'headers': {'host': 'timeout-test.com'},
            'requestContext': {
                'requestId': 's3-timeout-test',
                'identity': {'sourceIp': '172.16.1.1'}
            }
        }
        
        result = tenant_inference.resolveTenant(event)
        
        # Should handle timeout gracefully
        assert_fail_closed_behavior(result)

    def test_secrets_manager_failure(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling when Secrets Manager fails"""
        mock_aws_clients['secrets'].get_secret_value.side_effect = ClientError(
            {'Error': {'Code': 'ResourceNotFoundException', 'Message': 'Secret not found'}},
            'GetSecretValue'
        )
        
        # JWT token that would normally be valid
        valid_payload = {
            'iss': f'picasso-test',
            'aud': 'streaming-function',
            'purpose': 'stream',
            'tenantId': 'test123',
            'jti': 'test-jti',
            'iat': int(time.time()),
            'exp': int(time.time() + 900)
        }
        jwt_token = create_jwt_token(valid_payload)
        
        event = {
            'headers': {'authorization': f'Bearer {jwt_token}'},
            'requestContext': {
                'requestId': 'secrets-failure-test',
                'identity': {'sourceIp': '203.0.113.1'}
            }
        }
        
        result = tenant_inference.resolveTenant(event)
        
        # Should fail closed when secrets unavailable
        assert_fail_closed_behavior(result)
        
        # Should log security error
        error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
        assert any('JWT signing key unavailable' in call for call in error_calls)

    def test_cloudwatch_metrics_failure(self, mock_aws_clients, healthcare_audit_logger):
        """Test that CloudWatch metrics failures don't break the system"""
        # Mock CloudWatch failure
        mock_aws_clients['boto3_client'].return_value.put_metric_data.side_effect = Exception("CloudWatch unavailable")
        
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {'host': 'cloudwatch-fail.com'},
                'requestContext': {
                    'requestId': 'cloudwatch-failure-test',
                    'identity': {'sourceIp': '10.1.1.1'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should still fail closed properly despite CloudWatch failure
            assert_fail_closed_behavior(result)
            
            # System should continue operating (metrics failure shouldn't break core functionality)
            assert 'failure_id' in result

    def test_boto3_client_creation_failure(self, healthcare_audit_logger):
        """Test handling when boto3 client creation fails"""
        with patch('tenant_inference.boto3.client', side_effect=Exception("Cannot create AWS client")):
            event = {
                'headers': {'host': 'boto3-fail.com'},
                'requestContext': {
                    'requestId': 'boto3-failure-test',
                    'identity': {'sourceIp': '192.168.50.1'}
                }
            }
            
            # Should handle gracefully
            result = tenant_inference.resolveTenant(event)
            assert_fail_closed_behavior(result)


class TestDataCorruptionHandling:
    """Test handling of corrupted or malformed data"""

    def test_corrupted_jwt_token(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of corrupted JWT tokens"""
        corrupted_tokens = [
            'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.CORRUPTED.SIGNATURE',  # Corrupted payload
            'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ0ZXN0In0.CORRUPTED_SIG',  # Corrupted signature
            'COMPLETELY_INVALID_JWT_TOKEN',  # Not JWT format at all
            'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ0ZXN0In0.',  # Missing signature
        ]
        
        for corrupted_token in corrupted_tokens:
            event = {
                'headers': {'authorization': f'Bearer {corrupted_token}'},
                'requestContext': {
                    'requestId': f'corrupted-jwt-{hash(corrupted_token) % 1000}',
                    'identity': {'sourceIp': '10.0.0.50'}
                }
            }
            
            result = tenant_inference.extract_tenant_from_token(event)
            
            # Should handle corruption gracefully
            assert result is None, f"Should reject corrupted token: {corrupted_token[:20]}..."

    def test_corrupted_s3_mapping_data(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of corrupted S3 mapping data"""
        # Mock S3 responses with corrupted data
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': [
                {'Key': 'test-mappings/valid.json', 'Size': 100},
                {'Key': 'test-mappings/corrupted1.json', 'Size': 50},
                {'Key': 'test-mappings/corrupted2.json', 'Size': 75}
            ]
        }
        
        def mock_get_object(Bucket, Key):
            filename = Key.split('/')[-1]
            if filename == 'valid.json':
                return {'Body': Mock(read=lambda: b'{"host": "valid.com", "tenant": "valid123"}')}
            elif filename == 'corrupted1.json':
                return {'Body': Mock(read=lambda: b'{"host": "corrupt.com", invalid json')}  # Invalid JSON
            elif filename == 'corrupted2.json':
                return {'Body': Mock(read=lambda: b'')}  # Empty content
        
        mock_aws_clients['s3'].get_object.side_effect = mock_get_object
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Should load valid data and skip corrupted files
        assert len(registry['hashes']) == 1  # Only valid.json should be processed
        assert 'valid123' in registry['hashes']
        
        # Should log warnings for corrupted files
        warning_calls = [str(call) for call in healthcare_audit_logger.warning.call_args_list]
        assert any('Failed to load mapping' in call for call in warning_calls)

    def test_malformed_event_structure(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of malformed Lambda event structures"""
        malformed_events = [
            None,  # Null event
            {},    # Empty event
            {'headers': None},  # Null headers
            {'requestContext': None},  # Null request context
            {'headers': 'not_a_dict'},  # Wrong type for headers
            {'requestContext': 'not_a_dict'},  # Wrong type for request context
            {'queryStringParameters': 'not_a_dict'},  # Wrong type for query params
        ]
        
        for malformed_event in malformed_events:
            result = tenant_inference.resolveTenant(malformed_event)
            
            # Should handle malformed events gracefully
            assert_fail_closed_behavior(result)

    def test_invalid_json_in_secrets(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of invalid JSON in AWS Secrets Manager"""
        # Mock secrets with invalid JSON
        mock_aws_clients['secrets'].get_secret_value.return_value = {
            'SecretString': 'invalid json content'
        }
        
        valid_payload = {
            'iss': f'picasso-test',
            'aud': 'streaming-function',
            'purpose': 'stream',
            'tenantId': 'test123',
            'jti': 'test-jti',
            'iat': int(time.time()),
            'exp': int(time.time() + 900)
        }
        jwt_token = create_jwt_token(valid_payload)
        
        event = {
            'headers': {'authorization': f'Bearer {jwt_token}'},
            'requestContext': {
                'requestId': 'invalid-secrets-json',
                'identity': {'sourceIp': '192.168.1.200'}
            }
        }
        
        result = tenant_inference.resolveTenant(event)
        
        # Should fail closed when secrets are corrupted
        assert_fail_closed_behavior(result)


class TestResourceExhaustion:
    """Test handling of resource exhaustion scenarios"""

    def test_memory_exhaustion_protection(self, mock_aws_clients, healthcare_audit_logger):
        """Test protection against memory exhaustion attacks"""
        # Simulate very large S3 response
        large_s3_objects = []
        for i in range(200):  # More than MaxKeys=100 limit
            large_s3_objects.append({
                'Key': f'test-mappings/tenant{i:04d}.json',
                'Size': 1024 * 1024  # 1MB each
            })
        
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': large_s3_objects
        }
        
        # Mock large responses
        mock_aws_clients['s3'].get_object.return_value = {
            'Body': Mock(read=lambda: b'{"host": "large.com"}' + b'x' * (1024 * 1024))  # 1MB+ response
        }
        
        # Registry loading should be protected by MaxKeys limit
        registry = tenant_inference.loadTenantRegistry()
        
        # Should not process more than MaxKeys objects
        call_count = mock_aws_clients['s3'].get_object.call_count
        assert call_count <= 100, f"Should be limited by MaxKeys, but processed {call_count} objects"

    def test_cpu_exhaustion_protection(self, mock_aws_clients, healthcare_audit_logger):
        """Test protection against CPU exhaustion"""
        # Test with computationally expensive regex patterns
        expensive_hosts = [
            'a' * 1000 + '.com',  # Very long host
            'x' * 255,  # Maximum length host
            '...' + 'x' * 250,  # Pattern that might cause regex backtracking
        ]
        
        for expensive_host in expensive_hosts:
            start_time = time.perf_counter()
            
            result = tenant_inference.norm_host(expensive_host)
            
            end_time = time.perf_counter()
            execution_time = (end_time - start_time) * 1000  # ms
            
            # Should complete quickly even for expensive inputs
            assert execution_time < 100, f"Host normalization took {execution_time:.2f}ms for expensive input"
            
            # Should handle gracefully (return empty string for invalid)
            assert isinstance(result, str)

    def test_network_timeout_handling(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of network timeouts"""
        import socket
        
        # Mock various network errors
        network_errors = [
            socket.timeout("Connection timed out"),
            ConnectionError("Connection refused"),
            OSError("Network unreachable"),
        ]
        
        for network_error in network_errors:
            mock_aws_clients['s3'].list_objects_v2.side_effect = network_error
            
            event = {
                'headers': {'host': 'network-error.com'},
                'requestContext': {
                    'requestId': f'network-error-{type(network_error).__name__}',
                    'identity': {'sourceIp': '203.0.113.50'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should handle network errors gracefully
            assert_fail_closed_behavior(result)
            
            # Reset for next test
            mock_aws_clients['s3'].list_objects_v2.side_effect = None


class TestConcurrencyAndRaceConditions:
    """Test handling of concurrency issues and race conditions"""

    def test_concurrent_cache_updates(self, mock_aws_clients, healthcare_audit_logger):
        """Test thread safety during concurrent cache updates"""
        import threading
        import time
        
        # Mock S3 with delay to simulate race conditions
        def delayed_list_objects(**kwargs):
            time.sleep(0.1)  # Simulate network delay
            return {
                'Contents': [
                    {'Key': 'test-mappings/concurrent.json', 'Size': 100}
                ]
            }
        
        mock_aws_clients['s3'].list_objects_v2.side_effect = delayed_list_objects
        mock_aws_clients['s3'].get_object.return_value = {
            'Body': Mock(read=lambda: b'{"host": "concurrent.com"}')
        }
        
        # Clear cache to force concurrent loading
        tenant_inference.tenant_registry_cache = {}
        tenant_inference.registry_cache_timestamp = 0
        
        results = []
        exceptions = []
        
        def concurrent_load():
            try:
                result = tenant_inference.loadTenantRegistry()
                results.append(result)
            except Exception as e:
                exceptions.append(e)
        
        # Start multiple threads
        threads = []
        for _ in range(10):
            thread = threading.Thread(target=concurrent_load)
            threads.append(thread)
            thread.start()
        
        # Wait for all threads
        for thread in threads:
            thread.join()
        
        # Should not have any exceptions
        assert len(exceptions) == 0, f"Concurrent access caused exceptions: {exceptions}"
        
        # All threads should get valid results
        assert len(results) == 10
        for result in results:
            assert isinstance(result, dict)
            assert 'hosts' in result

    def test_cache_invalidation_race_condition(self, mock_aws_clients, healthcare_audit_logger):
        """Test cache invalidation race conditions"""
        # Setup initial cache
        tenant_inference.tenant_registry_cache = {'test': 'initial'}
        tenant_inference.registry_cache_timestamp = time.time()
        
        # Mock future time to trigger cache invalidation
        future_time = time.time() + 700  # Past cache TTL
        
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': [{'Key': 'test-mappings/race.json', 'Size': 100}]
        }
        mock_aws_clients['s3'].get_object.return_value = {
            'Body': Mock(read=lambda: b'{"host": "race.com"}')
        }
        
        with patch('time.time', return_value=future_time):
            # Concurrent cache invalidation
            result1 = tenant_inference.loadTenantRegistry()
            result2 = tenant_inference.loadTenantRegistry()
            
            # Both should get valid, consistent results
            assert isinstance(result1, dict)
            assert isinstance(result2, dict)
            # Second call should use cached result from first
            assert result1 is result2

    def test_failure_tracking_race_condition(self, mock_aws_clients, healthcare_audit_logger):
        """Test failure tracking thread safety"""
        import threading
        
        tenant_inference.failure_tracking = {}
        source_ip = '192.168.100.100'
        
        def concurrent_failure_tracking():
            for _ in range(5):
                tenant_inference._track_failure(source_ip)
        
        # Multiple threads tracking failures for same IP
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=concurrent_failure_tracking)
            threads.append(thread)
            thread.start()
        
        for thread in threads:
            thread.join()
        
        # Should have consistent failure count
        failure_count = len(tenant_inference.failure_tracking.get(source_ip, []))
        assert failure_count == 25, f"Expected 25 failures, got {failure_count}"


class TestEdgeCaseInputValidation:
    """Test edge cases in input validation"""

    def test_unicode_and_encoding_edge_cases(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of Unicode and encoding edge cases"""
        unicode_test_cases = [
            '测试.com',  # Chinese characters
            'тест.рф',   # Cyrillic characters
            'café.com',  # Accented characters
            '🏥.health',  # Emoji in domain
            'test\x00.com',  # Null byte
            'test\uFEFF.com',  # BOM character
            'test\u200B.com',  # Zero-width space
        ]
        
        for unicode_input in unicode_test_cases:
            # Test host normalization
            result = tenant_inference.norm_host(unicode_input)
            assert isinstance(result, str), f"Should return string for Unicode input: {unicode_input}"
            
            # Test in full request flow
            event = {
                'headers': {'host': unicode_input},
                'requestContext': {
                    'requestId': f'unicode-test-{hash(unicode_input) % 1000}',
                    'identity': {'sourceIp': '192.168.1.150'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            # Should handle gracefully without crashing
            assert result is not None

    def test_extremely_long_inputs(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of extremely long inputs"""
        # Very long host (over 255 chars)
        long_host = 'a' * 300 + '.com'
        
        result = tenant_inference.norm_host(long_host)
        assert result == '', "Should reject overly long hosts"
        
        # Very long path (over 1000 chars)
        long_path = '/api/' + 'x' * 1000
        
        result = tenant_inference.valid_path(long_path, ['/api/valid'])
        assert result is False, "Should reject overly long paths"

    def test_boundary_condition_values(self, mock_aws_clients, healthcare_audit_logger):
        """Test boundary condition values"""
        # Test minimum valid lengths
        min_host = 'a.b'  # 3 characters (minimum)
        result = tenant_inference.norm_host(min_host)
        assert result == min_host, "Should accept minimum length host"
        
        # Test maximum valid lengths
        max_host = 'a' * 251 + '.com'  # 255 characters (maximum)
        result = tenant_inference.norm_host(max_host)
        assert result == max_host, "Should accept maximum length host"
        
        # Test exactly at path limit
        limit_path = '/api/' + 'x' * (1000 - 5)  # Exactly 1000 chars
        result = tenant_inference.valid_path(limit_path, ['/api/'])
        assert result is False, "Should reject path at 1000 character limit"

    def test_special_character_combinations(self, mock_aws_clients, healthcare_audit_logger):
        """Test special character combinations that might cause issues"""
        special_combinations = [
            '..\\..//',  # Mixed path separators
            '%2e%2e%2f',  # URL encoded ../
            '\r\n\r\n',  # HTTP header injection
            '"><script>',  # XSS attempt
            "'; DROP TABLE",  # SQL injection attempt
        ]
        
        for special_combo in special_combinations:
            event = {
                'headers': {'host': special_combo},
                'path': special_combo,
                'requestContext': {
                    'requestId': f'special-char-{hash(special_combo) % 1000}',
                    'identity': {'sourceIp': '203.0.113.200'}
                },
                'queryStringParameters': {'t': special_combo}
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should handle special characters safely
            assert_fail_closed_behavior(result)

    def test_null_and_empty_edge_cases(self, mock_aws_clients, healthcare_audit_logger):
        """Test null and empty value edge cases"""
        null_empty_cases = [
            {'headers': {}},  # Empty headers
            {'headers': {'host': ''}},  # Empty host
            {'headers': {'host': '   '}},  # Whitespace only host
            {'path': ''},  # Empty path
            {'path': None},  # Null path
            {'queryStringParameters': {}},  # Empty query params
            {'queryStringParameters': None},  # Null query params
            {'queryStringParameters': {'t': ''}},  # Empty tenant param
            {'queryStringParameters': {'t': None}},  # Null tenant param
        ]
        
        for test_case in null_empty_cases:
            event = test_case.copy()
            event.setdefault('requestContext', {
                'requestId': f'null-empty-{hash(str(test_case)) % 1000}',
                'identity': {'sourceIp': '10.0.0.100'}
            })
            
            result = tenant_inference.resolveTenant(event)
            
            # Should handle null/empty values gracefully
            assert result is not None
            # Most should fail closed due to no valid tenant info
            if not any(key in test_case.get('headers', {}) for key in ['host', 'origin']):
                assert_fail_closed_behavior(result)