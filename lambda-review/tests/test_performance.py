"""
Performance tests for PICASSO tenant inference system
Healthcare-grade performance validation with <50ms latency requirements
"""

import pytest
import time
import statistics
import concurrent.futures
import threading
from unittest.mock import patch

import tenant_inference
from conftest import (
    measure_execution_time, assert_performance_requirement,
    create_jwt_token, TEST_JWT_SECRET
)


class TestPerformanceRequirements:
    """Test performance requirements and optimization"""

    def test_single_request_latency_requirement(self, mock_aws_clients, sample_tenant_registry, 
                                               valid_jwt_payload, healthcare_audit_logger):
        """Test that single tenant inference completes within 50ms"""
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            event = {
                'headers': {'authorization': f'Bearer {jwt_token}'},
                'requestContext': {
                    'requestId': 'performance-test-single',
                    'identity': {'sourceIp': '192.168.1.100'}
                }
            }
            
            # Measure execution time
            result, exec_time = measure_execution_time(
                tenant_inference.resolveTenant, event
            )
            
            # Verify successful result
            assert result is not None
            assert result.get('tenant_id') == 'tenant123hash'
            
            # Verify performance requirement
            assert_performance_requirement(exec_time, 50)  # 50ms requirement

    def test_jwt_validation_performance(self, mock_aws_clients, valid_jwt_payload):
        """Test JWT validation performance"""
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        event = {
            'headers': {'authorization': f'Bearer {jwt_token}'}
        }
        
        # Measure JWT validation specifically
        result, exec_time = measure_execution_time(
            tenant_inference.extract_tenant_from_token, event
        )
        
        # JWT validation should be very fast (< 10ms)
        assert_performance_requirement(exec_time, 10)
        assert result is not None

    def test_host_normalization_performance(self, healthcare_audit_logger):
        """Test host normalization performance"""
        test_hosts = [
            'EXAMPLE.COM:8080',
            'https://subdomain.example.org:443/path',
            '  MIXED-CASE-HOST.AI  ',
            'unicode-café.com',
            'very-long-subdomain-name.extremely-long-domain-name.com'
        ]
        
        for host in test_hosts:
            result, exec_time = measure_execution_time(
                tenant_inference.norm_host, host
            )
            
            # Host normalization should be very fast (< 5ms)
            assert_performance_requirement(exec_time, 5)
            assert isinstance(result, str)

    def test_path_validation_performance(self, healthcare_audit_logger):
        """Test path validation performance"""
        allowed_paths = [f'/api/v{i}/tenant{i}' for i in range(100)]  # Large list
        test_paths = [
            '/api/v1/tenant1/data',
            '/api/v50/tenant50/users',
            '/invalid/path/that/wont/match',
            '/very/long/path/with/many/segments/that/should/still/be/fast'
        ]
        
        for path in test_paths:
            result, exec_time = measure_execution_time(
                tenant_inference.valid_path, path, allowed_paths
            )
            
            # Path validation should be fast even with large allowed paths list
            assert_performance_requirement(exec_time, 20)  # 20ms max
            assert isinstance(result, bool)

    def test_registry_loading_performance(self, mock_aws_clients, s3_tenant_mapping_data):
        """Test tenant registry loading performance"""
        # Setup S3 mock with realistic data size
        s3_objects = []
        for i in range(50):  # Moderate number of tenants
            s3_objects.append({
                'Key': f'test-mappings/tenant{i:03d}.json',
                'Size': 1024
            })
        
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': s3_objects
        }
        
        # Mock realistic S3 response times
        def mock_get_object(Bucket, Key):
            time.sleep(0.001)  # Simulate 1ms network latency per object
            return {
                'Body': type('MockBody', (), {
                    'read': lambda: b'{"host": "example.com", "tenant": "test"}'
                })()
            }
        
        mock_aws_clients['s3'].get_object.side_effect = mock_get_object
        
        # Measure registry loading
        result, exec_time = measure_execution_time(
            tenant_inference.loadTenantRegistry
        )
        
        # Registry loading should complete within reasonable time
        assert_performance_requirement(exec_time, 2000)  # 2 seconds max for loading
        assert isinstance(result, dict)
        assert 'hashes' in result

    def test_cached_registry_performance(self, mock_aws_clients, sample_tenant_registry):
        """Test performance when using cached registry"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            # First call loads registry
            tenant_inference.loadTenantRegistry()
            
            # Subsequent calls should use cache and be very fast
            result, exec_time = measure_execution_time(
                tenant_inference.loadTenantRegistry
            )
            
            # Cached access should be extremely fast (< 1ms)
            assert_performance_requirement(exec_time, 1)
            assert result is sample_tenant_registry

    def test_concurrent_request_performance(self, mock_aws_clients, sample_tenant_registry, 
                                          valid_jwt_payload):
        """Test performance under concurrent load"""
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            def single_request(request_id):
                event = {
                    'headers': {'authorization': f'Bearer {jwt_token}'},
                    'requestContext': {
                        'requestId': f'concurrent-{request_id}',
                        'identity': {'sourceIp': f'192.168.1.{request_id % 255}'}
                    }
                }
                
                start_time = time.perf_counter()
                result = tenant_inference.resolveTenant(event)
                end_time = time.perf_counter()
                
                exec_time = (end_time - start_time) * 1000
                return result, exec_time
            
            # Run 20 concurrent requests
            with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
                futures = [executor.submit(single_request, i) for i in range(20)]
                results = [future.result() for future in concurrent.futures.as_completed(futures)]
            
            # All requests should complete successfully
            for result, exec_time in results:
                assert result is not None
                assert result.get('tenant_id') == 'tenant123hash'
                
                # Each request should still meet performance requirement
                assert_performance_requirement(exec_time, 100)  # Slightly higher for concurrency

    def test_memory_usage_optimization(self, mock_aws_clients, healthcare_audit_logger):
        """Test memory usage remains reasonable under load"""
        import psutil
        import os
        
        # Get initial memory usage
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Create large registry
        large_registry = {
            'hosts': {f'host{i}.com': f'tenant{i}' for i in range(1000)},
            'origins': {f'https://origin{i}.com': f'tenant{i}' for i in range(1000)},
            'paths': {f'/api/v1/tenant{i}': f'tenant{i}' for i in range(1000)},
            'hashes': {f'tenant{i}' for i in range(1000)},
            'loaded_at': time.time()
        }
        
        with patch('tenant_inference.loadTenantRegistry', return_value=large_registry):
            # Process many requests
            for i in range(100):
                event = {
                    'headers': {'host': f'host{i % 1000}.com'},
                    'requestContext': {
                        'requestId': f'memory-test-{i}',
                        'identity': {'sourceIp': '192.168.1.50'}
                    }
                }
                tenant_inference.resolveTenant(event)
        
        # Check final memory usage
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        # Memory increase should be reasonable (< 100MB for this test)
        assert memory_increase < 100, f"Memory usage increased by {memory_increase:.2f}MB"

    def test_rate_limiting_performance_impact(self, mock_aws_clients, healthcare_audit_logger):
        """Test that rate limiting doesn't significantly impact performance"""
        tenant_inference.failure_tracking = {}
        
        with patch('tenant_inference.loadTenantRegistry', return_value={'hosts': {}, 'origins': {}, 'paths': {}, 'hashes': set()}):
            # Normal request (should be fast)
            event1 = {
                'headers': {'host': 'normal.com'},
                'requestContext': {
                    'requestId': 'rate-limit-perf-1',
                    'identity': {'sourceIp': '10.0.0.1'}
                }
            }
            
            result1, time1 = measure_execution_time(
                tenant_inference.resolveTenant, event1
            )
            
            # Fill up rate limit for another IP
            rate_limited_ip = '10.0.0.2'
            for i in range(15):  # Exceed rate limit
                event = {
                    'headers': {'host': f'rate{i}.com'},
                    'requestContext': {
                        'requestId': f'rate-fill-{i}',
                        'identity': {'sourceIp': rate_limited_ip}
                    }
                }
                tenant_inference.resolveTenant(event)
            
            # Rate-limited request
            event2 = {
                'headers': {'host': 'rate-limited.com'},
                'requestContext': {
                    'requestId': 'rate-limit-perf-2',
                    'identity': {'sourceIp': rate_limited_ip}
                }
            }
            
            result2, time2 = measure_execution_time(
                tenant_inference.resolveTenant, event2
            )
            
            # Rate-limited requests should still be reasonably fast
            assert_performance_requirement(time2, 50)
            
            # Performance difference should be minimal
            performance_ratio = time2 / time1
            assert performance_ratio < 3.0, f"Rate limiting causes {performance_ratio}x slowdown"

    def test_performance_under_registry_failures(self, mock_aws_clients, healthcare_audit_logger):
        """Test performance when registry loading fails"""
        # Mock registry failure
        with patch('tenant_inference.loadTenantRegistry', side_effect=Exception("Registry unavailable")):
            event = {
                'headers': {'host': 'test.com'},
                'requestContext': {
                    'requestId': 'registry-failure-perf',
                    'identity': {'sourceIp': '192.168.1.75'}
                }
            }
            
            result, exec_time = measure_execution_time(
                tenant_inference.resolveTenant, event
            )
            
            # Should still complete quickly even on failure
            assert_performance_requirement(exec_time, 50)
            
            # Should fail closed
            assert result is not None
            assert result.get('error') == 'Access denied'

    def test_performance_statistics_analysis(self, mock_aws_clients, sample_tenant_registry, 
                                           valid_jwt_payload, performance_test_events):
        """Test performance statistics across multiple request types"""
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            execution_times = []
            
            # Test various scenarios
            test_scenarios = [
                # JWT-based inference (fastest)
                {'headers': {'authorization': f'Bearer {jwt_token}'}},
                
                # Host-based inference
                {'headers': {'host': 'healthcare.ai'}},
                
                # Path-based inference
                {'path': '/healthcare/portal'},
                
                # Config-based inference
                {'queryStringParameters': {'t': 'tenant456hash'}},
                
                # Failure cases (should still be fast)
                {'headers': {'host': 'nonexistent.com'}},
            ]
            
            for scenario_idx, base_event in enumerate(test_scenarios):
                for i in range(10):  # Multiple samples per scenario
                    event = base_event.copy()
                    event['requestContext'] = {
                        'requestId': f'stats-{scenario_idx}-{i}',
                        'identity': {'sourceIp': f'192.168.2.{i}'}
                    }
                    
                    result, exec_time = measure_execution_time(
                        tenant_inference.resolveTenant, event
                    )
                    
                    execution_times.append(exec_time)
            
            # Statistical analysis
            mean_time = statistics.mean(execution_times)
            median_time = statistics.median(execution_times)
            p95_time = sorted(execution_times)[int(len(execution_times) * 0.95)]
            max_time = max(execution_times)
            
            # Performance requirements
            assert_performance_requirement(mean_time, 30)    # Mean < 30ms
            assert_performance_requirement(median_time, 25)  # Median < 25ms
            assert_performance_requirement(p95_time, 45)     # 95th percentile < 45ms
            assert_performance_requirement(max_time, 50)     # Max < 50ms
            
            print(f"Performance Statistics:")
            print(f"  Mean: {mean_time:.2f}ms")
            print(f"  Median: {median_time:.2f}ms")
            print(f"  95th percentile: {p95_time:.2f}ms")
            print(f"  Max: {max_time:.2f}ms")

    def test_cold_start_performance(self, mock_aws_clients, sample_tenant_registry, valid_jwt_payload):
        """Test performance during cold start (first request)"""
        # Clear all caches to simulate cold start
        tenant_inference.tenant_registry_cache = {}
        tenant_inference.registry_cache_timestamp = 0
        tenant_inference.signing_key_cache = None
        tenant_inference.key_cache_expires = 0
        
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            event = {
                'headers': {'authorization': f'Bearer {jwt_token}'},
                'requestContext': {
                    'requestId': 'cold-start-test',
                    'identity': {'sourceIp': '192.168.1.200'}
                }
            }
            
            # Cold start should still meet performance requirements
            result, exec_time = measure_execution_time(
                tenant_inference.resolveTenant, event
            )
            
            # Cold start may be slightly slower but should still be reasonable
            assert_performance_requirement(exec_time, 100)  # 100ms for cold start
            assert result is not None
            assert result.get('tenant_id') == 'tenant123hash'

    def test_performance_monitoring_overhead(self, mock_aws_clients, sample_tenant_registry, 
                                           healthcare_audit_logger):
        """Test that audit logging and monitoring don't significantly impact performance"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            # Test with full monitoring/logging enabled
            event = {
                'headers': {'host': 'healthcare.ai'},
                'requestContext': {
                    'requestId': 'monitoring-overhead-test',
                    'identity': {'sourceIp': '10.0.1.100'}
                }
            }
            
            result, exec_time = measure_execution_time(
                tenant_inference.resolveTenant, event
            )
            
            # Full monitoring should not significantly impact performance
            assert_performance_requirement(exec_time, 50)
            assert result is not None
            
            # Verify monitoring actually occurred
            info_calls = healthcare_audit_logger.info.call_args_list
            assert len(info_calls) > 0, "Should have audit logging"

    def test_scalability_stress_test(self, mock_aws_clients, sample_tenant_registry):
        """Test system behavior under stress conditions"""
        with patch('tenant_inference.loadTenantRegistry', return_value=sample_tenant_registry):
            # Simulate high load with many different scenarios
            stress_scenarios = []
            
            for i in range(100):  # 100 different request patterns
                scenario = {
                    'headers': {'host': f'stress-test-{i % 10}.com'},
                    'requestContext': {
                        'requestId': f'stress-{i}',
                        'identity': {'sourceIp': f'10.0.{i // 255}.{i % 255}'}
                    },
                    'path': f'/api/stress/test/{i}',
                    'queryStringParameters': {'t': f'stress{i % 5}hash'}
                }
                stress_scenarios.append(scenario)
            
            start_time = time.perf_counter()
            
            # Process all requests
            for scenario in stress_scenarios:
                result = tenant_inference.resolveTenant(scenario)
                assert result is not None  # Should not crash
            
            end_time = time.perf_counter()
            total_time = (end_time - start_time) * 1000
            avg_time_per_request = total_time / len(stress_scenarios)
            
            # Average time per request should still be reasonable under stress
            assert_performance_requirement(avg_time_per_request, 50)
            
            print(f"Stress test: {len(stress_scenarios)} requests in {total_time:.2f}ms")
            print(f"Average: {avg_time_per_request:.2f}ms per request")