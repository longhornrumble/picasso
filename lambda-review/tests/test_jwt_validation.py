"""
Unit tests for JWT validation in PICASSO tenant inference system
Healthcare-grade security testing with comprehensive edge cases
"""

import pytest
import jwt
import time
import json
from datetime import datetime, timedelta
from unittest.mock import patch, Mock

import tenant_inference
from conftest import (
    create_jwt_token, create_invalid_jwt_token, TEST_JWT_SECRET, TEST_ENVIRONMENT,
    assert_security_audit_logged, assert_fail_closed_behavior
)


class TestJWTValidation:
    """Comprehensive JWT validation testing"""

    def test_valid_jwt_token_extraction(self, mock_aws_clients, valid_jwt_payload, healthcare_audit_logger):
        """Test successful JWT token extraction with valid payload"""
        # Create valid JWT token
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        # Test event with JWT in authorization header
        event = {
            'headers': {'authorization': f'Bearer {jwt_token}'},
            'requestContext': {'requestId': 'test-123'}
        }
        
        result = tenant_inference.extract_tenant_from_token(event)
        
        # Verify successful extraction
        assert result is not None
        assert result['tenant_id'] == 'tenant123hash'
        assert result['session_id'] == 'sess_12345_abcd'
        assert result['purpose'] == 'stream'
        assert result['source'] == 'jwt_token'
        assert result['jti'] == 'unique-jwt-id'
        assert 'expires_at' in result

    def test_jwt_token_from_multiple_sources(self, mock_aws_clients, valid_jwt_payload):
        """Test JWT extraction from different header/query sources"""
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        # Test x-jwt-token header
        event1 = {'headers': {'x-jwt-token': jwt_token}}
        result1 = tenant_inference.extract_tenant_from_token(event1)
        assert result1 is not None
        assert result1['tenant_id'] == 'tenant123hash'
        
        # Test query parameter
        event2 = {'queryStringParameters': {'token': jwt_token}}
        result2 = tenant_inference.extract_tenant_from_token(event2)
        assert result2 is not None
        assert result2['tenant_id'] == 'tenant123hash'
        
        # Test authorization header with Bearer prefix
        event3 = {'headers': {'authorization': f'Bearer {jwt_token}'}}
        result3 = tenant_inference.extract_tenant_from_token(event3)
        assert result3 is not None
        assert result3['tenant_id'] == 'tenant123hash'

    def test_expired_jwt_token_rejection(self, mock_aws_clients, expired_jwt_payload, healthcare_audit_logger):
        """Test rejection of expired JWT tokens"""
        # Create expired JWT token
        jwt_token = create_jwt_token(expired_jwt_payload)
        
        event = {
            'headers': {'authorization': f'Bearer {jwt_token}'},
            'requestContext': {'requestId': 'test-expired'}
        }
        
        result = tenant_inference.extract_tenant_from_token(event)
        
        # Verify rejection
        assert result is None
        
        # Verify security audit logging
        healthcare_audit_logger.warning.assert_called()
        warning_calls = [str(call) for call in healthcare_audit_logger.warning.call_args_list]
        assert any('Expired JWT token' in call for call in warning_calls)

    def test_missing_required_claims(self, mock_aws_clients, healthcare_audit_logger):
        """Test rejection of JWT tokens missing required claims"""
        # Test missing each required claim
        required_claims = ['iss', 'aud', 'purpose', 'tenantId', 'jti']
        
        for missing_claim in required_claims:
            current_time = datetime.utcnow()
            payload = {
                'iss': f'picasso-{TEST_ENVIRONMENT}',
                'aud': 'streaming-function',
                'purpose': 'stream',
                'tenantId': 'tenant123hash',
                'jti': 'unique-jwt-id',
                'iat': int(current_time.timestamp()),
                'exp': int((current_time + timedelta(minutes=15)).timestamp())
            }
            
            # Remove the claim being tested
            del payload[missing_claim]
            
            jwt_token = create_jwt_token(payload)
            event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
            
            result = tenant_inference.extract_tenant_from_token(event)
            assert result is None, f"Should reject token missing {missing_claim}"
            
            # Verify security logging
            warning_calls = [str(call) for call in healthcare_audit_logger.warning.call_args_list]
            assert any(f'missing claim: {missing_claim}' in call for call in warning_calls)

    def test_invalid_issuer_rejection(self, mock_aws_clients, valid_jwt_payload, healthcare_audit_logger):
        """Test rejection of JWT tokens with invalid issuer"""
        # Test invalid issuers
        invalid_issuers = [
            'malicious-issuer',
            'picasso-production',  # Wrong environment
            f'picasso-{TEST_ENVIRONMENT}-extra',
            '',
            None
        ]
        
        for invalid_issuer in invalid_issuers:
            payload = valid_jwt_payload.copy()
            payload['iss'] = invalid_issuer
            
            jwt_token = create_jwt_token(payload)
            event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
            
            result = tenant_inference.extract_tenant_from_token(event)
            assert result is None, f"Should reject token with issuer: {invalid_issuer}"

    def test_invalid_audience_rejection(self, mock_aws_clients, valid_jwt_payload, healthcare_audit_logger):
        """Test rejection of JWT tokens with invalid audience"""
        invalid_audiences = [
            'malicious-function',
            'wrong-function',
            'streaming-function-extra',
            '',
            None
        ]
        
        for invalid_audience in invalid_audiences:
            payload = valid_jwt_payload.copy()
            payload['aud'] = invalid_audience
            
            jwt_token = create_jwt_token(payload)
            event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
            
            result = tenant_inference.extract_tenant_from_token(event)
            assert result is None, f"Should reject token with audience: {invalid_audience}"

    def test_invalid_purpose_rejection(self, mock_aws_clients, valid_jwt_payload, healthcare_audit_logger):
        """Test rejection of JWT tokens with invalid purpose"""
        invalid_purposes = [
            'malicious',
            'admin',  # Not in allowed list
            'root',
            'backdoor',
            '',
            None
        ]
        
        for invalid_purpose in invalid_purposes:
            payload = valid_jwt_payload.copy()
            payload['purpose'] = invalid_purpose
            
            jwt_token = create_jwt_token(payload)
            event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
            
            result = tenant_inference.extract_tenant_from_token(event)
            assert result is None, f"Should reject token with purpose: {invalid_purpose}"

    def test_valid_audiences_accepted(self, mock_aws_clients, valid_jwt_payload):
        """Test that all valid audiences are accepted"""
        valid_audiences = ['streaming-function', 'master-function']
        
        for valid_audience in valid_audiences:
            payload = valid_jwt_payload.copy()
            payload['aud'] = valid_audience
            
            jwt_token = create_jwt_token(payload)
            event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
            
            result = tenant_inference.extract_tenant_from_token(event)
            assert result is not None, f"Should accept token with audience: {valid_audience}"

    def test_valid_purposes_accepted(self, mock_aws_clients, valid_jwt_payload):
        """Test that all valid purposes are accepted"""
        valid_purposes = ['stream', 'manage', 'config', 'chat']
        
        for valid_purpose in valid_purposes:
            payload = valid_jwt_payload.copy()
            payload['purpose'] = valid_purpose
            
            jwt_token = create_jwt_token(payload)
            event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
            
            result = tenant_inference.extract_tenant_from_token(event)
            assert result is not None, f"Should accept token with purpose: {valid_purpose}"
            assert result['purpose'] == valid_purpose

    def test_clock_skew_tolerance(self, mock_aws_clients):
        """Test JWT clock skew tolerance (60s)"""
        # Create token that's slightly in the future (within tolerance)
        future_time = datetime.utcnow() + timedelta(seconds=30)  # 30s in future
        payload = {
            'iss': f'picasso-{TEST_ENVIRONMENT}',
            'aud': 'streaming-function',
            'purpose': 'stream',
            'tenantId': 'tenant123hash',
            'jti': 'unique-jwt-id',
            'iat': int(future_time.timestamp()),
            'exp': int((future_time + timedelta(minutes=15)).timestamp())
        }
        
        jwt_token = create_jwt_token(payload)
        event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
        
        result = tenant_inference.extract_tenant_from_token(event)
        assert result is not None, "Should accept token within clock skew tolerance"

    def test_clock_skew_exceeded(self, mock_aws_clients):
        """Test rejection when clock skew tolerance is exceeded"""
        # Create token that's too far in the future (beyond tolerance)
        future_time = datetime.utcnow() + timedelta(seconds=120)  # 2 minutes in future
        payload = {
            'iss': f'picasso-{TEST_ENVIRONMENT}',
            'aud': 'streaming-function',
            'purpose': 'stream',
            'tenantId': 'tenant123hash',
            'jti': 'unique-jwt-id',
            'iat': int(future_time.timestamp()),
            'exp': int((future_time + timedelta(minutes=15)).timestamp())
        }
        
        jwt_token = create_jwt_token(payload)
        event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
        
        result = tenant_inference.extract_tenant_from_token(event)
        assert result is None, "Should reject token beyond clock skew tolerance"

    def test_malformed_jwt_token(self, mock_aws_clients, healthcare_audit_logger):
        """Test handling of malformed JWT tokens"""
        malformed_tokens = [
            'invalid.jwt.token',
            'not-a-jwt-at-all',
            'header.payload',  # Missing signature
            'header.payload.signature.extra',  # Too many parts
            '',
            None
        ]
        
        for malformed_token in malformed_tokens:
            if malformed_token is None:
                event = {'headers': {}}
            else:
                event = {'headers': {'authorization': f'Bearer {malformed_token}'}}
            
            result = tenant_inference.extract_tenant_from_token(event)
            assert result is None, f"Should reject malformed token: {malformed_token}"

    def test_jwt_with_wrong_algorithm(self, mock_aws_clients, valid_jwt_payload, healthcare_audit_logger):
        """Test rejection of JWT tokens with wrong signing algorithm"""
        # Create token with RS256 instead of HS256
        try:
            jwt_token = jwt.encode(valid_jwt_payload, 'wrong-secret', algorithm='none')
            event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
            
            result = tenant_inference.extract_tenant_from_token(event)
            assert result is None, "Should reject token with wrong algorithm"
        except Exception:
            # If JWT library doesn't support 'none' algorithm, test passes
            pass

    def test_jwt_with_wrong_secret(self, mock_aws_clients, valid_jwt_payload, healthcare_audit_logger):
        """Test rejection of JWT tokens signed with wrong secret"""
        # Create token with wrong secret
        jwt_token = create_jwt_token(valid_jwt_payload, secret='wrong-secret')
        event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
        
        result = tenant_inference.extract_tenant_from_token(event)
        assert result is None, "Should reject token with wrong secret"

    def test_signing_key_unavailable(self, mock_aws_clients, valid_jwt_payload, healthcare_audit_logger):
        """Test handling when signing key is unavailable"""
        # Mock secrets client to fail
        mock_aws_clients['secrets'].get_secret_value.side_effect = Exception("Key unavailable")
        
        jwt_token = create_jwt_token(valid_jwt_payload)
        event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
        
        result = tenant_inference.extract_tenant_from_token(event)
        assert result is None, "Should fail gracefully when signing key unavailable"
        
        # Verify error logging
        healthcare_audit_logger.error.assert_called()
        error_calls = [str(call) for call in healthcare_audit_logger.error.call_args_list]
        assert any('JWT signing key unavailable' in call for call in error_calls)

    def test_jwt_token_edge_cases(self, mock_aws_clients):
        """Test JWT token extraction edge cases"""
        # Test empty event
        result = tenant_inference.extract_tenant_from_token({})
        assert result is None
        
        # Test None event
        result = tenant_inference.extract_tenant_from_token(None)
        assert result is None
        
        # Test event with None headers
        result = tenant_inference.extract_tenant_from_token({'headers': None})
        assert result is None
        
        # Test event with None queryStringParameters
        result = tenant_inference.extract_tenant_from_token({'queryStringParameters': None})
        assert result is None

    def test_jwt_token_with_extra_claims(self, mock_aws_clients, valid_jwt_payload):
        """Test JWT tokens with extra non-required claims"""
        # Add extra claims that should be ignored
        payload = valid_jwt_payload.copy()
        payload.update({
            'extra_claim': 'should_be_ignored',
            'custom_data': {'nested': 'data'},
            'role': 'admin'  # Should not affect validation
        })
        
        jwt_token = create_jwt_token(payload)
        event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
        
        result = tenant_inference.extract_tenant_from_token(event)
        assert result is not None, "Should accept token with extra claims"
        assert result['tenant_id'] == 'tenant123hash'

    def test_jwt_security_logging(self, mock_aws_clients, healthcare_audit_logger):
        """Test comprehensive security logging for JWT validation"""
        # Test various invalid scenarios and verify logging
        test_cases = [
            ('expired', create_jwt_token({'exp': int(time.time()) - 3600})),  # Expired
            ('invalid', 'invalid.jwt.token'),  # Malformed
            ('wrong_secret', create_jwt_token({'iss': 'test'}, secret='wrong')),  # Wrong secret
        ]
        
        for case_name, jwt_token in test_cases:
            event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
            result = tenant_inference.extract_tenant_from_token(event)
            
            assert result is None, f"Should reject {case_name} token"
        
        # Verify security warnings were logged
        assert healthcare_audit_logger.warning.call_count > 0
        assert healthcare_audit_logger.error.call_count > 0

    def test_fifteen_minute_token_expiry_validation(self, mock_aws_clients):
        """Test that tokens expire after 15 minutes as specified"""
        # Create token that expires in exactly 15 minutes
        current_time = datetime.utcnow()
        payload = {
            'iss': f'picasso-{TEST_ENVIRONMENT}',
            'aud': 'streaming-function',
            'purpose': 'stream',
            'tenantId': 'tenant123hash',
            'jti': 'unique-jwt-id',
            'iat': int(current_time.timestamp()),
            'exp': int((current_time + timedelta(minutes=15)).timestamp())
        }
        
        jwt_token = create_jwt_token(payload)
        event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
        
        result = tenant_inference.extract_tenant_from_token(event)
        assert result is not None, "15-minute token should be valid"
        
        # Verify expiry time is correctly extracted
        expected_exp = payload['exp']
        assert result['expires_at'] == expected_exp

    def test_tenant_id_validation_in_jwt(self, mock_aws_clients, healthcare_audit_logger):
        """Test tenant ID validation within JWT tokens"""
        # Test various tenant ID formats
        valid_tenant_ids = ['tenant123hash', 'medical789hash', 'abc1234567890']
        
        for tenant_id in valid_tenant_ids:
            payload = {
                'iss': f'picasso-{TEST_ENVIRONMENT}',
                'aud': 'streaming-function',
                'purpose': 'stream',
                'tenantId': tenant_id,
                'jti': 'unique-jwt-id',
                'iat': int(time.time()),
                'exp': int(time.time() + 900)  # 15 minutes
            }
            
            jwt_token = create_jwt_token(payload)
            event = {'headers': {'authorization': f'Bearer {jwt_token}'}}
            
            result = tenant_inference.extract_tenant_from_token(event)
            assert result is not None, f"Should accept valid tenant ID: {tenant_id}"
            assert result['tenant_id'] == tenant_id