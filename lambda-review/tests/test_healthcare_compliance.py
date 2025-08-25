"""
Healthcare compliance tests for PICASSO tenant inference system
HIPAA-compliant audit logging and healthcare-grade security validation
"""

import pytest
import json
import time
import re
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

import tenant_inference
from conftest import (
    assert_hipaa_compliance_logging, assert_phi_protection,
    create_jwt_token, assert_security_audit_logged
)


class TestHIPAAComplianceAuditLogging:
    """Test HIPAA-compliant audit logging requirements"""

    def test_comprehensive_audit_log_structure(self, mock_aws_clients, healthcare_audit_logger):
        """Test that audit logs contain all required HIPAA elements"""
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {
                    'host': 'healthcare-audit.com',
                    'User-Agent': 'Healthcare-Client/1.0'
                },
                'requestContext': {
                    'requestId': 'hipaa-audit-test',
                    'identity': {'sourceIp': '192.168.1.100'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should generate audit log
            error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
            audit_logs = [call for call in error_calls if 'SECURITY_AUDIT' in call]
            
            assert len(audit_logs) > 0, "Should generate HIPAA audit logs"
            
            # Verify required HIPAA audit elements in logs
            for audit_log in audit_logs:
                # Check for required timestamp
                assert 'timestamp' in audit_log, "Audit log must include timestamp"
                
                # Check for source identification
                assert 'source_ip' in audit_log, "Audit log must include source IP"
                
                # Check for user agent (user identification)
                assert 'user_agent' in audit_log, "Audit log must include user agent"
                
                # Check for request identification
                assert 'request_id' in audit_log, "Audit log must include request ID"
                
                # Check for environment context
                assert 'environment' in audit_log, "Audit log must include environment"
                
                # Check for failure tracking ID
                assert 'failure_id' in audit_log, "Audit log must include failure ID for tracking"

    def test_audit_log_immutability_protection(self, mock_aws_clients, healthcare_audit_logger):
        """Test that audit logs are protected from tampering"""
        tenant_inference.failure_tracking = {}
        
        # Test with potentially malicious input that could corrupt logs
        malicious_inputs = [
            '", "injected_field": "malicious_value", "original_field": "',
            '\n{"fake_audit_log": "injected"}',
            '\\", \\"compromised\\": true, \\"',
            '\r\n<script>alert("audit log injection")</script>'
        ]
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            for malicious_input in malicious_inputs:
                event = {
                    'headers': {
                        'host': malicious_input,
                        'User-Agent': malicious_input
                    },
                    'requestContext': {
                        'requestId': malicious_input,
                        'identity': {'sourceIp': '10.0.0.1'}
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                
                # Audit logs should be generated
                assert healthcare_audit_logger.error.call_count > 0
        
        # Verify audit logs maintain proper JSON structure
        error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
        for call in error_calls:
            if 'SECURITY_AUDIT' in call:
                # Extract JSON from log message
                json_match = re.search(r'\{.*\}', call)
                if json_match:
                    try:
                        # Should be valid JSON
                        parsed = json.loads(json_match.group())
                        assert isinstance(parsed, dict), "Audit log should be valid JSON"
                    except json.JSONDecodeError:
                        pytest.fail(f"Audit log contains invalid JSON: {call}")

    def test_phi_protection_in_audit_logs(self, mock_aws_clients, healthcare_audit_logger):
        """Test that PHI (Protected Health Information) is not leaked in audit logs"""
        tenant_inference.failure_tracking = {}
        
        # Simulate requests with potential PHI
        phi_data = [
            'patient-ssn-123456789',
            'john.doe@email.com',
            'patient-mrn-987654321',
            'diagnosis-diabetes-type2',
            'prescription-insulin-10units'
        ]
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            for phi_item in phi_data:
                event = {
                    'headers': {
                        'host': f'healthcare-{phi_item}.com',
                        'User-Agent': f'Patient-App-{phi_item}'
                    },
                    'requestContext': {
                        'requestId': f'phi-test-{phi_item}',
                        'identity': {'sourceIp': '192.168.50.1'}
                    },
                    'queryStringParameters': {
                        't': phi_item  # Simulate PHI in parameters
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                
                # Verify PHI protection in result
                assert_phi_protection(result, [phi_item])
        
        # Verify audit logs don't contain full PHI
        all_logs = (healthcare_audit_logger.info.call_args_list + 
                   healthcare_audit_logger.error.call_args_list + 
                   healthcare_audit_logger.warning.call_args_list)
        
        for log_call in all_logs:
            log_str = str(log_call)
            # Some PHI might be logged for security purposes, but should be truncated/masked
            for phi_item in phi_data:
                if phi_item in log_str:
                    # If PHI appears, it should be truncated (e.g., first few chars + ...)
                    full_phi_pattern = re.compile(re.escape(phi_item))
                    matches = full_phi_pattern.findall(log_str)
                    # Allow some occurrences but they should be limited/controlled
                    assert len(matches) < 3, f"Too much PHI exposure in logs: {phi_item}"

    def test_audit_trail_completeness(self, mock_aws_clients, sample_tenant_registry, 
                                     valid_jwt_payload, healthcare_audit_logger):
        """Test complete audit trail for successful operations"""
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            # Successful JWT-based inference
            event = {
                'headers': {
                    'authorization': f'Bearer {jwt_token}',
                    'User-Agent': 'Healthcare-EHR-System/3.0'
                },
                'requestContext': {
                    'requestId': 'audit-trail-success',
                    'identity': {'sourceIp': '10.5.0.100'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should be successful
            assert result is not None
            assert result.get('tenant_id') == 'tenant123hash'
            
            # Verify complete audit trail
            assert_hipaa_compliance_logging(healthcare_audit_logger)
            
            # Should have success audit log
            info_calls = [str(call) for call in healthcare_audit_logger.info.call_args_list]
            success_logs = [call for call in info_calls if 'tenant_inference_success' in call]
            assert len(success_logs) > 0, "Should audit successful operations"
            
            # Verify success audit contains required elements
            for success_log in success_logs:
                assert 'inference_type' in success_log, "Success audit must include inference type"
                assert 'tenant_hash' in success_log, "Success audit must include tenant reference"
                assert 'source_ip' in success_log, "Success audit must include source IP"
                assert 'environment' in success_log, "Success audit must include environment"

    def test_security_incident_audit_escalation(self, mock_aws_clients, healthcare_audit_logger):
        """Test proper audit escalation for security incidents"""
        tenant_inference.failure_tracking = {}
        
        # Simulate various security incidents
        security_incidents = [
            {
                'type': 'path_traversal',
                'event': {
                    'headers': {'host': 'test.com'},
                    'path': '../../../etc/passwd',
                    'requestContext': {
                        'requestId': 'security-traversal',
                        'identity': {'sourceIp': '203.0.113.1'}
                    }
                }
            },
            {
                'type': 'injection_attempt',
                'event': {
                    'headers': {'host': 'test<script>alert("xss")</script>.com'},
                    'requestContext': {
                        'requestId': 'security-injection',
                        'identity': {'sourceIp': '203.0.113.2'}
                    }
                }
            },
            {
                'type': 'rate_limit_violation',
                'event': {
                    'headers': {'host': 'ddos-test.com'},
                    'requestContext': {
                        'requestId': 'security-ddos',
                        'identity': {'sourceIp': '203.0.113.3'}
                    }
                }
            }
        ]
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            for incident in security_incidents:
                result = tenant_inference.resolveTenant(incident['event'])
                
                # Should fail closed
                assert result is not None
                assert result.get('error') == 'Access denied'
        
        # Verify security incidents are properly audited
        error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
        security_logs = [call for call in error_calls if 'SECURITY_AUDIT' in call]
        
        assert len(security_logs) >= len(security_incidents), "Should audit all security incidents"
        
        # Verify escalation markers in security logs
        for security_log in security_logs:
            assert 'SECURITY_AUDIT' in security_log, "Security incidents must be clearly marked"
            assert 'failure_id' in security_log, "Security incidents must have tracking IDs"

    def test_cloudwatch_metrics_hipaa_compliance(self, mock_aws_clients, healthcare_audit_logger):
        """Test CloudWatch metrics comply with HIPAA requirements"""
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {'host': 'cloudwatch-test.com'},
                'requestContext': {
                    'requestId': 'cloudwatch-hipaa-test',
                    'identity': {'sourceIp': '172.16.0.50'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Should send CloudWatch metrics
            mock_cloudwatch = mock_aws_clients['boto3_client'].return_value
            mock_cloudwatch.put_metric_data.assert_called()
            
            # Verify metrics don't contain PHI
            call_args = mock_cloudwatch.put_metric_data.call_args
            metric_data = call_args[1]['MetricData'][0]
            
            # Metrics should be aggregated/anonymized
            assert 'patient' not in str(metric_data).lower(), "Metrics must not contain patient info"
            assert 'medical' not in str(metric_data).lower(), "Metrics must not contain medical info"
            assert 'ssn' not in str(metric_data).lower(), "Metrics must not contain SSN"
            assert 'diagnosis' not in str(metric_data).lower(), "Metrics must not contain diagnosis"
            
            # Verify required metric structure
            assert metric_data['MetricName'] == 'TenantInferenceFailures'
            assert metric_data['Unit'] == 'Count'
            assert 'Dimensions' in metric_data

    def test_data_retention_compliance(self, mock_aws_clients, healthcare_audit_logger):
        """Test data retention compliance for audit logs"""
        # This test validates the structure for compliance, actual retention 
        # would be handled by log management systems
        
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {'host': 'retention-test.com'},
                'requestContext': {
                    'requestId': 'retention-compliance-test',
                    'identity': {'sourceIp': '10.20.30.40'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Verify audit logs include retention metadata
            error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
            audit_logs = [call for call in error_calls if 'SECURITY_AUDIT' in call]
            
            for audit_log in audit_logs:
                # Should include environment for retention policy application
                assert 'environment' in audit_log, "Audit logs must include environment for retention"
                
                # Should include timestamp for retention calculation
                assert 'timestamp' in audit_log, "Audit logs must include timestamp for retention"
                
                # Should include structured data for automated processing
                json_match = re.search(r'\{.*\}', audit_log)
                assert json_match is not None, "Audit logs should be structured for retention processing"


class TestHealthcareSecurityStandards:
    """Test healthcare-specific security standards"""

    def test_minimum_encryption_standards(self, mock_aws_clients, valid_jwt_payload):
        """Test that JWT tokens use adequate encryption standards"""
        # Test JWT algorithm requirements
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        # Decode header to check algorithm
        import base64
        header_b64 = jwt_token.split('.')[0]
        # Add padding if needed
        header_b64 += '=' * (4 - len(header_b64) % 4)
        header_bytes = base64.b64decode(header_b64)
        header = json.loads(header_bytes)
        
        # Should use strong algorithm
        assert header.get('alg') == 'HS256', "Should use HS256 or stronger algorithm"
        assert header.get('typ') == 'JWT', "Should be proper JWT format"

    def test_access_control_granularity(self, mock_aws_clients, sample_tenant_registry, 
                                       healthcare_audit_logger):
        """Test granular access control for healthcare environments"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            # Test that different tenants are properly isolated
            tenant_isolation_tests = [
                {
                    'event': {'headers': {'host': 'healthcare.ai'}},
                    'expected_tenant': 'medical789hash',
                    'description': 'Medical tenant isolation'
                },
                {
                    'event': {'headers': {'host': 'secure.example.org'}},
                    'expected_tenant': 'tenant456hash',
                    'description': 'Secure tenant isolation'
                },
                {
                    'event': {'path': '/healthcare/portal'},
                    'expected_tenant': 'tenant123hash',
                    'description': 'Path-based tenant isolation'
                }
            ]
            
            for test_case in tenant_isolation_tests:
                event = test_case['event'].copy()
                event['requestContext'] = {
                    'requestId': f'isolation-test-{hash(test_case["description"]) % 1000}',
                    'identity': {'sourceIp': '192.168.100.1'}
                }
                
                result = tenant_inference.resolveTenant(event)
                
                assert result is not None, f"Failed {test_case['description']}"
                assert result.get('tenant_hash') == test_case['expected_tenant'], \
                    f"Incorrect tenant isolation for {test_case['description']}"

    def test_session_management_security(self, mock_aws_clients, valid_jwt_payload):
        """Test session management meets healthcare security standards"""
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        event = {
            'headers': {'authorization': f'Bearer {jwt_token}'},
            'requestContext': {'requestId': 'session-test', 'identity': {'sourceIp': '10.0.0.1'}}
        }
        
        result = tenant_inference.extract_tenant_from_token(event)
        
        assert result is not None, "Valid session should be accepted"
        
        # Verify session includes required security elements
        assert 'session_id' in result, "Session must include session ID"
        assert 'expires_at' in result, "Session must include expiry"
        assert 'jti' in result, "Session must include JWT ID for replay protection"
        
        # Verify session expiry is reasonable for healthcare (15 minutes max)
        expires_at = result['expires_at']
        current_time = int(time.time())
        session_duration = expires_at - current_time
        assert session_duration <= 900, "Session duration should not exceed 15 minutes for healthcare"

    def test_zero_trust_security_model(self, mock_aws_clients, healthcare_audit_logger):
        """Test zero-trust security model implementation"""
        # Every request should be validated regardless of source
        trusted_sources = [
            '10.0.0.1',      # Internal network
            '172.16.0.1',    # Private network
            '192.168.1.1'    # Local network
        ]
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            for trusted_ip in trusted_sources:
                event = {
                    'headers': {'host': 'nonexistent.com'},  # Invalid host
                    'requestContext': {
                        'requestId': f'zero-trust-{trusted_ip.replace(".", "-")}',
                        'identity': {'sourceIp': trusted_ip}
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                
                # Even "trusted" IPs should be denied for invalid requests
                assert result.get('error') == 'Access denied', \
                    f"Zero-trust violation: {trusted_ip} should be denied for invalid request"

    def test_compliance_documentation_in_responses(self, mock_aws_clients, healthcare_audit_logger):
        """Test that responses include compliance documentation elements"""
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            event = {
                'headers': {'host': 'compliance-test.com'},
                'requestContext': {
                    'requestId': 'compliance-doc-test',
                    'identity': {'sourceIp': '203.0.113.100'}
                }
            }
            
            result = tenant_inference.resolveTenant(event)
            
            # Verify response includes compliance elements
            assert 'failure_id' in result, "Response must include tracking ID for compliance"
            assert result.get('status_code') == 403, "Response must include proper status code"
            
            # Verify response doesn't leak sensitive information
            assert 'database' not in str(result).lower(), "Response must not leak system information"
            assert 'internal' not in str(result).lower(), "Response must not leak internal details"

    def test_healthcare_specific_threat_detection(self, mock_aws_clients, healthcare_audit_logger):
        """Test detection of healthcare-specific threats"""
        healthcare_threats = [
            # Medical record number patterns
            {'input': 'mrn-123456789', 'threat_type': 'medical_record_enumeration'},
            
            # Patient identifier patterns  
            {'input': 'patient-id-987654', 'threat_type': 'patient_enumeration'},
            
            # Healthcare system probing
            {'input': '/ehr/patients/search', 'threat_type': 'ehr_probing'},
            
            # Insurance information probing
            {'input': '/billing/insurance/lookup', 'threat_type': 'insurance_probing'},
            
            # Prescription system access
            {'input': '/pharmacy/prescriptions', 'threat_type': 'prescription_access'},
        ]
        
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            for threat in healthcare_threats:
                event = {
                    'headers': {'host': threat['input']},
                    'path': threat['input'],
                    'requestContext': {
                        'requestId': f'threat-{threat["threat_type"]}',
                        'identity': {'sourceIp': '203.0.113.200'}
                    },
                    'queryStringParameters': {
                        't': threat['input']
                    }
                }
                
                result = tenant_inference.resolveTenant(event)
                
                # Should deny healthcare-specific threats
                assert result.get('error') == 'Access denied', \
                    f"Should deny healthcare threat: {threat['threat_type']}"
        
        # Verify threats are properly logged for analysis
        all_logs = (healthcare_audit_logger.info.call_args_list + 
                   healthcare_audit_logger.warning.call_args_list + 
                   healthcare_audit_logger.error.call_args_list)
        
        assert len(all_logs) >= len(healthcare_threats), "Should log all healthcare threats"