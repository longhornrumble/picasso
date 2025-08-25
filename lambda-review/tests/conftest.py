"""
Test configuration and fixtures for PICASSO tenant inference system
Healthcare-grade test setup with comprehensive mocking
"""

import pytest
import json
import time
import os
import sys
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta
import jwt

# Test configuration
TEST_JWT_SECRET = "test-secret-key-for-healthcare-security-testing"
TEST_S3_BUCKET = "test-picasso-bucket"
TEST_ENVIRONMENT = "test"

# Set environment variables BEFORE importing tenant_inference
os.environ.update({
    'S3_BUCKET': TEST_S3_BUCKET,
    'MAPPINGS_PREFIX': 'test-mappings',
    'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key',
    'ENVIRONMENT': TEST_ENVIRONMENT
})

# Add the parent directory to the path to import the module under test
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lambda-review'))

@pytest.fixture(autouse=True)
def setup_environment():
    """Set up test environment variables"""
    os.environ.update({
        'S3_BUCKET': TEST_S3_BUCKET,
        'MAPPINGS_PREFIX': 'test-mappings',
        'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key',
        'ENVIRONMENT': TEST_ENVIRONMENT
    })
    
    # Clear module-level caches before each test
    try:
        import tenant_inference
        tenant_inference.tenant_registry_cache = {}
        tenant_inference.registry_cache_timestamp = 0
        tenant_inference.failure_tracking = {}
        tenant_inference.signing_key_cache = TEST_JWT_SECRET  # Pre-cache the test secret
        tenant_inference.key_cache_expires = time.time() + 3600  # Valid for 1 hour
    except ImportError:
        pass
    
    yield
    
    # Cleanup after test
    for key in ['S3_BUCKET', 'MAPPINGS_PREFIX', 'JWT_SECRET_KEY_NAME', 'ENVIRONMENT']:
        os.environ.pop(key, None)

@pytest.fixture
def mock_aws_clients():
    """Mock all AWS service clients"""
    with patch('tenant_inference.s3') as mock_s3, \
         patch('tenant_inference.secrets_client') as mock_secrets, \
         patch('tenant_inference.boto3.client') as mock_boto3_client, \
         patch('tenant_inference._get_signing_key') as mock_get_signing_key:
        
        # Mock S3 client
        mock_s3.list_objects_v2.return_value = {'Contents': []}
        mock_s3.get_object.return_value = {
            'Body': Mock(read=lambda: b'{"tenant": "test", "host": "test.example.com"}')
        }
        
        # Mock Secrets Manager client
        mock_secrets.get_secret_value.return_value = {
            'SecretString': json.dumps({'signingKey': TEST_JWT_SECRET})
        }
        
        # Mock the signing key function to return our test secret
        mock_get_signing_key.return_value = TEST_JWT_SECRET
        
        # Mock CloudWatch client
        mock_cloudwatch = Mock()
        mock_cloudwatch.put_metric_data.return_value = {}
        mock_boto3_client.return_value = mock_cloudwatch
        
        yield {
            's3': mock_s3,
            'secrets': mock_secrets,
            'cloudwatch': mock_cloudwatch,
            'boto3_client': mock_boto3_client,
            'get_signing_key': mock_get_signing_key
        }

@pytest.fixture
def sample_tenant_registry():
    """Sample tenant registry for testing"""
    return {
        'hosts': {
            'example.com': 'tenant123hash',
            'secure.example.org': 'tenant456hash',
            'healthcare.ai': 'medical789hash'
        },
        'origins': {
            'https://example.com': 'tenant123hash',
            'https://secure.example.org': 'tenant456hash',
            'https://healthcare.ai': 'medical789hash'
        },
        'paths': {
            '/api/v1/tenant123': 'tenant123hash',
            '/healthcare/portal': 'medical789hash',
            '/secure/dashboard': 'tenant456hash'
        },
        'hashes': {
            'tenant123hash',
            'tenant456hash', 
            'medical789hash',
            'emergency999hash'
        },
        'loaded_at': time.time()
    }

@pytest.fixture
def valid_jwt_payload():
    """Valid JWT payload for testing"""
    # Use time.time() instead of datetime.utcnow() to avoid timezone issues
    current_time = int(time.time())
    return {
        'iss': f'picasso-{TEST_ENVIRONMENT}',
        'aud': 'streaming-function',
        'purpose': 'stream',
        'tenantId': 'tenant123hash',
        'sessionId': 'sess_12345_abcd',
        'jti': 'unique-jwt-id',
        'iat': current_time - 60,  # Issued 1 minute ago to avoid timing issues
        'exp': current_time + (15 * 60)  # Expires in 15 minutes
    }

