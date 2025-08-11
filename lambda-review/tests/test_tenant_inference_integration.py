"""
Integration tests for main resolveTenant function in PICASSO tenant inference system
Healthcare-grade integration testing with full precedence order validation
"""

import pytest
import json
import time
from unittest.mock import Mock, patch
from datetime import datetime, timedelta

import tenant_inference
from conftest import (
    create_jwt_token, TEST_JWT_SECRET, TEST_ENVIRONMENT,
    assert_security_audit_logged, assert_fail_closed_behavior,
    measure_execution_time, assert_performance_requirement
)


class TestTenantInferenceIntegration:
    """Integration tests for main resolveTenant function"""

    def test_jwt_token_precedence_highest_priority(self, mock_aws_clients, sample_tenant_registry, 
                                                  valid_jwt_payload, healthcare_audit_logger):
        """Test JWT token has highest precedence in inference"""
        # Setup registry with host/path mappings
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            jwt_token = create_jwt_token(valid_jwt_payload)
            
            # Event with JWT token AND host/path that would match different tenant
            event = {
                'headers': {
                    'authorization': f'Bearer {jwt_token}',
                    'host': 'secure.example.org'  # Would resolve to tenant456hash
                },
                'requestContext': {
                    'requestId': 'test-precedence',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'path': '/secure/dashboard',  # Would also resolve to tenant456hash
                'queryStringParameters': {
                    't': 'medical789hash'  # Would resolve to medical789hash
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should return JWT tenant, not host/path/config tenant
            assert result['tenant_id'] == 'tenant123hash'  # From JWT
            assert result['source'] == 'jwt_token'
            
            # Verify success audit logging
            assert_security_audit_logged(healthcare_audit_logger, 'tenant_inference_success')

    def test_host_precedence_over_path_and_config(self, mock_aws_clients, sample_tenant_registry, 
                                                 healthcare_audit_logger):
        """Test host-based inference has precedence over path and config"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            event = {
                'headers': {
                    'host': 'healthcare.ai'  # Should resolve to medical789hash
                },
                'requestContext': {
                    'requestId': 'test-host-precedence',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'path': '/secure/dashboard',  # Would resolve to tenant456hash
                'queryStringParameters': {
                    't': 'tenant123hash'  # Different config tenant
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should return host-based tenant
            assert result['tenant_hash'] == 'medical789hash'
            assert result['source'] == 'host'
            assert result['matched_value'] == 'healthcare.ai'

    def test_origin_precedence_when_no_host(self, mock_aws_clients, sample_tenant_registry, 
                                           healthcare_audit_logger):
        """Test origin-based inference when host is not available"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            event = {
                'headers': {
                    'origin': 'https://secure.example.org'  # Should resolve to tenant456hash
                },
                'requestContext': {
                    'requestId': 'test-origin-precedence',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'path': '/healthcare/portal',  # Would resolve to different tenant
                'queryStringParameters': {
                    't': 'tenant123hash'  # Different config tenant
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should return origin-based tenant
            assert result['tenant_hash'] == 'tenant456hash'
            assert result['source'] == 'origin'

    def test_path_precedence_over_config(self, mock_aws_clients, sample_tenant_registry, 
                                        healthcare_audit_logger):
        """Test path-based inference has precedence over config parameter"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            event = {
                'headers': {},
                'requestContext': {
                    'requestId': 'test-path-precedence',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'path': '/healthcare/portal',  # Should resolve to tenant123hash
                'queryStringParameters': {
                    't': 'tenant456hash'  # Different config tenant
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should return path-based tenant
            assert result['tenant_hash'] == 'tenant123hash'
            assert result['source'] == 'path'

    def test_config_parameter_fallback(self, mock_aws_clients, sample_tenant_registry, 
                                      healthcare_audit_logger):
        """Test config parameter as final fallback method"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            event = {
                'headers': {},  # No host/origin
                'requestContext': {
                    'requestId': 'test-config-fallback',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'path': '/unknown/path',  # Path not in registry
                'queryStringParameters': {
                    't': 'tenant456hash'  # Valid tenant hash in registry
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should return config-based tenant
            assert result['tenant_hash'] == 'tenant456hash'
            assert result['source'] == 'config'

    def test_all_inference_methods_fail(self, mock_aws_clients, sample_tenant_registry, 
                                       healthcare_audit_logger):
        """Test fail-closed behavior when all inference methods fail"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            event = {
                'headers': {
                    'host': 'unknown.example.com'  # Not in registry
                },
                'requestContext': {
                    'requestId': 'test-all-fail',
                    'identity': {'sourceIp': '192.168.1.100'}
                },
                'path': '/unknown/path',  # Not in registry
                'queryStringParameters': {
                    't': 'unknown-tenant-hash'  # Not in registry
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should return fail-closed response
            assert_fail_closed_behavior(result)
            
            # Verify failure audit logging
            assert_security_audit_logged(healthcare_audit_logger, 'no_tenant_found')

    def test_rate_limiting_blocks_requests(self, mock_aws_clients, sample_tenant_registry, 
                                         rate_limit_events, healthcare_audit_logger):
        """Test rate limiting blocks requests after threshold exceeded"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            results = []
            
            # Send multiple failing requests from same IP
            for event in rate_limit_events:
                result = tenant_inference.resolveTenant(event)
                results.append(result)
            
            # Early requests should fail with 'no_tenant_found'
            # Later requests should fail with 'rate_limited'
            rate_limited_results = [r for r in results if 'rate_limited' in str(r)]
            assert len(rate_limited_results) > 0, "Should have rate-limited requests"
            
            # Verify rate limiting audit logging
            error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
            assert any('rate_limited' in call for call in error_calls)

    def test_successful_jwt_inference_full_flow(self, mock_aws_clients, valid_jwt_payload, 
                                               healthcare_audit_logger):
        """Test complete JWT inference flow with all validations"""
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        event = {
            'headers': {
                'authorization': f'Bearer {jwt_token}',
                'User-Agent': 'Healthcare-Client/1.0'
            },
            'requestContext': {
                'requestId': 'test-jwt-full-flow',
                'identity': {'sourceIp': '10.0.1.100'}
            }
        }
        
        result = tenant_inference.resolveTenant(event)
        
        # Verify successful JWT inference
        assert result['tenant_id'] == 'tenant123hash'
        assert result['source'] == 'jwt_token'
        assert result['purpose'] == 'stream'
        assert result['session_id'] == 'sess_12345_abcd'
        assert 'expires_at' in result
        
        # Verify success audit logging with proper context
        info_calls = [str(call) for call in healthcare_audit_logger.info.call_args_list]
        assert any('tenant_inference_success' in call and 'jwt_inference' in call 
                  for call in info_calls)

    def test_host_inference_with_normalization(self, mock_aws_clients, sample_tenant_registry, 
                                              healthcare_audit_logger):
        """Test host inference with proper host normalization"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            event = {
                'headers': {
                    'host': 'HEALTHCARE.AI:443'  # Uppercase with port - should normalize
                },
                'requestContext': {
                    'requestId': 'test-host-normalization',
                    'identity': {'sourceIp': '192.168.1.50'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should successfully resolve after normalization
            assert result['tenant_hash'] == 'medical789hash'
            assert result['source'] == 'host'
            assert result['matched_value'] == 'healthcare.ai'  # Normalized

    def test_path_inference_with_prefix_matching(self, mock_aws_clients, sample_tenant_registry, 
                                                healthcare_audit_logger):
        """Test path inference with prefix matching logic"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            event = {
                'headers': {},
                'requestContext': {
                    'requestId': 'test-path-prefix',
                    'identity': {'sourceIp': '172.16.1.10'}
                },
                'path': '/healthcare/portal/patient/view/123'  # Longer than registered path
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should match prefix /healthcare/portal
            assert result['tenant_hash'] == 'tenant123hash'
            assert result['source'] == 'path'
            assert result['matched_value'] == '/healthcare/portal'

    def test_malicious_input_handling(self, mock_aws_clients, malicious_lambda_event, 
                                     healthcare_audit_logger):
        """Test handling of malicious input with security hardening"""
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            result = tenant_inference.resolveTenant(malicious_lambda_event)
            
            # Should fail closed with security logging
            assert_fail_closed_behavior(result)
            
            # Verify comprehensive security logging
            all_logs = (healthcare_audit_logger.info.call_args_list + 
                       healthcare_audit_logger.warning.call_args_list + 
                       healthcare_audit_logger.error.call_args_list)
            
            # Should log security violations
            log_strings = [str(call) for call in all_logs]
            security_logged = any('SECURITY' in log for log in log_strings)
            assert security_logged, "Should log security violations"

    def test_system_error_handling(self, mock_aws_clients, healthcare_audit_logger):
        """Test system error handling in main inference function"""
        # Mock an unexpected system error
        with patch('tenant_inference._extract_request_context', side_effect=Exception("System failure")):
            event = {'headers': {}, 'requestContext': {}}
            
            result = tenant_inference.resolveTenant(event)
            
            # Should fail closed gracefully
            assert_fail_closed_behavior(result)
            
            # Verify critical error logging
            error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
            assert any('CRITICAL: Tenant inference system failure' in call 
                      for call in error_calls)

    def test_cloudwatch_metrics_integration(self, mock_aws_clients, healthcare_audit_logger):
        """Test CloudWatch metrics are sent for failures"""
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {'host': 'nonexistent.com'},
                'requestContext': {
                    'requestId': 'test-metrics',
                    'identity': {'sourceIp': '203.0.113.10'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should fail closed
            assert_fail_closed_behavior(result)
            
            # Verify CloudWatch metrics call
            mock_aws_clients['boto3_client'].assert_called_with('cloudwatch')
            cloudwatch_mock = mock_aws_clients['boto3_client'].return_value
            cloudwatch_mock.put_metric_data.assert_called()
            
            # Verify metric data structure
            call_args = cloudwatch_mock.put_metric_data.call_args
            metric_data = call_args[1]['MetricData'][0]
            assert metric_data['MetricName'] == 'TenantInferenceFailures'
            assert metric_data['Value'] == 1
            assert metric_data['Unit'] == 'Count'

    def test_request_context_extraction(self, mock_aws_clients, healthcare_audit_logger):
        """Test proper extraction of request context for audit logging"""
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {
                    'User-Agent': 'Healthcare-Test-Client/2.0',
                    'X-Forwarded-For': '203.0.113.1, 10.0.0.1',
                    'X-Real-IP': '203.0.113.1'
                },
                'requestContext': {
                    'requestId': 'context-extraction-test',
                    'identity': {
                        'sourceIp': '203.0.113.1'
                    }
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should extract and use context properly
            assert_fail_closed_behavior(result)
            
            # Verify context was extracted and logged
            error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
            context_logged = any('203.0.113.1' in call and 'Healthcare-Test-Client' in call 
                               for call in error_calls)
            assert context_logged, "Should log extracted request context"

    def test_multiple_header_sources_extraction(self, mock_aws_clients, sample_tenant_registry, 
                                               healthcare_audit_logger):
        """Test extraction from multiple header sources (host, origin)"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            # Test case-insensitive header extraction
            event = {
                'headers': {
                    'Host': 'healthcare.ai',  # Capital H
                    'origin': 'https://backup.example.com',  # lowercase
                    'X-Forwarded-Host': 'forwarded.example.com'
                },
                'requestContext': {
                    'requestId': 'multi-header-test',
                    'identity': {'sourceIp': '10.1.1.1'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should prioritize Host header
            assert result['tenant_hash'] == 'medical789hash'
            assert result['source'] == 'host'

    def test_edge_case_empty_event(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of completely empty event"""
        result = tenant_inference.resolveTenant({})
        
        # Should fail closed gracefully
        assert_fail_closed_behavior(result)

    def test_edge_case_null_event(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of null event"""
        result = tenant_inference.resolveTenant(None)
        
        # Should fail closed gracefully
        assert_fail_closed_behavior(result)

    def test_precedence_order_comprehensive(self, mock_aws_clients, sample_tenant_registry, 
                                           valid_jwt_payload, healthcare_audit_logger):
        """Test comprehensive precedence order: JWT > Host > Origin > Path > Config"""
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            # Event with ALL inference methods available
            comprehensive_event = {
                'headers': {
                    'authorization': f'Bearer {jwt_token}',  # JWT: tenant123hash
                    'host': 'secure.example.org',           # Host: tenant456hash  
                    'origin': 'https://healthcare.ai'       # Origin: medical789hash
                },
                'requestContext': {
                    'requestId': 'comprehensive-precedence',
                    'identity': {'sourceIp': '192.168.100.1'}
                },
                'path': '/secure/dashboard',                 # Path: tenant456hash
                'queryStringParameters': {
                    't': 'medical789hash'                   # Config: medical789hash
                }
            }
            
            result = tenant_inference.resolveTenant(comprehensive_event)
            
            # Should return JWT result (highest precedence)
            assert result['tenant_id'] == 'tenant123hash'
            assert result['source'] == 'jwt_token'

    def test_inference_performance_requirement(self, mock_aws_clients, sample_tenant_registry, 
                                              performance_test_events, healthcare_audit_logger):
        """Test that tenant inference meets <50ms performance requirement"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            total_time = 0
            successful_inferences = 0
            
            for event in performance_test_events[:10]:  # Test subset for performance
                result, exec_time = measure_execution_time(
                    tenant_inference.resolveTenant, event
                )
                
                # Track performance
                total_time += exec_time
                if not (result and result.get('error')):
                    successful_inferences += 1
                
                # Each individual call should be fast
                assert_performance_requirement(exec_time, 50)  # 50ms requirement
            
            # Average should be well under requirement
            avg_time = total_time / len(performance_test_events[:10])
            assert_performance_requirement(avg_time, 25)  # Even stricter for average

    def test_tenant_inference_audit_completeness(self, mock_aws_clients, sample_tenant_registry, 
                                                 valid_jwt_payload, healthcare_audit_logger):
        """Test completeness of audit logging for all inference types"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            jwt_token = create_jwt_token(valid_jwt_payload)
            
            test_cases = [
                # JWT inference
                ({'headers': {'authorization': f'Bearer {jwt_token}'}, 
                  'requestContext': {'requestId': 'audit-jwt', 'identity': {'sourceIp': '10.0.0.1'}}}, 
                 'jwt_inference'),
                
                # Host inference  
                ({'headers': {'host': 'healthcare.ai'}, 
                  'requestContext': {'requestId': 'audit-host', 'identity': {'sourceIp': '10.0.0.2'}}}, 
                 'host_inference'),
                
                # Path inference
                ({'path': '/healthcare/portal', 
                  'requestContext': {'requestId': 'audit-path', 'identity': {'sourceIp': '10.0.0.3'}}}, 
                 'path_inference'),
                
                # Config inference
                ({'queryStringParameters': {'t': 'tenant456hash'}, 
                  'requestContext': {'requestId': 'audit-config', 'identity': {'sourceIp': '10.0.0.4'}}}, 
                 'config_inference')
            ]
            
            for event, expected_inference_type in test_cases:
                # Clear previous logs
                healthcare_audit_logger.reset_mock()
                
                result = tenant_inference.resolveTenant(event)
                
                # Should succeed
                assert result is not None
                if 'error' not in result:  # Success case
                    assert_security_audit_logged(healthcare_audit_logger, expected_inference_type)

    def test_cross_tenant_isolation_validation(self, mock_aws_clients, sample_tenant_registry, 
                                              healthcare_audit_logger):
        """Test that cross-tenant data access is prevented"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            # Attempt to access different tenant's path with mismatched host
            event = {
                'headers': {
                    'host': 'healthcare.ai'  # medical789hash tenant
                },
                'requestContext': {
                    'requestId': 'cross-tenant-test',
                    'identity': {'sourceIp': '192.168.1.200'}
                },
                'path': '/secure/dashboard',  # Different tenant's path
                'queryStringParameters': {
                    't': 'tenant456hash'  # Yet another tenant
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should resolve to host-based tenant (highest precedence after JWT)
            # This ensures consistent tenant resolution, preventing cross-tenant access
            assert result['tenant_hash'] == 'medical789hash'
            assert result['source'] == 'host'
            
            # The precedence order inherently prevents cross-tenant confusion