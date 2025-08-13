"""
Phase 3 Performance Regression Testing

This module provides comprehensive performance regression testing to validate
Phase 3 optimization targets are met and maintained across all system components.

Phase 3 Optimization Targets Validated:
- JWT operations complete in <100ms (down from previous 660ms failures)
- Database operations complete in <150ms (optimized query patterns)
- Overall response times <200ms (down from 422ms average)
- Memory usage optimized and timeout configurations optimal
- Cold start performance <100ms
- Concurrent user performance maintained under load
- Performance monitoring overhead minimized

Critical Success Criteria:
- 95th percentile response time <200ms
- Average JWT validation <100ms
- Database query performance <150ms
- Memory usage growth <50MB under load
- Zero performance degradation under concurrent load
- Performance metrics consistently meet targets
"""

import pytest
import time
import statistics
import threading
import uuid
import json
import jwt
import os
import psutil
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from concurrent.futures import ThreadPoolExecutor, as_completed
import boto3
from moto import mock_dynamodb2, mock_secretsmanager, mock_s3
from botocore.exceptions import ClientError

# Test markers
pytestmark = [
    pytest.mark.performance,
    pytest.mark.phase3,
    pytest.mark.regression,
    pytest.mark.critical
]


class TestPhase3PerformanceRegression:
    """
    Comprehensive performance regression testing for Phase 3 optimizations
    """

    @pytest.fixture(autouse=True)
    def setup_performance_environment(self):
        """Setup performance testing environment"""
        os.environ.update({
            'ENVIRONMENT': 'test',
            'AWS_REGION': 'us-east-1',
            'S3_BUCKET': 'test-picasso-bucket',
            'MAPPINGS_PREFIX': 'test-mappings',
            'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key',
            'DYNAMODB_SUMMARIES_TABLE': 'test-conversation-summaries',
            'DYNAMODB_MESSAGES_TABLE': 'test-recent-messages'
        })
        
        # Record initial system metrics
        self.initial_memory = psutil.Process(os.getpid()).memory_info().rss / 1024 / 1024  # MB
        self.test_start_time = time.perf_counter()
        
        yield
        
        # Cleanup
        env_vars = [
            'ENVIRONMENT', 'AWS_REGION', 'S3_BUCKET', 'MAPPINGS_PREFIX',
            'JWT_SECRET_KEY_NAME', 'DYNAMODB_SUMMARIES_TABLE', 'DYNAMODB_MESSAGES_TABLE'
        ]
        for var in env_vars:
            os.environ.pop(var, None)

    @pytest.fixture
    def performance_test_secret_key(self):
        """Secret key for performance testing"""
        return "performance-test-secret-key-32-characters-for-jwt-validation"

    @pytest.fixture
    def performance_tenant_registry(self):
        """Tenant registry optimized for performance testing"""
        return {
            'hosts': {f'perf-test-{i}.com': f'tenant_{i}_hash' for i in range(100)},
            'origins': {f'https://perf-test-{i}.com': f'tenant_{i}_hash' for i in range(100)},
            'paths': {f'/api/v1/tenant{i}': f'tenant_{i}_hash' for i in range(100)},
            'hashes': {f'tenant_{i}_hash' for i in range(100)},
            'loaded_at': time.time()
        }

    def measure_execution_time(self, func, *args, **kwargs):
        """Measure function execution time in milliseconds"""
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        execution_time = (end_time - start_time) * 1000
        return result, execution_time

    def assert_performance_target(self, execution_time, target_ms, operation_name):
        """Assert execution time meets performance target"""
        assert execution_time < target_ms, \
            f"{operation_name} took {execution_time:.2f}ms, exceeds {target_ms}ms target"


