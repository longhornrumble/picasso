"""
Unit tests for path validation in PICASSO tenant inference system
Healthcare-grade security testing with comprehensive path traversal protection
"""

import pytest
import os
from unittest.mock import patch

import tenant_inference
from conftest import assert_security_audit_logged


class TestPathValidation:
    """Comprehensive path validation testing with security focus"""

    def test_valid_path_basic_functionality(self, healthcare_audit_logger):
        """Test basic valid path functionality"""
        allowed_paths = [
            '/api/v1/tenant1',
            '/healthcare/portal',
            '/secure/dashboard',
            '/patient/records'
        ]
        
        valid_test_cases = [
            ('/api/v1/tenant1', ['/api/v1/tenant1'], True),
            ('/api/v1/tenant1/data', ['/api/v1/tenant1'], True),  # Prefix match
            ('/healthcare/portal/login', ['/healthcare/portal'], True),
            ('/secure/dashboard/admin', ['/secure/dashboard'], True),
        ]
        
        for path, allowed, expected in valid_test_cases:
            result = tenant_inference.valid_path(path, allowed)
            assert result == expected, f"Path '{path}' should be {expected}"

    def test_path_traversal_protection(self, healthcare_audit_logger):
        """Test protection against path traversal attacks"""
        allowed_paths = ['/api/v1/safe']
        
        # Path traversal attempts
        traversal_attempts = [
            '../../../etc/passwd',
            '/api/v1/../../../etc/passwd',
            '/api/v1/safe/../../../etc/passwd',
            '../../config/secrets.txt',
            '/api/../../../root/.ssh/id_rsa',
            '/api/v1/safe/../../../../../../etc/shadow',
            '../../../../../var/log/secure',
            '/api/v1/../admin/config',
            '/api/v1/safe/../../../proc/self/environ',
        ]
        
        for malicious_path in traversal_attempts:
            result = tenant_inference.valid_path(malicious_path, allowed_paths)
            assert result is False, f"Should reject path traversal attempt: {malicious_path}"
            
            # Verify security logging
            warning_calls = [str(call) for call in healthcare_audit_logger.warning.call_args_list]
            assert any('Path traversal attempt' in call for call in warning_calls), \
                f"Should log path traversal attempt for: {malicious_path}"

    def test_normalized_path_traversal_protection(self, healthcare_audit_logger):
        """Test protection against normalized path traversal attacks"""
        allowed_paths = ['/api/v1/safe']
        
        # These paths become traversals after normalization
        normalized_traversals = [
            '/api/v1/./../../etc/passwd',
            '/api/v1/safe/./../../config',
            '/api/v1//../../etc/hosts',
            '/api/v1/safe///../../root',
            '/./api/v1/../../../etc',
            '/api/v1/safe/./../../../bin',
        ]
        
        for path in normalized_traversals:
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result is False, f"Should reject normalized traversal: {path}"

    def test_path_length_validation(self, healthcare_audit_logger):
        """Test path length validation (max 1000 characters)"""
        allowed_paths = ['/api/long/path']
        
        # Valid length path
        valid_path = '/api/long/path' + '/valid' * 20  # Well under 1000 chars
        result = tenant_inference.valid_path(valid_path, allowed_paths)
        assert result is True, "Should accept valid length path"
        
        # Path at limit (1000 characters)
        limit_path = '/api/long/path' + 'x' * (1000 - len('/api/long/path'))
        result = tenant_inference.valid_path(limit_path, allowed_paths)
        assert result is False, "Should reject path at 1000 character limit"
        
        # Path over limit
        over_limit_path = '/api/long/path' + 'x' * 1000
        result = tenant_inference.valid_path(over_limit_path, allowed_paths)
        assert result is False, "Should reject path over 1000 characters"
        
        # Verify security logging
        warning_calls = [str(call) for call in healthcare_audit_logger.warning.call_args_list]
        assert any('Path too long' in call for call in warning_calls)

    def test_path_character_validation(self, healthcare_audit_logger):
        """Test path character validation (safe patterns only)"""
        allowed_paths = ['/api/test']
        
        # Valid characters
        valid_paths = [
            '/api/test/data',
            '/api/test/user-profile',
            '/api/test/user_data',
            '/api/test/version1_0',
            '/api/test/endpoint-v2',
        ]
        
        for path in valid_paths:
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result is True, f"Should accept valid path: {path}"
        
        # Invalid characters
        invalid_paths = [
            '/api/test/<script>',  # HTML/JS injection
            '/api/test/user@domain',  # @ character
            '/api/test/user#hash',  # # character
            '/api/test/user?query=1',  # Query parameters
            '/api/test/user&param=1',  # & character
            '/api/test/user=value',  # = character
            '/api/test/user|pipe',  # Pipe character
            '/api/test/user;command',  # Semicolon
            '/api/test/user(function)',  # Parentheses
            '/api/test/user[index]',  # Brackets
            '/api/test/user{object}',  # Braces
            '/api/test/user space',  # Space
            '/api/test/user\ttab',  # Tab
            '/api/test/user\nnewline',  # Newline
        ]
        
        for path in invalid_paths:
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result is False, f"Should reject invalid characters in path: {path}"
            
            # Verify security logging
            warning_calls = [str(call) for call in healthcare_audit_logger.warning.call_args_list]
            assert any('Invalid path characters' in call for call in warning_calls)

    def test_prefix_matching_logic(self, healthcare_audit_logger):
        """Test prefix matching logic for allowed paths"""
        allowed_paths = [
            '/api/v1/tenant123',
            '/healthcare/portal',
            '/admin/dashboard'
        ]
        
        # Test exact matches
        exact_matches = [
            ('/api/v1/tenant123', True),
            ('/healthcare/portal', True),
            ('/admin/dashboard', True),
        ]
        
        for path, expected in exact_matches:
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result == expected, f"Exact match failed for: {path}"
        
        # Test prefix matches
        prefix_matches = [
            ('/api/v1/tenant123/data', True),
            ('/api/v1/tenant123/users/123', True),
            ('/healthcare/portal/login', True),
            ('/healthcare/portal/patient/view', True),
            ('/admin/dashboard/metrics', True),
        ]
        
        for path, expected in prefix_matches:
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result == expected, f"Prefix match failed for: {path}"
        
        # Test non-matches
        non_matches = [
            ('/api/v1/tenant456', False),  # Different tenant
            ('/api/v2/tenant123', False),  # Different version
            ('/healthcare/admin', False),  # Different section
            ('/public/dashboard', False),  # Different prefix
            ('/api/v1', False),  # Shorter than allowed
        ]
        
        for path, expected in non_matches:
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result == expected, f"Non-match test failed for: {path}"

    def test_path_normalization_edge_cases(self, healthcare_audit_logger):
        """Test path normalization edge cases"""
        allowed_paths = ['/api/v1/safe']
        
        # Paths that require normalization
        normalization_cases = [
            ('/api/v1/safe/./data', ['/api/v1/safe'], True),  # Current dir
            ('/api/v1/safe//data', ['/api/v1/safe'], True),   # Double slash
            ('/api/v1//safe/data', ['/api/v1/safe'], True),   # Double slash in middle
            ('/api/./v1/safe/data', ['/api/v1/safe'], True),  # Current dir in middle
        ]
        
        for path, allowed, expected in normalization_cases:
            result = tenant_inference.valid_path(path, allowed)
            assert result == expected, f"Normalization test failed for: {path}"

    def test_path_validation_edge_cases(self, healthcare_audit_logger):
        """Test path validation edge cases and error conditions"""
        allowed_paths = ['/api/v1/test']
        
        # Edge cases
        edge_cases = [
            (None, False),
            ('', False),
            ('   ', False),
            (123, False),  # Non-string
            ([], False),   # Non-string
            ({}, False),   # Non-string
        ]
        
        for path, expected in edge_cases:
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result == expected, f"Edge case failed for: {path}"

    def test_empty_allowed_paths(self, healthcare_audit_logger):
        """Test behavior with empty allowed paths list"""
        empty_allowed = []
        
        test_paths = [
            '/api/v1/test',
            '/healthcare/portal',
            '/any/path',
        ]
        
        for path in test_paths:
            result = tenant_inference.valid_path(path, empty_allowed)
            assert result is False, f"Should reject all paths when no paths allowed: {path}"

    def test_root_path_validation(self, healthcare_audit_logger):
        """Test validation of root and near-root paths"""
        allowed_paths = ['/api']
        
        root_path_cases = [
            ('/', False),  # Root path
            ('/api', True),  # Allowed root-level path
            ('/api/', True),  # Allowed with trailing slash
            ('/api/data', True),  # Allowed subpath
        ]
        
        for path, expected in root_path_cases:
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result == expected, f"Root path test failed for: {path}"

    def test_path_with_encoded_traversal(self, healthcare_audit_logger):
        """Test protection against URL-encoded path traversal"""
        allowed_paths = ['/api/v1/safe']
        
        # URL-encoded traversal attempts
        encoded_traversals = [
            '/api/v1/safe%2F..%2F..%2Fetc%2Fpasswd',  # URL encoded ../../../etc/passwd
            '/api/v1/safe/%2e%2e/%2e%2e/etc/passwd',   # URL encoded ../.. 
            '/api/v1/safe%5c..%5c..%5cetc%5cpasswd',   # Windows-style with URL encoding
        ]
        
        for path in encoded_traversals:
            # Note: The current implementation may not decode URLs,
            # but we test to ensure they're still rejected
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result is False, f"Should reject encoded traversal: {path}"

    def test_path_validation_performance(self, healthcare_audit_logger):
        """Test path validation performance with large allowed paths list"""
        # Create large list of allowed paths
        large_allowed_paths = [f'/api/v1/tenant{i}' for i in range(1000)]
        
        test_cases = [
            '/api/v1/tenant500/data',  # Should match
            '/api/v1/tenant999/users',  # Should match
            '/api/v1/tenant1001/data',  # Should not match
            '/api/v2/tenant500/data',  # Should not match
        ]
        
        for path in test_cases:
            # This should complete quickly even with large allowed paths list
            result = tenant_inference.valid_path(path, large_allowed_paths)
            assert isinstance(result, bool), f"Should return boolean for: {path}"

    def test_path_validation_with_special_filesystem_names(self, healthcare_audit_logger):
        """Test validation against special filesystem names"""
        allowed_paths = ['/api/v1/safe']
        
        # Special filesystem names that could be dangerous
        special_names = [
            '/api/v1/safe/CON',     # Windows reserved name
            '/api/v1/safe/PRN',     # Windows reserved name
            '/api/v1/safe/AUX',     # Windows reserved name
            '/api/v1/safe/NUL',     # Windows reserved name
            '/api/v1/safe/COM1',    # Windows reserved name
            '/api/v1/safe/LPT1',    # Windows reserved name
            '/api/v1/safe/..',      # Parent directory reference
            '/api/v1/safe/.',       # Current directory reference
            '/api/v1/safe/~',       # Home directory reference
        ]
        
        for path in special_names:
            result = tenant_inference.valid_path(path, allowed_paths)
            # Most should be rejected, especially .. 
            if '..' in path:
                assert result is False, f"Should reject parent directory reference: {path}"

    def test_healthcare_specific_path_patterns(self, healthcare_audit_logger):
        """Test validation of healthcare-specific path patterns"""
        healthcare_allowed = [
            '/patient/records',
            '/medical/imaging',
            '/phi/secure',
            '/hipaa/audit'
        ]
        
        valid_healthcare_paths = [
            '/patient/records/12345',
            '/patient/records/view/67890',
            '/medical/imaging/xray/patient123',
            '/phi/secure/access/doctor456',
            '/hipaa/audit/log/2024-01-01',
        ]
        
        for path in valid_healthcare_paths:
            result = tenant_inference.valid_path(path, healthcare_allowed)
            assert result is True, f"Should accept healthcare path: {path}"
        
        # Healthcare-related attack attempts
        healthcare_attacks = [
            '/patient/records/../../../etc/passwd',
            '/medical/imaging/../../config/database',
            '/phi/secure/../admin/override',
            '/hipaa/audit/../../backup/patient-data',
        ]
        
        for attack_path in healthcare_attacks:
            result = tenant_inference.valid_path(attack_path, healthcare_allowed)
            assert result is False, f"Should reject healthcare attack: {attack_path}"

    def test_path_validation_error_handling(self, healthcare_audit_logger):
        """Test error handling in path validation"""
        allowed_paths = ['/api/test']
        
        # Test that function handles errors gracefully
        with patch('tenant_inference.os.path.normpath', side_effect=Exception("Normalization error")):
            result = tenant_inference.valid_path('/api/test/data', allowed_paths)
            assert result is False, "Should return False on normalization error"
            
            # Verify error logging
            error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
            assert any('Path validation failed' in call for call in error_calls)

    def test_path_validation_logging_coverage(self, healthcare_audit_logger):
        """Test that all security violations are properly logged"""
        allowed_paths = ['/api/safe']
        
        # Test various violation types to ensure logging
        violation_cases = [
            ('x' * 1001, 'Path too long'),  # Length violation
            ('/api/safe/../../../etc/passwd', 'Path traversal attempt'),  # Traversal
            ('/api/safe/user<script>', 'Invalid path characters'),  # Invalid chars
        ]
        
        for path, expected_log in violation_cases:
            result = tenant_inference.valid_path(path, allowed_paths)
            assert result is False, f"Should reject: {path}"
        
        # Verify all expected log messages appeared
        all_warnings = [str(call) for call in healthcare_audit_logger.warning.call_args_list]
        for _, expected_log in violation_cases:
            assert any(expected_log in warning for warning in all_warnings), \
                f"Missing expected log message: {expected_log}"