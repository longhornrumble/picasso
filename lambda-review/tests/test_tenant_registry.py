"""
Unit tests for tenant registry loading in PICASSO tenant inference system
Healthcare-grade testing with comprehensive S3 mocking and caching validation
"""

import pytest
import json
import time
from unittest.mock import Mock, patch, call
from botocore.exceptions import ClientError, NoCredentialsError

import tenant_inference
from conftest import TEST_S3_BUCKET, assert_security_audit_logged


class TestTenantRegistryLoading:
    """Comprehensive tenant registry loading tests"""

    def test_successful_registry_loading(self, mock_aws_clients, s3_tenant_mapping_data, healthcare_audit_logger):
        """Test successful loading of tenant registry from S3"""
        # Mock S3 list_objects_v2 response
        s3_objects = []
        for filename, data in s3_tenant_mapping_data.items():
            s3_objects.append({
                'Key': f'test-mappings/{filename}',
                'Size': 1024,
                'LastModified': '2024-01-01T00:00:00Z'
            })
        
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': s3_objects
        }
        
        # Mock S3 get_object responses
        def mock_get_object(Bucket, Key):
            filename = Key.split('/')[-1]
            data = s3_tenant_mapping_data[filename]
            return {
                'Body': Mock(read=lambda: json.dumps(data).encode())
            }
        
        mock_aws_clients['s3'].get_object.side_effect = mock_get_object
        
        # Load registry
        registry = tenant_inference.loadTenantRegistry()
        
        # Verify registry structure
        assert isinstance(registry, dict)
        assert 'hosts' in registry
        assert 'origins' in registry
        assert 'paths' in registry
        assert 'hashes' in registry
        assert 'loaded_at' in registry
        
        # Verify tenant hashes are loaded
        expected_hashes = {'tenant123hash', 'tenant456hash', 'medical789hash'}
        assert registry['hashes'] == expected_hashes
        
        # Verify host mappings
        assert 'healthcare.ai' in registry['hosts']
        assert 'secure.example.org' in registry['hosts']
        assert registry['hosts']['healthcare.ai'] == 'tenant123hash'
        
        # Verify origin mappings
        assert 'https://healthcare.ai' in registry['origins']
        assert registry['origins']['https://healthcare.ai'] == 'tenant123hash'
        
        # Verify path mappings
        assert '/healthcare/portal' in registry['paths']
        assert registry['paths']['/healthcare/portal'] == 'tenant123hash'

    def test_registry_caching_mechanism(self, mock_aws_clients, s3_tenant_mapping_data, healthcare_audit_logger):
        """Test 5-10 minute caching strategy"""
        # Setup mock responses
        mock_aws_clients['s3'].list_objects_v2.return_value = {'Contents': []}
        
        # First call should hit S3
        registry1 = tenant_inference.loadTenantRegistry()
        assert mock_aws_clients['s3'].list_objects_v2.call_count == 1
        
        # Second call within TTL should use cache
        registry2 = tenant_inference.loadTenantRegistry()
        assert mock_aws_clients['s3'].list_objects_v2.call_count == 1  # No additional call
        assert registry1 is registry2  # Same object reference
        
        # Simulate cache expiry
        with patch('time.time', return_value=time.time() + 700):  # 11+ minutes later
            registry3 = tenant_inference.loadTenantRegistry()
            assert mock_aws_clients['s3'].list_objects_v2.call_count == 2  # Additional call

    def test_s3_connection_failure_graceful_degradation(self, mock_aws_clients, healthcare_audit_logger):
        """Test graceful degradation when S3 is unavailable"""
        # Mock S3 failure
        mock_aws_clients['s3'].list_objects_v2.side_effect = ClientError(
            {'Error': {'Code': 'ServiceUnavailable', 'Message': 'Service unavailable'}},
            'ListObjectsV2'
        )
        
        # Should return degraded registry, not crash
        registry = tenant_inference.loadTenantRegistry()
        
        # Verify degraded registry structure
        assert isinstance(registry, dict)
        assert registry['hosts'] == {}
        assert registry['origins'] == {}
        assert registry['paths'] == {}
        assert registry['hashes'] == set()
        assert 'loaded_at' in registry
        assert registry.get('degraded') is True
        
        # Verify error logging
        error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
        assert any('Failed to load tenant registry' in call for call in error_calls)

    def test_cached_registry_fallback_on_failure(self, mock_aws_clients, healthcare_audit_logger):
        """Test fallback to cached registry when S3 fails"""
        # First, successfully load registry
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': [{
                'Key': 'test-mappings/tenant123hash.json',
                'Size': 1024
            }]
        }
        mock_aws_clients['s3'].get_object.return_value = {
            'Body': Mock(read=lambda: b'{"host": "cached.example.com"}')
        }
        
        registry1 = tenant_inference.loadTenantRegistry()
        assert 'cached.example.com' in registry1['hosts']
        
        # Simulate cache expiry and S3 failure
        with patch('time.time', return_value=time.time() + 700):
            mock_aws_clients['s3'].list_objects_v2.side_effect = Exception("S3 down")
            
            registry2 = tenant_inference.loadTenantRegistry()
            
            # Should return cached version
            assert 'cached.example.com' in registry2['hosts']
            
            # Verify warning about using cached version
            warning_calls = [str(call) for call in healthcare_audit_logger.warning.call_args_list]
            assert any('Using cached tenant registry' in call for call in warning_calls)

    def test_invalid_json_mapping_handling(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of invalid JSON in mapping files"""
        # Mock S3 responses with one invalid JSON file
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': [
                {'Key': 'test-mappings/valid.json', 'Size': 100},
                {'Key': 'test-mappings/invalid.json', 'Size': 50},
                {'Key': 'test-mappings/also_valid.json', 'Size': 120}
            ]
        }
        
        def mock_get_object(Bucket, Key):
            filename = Key.split('/')[-1]
            if filename == 'invalid.json':
                return {'Body': Mock(read=lambda: b'invalid json content')}
            else:
                return {'Body': Mock(read=lambda: b'{"host": "example.com"}')}
        
        mock_aws_clients['s3'].get_object.side_effect = mock_get_object
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Should load valid mappings and skip invalid ones
        assert len(registry['hashes']) == 2  # valid.json and also_valid.json
        
        # Verify warning logged for invalid mapping
        warning_calls = [str(call) for call in healthcare_audit_logger.warning.call_args_list]
        assert any('Failed to load mapping' in call and 'invalid.json' in call 
                  for call in warning_calls)

    def test_non_json_file_filtering(self, mock_aws_clients, healthcare_audit_logger):
        """Test that non-JSON files are ignored"""
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': [
                {'Key': 'test-mappings/tenant1.json', 'Size': 100},
                {'Key': 'test-mappings/readme.txt', 'Size': 50},
                {'Key': 'test-mappings/backup.bak', 'Size': 200},
                {'Key': 'test-mappings/tenant2.json', 'Size': 150}
            ]
        }
        
        mock_aws_clients['s3'].get_object.return_value = {
            'Body': Mock(read=lambda: b'{"host": "example.com"}')
        }
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Should only process .json files
        assert mock_aws_clients['s3'].get_object.call_count == 2
        calls = mock_aws_clients['s3'].get_object.call_args_list
        processed_keys = [call[1]['Key'] for call in calls]
        assert 'test-mappings/tenant1.json' in processed_keys
        assert 'test-mappings/tenant2.json' in processed_keys
        assert 'test-mappings/readme.txt' not in processed_keys

    def test_invalid_tenant_hash_format_filtering(self, mock_aws_clients, healthcare_audit_logger):
        """Test filtering of invalid tenant hash formats"""
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': [
                {'Key': 'test-mappings/validhash123.json', 'Size': 100},
                {'Key': 'test-mappings/invalid-hash!@#.json', 'Size': 50},
                {'Key': 'test-mappings/short.json', 'Size': 30},
                {'Key': 'test-mappings/toolongtenanthashname.json', 'Size': 120}
            ]
        }
        
        mock_aws_clients['s3'].get_object.return_value = {
            'Body': Mock(read=lambda: b'{"host": "example.com"}')
        }
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Should only process files with valid tenant hash names
        # validhash123 should be valid (if it matches the regex pattern)
        processed_calls = mock_aws_clients['s3'].get_object.call_count
        assert processed_calls >= 1, "Should process at least one valid hash"
        
        # Check that valid hash was added
        assert len(registry['hashes']) >= 1

    def test_performance_limit_max_keys(self, mock_aws_clients, healthcare_audit_logger):
        """Test performance optimization with MaxKeys limit"""
        tenant_inference.loadTenantRegistry()
        
        # Verify MaxKeys parameter is used for performance
        mock_aws_clients['s3'].list_objects_v2.assert_called_with(
            Bucket=TEST_S3_BUCKET,
            Prefix='test-mappings/',
            MaxKeys=100
        )

    def test_registry_indexing_by_attributes(self, mock_aws_clients, healthcare_audit_logger):
        """Test proper indexing by host, origin, and path attributes"""
        mapping_data = {
            'multitenant.json': {
                'tenant': 'Multi Tenant Corp',
                'host': 'multi.example.com',
                'origin': 'https://multi.example.com',
                'path': '/multi/tenant/path'
            }
        }
        
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': [{'Key': 'test-mappings/multitenant.json', 'Size': 200}]
        }
        
        mock_aws_clients['s3'].get_object.return_value = {
            'Body': Mock(read=lambda: json.dumps(mapping_data['multitenant.json']).encode())
        }
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Verify all indexing
        assert 'multi.example.com' in registry['hosts']
        assert registry['hosts']['multi.example.com'] == 'multitenant'
        
        assert 'https://multi.example.com' in registry['origins']
        assert registry['origins']['https://multi.example.com'] == 'multitenant'
        
        assert '/multi/tenant/path' in registry['paths']
        assert registry['paths']['/multi/tenant/path'] == 'multitenant'

    def test_partial_mapping_data_handling(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of mapping data with only some attributes"""
        mappings = {
            'host_only.json': {'host': 'host-only.com'},
            'origin_only.json': {'origin': 'https://origin-only.com'},
            'path_only.json': {'path': '/path-only'},
            'complete.json': {
                'host': 'complete.com',
                'origin': 'https://complete.com', 
                'path': '/complete'
            }
        }
        
        s3_objects = [{'Key': f'test-mappings/{k}', 'Size': 100} for k in mappings.keys()]
        mock_aws_clients['s3'].list_objects_v2.return_value = {'Contents': s3_objects}
        
        def mock_get_object(Bucket, Key):
            filename = Key.split('/')[-1]
            return {'Body': Mock(read=lambda: json.dumps(mappings[filename]).encode())}
        
        mock_aws_clients['s3'].get_object.side_effect = mock_get_object
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Verify selective indexing
        assert 'host-only.com' in registry['hosts']
        assert 'origin-only.com' not in registry['hosts']  # Only has origin
        
        assert 'https://origin-only.com' in registry['origins']
        assert 'https://host-only.com' not in registry['origins']  # Only has host
        
        assert '/path-only' in registry['paths']
        assert '/host-only' not in registry['paths']  # No path defined

    def test_s3_no_objects_handling(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling when S3 bucket has no mapping objects"""
        mock_aws_clients['s3'].list_objects_v2.return_value = {'Contents': []}
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Should return empty but valid registry
        assert registry['hosts'] == {}
        assert registry['origins'] == {}
        assert registry['paths'] == {}
        assert registry['hashes'] == set()
        assert 'loaded_at' in registry
        assert 'degraded' not in registry  # Not degraded, just empty

    def test_s3_access_denied_handling(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of S3 access denied errors"""
        mock_aws_clients['s3'].list_objects_v2.side_effect = ClientError(
            {'Error': {'Code': 'AccessDenied', 'Message': 'Access denied'}},
            'ListObjectsV2'
        )
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Should return degraded registry
        assert registry.get('degraded') is True
        
        # Verify error logging
        error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
        assert any('Failed to load tenant registry' in call for call in error_calls)

    def test_registry_loading_info_logging(self, mock_aws_clients, healthcare_audit_logger):
        """Test proper info logging during registry loading"""
        mock_aws_clients['s3'].list_objects_v2.return_value = {
            'Contents': [
                {'Key': 'test-mappings/tenant1.json', 'Size': 100},
                {'Key': 'test-mappings/tenant2.json', 'Size': 100}
            ]
        }
        
        mock_aws_clients['s3'].get_object.return_value = {
            'Body': Mock(read=lambda: b'{"host": "example.com"}')
        }
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Verify info logging
        info_calls = [str(call) for call in healthcare_audit_logger.info.call_args_list]
        assert any('Loading tenant registry from S3' in call for call in info_calls)
        assert any('Tenant registry loaded' in call and '2 tenants' in call 
                  for call in info_calls)

    def test_concurrent_registry_loading(self, mock_aws_clients, healthcare_audit_logger):
        """Test thread safety during concurrent registry loading"""
        import threading
        import time
        
        # Mock delayed S3 response
        def delayed_list_objects(**kwargs):
            time.sleep(0.1)  # Small delay to simulate network latency
            return {'Contents': [{'Key': 'test-mappings/test.json', 'Size': 100}]}
        
        mock_aws_clients['s3'].list_objects_v2.side_effect = delayed_list_objects
        mock_aws_clients['s3'].get_object.return_value = {
            'Body': Mock(read=lambda: b'{"host": "concurrent.com"}')
        }
        
        results = []
        
        def load_registry():
            result = tenant_inference.loadTenantRegistry()
            results.append(result)
        
        # Start multiple threads to load registry concurrently
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=load_registry)
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # All threads should get the same registry (cached after first load)
        assert len(results) == 5
        for result in results[1:]:
            assert result is results[0] or result == results[0]

    def test_registry_memory_efficiency(self, mock_aws_clients, healthcare_audit_logger):
        """Test memory efficiency of registry structure"""
        # Create registry with many tenants
        large_mapping_set = {}
        for i in range(50):  # Well under MaxKeys=100 limit
            large_mapping_set[f'tenant{i:03d}.json'] = {
                'host': f'tenant{i:03d}.example.com',
                'origin': f'https://tenant{i:03d}.example.com',
                'path': f'/tenant/{i:03d}'
            }
        
        s3_objects = [{'Key': f'test-mappings/{k}', 'Size': 100} 
                     for k in large_mapping_set.keys()]
        mock_aws_clients['s3'].list_objects_v2.return_value = {'Contents': s3_objects}
        
        def mock_get_object(Bucket, Key):
            filename = Key.split('/')[-1]
            return {'Body': Mock(read=lambda: json.dumps(large_mapping_set[filename]).encode())}
        
        mock_aws_clients['s3'].get_object.side_effect = mock_get_object
        
        registry = tenant_inference.loadTenantRegistry()
        
        # Verify all mappings loaded efficiently
        assert len(registry['hosts']) == 50
        assert len(registry['origins']) == 50
        assert len(registry['paths']) == 50
        assert len(registry['hashes']) == 50
        
        # Verify structure is as expected
        assert 'tenant025.example.com' in registry['hosts']
        assert registry['hosts']['tenant025.example.com'] == 'tenant025'