@pytest.fixture
def expired_jwt_payload():
    """Expired JWT payload for testing"""
    # Create an expired token (expired 5 minutes ago)
    current_time = int(time.time())
    return {
        'iss': f'picasso-{TEST_ENVIRONMENT}',
        'aud': 'streaming-function',
        'purpose': 'stream',
        'tenantId': 'tenant123hash',
        'sessionId': 'sess_12345_abcd',
        'jti': 'unique-jwt-id',
        'iat': current_time - (20 * 60),  # Issued 20 minutes ago
        'exp': current_time - (5 * 60)   # Expired 5 minutes ago
    }

@pytest.fixture
def invalid_jwt_payload():
    """Invalid JWT payload (missing required claims) for testing"""
    # Use time.time() for consistency with valid_jwt_payload
    current_time = int(time.time())
    return {
        'iss': f'picasso-{TEST_ENVIRONMENT}',
        'aud': 'streaming-function',
        # Missing required claims: purpose, tenantId, jti
        'iat': current_time - 60,  # Issued 1 minute ago
        'exp': current_time + (15 * 60)  # Expires in 15 minutes
    }

@pytest.fixture
def sample_lambda_event():
    """Sample Lambda event structure"""
    return {
        'headers': {
            'Host': 'example.com',
            'User-Agent': 'Healthcare-Client/1.0',
            'authorization': 'Bearer test-jwt-token'
        },
        'requestContext': {
            'requestId': 'test-request-123',
            'identity': {
                'sourceIp': '192.168.1.100'
            },
            'http': {
                'path': '/api/v1/tenant123/data'
            }
        },
        'path': '/api/v1/tenant123/data',
        'queryStringParameters': {
            't': 'tenant123hash'
        }
    }

@pytest.fixture
def malicious_lambda_event():
    """Lambda event with malicious content for security testing"""
    return {
        'headers': {
            'Host': 'evil.example.com/../../../etc/passwd',
            'User-Agent': '<script>alert("xss")</script>',
            'Origin': 'http://malicious-site.com',
            'authorization': 'Bearer malicious-token'
        },
        'requestContext': {
            'requestId': 'malicious-request-456',
            'identity': {
                'sourceIp': '10.0.0.1'
            },
            'http': {
                'path': '/../../etc/passwd'
            }
        },
        'path': '/../../etc/passwd',
        'queryStringParameters': {
            't': 'invalid-tenant-hash-with-special-chars!@#'
        }
    }

@pytest.fixture
def rate_limit_events():
    """Generate multiple events for rate limiting tests"""
    events = []
    for i in range(15):  # More than rate limit threshold
        event = {
            'headers': {
                'Host': 'invalid.com',
                'User-Agent': f'Test-Client/{i}'
            },
            'requestContext': {
                'requestId': f'rate-limit-test-{i}',
                'identity': {
                    'sourceIp': '192.168.1.200'  # Same IP for rate limiting
                }
            },
            'path': '/invalid/path',
            'queryStringParameters': {}
        }
        events.append(event)
    return events

@pytest.fixture
def performance_test_events():
    """Generate events for performance testing"""
    events = []
    hosts = ['fast1.com', 'fast2.org', 'fast3.ai', 'fast4.net', 'fast5.io']
    
    for i in range(100):
        event = {
            'headers': {
                'Host': hosts[i % len(hosts)],
                'User-Agent': 'Performance-Test-Client/1.0'
            },
            'requestContext': {
                'requestId': f'perf-test-{i}',
                'identity': {
                    'sourceIp': f'192.168.1.{i % 255}'
                }
            },
            'path': f'/api/perf/test/{i}',
            'queryStringParameters': {
                't': f'tenant{i % 5}hash'
            }
        }
        events.append(event)
    return events

@pytest.fixture
def healthcare_audit_logger():
    """Mock logger for healthcare audit testing"""
    with patch('tenant_inference.logger') as mock_logger:
        # Track all log calls for audit verification
        mock_logger.info.side_effect = lambda msg: print(f"INFO: {msg}")
        mock_logger.warning.side_effect = lambda msg: print(f"WARNING: {msg}")
        mock_logger.error.side_effect = lambda msg: print(f"ERROR: {msg}")
        yield mock_logger