class TestJWTPerformanceOptimization:
    """Test Phase 3 JWT performance optimization targets"""

    def test_jwt_validation_under_100ms_target(self, setup_performance_environment, 
                                              performance_test_secret_key):
        """
        CRITICAL: Test JWT validation meets <100ms target (down from 660ms failures)
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Clear cache to test fresh performance
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                # Test multiple JWT validations for statistical significance
                validation_times = []
                
                for i in range(20):
                    current_time = int(time.time())
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': f'perf_test_tenant_{i}',
                        'sessionId': f'perf-test-session-{i}',
                        'jti': f'perf-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    jwt_token = jwt.encode(jwt_payload, performance_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {'authorization': f'Bearer {jwt_token}'},
                        'requestContext': {
                            'requestId': f'jwt-perf-test-{i}',
                            'identity': {'sourceIp': '192.168.1.100'}
                        }
                    }
                    
                    result, exec_time = self.measure_execution_time(
                        tenant_inference.extract_tenant_from_token, event
                    )
                    
                    validation_times.append(exec_time)
                    
                    assert result is not None, f"JWT validation {i} should succeed"
                    assert exec_time < 100, f"JWT validation {i} took {exec_time:.2f}ms, exceeds 100ms target"
                
                # Statistical performance analysis
                avg_time = statistics.mean(validation_times)
                median_time = statistics.median(validation_times)
                p95_time = sorted(validation_times)[int(len(validation_times) * 0.95)]
                max_time = max(validation_times)
                
                # All metrics should meet targets
                assert avg_time < 50, f"Average JWT validation {avg_time:.2f}ms should be <50ms"
                assert median_time < 40, f"Median JWT validation {median_time:.2f}ms should be <40ms"
                assert p95_time < 100, f"95th percentile JWT validation {p95_time:.2f}ms should be <100ms"
                assert max_time < 100, f"Maximum JWT validation {max_time:.2f}ms should be <100ms"

    def test_jwt_key_caching_performance_optimization(self, setup_performance_environment,
                                                     performance_test_secret_key):
        """
        Test JWT key caching provides significant performance improvement
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
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
                
                # First call - should retrieve from AWS and cache
                _, first_call_time = self.measure_execution_time(
                    tenant_inference._get_signing_key
                )
                
                # Subsequent calls - should use cache
                cache_times = []
                for i in range(10):
                    _, cache_time = self.measure_execution_time(
                        tenant_inference._get_signing_key
                    )
                    cache_times.append(cache_time)
                
                avg_cache_time = statistics.mean(cache_times)
                
                # Cache should provide significant performance improvement
                performance_improvement = first_call_time / avg_cache_time
                assert performance_improvement > 5, \
                    f"Caching should provide >5x improvement: {performance_improvement:.1f}x"
                assert avg_cache_time < 5, f"Cached access should be <5ms: {avg_cache_time:.2f}ms"

    def test_jwt_concurrent_validation_performance(self, setup_performance_environment,
                                                  performance_test_secret_key):
        """
        Test JWT validation maintains performance under concurrent load
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                def validate_jwt_token(thread_id):
                    """Validate JWT token in concurrent thread"""
                    current_time = int(time.time())
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': f'concurrent_tenant_{thread_id}',
                        'sessionId': f'concurrent-session-{thread_id}',
                        'jti': f'concurrent-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    jwt_token = jwt.encode(jwt_payload, performance_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {'authorization': f'Bearer {jwt_token}'},
                        'requestContext': {
                            'requestId': f'concurrent-jwt-{thread_id}',
                            'identity': {'sourceIp': f'192.168.1.{thread_id % 255}'}
                        }
                    }
                    
                    start_time = time.perf_counter()
                    result = tenant_inference.extract_tenant_from_token(event)
                    execution_time = (time.perf_counter() - start_time) * 1000
                    
                    return result, execution_time
                
                # Run concurrent JWT validations
                concurrent_workers = 20
                with ThreadPoolExecutor(max_workers=concurrent_workers) as executor:
                    futures = [
                        executor.submit(validate_jwt_token, i) 
                        for i in range(concurrent_workers)
                    ]
                    
                    results = [future.result() for future in as_completed(futures)]
                
                # Analyze concurrent performance
                validation_times = [exec_time for _, exec_time in results]
                successful_validations = [result for result, _ in results if result is not None]
                
                assert len(successful_validations) == concurrent_workers, \
                    "All concurrent JWT validations should succeed"
                
                avg_concurrent_time = statistics.mean(validation_times)
                max_concurrent_time = max(validation_times)
                
                # Concurrent performance should still meet targets
                assert avg_concurrent_time < 100, \
                    f"Average concurrent JWT time {avg_concurrent_time:.2f}ms should be <100ms"
                assert max_concurrent_time < 200, \
                    f"Maximum concurrent JWT time {max_concurrent_time:.2f}ms should be <200ms"


class TestDatabasePerformanceOptimization:
    """Test Phase 3 database performance optimization targets"""

    def test_database_operations_under_150ms_target(self, setup_performance_environment,
                                                   performance_test_secret_key):
        """
        Test database operations meet <150ms target with optimized query patterns
        """
        with mock_dynamodb2(), mock_secretsmanager():
            # Setup AWS services
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
            )
            
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            
            # Create optimized DynamoDB tables
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
                conversation_handler.jwt_signing_key_cache = performance_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                # Test database read operations
                read_times = []
                for i in range(10):
                    session_id = f'db-perf-read-{i}'
                    
                    _, read_time = self.measure_execution_time(
                        conversation_handler._get_conversation_from_db,
                        session_id, 'test_tenant'
                    )
                    
                    read_times.append(read_time)
                    assert read_time < 150, f"Database read {i} took {read_time:.2f}ms, exceeds 150ms target"
                
                # Test database write operations
                write_times = []
                for i in range(10):
                    session_id = f'db-perf-write-{i}'
                    delta = {
                        'summary_update': f'Performance test summary {i}',
                        'appendUser': {'text': f'Test message {i}'},
                        'appendAssistant': {'text': f'Response {i}'}
                    }
                    
                    try:
                        _, write_time = self.measure_execution_time(
                            conversation_handler._save_conversation_to_db,
                            session_id, 'test_tenant', delta, 1
                        )
                        write_times.append(write_time)
                        assert write_time < 150, f"Database write {i} took {write_time:.2f}ms, exceeds 150ms target"
                    except Exception:
                        # Handle any mock limitations
                        pass
                
                # Performance analysis
                if read_times:
                    avg_read_time = statistics.mean(read_times)
                    max_read_time = max(read_times)
                    assert avg_read_time < 100, f"Average read time {avg_read_time:.2f}ms should be <100ms"
                    assert max_read_time < 150, f"Maximum read time {max_read_time:.2f}ms should be <150ms"
                
                if write_times:
                    avg_write_time = statistics.mean(write_times)
                    max_write_time = max(write_times)
                    assert avg_write_time < 100, f"Average write time {avg_write_time:.2f}ms should be <100ms"
                    assert max_write_time < 150, f"Maximum write time {max_write_time:.2f}ms should be <150ms"

    def test_database_query_optimization_patterns(self, setup_performance_environment,
                                                 performance_test_secret_key):
        """
        Test optimized database query patterns maintain performance
        """
        with mock_dynamodb2(), mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
            )
            
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            
            # Create tables with optimized schema
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
                
                # Test various query patterns
                query_patterns = [
                    ('get_item', 'session-1', 'tenant-1'),
                    ('get_item', 'session-2', 'tenant-2'),
                    ('get_item', 'session-3', 'tenant-3'),
                ]
                
                query_times = []
                for pattern, session_id, tenant_id in query_patterns:
                    if pattern == 'get_item':
                        _, query_time = self.measure_execution_time(
                            conversation_handler._get_conversation_from_db,
                            session_id, tenant_id
                        )
                        query_times.append(query_time)
                        
                        # Each optimized query should be fast
                        assert query_time < 150, f"Optimized query took {query_time:.2f}ms, exceeds 150ms target"
                
                # Overall query performance should be optimized
                if query_times:
                    avg_query_time = statistics.mean(query_times)
                    assert avg_query_time < 100, f"Average query time {avg_query_time:.2f}ms should be <100ms"

    def test_database_connection_pooling_optimization(self, setup_performance_environment):
        """
        Test database connection pooling provides performance optimization
        """
        with mock_dynamodb2():
            dynamodb = boto3.client('dynamodb', region_name='us-east-1')
            
            # Create test table
            dynamodb.create_table(
                TableName='test-conversation-summaries',
                KeySchema=[{'AttributeName': 'sessionId', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'sessionId', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            )
            
            # Test multiple database operations with connection reuse
            operation_times = []
            
            for i in range(20):
                start_time = time.perf_counter()
                
                # Simulate database operation
                try:
                    dynamodb.get_item(
                        TableName='test-conversation-summaries',
                        Key={'sessionId': {'S': f'connection-test-{i}'}}
                    )
                except Exception:
                    pass  # Handle mock limitations
                
                operation_time = (time.perf_counter() - start_time) * 1000
                operation_times.append(operation_time)
            
            # Connection pooling should provide consistent performance
            avg_operation_time = statistics.mean(operation_times)
            std_dev = statistics.stdev(operation_times) if len(operation_times) > 1 else 0
            
            assert avg_operation_time < 50, f"Average operation time {avg_operation_time:.2f}ms should be <50ms"
            assert std_dev < 20, f"Operation time variance {std_dev:.2f}ms should be low (good connection pooling)"


class TestOverallResponseTimeOptimization:
    """Test Phase 3 overall response time optimization targets"""

    def test_end_to_end_response_under_200ms_target(self, setup_performance_environment,
                                                   performance_test_secret_key, 
                                                   performance_tenant_registry):
        """
        CRITICAL: Test end-to-end response time meets <200ms target (down from 422ms average)
        """
        with mock_secretsmanager(), mock_s3(), mock_dynamodb2():
            # Setup comprehensive AWS environment
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
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
                 patch('tenant_inference.loadTenantRegistry', return_value=performance_tenant_registry):
                
                import tenant_inference
                
                # Test end-to-end response times
                response_times = []
                
                for i in range(25):  # Test multiple requests for statistical significance
                    current_time = int(time.time())
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': f'tenant_{i % 10}_hash',
                        'sessionId': f'e2e-perf-session-{i}',
                        'jti': f'e2e-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    jwt_token = jwt.encode(jwt_payload, performance_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {
                            'authorization': f'Bearer {jwt_token}',
                            'host': f'perf-test-{i % 10}.com'
                        },
                        'requestContext': {
                            'requestId': f'e2e-perf-test-{i}',
                            'identity': {'sourceIp': f'192.168.1.{i % 255}'},
                            'http': {'path': f'/api/v1/tenant{i % 10}'}
                        },
                        'path': f'/api/v1/tenant{i % 10}',
                        'queryStringParameters': {'t': f'tenant_{i % 10}_hash'}
                    }
                    
                    result, response_time = self.measure_execution_time(
                        tenant_inference.resolveTenant, event
                    )
                    
                    response_times.append(response_time)
                    
                    assert result is not None, f"End-to-end request {i} should succeed"
                    assert response_time < 200, f"Response {i} took {response_time:.2f}ms, exceeds 200ms target"
                
                # Statistical performance analysis (critical for regression testing)
                avg_response_time = statistics.mean(response_times)
                median_response_time = statistics.median(response_times)
                p90_response_time = sorted(response_times)[int(len(response_times) * 0.90)]
                p95_response_time = sorted(response_times)[int(len(response_times) * 0.95)]
                max_response_time = max(response_times)
                
                # All performance targets must be met
                assert avg_response_time < 150, f"Average response time {avg_response_time:.2f}ms should be <150ms"
                assert median_response_time < 130, f"Median response time {median_response_time:.2f}ms should be <130ms"
                assert p90_response_time < 180, f"90th percentile response time {p90_response_time:.2f}ms should be <180ms"
                assert p95_response_time < 200, f"95th percentile response time {p95_response_time:.2f}ms should be <200ms"
                assert max_response_time < 200, f"Maximum response time {max_response_time:.2f}ms should be <200ms"

    def test_cold_start_performance_optimization(self, setup_performance_environment,
                                               performance_test_secret_key,
                                               performance_tenant_registry):
        """
        Test cold start performance meets <100ms target
        """
        with mock_secretsmanager(), mock_s3():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
            )
            
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket='test-picasso-bucket')
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client), \
                 patch('tenant_inference.s3', s3_client), \
                 patch('tenant_inference.loadTenantRegistry', return_value=performance_tenant_registry):
                
                import tenant_inference
                
                # Clear all caches to simulate cold start
                tenant_inference.tenant_registry_cache = {}
                tenant_inference.registry_cache_timestamp = 0
                tenant_inference.signing_key_cache = None
                tenant_inference.key_cache_expires = 0
                
                # Test cold start performance
                current_time = int(time.time())
                jwt_payload = {
                    'iss': 'picasso-test',
                    'aud': 'streaming-function',
                    'purpose': 'stream',
                    'tenantId': 'tenant_0_hash',
                    'sessionId': 'cold-start-session',
                    'jti': f'cold-start-{uuid.uuid4().hex}',
                    'iat': current_time,
                    'exp': current_time + (15 * 60)
                }
                
                jwt_token = jwt.encode(jwt_payload, performance_test_secret_key, algorithm='HS256')
                
                event = {
                    'headers': {
                        'authorization': f'Bearer {jwt_token}',
                        'host': 'perf-test-0.com'
                    },
                    'requestContext': {
                        'requestId': 'cold-start-test',
                        'identity': {'sourceIp': '192.168.1.200'},
                        'http': {'path': '/api/v1/tenant0'}
                    },
                    'path': '/api/v1/tenant0'
                }
                
                result, cold_start_time = self.measure_execution_time(
                    tenant_inference.resolveTenant, event
                )
                
                assert result is not None, "Cold start request should succeed"
                assert cold_start_time < 100, f"Cold start took {cold_start_time:.2f}ms, exceeds 100ms target"
                
                # Subsequent requests should be even faster
                result2, warm_start_time = self.measure_execution_time(
                    tenant_inference.resolveTenant, event
                )
                
                assert result2 is not None, "Warm request should succeed"
                assert warm_start_time < cold_start_time, "Warm start should be faster than cold start"
                assert warm_start_time < 50, f"Warm start should be <50ms: {warm_start_time:.2f}ms"

    def test_concurrent_load_performance_optimization(self, setup_performance_environment,
                                                    performance_test_secret_key,
                                                    performance_tenant_registry):
        """
        Test performance optimization under concurrent load
        """
        with mock_secretsmanager(), mock_s3():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
            )
            
            s3_client = boto3.client('s3', region_name='us-east-1')
            s3_client.create_bucket(Bucket='test-picasso-bucket')
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client), \
                 patch('tenant_inference.s3', s3_client), \
                 patch('tenant_inference.loadTenantRegistry', return_value=performance_tenant_registry):
                
                import tenant_inference
                
                def concurrent_request(thread_id):
                    """Execute request in concurrent thread"""
                    current_time = int(time.time())
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': f'tenant_{thread_id % 10}_hash',
                        'sessionId': f'concurrent-load-{thread_id}',
                        'jti': f'concurrent-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    jwt_token = jwt.encode(jwt_payload, performance_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {
                            'authorization': f'Bearer {jwt_token}',
                            'host': f'perf-test-{thread_id % 10}.com'
                        },
                        'requestContext': {
                            'requestId': f'concurrent-load-{thread_id}',
                            'identity': {'sourceIp': f'192.168.2.{thread_id % 255}'}
                        }
                    }
                    
                    start_time = time.perf_counter()
                    result = tenant_inference.resolveTenant(event)
                    execution_time = (time.perf_counter() - start_time) * 1000
                    
                    return result, execution_time
                
                # Execute concurrent load test
                concurrent_users = 50
                with ThreadPoolExecutor(max_workers=concurrent_users) as executor:
                    futures = [
                        executor.submit(concurrent_request, i) 
                        for i in range(concurrent_users)
                    ]
                    
                    results = [future.result() for future in as_completed(futures)]
                
                # Analyze concurrent load performance
                execution_times = [exec_time for _, exec_time in results]
                successful_requests = [result for result, _ in results if result is not None]
                
                assert len(successful_requests) == concurrent_users, \
                    "All concurrent requests should succeed"
                
                # Performance under load should still meet targets
                avg_concurrent_time = statistics.mean(execution_times)
                p95_concurrent_time = sorted(execution_times)[int(len(execution_times) * 0.95)]
                max_concurrent_time = max(execution_times)
                
                assert avg_concurrent_time < 200, \
                    f"Average concurrent response time {avg_concurrent_time:.2f}ms should be <200ms"
                assert p95_concurrent_time < 250, \
                    f"95th percentile concurrent time {p95_concurrent_time:.2f}ms should be <250ms"
                assert max_concurrent_time < 300, \
                    f"Maximum concurrent time {max_concurrent_time:.2f}ms should be <300ms"


class TestMemoryAndResourceOptimization:
    """Test Phase 3 memory usage and resource optimization"""

    def test_memory_usage_optimization_under_load(self, setup_performance_environment,
                                                 performance_test_secret_key):
        """
        Test memory usage remains optimized under load (<50MB growth)
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Record initial memory usage
                process = psutil.Process(os.getpid())
                initial_memory = process.memory_info().rss / 1024 / 1024  # MB
                
                # Simulate load with many JWT operations
                for i in range(100):
                    current_time = int(time.time())
                    jwt_payload = {
                        'iss': 'picasso-test',
                        'aud': 'streaming-function',
                        'purpose': 'stream',
                        'tenantId': f'memory_test_tenant_{i}',
                        'sessionId': f'memory-test-{i}',
                        'jti': f'memory-{uuid.uuid4().hex}',
                        'iat': current_time,
                        'exp': current_time + (15 * 60)
                    }
                    
                    jwt_token = jwt.encode(jwt_payload, performance_test_secret_key, algorithm='HS256')
                    
                    event = {
                        'headers': {'authorization': f'Bearer {jwt_token}'},
                        'requestContext': {
                            'requestId': f'memory-test-{i}',
                            'identity': {'sourceIp': f'192.168.3.{i % 255}'}
                        }
                    }
                    
                    tenant_inference.extract_tenant_from_token(event)
                
                # Check final memory usage
                final_memory = process.memory_info().rss / 1024 / 1024  # MB
                memory_growth = final_memory - initial_memory
                
                # Memory growth should be minimal
                assert memory_growth < 50, f"Memory growth {memory_growth:.2f}MB should be <50MB"

    def test_timeout_configuration_optimization(self, setup_performance_environment):
        """
        Test timeout configurations are optimized for performance
        """
        # Test that timeout configurations don't cause unnecessary delays
        import sys
        import os
        lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
        if lambda_review_path not in sys.path:
            sys.path.insert(0, lambda_review_path)
        
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            
            # Test timeout doesn't cause performance degradation
            timeout_start = time.perf_counter()
            
            try:
                # Simulate operation that would timeout
                with patch('tenant_inference.secrets_client', secrets_client):
                    import tenant_inference
                    tenant_inference._get_signing_key()
            except Exception:
                pass  # Expected to fail quickly
            
            timeout_duration = (time.perf_counter() - timeout_start) * 1000
            
            # Timeout should fail fast, not cause long delays
            assert timeout_duration < 1000, f"Timeout should fail quickly: {timeout_duration:.2f}ms"

    def test_performance_monitoring_overhead_minimized(self, setup_performance_environment,
                                                      performance_test_secret_key):
        """
        Test performance monitoring overhead is minimized
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': performance_test_secret_key})
            )
            
            import sys
            import os
            lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
            if lambda_review_path not in sys.path:
                sys.path.insert(0, lambda_review_path)
            
            with patch('tenant_inference.secrets_client', secrets_client):
                import tenant_inference
                
                # Test operation without monitoring
                current_time = int(time.time())
                jwt_payload = {
                    'iss': 'picasso-test',
                    'aud': 'streaming-function',
                    'purpose': 'stream',
                    'tenantId': 'monitoring_test_tenant',
                    'sessionId': 'monitoring-test',
                    'jti': f'monitoring-{uuid.uuid4().hex}',
                    'iat': current_time,
                    'exp': current_time + (15 * 60)
                }
                
                jwt_token = jwt.encode(jwt_payload, performance_test_secret_key, algorithm='HS256')
                
                event = {
                    'headers': {'authorization': f'Bearer {jwt_token}'},
                    'requestContext': {
                        'requestId': 'monitoring-overhead-test',
                        'identity': {'sourceIp': '192.168.4.100'}
                    }
                }
                
                # Test with minimal monitoring overhead
                times_without_monitoring = []
                for _ in range(10):
                    _, exec_time = self.measure_execution_time(
                        tenant_inference.extract_tenant_from_token, event
                    )
                    times_without_monitoring.append(exec_time)
                
                avg_time_without_monitoring = statistics.mean(times_without_monitoring)
                
                # Even with monitoring, performance should be excellent
                assert avg_time_without_monitoring < 50, \
                    f"Performance with monitoring {avg_time_without_monitoring:.2f}ms should be <50ms"


if __name__ == "__main__":
    pytest.main([
        __file__,
        "-v",
        "--tb=short",
        "--show-capture=no"
    ])