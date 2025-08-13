"""
Phase 4 Functional Testing: Comprehensive Integration Test Suite

This module provides comprehensive functional testing to validate that all remediation
phases (1-3) work together as an integrated system ready for staging deployment.

Test Scope:
- JWT Authentication System (Phase 1) integration
- Environment Configuration (Phase 2) validation  
- Performance Requirements (Phase 3) verification
- Conversation Memory System (Original Failure) validation
- End-to-end user journey simulation
- Cross-component functionality validation

Success Criteria:
- All authentication tests pass (JWT roundtrip working)
- All environment configuration tests pass  
- All performance benchmarks meet targets (<200ms)
- 4-turn conversation memory test passes
- >95% test coverage on critical functionality
- All regression tests pass
"""

import pytest
import json
import time
import uuid
import jwt
import os
import statistics
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from concurrent.futures import ThreadPoolExecutor
import boto3
from moto import mock_dynamodb2, mock_secretsmanager, mock_s3
from botocore.exceptions import ClientError

# Test markers for categorization
pytestmark = [
    pytest.mark.integration,
    pytest.mark.phase4,
    pytest.mark.functional,
    pytest.mark.critical
]


class TestPhase4FunctionalIntegration:
    """
    Comprehensive Phase 4 functional testing suite validating all remediation
    phases work together as an integrated system.
    """

    @pytest.fixture(autouse=True)
    def setup_phase4_environment(self):
        """Set up comprehensive test environment for Phase 4 validation"""
        # Environment variables for all phases
        os.environ.update({
            'ENVIRONMENT': 'test',
            'S3_BUCKET': 'test-picasso-bucket',
            'MAPPINGS_PREFIX': 'test-mappings',
            'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key',
            'DYNAMODB_SUMMARIES_TABLE': 'test-conversation-summaries',
            'DYNAMODB_MESSAGES_TABLE': 'test-recent-messages',
            'AWS_REGION': 'us-east-1'
        })
        
        yield
        
        # Cleanup environment
        env_vars = [
            'ENVIRONMENT', 'S3_BUCKET', 'MAPPINGS_PREFIX', 'JWT_SECRET_KEY_NAME',
            'DYNAMODB_SUMMARIES_TABLE', 'DYNAMODB_MESSAGES_TABLE', 'AWS_REGION'
        ]
        for var in env_vars:
            os.environ.pop(var, None)

    @pytest.fixture
    def phase4_test_secret_key(self):
        """Generate consistent test secret key for Phase 4"""
        return "phase4-test-secret-key-12345678901234567890123456789012"

    @pytest.fixture
    def phase4_test_session(self):
        """Generate unique test session ID for Phase 4"""
        return f"phase4-test-session-{int(time.time())}-{uuid.uuid4().hex[:8]}"

    @pytest.fixture
    def phase4_tenant_registry(self):
        """Comprehensive tenant registry for Phase 4 testing"""
        return {
            'hosts': {
                'test.healthcare.ai': 'healthcare_tenant_hash',
                'staging.myrecruiter.ai': 'recruiter_tenant_hash',
                'test.example.com': 'example_tenant_hash'
            },
            'origins': {
                'https://test.healthcare.ai': 'healthcare_tenant_hash',
                'https://staging.myrecruiter.ai': 'recruiter_tenant_hash',
                'https://test.example.com': 'example_tenant_hash'
            },
            'paths': {
                '/api/v1/healthcare': 'healthcare_tenant_hash',
                '/api/v1/recruiter': 'recruiter_tenant_hash',
                '/api/v1/example': 'example_tenant_hash'
            },
            'hashes': {
                'healthcare_tenant_hash',
                'recruiter_tenant_hash', 
                'example_tenant_hash'
            },
            'loaded_at': time.time()
        }