@pytest.fixture
def s3_tenant_mapping_data():
    """Mock S3 tenant mapping data"""
    return {
        'tenant123hash.json': {
            'tenant': 'Healthcare Corp',
            'host': 'healthcare.ai',
            'origin': 'https://healthcare.ai',
            'path': '/healthcare/portal',
            'created_at': '2024-01-01T00:00:00Z',
            'security_level': 'high'
        },
        'tenant456hash.json': {
            'tenant': 'Secure Systems Inc',
            'host': 'secure.example.org',
            'origin': 'https://secure.example.org',
            'path': '/secure/dashboard',
            'created_at': '2024-01-01T00:00:00Z',
            'security_level': 'maximum'
        },
        'medical789hash.json': {
            'tenant': 'Medical Records LLC',
            'host': 'medrecords.com',
            'origin': 'https://medrecords.com',
            'path': '/medical/records',
            'created_at': '2024-01-01T00:00:00Z',
            'security_level': 'hipaa_compliant'
        }
    }

# Utility functions for test helpers

def create_jwt_token(payload, secret=TEST_JWT_SECRET, algorithm='HS256'):
    """Helper to create JWT tokens for testing"""
    return jwt.encode(payload, secret, algorithm=algorithm)

def create_invalid_jwt_token():
    """Helper to create invalid JWT tokens"""
    return "invalid.jwt.token.structure"

def assert_security_audit_logged(mock_logger, expected_event_type):
    """Helper to verify security audit logging"""
    audit_calls = [call for call in mock_logger.info.call_args_list 
                   if 'SECURITY_AUDIT' in str(call)]
    failure_calls = [call for call in mock_logger.error.call_args_list 
                     if 'SECURITY_AUDIT' in str(call)]
    
    all_audit_calls = audit_calls + failure_calls
    assert len(all_audit_calls) > 0, "No security audit logs found"
    
    if expected_event_type:
        audit_found = any(expected_event_type in str(call) for call in all_audit_calls)
        assert audit_found, f"Expected audit event '{expected_event_type}' not found in logs"

def assert_rate_limiting_triggered(mock_logger):
    """Helper to verify rate limiting was triggered"""
    rate_limit_calls = [call for call in mock_logger.error.call_args_list 
                        if 'rate_limited' in str(call)]
    assert len(rate_limit_calls) > 0, "Rate limiting was not triggered as expected"

def assert_fail_closed_behavior(result):
    """Helper to verify fail-closed security behavior"""
    assert result is not None, "Result should not be None for fail-closed behavior"
    assert 'error' in result, "Result should contain error for fail-closed behavior"
    assert result['status_code'] == 403, "Should return 403 for fail-closed behavior"
    assert 'failure_id' in result, "Should include failure_id for audit tracking"
    assert result['error'] == 'Access denied', "Should return generic error message"

# Performance testing helpers

def measure_execution_time(func, *args, **kwargs):
    """Measure function execution time in milliseconds"""
    start_time = time.perf_counter()
    result = func(*args, **kwargs)
    end_time = time.perf_counter()
    execution_time_ms = (end_time - start_time) * 1000
    return result, execution_time_ms

def assert_performance_requirement(execution_time_ms, max_time_ms=50):
    """Assert that execution time meets performance requirements"""
    assert execution_time_ms < max_time_ms, \
        f"Execution time {execution_time_ms:.2f}ms exceeds requirement {max_time_ms}ms"

# Healthcare compliance helpers

def assert_hipaa_compliance_logging(mock_logger):
    """Verify HIPAA-compliant audit logging"""
    # Check for required audit elements
    all_calls = mock_logger.info.call_args_list + mock_logger.error.call_args_list
    audit_calls = [call for call in all_calls if 'SECURITY_AUDIT' in str(call)]
    
    assert len(audit_calls) > 0, "HIPAA requires comprehensive audit logging"
    
    # Verify audit data contains required elements
    for call in audit_calls:
        call_str = str(call)
        assert 'timestamp' in call_str, "Audit logs must include timestamps"
        assert 'source_ip' in call_str, "Audit logs must include source IP"
        assert 'environment' in call_str, "Audit logs must include environment"

def assert_phi_protection(result, sensitive_data=None):
    """Ensure no PHI (Protected Health Information) is leaked"""
    if sensitive_data:
        result_str = json.dumps(result) if isinstance(result, dict) else str(result)
        for sensitive_item in sensitive_data:
            assert sensitive_item not in result_str, \
                f"Sensitive data '{sensitive_item}' found in result - PHI leak detected"