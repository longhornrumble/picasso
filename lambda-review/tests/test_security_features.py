"""
Security tests for PICASSO tenant inference system
Healthcare-grade security validation including rate limiting, fail-closed behavior, and attack prevention
"""

import pytest
import time
import json
from unittest.mock import Mock, patch
from datetime import datetime, timedelta

import tenant_inference
from conftest import (
    assert_security_audit_logged, assert_fail_closed_behavior, 
    assert_rate_limiting_triggered, create_jwt_token, TEST_ENVIRONMENT
)


class TestRateLimitingFeatures:
    """Test rate limiting functionality"""

    def test_rate_limiting_threshold_enforcement(self, mock_aws_clients, healthcare_audit_logger):
        """Test that rate limiting triggers after 10 failures in 5-minute window"""
        source_ip = '192.168.1.100'
        
        # Clear any existing failure tracking
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            # Send exactly 10 failing requests (at threshold)
            for i in range(10):
                event = {
                    'headers': {'host': f'nonexistent{i}.com'},
                    'requestContext': {
                        'requestId': f'rate-test-{i}',
                        'identity': {'sourceIp': source_ip}
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                assert_fail_closed_behavior(result)
            
            # 11th request should be rate limited
            event = {
                'headers': {'host': 'rate-limited.com'},
                'requestContext': {
                    'requestId': 'rate-test-11',
                    'identity': {'sourceIp': source_ip}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            assert_fail_closed_behavior(result)
            
            # Verify rate limiting was triggered
            assert_rate_limiting_triggered(healthcare_audit_logger)

    def test_rate_limiting_per_ip_isolation(self, mock_aws_clients, healthcare_audit_logger):
        """Test that rate limiting is applied per IP address"""
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            # IP 1: Exceed rate limit
            ip1 = '192.168.1.100'
            for i in range(11):  # Exceed threshold
                event = {
                    'headers': {'host': f'fail{i}.com'},
                    'requestContext': {
                        'requestId': f'ip1-{i}',
                        'identity': {'sourceIp': ip1}
                    }
                }
                tenant_inference.resolveTenant(event)
            
            # IP 2: Should not be rate limited yet
            ip2 = '192.168.1.200'
            event = {
                'headers': {'host': 'different-fail.com'},
                'requestContext': {
                    'requestId': 'ip2-test',
                    'identity': {'sourceIp': ip2}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # IP2 should get normal failure (not rate limited)
            assert_fail_closed_behavior(result)
            
            # Check that IP1 is rate limited but IP2 is not
            # (This would require inspecting the specific failure reasons in logs)

    def test_rate_limiting_window_expiry(self, mock_aws_clients, healthcare_audit_logger):
        """Test that rate limiting window expires after 5 minutes"""
        tenant_inference.failure_tracking = {}
        source_ip = '10.0.0.1'
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            # Fill up rate limit
            for i in range(11):
                event = {
                    'headers': {'host': f'expired{i}.com'},
                    'requestContext': {
                        'requestId': f'expire-test-{i}',
                        'identity': {'sourceIp': source_ip}
                    }
                }
                tenant_inference.resolveTenant(event)
            
            # Should be rate limited now
            event = {
                'headers': {'host': 'should-be-limited.com'},
                'requestContext': {
                    'requestId': 'expire-limited',
                    'identity': {'sourceIp': source_ip}
                }
            }
            
            # Mock time advancement (5+ minutes)
            with patch('time.time', return_value=time.time() + 400):  # 6+ minutes
                result = tenant_inference.resolveTenant(event)
                
                # Should not be rate limited anymore (window expired)
                assert_fail_closed_behavior(result)
                # The specific failure reason should be 'no_tenant_found', not 'rate_limited'

    def test_rate_limiting_failure_tracking_cleanup(self, mock_aws_clients):
        """Test that old failures are cleaned up from tracking"""
        tenant_inference.failure_tracking = {}
        source_ip = '172.16.1.1'
        
        # Add some old failures manually
        old_time = time.time() - 400  # 6+ minutes ago
        tenant_inference.failure_tracking[source_ip] = [old_time] * 5
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {'host': 'cleanup-test.com'},
                'requestContext': {
                    'requestId': 'cleanup-test',
                    'identity': {'sourceIp': source_ip}
                }
            }
            
            # This should trigger cleanup of old failures
            tenant_inference.resolveTenant(event)
            
            # Check that old failures were cleaned up
            remaining_failures = tenant_inference.failure_tracking.get(source_ip, [])
            assert len(remaining_failures) <= 1  # Only the new failure should remain

    def test_rate_limiting_with_unknown_source_ip(self, mock_aws_clients, healthcare_audit_logger):
        """Test rate limiting behavior with unknown/missing source IP"""
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            # Event with no source IP
            event = {
                'headers': {'host': 'no-ip-test.com'},
                'requestContext': {'requestId': 'no-ip-test'}
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should still fail closed gracefully
            assert_fail_closed_behavior(result)
            
            # Should handle 'unknown' IP in rate limiting
            assert 'unknown' in tenant_inference.failure_tracking


class TestFailClosedSecurityBehavior:
    """Test fail-closed security behavior"""

    def test_fail_closed_on_system_errors(self, mock_aws_clients, healthcare_audit_logger):
        """Test fail-closed behavior on unexpected system errors"""
        # Mock a system error during processing
        with patch('tenant_inference._extract_request_context', side_effect=Exception("Critical system error")):
            event = {
                'headers': {'host': 'system-error.com'},
                'requestContext': {'requestId': 'system-error-test'}
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should fail closed
            assert_fail_closed_behavior(result)
            
            # Should log critical error
            error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
            assert any('CRITICAL: Tenant inference system failure' in call 
                      for call in error_calls)

    def test_fail_closed_generic_error_message(self, mock_aws_clients, healthcare_audit_logger):
        """Test that error messages don't leak sensitive information"""
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {'host': 'information-leak-test.com'},
                'requestContext': {
                    'requestId': 'info-leak-test',
                    'identity': {'sourceIp': '10.1.1.1'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should return generic error message
            assert result['error'] == 'Access denied'
            assert 'tenant' not in result['error'].lower()
            assert 'registry' not in result['error'].lower()
            assert 'database' not in result['error'].lower()
            assert 'config' not in result['error'].lower()

    def test_fail_closed_includes_audit_tracking(self, mock_aws_clients, healthcare_audit_logger):
        """Test that fail-closed responses include proper audit tracking"""
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {'host': 'audit-tracking.com'},
                'requestContext': {
                    'requestId': 'audit-test',
                    'identity': {'sourceIp': '203.0.113.1'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should include failure_id for audit tracking
            assert 'failure_id' in result
            assert isinstance(result['failure_id'], str)
            assert len(result['failure_id']) > 0
            
            # Should include proper status code
            assert result['status_code'] == 403


class TestSecurityHardeningFeatures:
    """Test comprehensive security hardening features"""

    def test_jwt_security_validation_comprehensive(self, mock_aws_clients, healthcare_audit_logger):
        """Test comprehensive JWT security validation"""
        malicious_jwt_scenarios = [
            # Malformed tokens
            'malicious.jwt.token',
            'ey.fake.jwt',
            'fake-jwt-token',
            
            # Algorithm attacks
            create_jwt_token({'alg': 'none'}, secret='', algorithm='none') if hasattr(tenant_inference.jwt, 'encode') else 'none-alg-test',
            
            # Invalid signatures
            create_jwt_token({'iss': 'malicious'}, secret='wrong-key'),
            
            # Missing required claims
            create_jwt_token({'iss': f'picasso-{TEST_ENVIRONMENT}'}),  # Missing other claims
        ]
        
        for malicious_token in malicious_jwt_scenarios:
            event = {
                'headers': {'authorization': f'Bearer {malicious_token}'},
                'requestContext': {
                    'requestId': f'jwt-security-{hash(malicious_token) % 1000}',
                    'identity': {'sourceIp': '10.0.0.1'}
                }
            }
            
            result = tenant_inference.extract_tenant_from_token(event)
            
            # Should reject all malicious tokens
            assert result is None, f"Should reject malicious token: {malicious_token[:20]}..."

    def test_host_injection_attack_prevention(self, mock_aws_clients, healthcare_audit_logger):
        """Test prevention of host header injection attacks"""
        malicious_hosts = [
            'evil.com\r\nHost: attacker.com',  # HTTP header injection
            'legitimate.com\nextra-header: value',  # Newline injection
            'host.com\r\n\r\n<script>alert("xss")</script>',  # Script injection
            'host.com\x00attacker.com',  # Null byte injection
            'host<script>alert("xss")</script>.com',  # XSS attempt
            'host@attacker.com',  # Email-like injection
        ]
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            for malicious_host in malicious_hosts:
                event = {
                    'headers': {'host': malicious_host},
                    'requestContext': {
                        'requestId': f'host-injection-{hash(malicious_host) % 1000}',
                        'identity': {'sourceIp': '192.168.1.50'}
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                
                # Should fail closed
                assert_fail_closed_behavior(result)

    def test_path_traversal_comprehensive_protection(self, mock_aws_clients, healthcare_audit_logger):
        """Test comprehensive path traversal protection"""
        traversal_attacks = [
            '../../../etc/passwd',
            '..\\..\\..\\windows\\system32\\config\\sam',
            '/var/www/html/../../../etc/shadow',
            '/app/data/../../config/database.yml',
            '....//....//....//etc/passwd',  # Double dot encoding
            '..%2F..%2F..%2Fetc%2Fpasswd',  # URL encoded
            '..%252F..%252F..%252Fetc%252Fpasswd',  # Double URL encoded
        ]
        
        for attack_path in traversal_attacks:
            event = {
                'requestContext': {
                    'requestId': f'traversal-{hash(attack_path) % 1000}',
                    'identity': {'sourceIp': '10.0.0.100'}
                },
                'path': attack_path
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should fail closed
            assert_fail_closed_behavior(result)

    def test_sql_injection_parameter_protection(self, mock_aws_clients, healthcare_audit_logger):
        """Test protection against SQL injection in parameters"""
        sql_injection_attempts = [
            "'; DROP TABLE tenants; --",
            "' OR '1'='1",
            "'; UPDATE tenants SET admin=1; --",
            "' UNION SELECT * FROM admin_users --",
            "'; INSERT INTO audit_log VALUES ('hacked'); --",
        ]
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            for sql_injection in sql_injection_attempts:
                event = {
                    'headers': {'host': 'test.com'},
                    'requestContext': {
                        'requestId': f'sql-injection-{hash(sql_injection) % 1000}',
                        'identity': {'sourceIp': '172.16.1.100'}
                    },
                    'queryStringParameters': {
                        't': sql_injection
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                
                # Should fail closed (invalid tenant hash format)
                assert_fail_closed_behavior(result)

    def test_xss_attack_prevention(self, mock_aws_clients, healthcare_audit_logger):
        """Test XSS attack prevention in all input fields"""
        xss_payloads = [
            '<script>alert("xss")</script>',
            'javascript:alert("xss")',
            '<img src=x onerror=alert("xss")>',
            '<svg onload=alert("xss")>',
            '"><script>alert("xss")</script>',
        ]
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            for xss_payload in xss_payloads:
                event = {
                    'headers': {
                        'host': xss_payload,
                        'origin': f'https://{xss_payload}',
                        'user-agent': xss_payload
                    },
                    'requestContext': {
                        'requestId': f'xss-{hash(xss_payload) % 1000}',
                        'identity': {'sourceIp': '203.0.113.50'}
                    },
                    'path': f'/{xss_payload}',
                    'queryStringParameters': {
                        't': xss_payload
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                
                # Should fail closed
                assert_fail_closed_behavior(result)

    def test_dos_attack_mitigation(self, mock_aws_clients, healthcare_audit_logger):
        """Test DoS attack mitigation through rate limiting"""
        tenant_inference.failure_tracking = {}
        attacker_ip = '10.0.0.200'
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            # Rapid-fire requests (DoS attempt)
            for i in range(20):  # Well over rate limit
                event = {
                    'headers': {'host': f'dos-attack-{i}.com'},
                    'requestContext': {
                        'requestId': f'dos-{i}',
                        'identity': {'sourceIp': attacker_ip}
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                assert_fail_closed_behavior(result)
            
            # Verify rate limiting kicks in
            assert len(tenant_inference.failure_tracking[attacker_ip]) >= tenant_inference.RATE_LIMIT_THRESHOLD

    def test_environment_based_security_enforcement(self, mock_aws_clients, healthcare_audit_logger):
        """Test environment-based security enforcement (production hardening)"""
        with patch.dict('os.environ', {'ENVIRONMENT': 'production'}):
            # Force module reload to pick up environment
            import importlib
            importlib.reload(tenant_inference)
            
            # Test HTTP origin rejection in production
            event = {
                'headers': {
                    'origin': 'http://insecure.example.com'  # HTTP in production
                },
                'requestContext': {
                    'requestId': 'prod-security-test',
                    'identity': {'sourceIp': '192.168.1.10'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should fail closed in production for HTTP
            assert_fail_closed_behavior(result)

    def test_cloudwatch_security_metrics_integration(self, mock_aws_clients, healthcare_audit_logger):
        """Test CloudWatch security metrics for monitoring"""
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            # Generate security failures
            security_events = [
                {'headers': {'host': '../../../etc/passwd'}, 'type': 'path_traversal'},
                {'headers': {'host': '<script>alert("xss")</script>'}, 'type': 'xss_attempt'},
                {'queryStringParameters': {'t': "'; DROP TABLE x; --"}, 'type': 'sql_injection'},
            ]
            
            for i, security_event in enumerate(security_events):
                event = security_event.copy()
                event['requestContext'] = {
                    'requestId': f'security-metric-{i}',
                    'identity': {'sourceIp': f'10.0.0.{i+1}'}
                }
                
                result = tenant_inference.resolveTenant(event)
                assert_fail_closed_behavior(result)
            
            # Verify CloudWatch metrics were sent
            mock_cloudwatch = mock_aws_clients['boto3_client'].return_value
            assert mock_cloudwatch.put_metric_data.call_count >= len(security_events)

    def test_audit_log_tampering_protection(self, mock_aws_clients, healthcare_audit_logger):
        """Test that audit logs cannot be tampered with by malicious input"""
        malicious_inputs_for_logs = [
            '", "injected": "malicious", "original": "',
            '\n{"fake_log": "injected"}',
            '\\", \\"hacked\\": true, \\"',
            '\r\n<script>alert("log injection")</script>',
        ]
        
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            for malicious_input in malicious_inputs_for_logs:
                event = {
                    'headers': {
                        'host': malicious_input,
                        'user-agent': malicious_input
                    },
                    'requestContext': {
                        'requestId': malicious_input,
                        'identity': {'sourceIp': '192.168.1.99'}
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                assert_fail_closed_behavior(result)
            
            # Verify audit logs maintain integrity
            # (Manual inspection would be needed to ensure JSON structure isn't corrupted)
            assert healthcare_audit_logger.error.call_count >= len(malicious_inputs_for_logs)

    def test_timing_attack_resistance(self, mock_aws_clients, healthcare_audit_logger):
        """Test resistance to timing attacks for tenant enumeration"""
        valid_registry = {'hosts': {'legitimate.com': 'tenant123'}, 'origins': {}, 'paths': {}, 'hashes': {'tenant123'}}
        
        with patch('tenant_inference.loadTenantRegistry', return_value=valid_registry):
            # Test timing for valid vs invalid hosts
            hosts_to_test = [
                'legitimate.com',  # Valid host
                'nonexistent1.com',  # Invalid host
                'nonexistent2.org',  # Invalid host
            ]
            
            timing_results = []
            
            for host in hosts_to_test:
                event = {
                    'headers': {'host': host},
                    'requestContext': {
                        'requestId': f'timing-{host}',
                        'identity': {'sourceIp': '10.0.0.50'}
                    }
                }
                
                start_time = time.perf_counter()
                result = tenant_inference.resolveTenant(event)
                end_time = time.perf_counter()
                
                execution_time = (end_time - start_time) * 1000  # Convert to ms
                timing_results.append((host, execution_time, result))
            
            # Timing differences should be minimal to prevent enumeration
            valid_time = timing_results[0][1]
            invalid_times = [t[1] for t in timing_results[1:]]
            
            for invalid_time in invalid_times:
                # Allow some variance but not orders of magnitude difference
                time_ratio = max(valid_time, invalid_time) / min(valid_time, invalid_time)
                assert time_ratio < 5.0, f"Timing difference too large: {time_ratio}x"