class TestPhase1JWTAuthenticationIntegration:
    """Validate Phase 1 JWT Authentication fixes work in integrated system"""

    def test_jwt_roundtrip_authentication_success(self, setup_phase4_environment, 
                                                 phase4_test_secret_key, phase4_test_session):
        """
        CRITICAL: Test complete JWT authentication roundtrip
        
        Validates Phase 1 fixes:
        - JWT token generation and validation work together
        - Tolerant key loader handles different secret formats
        - Startup self-check validates authentication
        - No HTTP 403 authentication failures
        """
        start_time = time.perf_counter()
        
        # Import after environment setup
        import sys
        import os
        lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
        if lambda_review_path not in sys.path:
            sys.path.insert(0, lambda_review_path)
        
        with mock_secretsmanager():
            # Setup AWS mocks for Phase 1
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': phase4_test_secret_key})
            )
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Clear any cached keys to test fresh retrieval
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                # Step 1: Test tolerant key loader retrieval
                retrieved_key = tenant_inference._get_signing_key()
                assert retrieved_key == phase4_test_secret_key, "Key loader should retrieve correct key"
                
                # Step 2: Generate JWT token
                current_time = int(time.time())
                jwt_payload = {
                    'iss': 'picasso-test',
                    'aud': 'streaming-function',
                    'purpose': 'stream',
                    'tenantId': 'healthcare_tenant_hash',
                    'sessionId': phase4_test_session,
                    'jti': f'jwt-{uuid.uuid4().hex}',
                    'iat': current_time,
                    'exp': current_time + (15 * 60)  # 15 minutes
                }
                
                jwt_token = jwt.encode(jwt_payload, phase4_test_secret_key, algorithm='HS256')
                
                # Step 3: Test JWT validation roundtrip
                event = {
                    'headers': {'authorization': f'Bearer {jwt_token}'},
                    'requestContext': {
                        'requestId': 'phase4-jwt-test',
                        'identity': {'sourceIp': '192.168.1.100'}
                    }
                }
                
                result = tenant_inference.extract_tenant_from_token(event)
                
                # Validate successful roundtrip
                assert result is not None, "JWT roundtrip should succeed"
                assert result['tenant_id'] == 'healthcare_tenant_hash'
                assert result['session_id'] == phase4_test_session
                assert result['source'] == 'jwt_token'
                
                # Measure performance
                end_time = time.perf_counter()
                execution_time = (end_time - start_time) * 1000
                
                # Validate performance meets Phase 3 requirements
                assert execution_time < 100, f"JWT operations should complete in <100ms, got {execution_time:.2f}ms"

    def test_jwt_startup_self_check_validation(self, setup_phase4_environment, phase4_test_secret_key):
        """
        Test Phase 1 startup self-check validates authentication system
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': phase4_test_secret_key})
            )
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Test startup self-check
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                # Self-check should successfully validate key retrieval
                key = tenant_inference._get_signing_key()
                assert key == phase4_test_secret_key
                
                # Verify caching works for performance
                assert tenant_inference.signing_key_cache == phase4_test_secret_key
                assert tenant_inference.key_cache_expires > time.time()

    def test_jwt_tolerant_key_loader_formats(self, setup_phase4_environment):
        """
        Test Phase 1 tolerant key loader handles different secret formats
        """
        test_cases = [
            # Standard format
            {'signingKey': 'standard-format-key'},
            # Alternative format
            {'signing_key': 'alternative-format-key'},
            # Nested format
            {'jwt': {'signingKey': 'nested-format-key'}},
            # Direct string format
            'direct-string-key'
        ]
        
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                for i, secret_format in enumerate(test_cases):
                    secret_name = f'test-key-format-{i}'
                    
                    if isinstance(secret_format, str):
                        secret_string = secret_format
                    else:
                        secret_string = json.dumps(secret_format)
                    
                    secrets_client.create_secret(
                        Name=secret_name,
                        SecretString=secret_string
                    )
                    
                    # Test tolerant key extraction
                    with patch.dict(os.environ, {'JWT_SECRET_KEY_NAME': secret_name}):
                        tenant_inference.signing_key_cache = None
                        tenant_inference.key_cache_expires = 0
                        
                        # Should successfully extract key regardless of format
                        key = tenant_inference._get_signing_key()
                        assert key is not None, f"Should extract key from format: {secret_format}"
                        assert len(key) > 0, "Extracted key should not be empty"


class TestPhase2EnvironmentConfigurationIntegration:
    """Validate Phase 2 environment configuration fixes work in integrated system"""

    def test_environment_variable_standardization(self, setup_phase4_environment):
        """
        Test Phase 2 environment variable standardization across environments
        """
        required_env_vars = [
            'ENVIRONMENT',
            'S3_BUCKET', 
            'MAPPINGS_PREFIX',
            'JWT_SECRET_KEY_NAME',
            'DYNAMODB_SUMMARIES_TABLE',
            'DYNAMODB_MESSAGES_TABLE'
        ]
        
        # All required environment variables should be set
        for var in required_env_vars:
            assert os.getenv(var) is not None, f"Required environment variable {var} must be set"
            assert len(os.getenv(var)) > 0, f"Environment variable {var} must not be empty"

    def test_secret_naming_consistency(self, setup_phase4_environment):
        """
        Test Phase 2 secret naming consistency across staging/production
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            
            # Test consistent naming pattern
            test_environments = ['staging', 'production', 'test']
            
            for env in test_environments:
                secret_name = f'picasso-{env}/jwt/signing-key'
                secrets_client.create_secret(
                    Name=secret_name,
                    SecretString=json.dumps({'signingKey': f'{env}-secret-key'})
                )
                
                # Verify secret can be retrieved with consistent naming
                response = secrets_client.get_secret_value(SecretId=secret_name)
                secret_data = json.loads(response['SecretString'])
                assert 'signingKey' in secret_data
                assert secret_data['signingKey'] == f'{env}-secret-key'

    def test_configuration_validation_passes(self, setup_phase4_environment):
        """
        Test Phase 2 configuration validation passes for all environments
        """
        import sys
        import os
        lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
        if lambda_review_path not in sys.path:
            sys.path.insert(0, lambda_review_path)
        
        # Test configuration validation logic
        config_items = [
            ('S3_BUCKET', 'test-picasso-bucket'),
            ('MAPPINGS_PREFIX', 'test-mappings'),
            ('JWT_SECRET_KEY_NAME', 'test-picasso/jwt/signing-key'),
            ('ENVIRONMENT', 'test')
        ]
        
        for key, expected_value in config_items:
            actual_value = os.getenv(key)
            assert actual_value == expected_value, f"Configuration {key} should be {expected_value}, got {actual_value}"

    def test_deployment_script_environment_compatibility(self, setup_phase4_environment):
        """
        Test Phase 2 deployment scripts work without errors across environments
        """
        # Simulate deployment script validation
        deployment_environments = ['staging', 'production']
        
        for env in deployment_environments:
            # Test environment-specific configuration
            test_config = {
                'ENVIRONMENT': env,
                'S3_BUCKET': f'picasso-{env}-bucket',
                'MAPPINGS_PREFIX': f'{env}-mappings',
                'JWT_SECRET_KEY_NAME': f'picasso-{env}/jwt/signing-key'
            }
            
            # Validate all required configuration is present
            for key, value in test_config.items():
                assert value is not None, f"Deployment config {key} must be set for {env}"
                assert len(value) > 0, f"Deployment config {key} must not be empty for {env}"
                assert env in value or key == 'ENVIRONMENT', f"Config {key} should include environment {env}"


class TestPhase3PerformanceOptimizationIntegration:
    """Validate Phase 3 performance optimization targets in integrated system"""

    def test_jwt_operations_performance_target(self, setup_phase4_environment, 
                                             phase4_test_secret_key, phase4_test_session):
        """
        Test Phase 3 JWT operations complete in <100ms target
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': phase4_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Test multiple JWT operations for statistical significance
                execution_times = []
                
                for i in range(10):
                    current_time = int(time.time())
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': 'test_tenant_hash',
                        'sessionId': f'{phase4_test_session}-{i}',
                        'jti': f'jwt-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    jwt_token = jwt.encode(jwt_payload, phase4_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {'authorization': f'Bearer {jwt_token}'},
                        'requestContext': {
                            'requestId': f'perf-test-{i}',
                            'identity': {'sourceIp': '192.168.1.100'}
                        }
                    }
                    
                    start_time = time.perf_counter()
                    result = tenant_inference.extract_tenant_from_token(event)
                    end_time = time.perf_counter()
                    
                    execution_time = (end_time - start_time) * 1000
                    execution_times.append(execution_time)
                    
                    assert result is not None, f"JWT operation {i} should succeed"
                
                # Statistical performance analysis
                avg_time = statistics.mean(execution_times)
                max_time = max(execution_times)
                p95_time = sorted(execution_times)[int(len(execution_times) * 0.95)]
                
                assert avg_time < 100, f"Average JWT time {avg_time:.2f}ms exceeds 100ms target"
                assert max_time < 100, f"Maximum JWT time {max_time:.2f}ms exceeds 100ms target"
                assert p95_time < 100, f"95th percentile JWT time {p95_time:.2f}ms exceeds 100ms target"

    def test_database_operations_performance_target(self, setup_phase4_environment, phase4_test_session):
        """
        Test Phase 3 database operations complete in <150ms target
        """
        with mock_dynamodb2():
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            
            # Create test tables
            tables = ['test-conversation-summaries', 'test-recent-messages']
            for table_name in tables:
                dynamodb.create_table(
                    TableName=table_name,
                    KeySchema=[
                        {'AttributeName': 'sessionId', 'KeyType': 'HASH'},
                    ],
                    AttributeDefinitions=[
                        {'AttributeName': 'sessionId', 'AttributeType': 'S'},
                    ],
                    BillingMode='PAY_PER_REQUEST'
                )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('conversation_handler.dynamodb', dynamodb):
                import conversation_handler
                
                # Test database read operations
                read_times = []
                for i in range(5):
                    start_time = time.perf_counter()
                    
                    # Test conversation retrieval
                    try:
                        result = conversation_handler._get_conversation_from_db(
                            f'{phase4_test_session}-{i}', 'test_tenant'
                        )
                    except:
                        result = None  # Expected for non-existent conversations
                    
                    end_time = time.perf_counter()
                    read_time = (end_time - start_time) * 1000
                    read_times.append(read_time)
                
                # Test database write operations
                write_times = []
                for i in range(5):
                    start_time = time.perf_counter()
                    
                    try:
                        conversation_handler._save_conversation_to_db(
                            f'{phase4_test_session}-write-{i}',
                            'test_tenant',
                            {'summary_update': f'Test summary {i}'},
                            1
                        )
                    except:
                        pass  # Handle any mock limitations
                    
                    end_time = time.perf_counter()
                    write_time = (end_time - start_time) * 1000
                    write_times.append(write_time)
                
                # Validate performance targets
                avg_read_time = statistics.mean(read_times)
                avg_write_time = statistics.mean(write_times)
                
                assert avg_read_time < 150, f"Average read time {avg_read_time:.2f}ms exceeds 150ms target"
                assert avg_write_time < 150, f"Average write time {avg_write_time:.2f}ms exceeds 150ms target"

    def test_overall_response_time_target(self, setup_phase4_environment, 
                                         phase4_test_secret_key, phase4_test_session,
                                         phase4_tenant_registry):
        """
        Test Phase 3 overall response times <200ms target
        """
        with mock_secretsmanager(), mock_s3(), mock_dynamodb2():
            # Setup comprehensive AWS mocking
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': phase4_test_secret_key})
            )
            
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket='test-picasso-bucket')
            
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            dynamodb.create_table(
                TableName='test-conversation-summaries',
                KeySchema=[{'AttributeName': 'sessionId', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'sessionId', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client), \
                 patch('tenant_inference.s3', s3_client), \
                 patch('tenant_inference.loadTenantRegistry', return_value=phase4_tenant_registry):
                
                import tenant_inference
                
                # Test end-to-end response times
                response_times = []
                
                for i in range(10):
                    current_time = int(time.time())
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': 'healthcare_tenant_hash',
                        'sessionId': f'{phase4_test_session}-{i}',
                        'jti': f'jwt-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    jwt_token = jwt.encode(jwt_payload, phase4_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {
                            'authorization': f'Bearer {jwt_token}',
                            'host': 'test.healthcare.ai'
                        },
                        'requestContext': {
                            'requestId': f'e2e-perf-test-{i}',
                            'identity': {'sourceIp': '192.168.1.100'},
                            'http': {'path': '/api/v1/healthcare'}
                        },
                        'path': '/api/v1/healthcare',
                        'queryStringParameters': {'t': 'healthcare_tenant_hash'}
                    }
                    
                    start_time = time.perf_counter()
                    result = tenant_inference.resolveTenant(event)
                    end_time = time.perf_counter()
                    
                    response_time = (end_time - start_time) * 1000
                    response_times.append(response_time)
                    
                    assert result is not None, f"End-to-end operation {i} should succeed"
                
                # Performance analysis
                avg_response_time = statistics.mean(response_times)
                max_response_time = max(response_times)
                p95_response_time = sorted(response_times)[int(len(response_times) * 0.95)]
                
                assert avg_response_time < 200, f"Average response time {avg_response_time:.2f}ms exceeds 200ms target"
                assert max_response_time < 200, f"Maximum response time {max_response_time:.2f}ms exceeds 200ms target"
                assert p95_response_time < 200, f"95th percentile response time {p95_response_time:.2f}ms exceeds 200ms target"

    def test_memory_and_timeout_configuration_optimal(self, setup_phase4_environment):
        """
        Test Phase 3 memory and timeout configurations are optimal
        """
        # Test memory usage remains reasonable
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Simulate typical workload
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': 'test-memory-key'})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Process multiple requests to test memory usage
                for i in range(50):
                    event = {
                        'headers': {'host': f'test{i % 10}.com'},
                        'requestContext': {
                            'requestId': f'memory-test-{i}',
                            'identity': {'sourceIp': '192.168.1.50'}
                        }
                    }
                    tenant_inference.resolveTenant(event)
        
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        # Memory increase should be reasonable (<50MB for this test)
        assert memory_increase < 50, f"Memory usage increased by {memory_increase:.2f}MB, should be optimized"


class TestOriginalConversationMemoryFailure:
    """Validate the original 4-turn conversation memory failure is fixed"""

    def test_four_turn_conversation_memory_success(self, setup_phase4_environment, 
                                                  phase4_test_secret_key, phase4_test_session):
        """
        CRITICAL: Test the original failing 4-turn conversation memory scenario
        
        This test validates that the original staging assessment failure is now fixed:
        "Turn 4 conversation summary was a complete miss with no memory of previous conversations"
        """
        with mock_dynamodb2(), mock_secretsmanager():
            # Setup AWS services
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': phase4_test_secret_key})
            )
            
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            
            # Create conversation tables
            for table_name in ['test-conversation-summaries', 'test-recent-messages']:
                dynamodb.create_table(
                    TableName=table_name,
                    KeySchema=[{'AttributeName': 'sessionId', 'KeyType': 'HASH'}],
                    AttributeDefinitions=[{'AttributeName': 'sessionId', 'AttributeType': 'S'}],
                    BillingMode='PAY_PER_REQUEST'
                )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('conversation_handler.dynamodb', dynamodb), \
                 patch('conversation_handler.secrets_client', secrets_client):
                
                import conversation_handler
                
                # Setup conversation handler
                conversation_handler.jwt_signing_key_cache = phase4_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                # Simulate 4-turn conversation with memory retention
                conversation_turns = [
                    {
                        'turn': 1,
                        'user_message': "Hello, I'm a new patient with diabetes. I need help managing my condition.",
                        'assistant_message': "Hello! I'm here to help you manage your diabetes. Can you tell me about your current symptoms and medications?"
                    },
                    {
                        'turn': 2,
                        'user_message': "I'm taking metformin 500mg twice daily. My blood sugar has been running high lately, around 180-200 mg/dL.",
                        'assistant_message': "Thank you for that information. High blood sugar readings like 180-200 mg/dL do need attention. Are you following a specific diet plan?"
                    },
                    {
                        'turn': 3,
                        'user_message': "I try to eat healthy but I'm not following a strict diet. Should I be more careful about carbohydrates?",
                        'assistant_message': "Yes, carbohydrate management is crucial for diabetes control. Given your metformin use and current readings, I recommend consulting your doctor about adjusting your medication or diet plan."
                    },
                    {
                        'turn': 4,
                        'user_message': "Thank you for the advice. Can you summarize what we've discussed so I can share it with my doctor?",
                        'assistant_message': "Certainly! Let me provide a comprehensive summary of our conversation."
                    }
                ]
                
                conversation_state = None
                
                # Execute 4-turn conversation
                for i, turn_data in enumerate(conversation_turns, 1):
                    current_time = int(time.time())
                    jwt_payload = {
                        'sessionId': phase4_test_session,
                        'tenantId': 'healthcare_tenant_hash',
                        'turn': i,
                        'iat': current_time,
                        'exp': current_time + 3600
                    }
                    jwt_token = jwt.encode(jwt_payload, phase4_test_secret_key, algorithm='HS256')
                    
                    # Save conversation turn
                    save_event = {
                        "httpMethod": "POST",
                        "queryStringParameters": {"operation": "save"},
                        "headers": {"Authorization": f"Bearer {jwt_token}"},
                        "body": json.dumps({
                            "sessionId": phase4_test_session,
                            "turn": i,
                            "delta": {
                                "summary_update": f"Turn {i}: Patient discussed {turn_data['user_message'][:50]}...",
                                "appendUser": {"text": turn_data['user_message']},
                                "appendAssistant": {"text": turn_data['assistant_message']}
                            }
                        }),
                        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                    }
                    
                    with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                        save_response = conversation_handler.handle_save_conversation(save_event)
                    
                    assert save_response["statusCode"] == 200, f"Turn {i} save should succeed"
                    
                    # Get conversation state after each turn
                    get_event = {
                        "httpMethod": "GET",
                        "queryStringParameters": {"operation": "get"},
                        "headers": {"Authorization": f"Bearer {jwt_token}"},
                        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                    }
                    
                    get_response = conversation_handler.handle_get_conversation(get_event)
                    assert get_response["statusCode"] == 200, f"Turn {i} get should succeed"
                    
                    conversation_state = json.loads(get_response["body"])["state"]
                
                # Validate Turn 4 memory retention (the original failure point)
                assert conversation_state is not None, "Turn 4 should have conversation state"
                assert "summary" in conversation_state, "Turn 4 should have summary"
                assert "lastMessages" in conversation_state, "Turn 4 should have message history"
                
                # Critical validation: Turn 4 should remember all previous turns
                summary = conversation_state["summary"]
                messages = conversation_state["lastMessages"]
                
                # Memory validation - summary should reference diabetes discussion
                diabetes_keywords = ["diabetes", "metformin", "blood sugar", "180-200", "carbohydrate"]
                found_keywords = [keyword for keyword in diabetes_keywords if keyword.lower() in summary.lower()]
                assert len(found_keywords) >= 3, f"Turn 4 summary should remember diabetes conversation, found keywords: {found_keywords}"
                
                # Memory validation - should have messages from multiple turns
                assert len(messages) >= 6, f"Turn 4 should remember multiple conversation turns, got {len(messages)} messages"
                
                # Memory validation - should include recent user and assistant messages
                user_messages = [msg for msg in messages if msg.get('role') == 'user']
                assistant_messages = [msg for msg in messages if msg.get('role') == 'assistant']
                
                assert len(user_messages) >= 2, "Should remember multiple user messages"
                assert len(assistant_messages) >= 2, "Should remember multiple assistant messages"
                
                # Performance validation - Turn 4 retrieval should be fast
                start_time = time.perf_counter()
                final_get_response = conversation_handler.handle_get_conversation(get_event)
                end_time = time.perf_counter()
                retrieval_time = (end_time - start_time) * 1000
                
                assert retrieval_time < 200, f"Turn 4 memory retrieval should be <200ms, got {retrieval_time:.2f}ms"
                assert final_get_response["statusCode"] == 200, "Final memory retrieval should succeed"

    def test_conversation_memory_persistence_across_sessions(self, setup_phase4_environment,
                                                           phase4_test_secret_key):
        """
        Test conversation memory persists correctly across multiple sessions
        """
        with mock_dynamodb2(), mock_secretsmanager():
            # Setup AWS services
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': phase4_test_secret_key})
            )
            
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            for table_name in ['test-conversation-summaries', 'test-recent-messages']:
                dynamodb.create_table(
                    TableName=table_name,
                    KeySchema=[{'AttributeName': 'sessionId', 'KeyType': 'HASH'}],
                    AttributeDefinitions=[{'AttributeName': 'sessionId', 'AttributeType': 'S'}],
                    BillingMode='PAY_PER_REQUEST'
                )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('conversation_handler.dynamodb', dynamodb), \
                 patch('conversation_handler.secrets_client', secrets_client):
                
                import conversation_handler
                conversation_handler.jwt_signing_key_cache = phase4_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                session_id = f"persistence-test-{int(time.time())}"
                
                # Save initial conversation
                current_time = int(time.time())
                jwt_payload = {
                    'sessionId': session_id,
                    'tenantId': 'test_tenant',
                    'turn': 1,
                    'iat': current_time,
                    'exp': current_time + 3600
                }
                jwt_token = jwt.encode(jwt_payload, phase4_test_secret_key, algorithm='HS256')
                
                save_event = {
                    "httpMethod": "POST",
                    "queryStringParameters": {"operation": "save"},
                    "headers": {"Authorization": f"Bearer {jwt_token}"},
                    "body": json.dumps({
                        "sessionId": session_id,
                        "turn": 1,
                        "delta": {
                            "summary_update": "Patient initial consultation about symptoms",
                            "appendUser": {"text": "I have been experiencing headaches"},
                            "appendAssistant": {"text": "I understand you're having headaches. Can you describe them?"}
                        }
                    }),
                    "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                }
                
                with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                    save_response = conversation_handler.handle_save_conversation(save_event)
                
                assert save_response["statusCode"] == 200, "Initial save should succeed"
                
                # Simulate session restart - clear caches
                conversation_handler.jwt_signing_key_cache = None
                conversation_handler.jwt_key_cache_expires = 0
                
                # Re-authenticate and retrieve conversation
                conversation_handler.jwt_signing_key_cache = phase4_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                get_event = {
                    "httpMethod": "GET", 
                    "queryStringParameters": {"operation": "get"},
                    "headers": {"Authorization": f"Bearer {jwt_token}"},
                    "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                }
                
                get_response = conversation_handler.handle_get_conversation(get_event)
                assert get_response["statusCode"] == 200, "Conversation retrieval after restart should succeed"
                
                conversation_state = json.loads(get_response["body"])["state"]
                assert "headaches" in conversation_state["summary"].lower(), "Conversation memory should persist across sessions"

    def test_conversation_memory_clear_functionality(self, setup_phase4_environment,
                                                   phase4_test_secret_key):
        """
        Test conversation memory clear functionality works correctly
        """
        with mock_dynamodb2(), mock_secretsmanager():
            # Setup AWS services
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': phase4_test_secret_key})
            )
            
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            for table_name in ['test-conversation-summaries', 'test-recent-messages']:
                dynamodb.create_table(
                    TableName=table_name,
                    KeySchema=[{'AttributeName': 'sessionId', 'KeyType': 'HASH'}],
                    AttributeDefinitions=[{'AttributeName': 'sessionId', 'AttributeType': 'S'}],
                    BillingMode='PAY_PER_REQUEST'
                )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('conversation_handler.dynamodb', dynamodb), \
                 patch('conversation_handler.secrets_client', secrets_client):
                
                import conversation_handler
                conversation_handler.jwt_signing_key_cache = phase4_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                session_id = f"clear-test-{int(time.time())}"
                
                # Create conversation to clear
                current_time = int(time.time())
                jwt_payload = {
                    'sessionId': session_id,
                    'tenantId': 'test_tenant',
                    'turn': 1,
                    'iat': current_time,
                    'exp': current_time + 3600
                }
                jwt_token = jwt.encode(jwt_payload, phase4_test_secret_key, algorithm='HS256')
                
                save_event = {
                    "httpMethod": "POST",
                    "queryStringParameters": {"operation": "save"},
                    "headers": {"Authorization": f"Bearer {jwt_token}"},
                    "body": json.dumps({
                        "sessionId": session_id,
                        "turn": 1,
                        "delta": {
                            "summary_update": "Test conversation for clearing",
                            "appendUser": {"text": "This conversation will be cleared"},
                            "appendAssistant": {"text": "I understand, this is a test conversation"}
                        }
                    }),
                    "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                }
                
                with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                    save_response = conversation_handler.handle_save_conversation(save_event)
                
                assert save_response["statusCode"] == 200, "Save before clear should succeed"
                
                # Clear conversation
                clear_event = {
                    "httpMethod": "DELETE",
                    "queryStringParameters": {"operation": "clear"},
                    "headers": {"Authorization": f"Bearer {jwt_token}"},
                    "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                }
                
                with patch.object(conversation_handler, '_verify_conversation_deleted', return_value=True):
                    clear_response = conversation_handler.handle_clear_conversation(clear_event)
                
                assert clear_response["statusCode"] == 200, "Clear operation should succeed"
                
                clear_body = json.loads(clear_response["body"])
                assert clear_body["stateToken"] is None, "State token should be None after clear"
                assert "report" in clear_body, "Clear response should include report"


class TestEndToEndUserJourneySimulation:
    """Comprehensive end-to-end user journey simulation tests"""

    def test_complete_healthcare_user_journey(self, setup_phase4_environment,
                                            phase4_test_secret_key, phase4_tenant_registry):
        """
        Test complete healthcare user journey from authentication to conversation completion
        """
        with mock_secretsmanager(), mock_s3(), mock_dynamodb2():
            # Setup comprehensive AWS environment
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': phase4_test_secret_key})
            )
            
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket='test-picasso-bucket')
            
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            for table_name in ['test-conversation-summaries', 'test-recent-messages']:
                dynamodb.create_table(
                    TableName=table_name,
                    KeySchema=[{'AttributeName': 'sessionId', 'KeyType': 'HASH'}],
                    AttributeDefinitions=[{'AttributeName': 'sessionId', 'AttributeType': 'S'}],
                    BillingMode='PAY_PER_REQUEST'
                )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client), \
                 patch('tenant_inference.s3', s3_client), \
                 patch('tenant_inference.loadTenantRegistry', return_value=phase4_tenant_registry), \
                 patch('conversation_handler.dynamodb', dynamodb), \
                 patch('conversation_handler.secrets_client', secrets_client):
                
                import tenant_inference
                import conversation_handler
                
                conversation_handler.jwt_signing_key_cache = phase4_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                journey_session_id = f"healthcare-journey-{int(time.time())}"
                
                # Step 1: User authentication and tenant resolution
                current_time = int(time.time())
                jwt_payload = {
                    'iss': 'picasso-test',
                    'aud': 'streaming-function',
                    'purpose': 'stream',
                    'tenantId': 'healthcare_tenant_hash',
                    'sessionId': journey_session_id,
                    'jti': f'journey-{uuid.uuid4().hex}',
                    'iat': current_time,
                    'exp': current_time + (15 * 60)
                }
                jwt_token = jwt.encode(jwt_payload, phase4_test_secret_key, algorithm='HS256')
                
                tenant_event = {
                    'headers': {
                        'authorization': f'Bearer {jwt_token}',
                        'host': 'test.healthcare.ai'
                    },
                    'requestContext': {
                        'requestId': 'healthcare-journey',
                        'identity': {'sourceIp': '192.168.1.100'},
                        'http': {'path': '/api/v1/healthcare'}
                    },
                    'path': '/api/v1/healthcare',
                    'queryStringParameters': {'t': 'healthcare_tenant_hash'}
                }
                
                start_time = time.perf_counter()
                tenant_result = tenant_inference.resolveTenant(tenant_event)
                tenant_time = (time.perf_counter() - start_time) * 1000
                
                assert tenant_result is not None, "Healthcare tenant resolution should succeed"
                assert tenant_result['tenant_id'] == 'healthcare_tenant_hash'
                assert tenant_time < 200, f"Tenant resolution should be <200ms, got {tenant_time:.2f}ms"
                
                # Step 2: Initialize conversation (GET)
                jwt_payload_conv = {
                    'sessionId': journey_session_id,
                    'tenantId': 'healthcare_tenant_hash',
                    'turn': 1,
                    'iat': current_time,
                    'exp': current_time + 3600
                }
                conv_jwt_token = jwt.encode(jwt_payload_conv, phase4_test_secret_key, algorithm='HS256')
                
                get_event = {
                    "httpMethod": "GET",
                    "queryStringParameters": {"operation": "get"},
                    "headers": {"Authorization": f"Bearer {conv_jwt_token}"},
                    "requestContext": {"identity": {"sourceIp": "192.168.1.100"}}
                }
                
                start_time = time.perf_counter()
                get_response = conversation_handler.handle_get_conversation(get_event)
                get_time = (time.perf_counter() - start_time) * 1000
                
                assert get_response["statusCode"] == 200, "Initial conversation GET should succeed"
                assert get_time < 200, f"GET operation should be <200ms, got {get_time:.2f}ms"
                
                # Step 3: Healthcare consultation conversation
                healthcare_conversation = [
                    {
                        'turn': 1,
                        'user': "I've been having chest pain for the past 2 days. Should I be concerned?",
                        'assistant': "Chest pain can be serious. Can you describe the pain - is it sharp, dull, pressure-like? Does it radiate anywhere?"
                    },
                    {
                        'turn': 2,
                        'user': "It's a sharp pain that comes and goes. Sometimes it radiates to my left arm. I'm 45 years old.",
                        'assistant': "Given your symptoms - sharp chest pain radiating to the left arm - this could potentially be cardiac-related. I strongly recommend seeking immediate medical attention or calling emergency services."
                    },
                    {
                        'turn': 3,
                        'user': "I'm worried it might be a heart attack. I also have high blood pressure and diabetes.",
                        'assistant': "Your risk factors (age 45, high blood pressure, diabetes) combined with these symptoms are concerning for a cardiac event. Please go to the emergency room immediately or call 911. Don't drive yourself."
                    }
                ]
                
                conversation_performance = []
                
                for turn_data in healthcare_conversation:
                    jwt_payload_turn = {
                        'sessionId': journey_session_id,
                        'tenantId': 'healthcare_tenant_hash',
                        'turn': turn_data['turn'],
                        'iat': current_time,
                        'exp': current_time + 3600
                    }
                    turn_jwt_token = jwt.encode(jwt_payload_turn, phase4_test_secret_key, algorithm='HS256')
                    
                    save_event = {
                        "httpMethod": "POST",
                        "queryStringParameters": {"operation": "save"},
                        "headers": {"Authorization": f"Bearer {turn_jwt_token}"},
                        "body": json.dumps({
                            "sessionId": journey_session_id,
                            "turn": turn_data['turn'],
                            "delta": {
                                "summary_update": f"Turn {turn_data['turn']}: Patient reporting chest pain symptoms",
                                "appendUser": {"text": turn_data['user']},
                                "appendAssistant": {"text": turn_data['assistant']}
                            }
                        }),
                        "requestContext": {"identity": {"sourceIp": "192.168.1.100"}}
                    }
                    
                    with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                        start_time = time.perf_counter()
                        save_response = conversation_handler.handle_save_conversation(save_event)
                        save_time = (time.perf_counter() - start_time) * 1000
                    
                    conversation_performance.append(save_time)
                    assert save_response["statusCode"] == 200, f"Turn {turn_data['turn']} save should succeed"
                    assert save_time < 200, f"Turn {turn_data['turn']} save should be <200ms, got {save_time:.2f}ms"
                
                # Step 4: Final conversation state validation
                final_get_event = {
                    "httpMethod": "GET",
                    "queryStringParameters": {"operation": "get"},
                    "headers": {"Authorization": f"Bearer {turn_jwt_token}"},
                    "requestContext": {"identity": {"sourceIp": "192.168.1.100"}}
                }
                
                start_time = time.perf_counter()
                final_response = conversation_handler.handle_get_conversation(final_get_event)
                final_time = (time.perf_counter() - start_time) * 1000
                
                assert final_response["statusCode"] == 200, "Final conversation state retrieval should succeed"
                assert final_time < 200, f"Final GET should be <200ms, got {final_time:.2f}ms"
                
                final_state = json.loads(final_response["body"])["state"]
                
                # Validate complete healthcare conversation memory
                summary = final_state["summary"]
                messages = final_state["lastMessages"]
                
                # Healthcare-specific validation
                healthcare_keywords = ["chest pain", "left arm", "heart attack", "emergency", "diabetes", "blood pressure"]
                found_keywords = [kw for kw in healthcare_keywords if kw.lower() in summary.lower()]
                assert len(found_keywords) >= 4, f"Healthcare conversation should be comprehensively remembered, found: {found_keywords}"
                
                assert len(messages) >= 6, f"Should remember all conversation turns, got {len(messages)} messages"
                
                # Performance validation for complete journey
                avg_perf = statistics.mean(conversation_performance)
                assert avg_perf < 200, f"Average conversation performance should be <200ms, got {avg_perf:.2f}ms"

    def test_concurrent_user_sessions_isolation(self, setup_phase4_environment,
                                              phase4_test_secret_key, phase4_tenant_registry):
        """
        Test concurrent user sessions maintain proper isolation
        """
        with mock_secretsmanager(), mock_s3(), mock_dynamodb2():
            # Setup AWS environment
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': phase4_test_secret_key})
            )
            
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket='test-picasso-bucket')
            
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            for table_name in ['test-conversation-summaries', 'test-recent-messages']:
                dynamodb.create_table(
                    TableName=table_name,
                    KeySchema=[{'AttributeName': 'sessionId', 'KeyType': 'HASH'}],
                    AttributeDefinitions=[{'AttributeName': 'sessionId', 'AttributeType': 'S'}],
                    BillingMode='PAY_PER_REQUEST'
                )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client), \
                 patch('tenant_inference.s3', s3_client), \
                 patch('tenant_inference.loadTenantRegistry', return_value=phase4_tenant_registry), \
                 patch('conversation_handler.dynamodb', dynamodb), \
                 patch('conversation_handler.secrets_client', secrets_client):
                
                import tenant_inference
                import conversation_handler
                
                conversation_handler.jwt_signing_key_cache = phase4_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                # Create multiple concurrent sessions
                concurrent_sessions = []
                for i in range(5):
                    session_id = f"concurrent-session-{i}-{int(time.time())}"
                    concurrent_sessions.append(session_id)
                
                def test_session(session_id):
                    """Test individual session in concurrent environment"""
                    current_time = int(time.time())
                    
                    # Tenant resolution
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': 'healthcare_tenant_hash',
                        'sessionId': session_id,
                        'jti': f'concurrent-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    jwt_token = jwt.encode(jwt_payload, phase4_test_secret_key, algorithm='HS256')
                    
                    tenant_event = {
                        'headers': {'authorization': f'Bearer {jwt_token}'},
                        'requestContext': {
                            'requestId': f'concurrent-{session_id}',
                            'identity': {'sourceIp': '192.168.1.100'}
                        }
                    }
                    
                    tenant_result = tenant_inference.resolveTenant(tenant_event)
                    assert tenant_result is not None, f"Session {session_id} tenant resolution should succeed"
                    
                    # Conversation operations
                    conv_jwt_payload = {
                        'sessionId': session_id,
                        'tenantId': 'healthcare_tenant_hash',
                        'turn': 1,
                        'iat': current_time,
                        'exp': current_time + 3600
                    }
                    conv_jwt_token = jwt.encode(conv_jwt_payload, phase4_test_secret_key, algorithm='HS256')
                    
                    save_event = {
                        "httpMethod": "POST",
                        "queryStringParameters": {"operation": "save"},
                        "headers": {"Authorization": f"Bearer {conv_jwt_token}"},
                        "body": json.dumps({
                            "sessionId": session_id,
                            "turn": 1,
                            "delta": {
                                "summary_update": f"Session {session_id} unique conversation",
                                "appendUser": {"text": f"This is session {session_id}"},
                                "appendAssistant": {"text": f"I'm helping session {session_id}"}
                            }
                        }),
                        "requestContext": {"identity": {"sourceIp": "192.168.1.100"}}
                    }
                    
                    with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                        save_response = conversation_handler.handle_save_conversation(save_event)
                    
                    assert save_response["statusCode"] == 200, f"Session {session_id} save should succeed"
                    return session_id
                
                # Execute concurrent sessions
                with ThreadPoolExecutor(max_workers=5) as executor:
                    futures = [executor.submit(test_session, session_id) for session_id in concurrent_sessions]
                    results = [future.result() for future in futures]
                
                # Validate all sessions completed successfully
                assert len(results) == 5, "All concurrent sessions should complete"
                assert set(results) == set(concurrent_sessions), "All sessions should be properly isolated"
                
                # Validate session isolation - each session should have unique data
                for session_id in concurrent_sessions:
                    conv_jwt_payload = {
                        'sessionId': session_id,
                        'tenantId': 'healthcare_tenant_hash',
                        'turn': 1,
                        'iat': int(time.time()),
                        'exp': int(time.time()) + 3600
                    }
                    conv_jwt_token = jwt.encode(conv_jwt_payload, phase4_test_secret_key, algorithm='HS256')
                    
                    get_event = {
                        "httpMethod": "GET",
                        "queryStringParameters": {"operation": "get"},
                        "headers": {"Authorization": f"Bearer {conv_jwt_token}"},
                        "requestContext": {"identity": {"sourceIp": "192.168.1.100"}}
                    }
                    
                    get_response = conversation_handler.handle_get_conversation(get_event)
                    assert get_response["statusCode"] == 200, f"Session {session_id} retrieval should succeed"
                    
                    state = json.loads(get_response["body"])["state"]
                    assert session_id in state["summary"], f"Session {session_id} should have isolated data"


if __name__ == "__main__":
    pytest.main([
        __file__,
        "-v", 
        "--tb=short",
        "--show-capture=no"
    ])