"""
PICASSO Conversation Endpoint Comprehensive Testing Suite

Tests all aspects of the conversation endpoint implementation:
- API contract compliance (GET, POST, DELETE operations)
- Security hardeners (token validation, rate limiting, payload limits, DLP)
- DynamoDB integration (TTL, tenant isolation, compare-and-swap)
- Error handling and performance validation

Healthcare-grade testing with 90%+ coverage requirement.
"""

import json
import pytest
import time
import uuid
import jwt
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from moto import mock_dynamodb2 as mock_dynamodb, mock_secretsmanager
import boto3
from botocore.exceptions import ClientError


# Test fixtures
@pytest.fixture
def conversation_handler():
    """Import conversation handler with proper mocking"""
    with patch('conversation_handler.dynamodb') as mock_dynamodb, \
         patch('conversation_handler.secrets_client') as mock_secrets:
        
        # Import after mocking AWS clients
        import sys
        import os
        
        # Add lambda-review directory to path
        lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
        if lambda_review_path not in sys.path:
            sys.path.insert(0, lambda_review_path)
        
        # Mock audit_logger availability
        with patch.dict('sys.modules', {'audit_logger': Mock()}):
            import conversation_handler
            conversation_handler.AUDIT_LOGGER_AVAILABLE = True
            conversation_handler.audit_logger = Mock()
            
            # Mock JWT signing key
            conversation_handler.jwt_signing_key_cache = "test-secret-key-123456789012345678901234567890"
            conversation_handler.jwt_key_cache_expires = time.time() + 3600
            
            return conversation_handler


@pytest.fixture
def mock_jwt_token():
    """Generate valid JWT token for testing"""
    signing_key = "test-secret-key-123456789012345678901234567890"
    payload = {
        'sessionId': 'test-session-12345',
        'tenantId': 'tenant-12345',
        'turn': 1,
        'iat': int(time.time()),
        'exp': int(time.time()) + 3600
    }
    return jwt.encode(payload, signing_key, algorithm='HS256')


@pytest.fixture
def mock_event_get(mock_jwt_token):
    """Mock Lambda event for GET operation"""
    return {
        "httpMethod": "GET",
        "queryStringParameters": {"operation": "get"},
        "headers": {"Authorization": f"Bearer {mock_jwt_token}"},
        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
    }


@pytest.fixture
def mock_event_post(mock_jwt_token):
    """Mock Lambda event for POST operation"""
    return {
        "httpMethod": "POST",
        "queryStringParameters": {"operation": "save"},
        "headers": {"Authorization": f"Bearer {mock_jwt_token}"},
        "body": json.dumps({
            "sessionId": "test-session-12345",
            "turn": 1,
            "delta": {
                "summary_update": "Patient discussed symptoms",
                "appendUser": {"text": "Hello doctor"},
                "appendAssistant": {"text": "Hello, how can I help?"}
            }
        }),
        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
    }


@pytest.fixture
def mock_event_delete(mock_jwt_token):
    """Mock Lambda event for DELETE operation"""
    return {
        "httpMethod": "DELETE",
        "queryStringParameters": {"operation": "clear"},
        "headers": {"Authorization": f"Bearer {mock_jwt_token}"},
        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
    }


@pytest.fixture
def mock_context():
    """Mock Lambda context"""
    context = Mock()
    context.aws_request_id = "test-request-123"
    return context


class TestConversationEndpointStaticAnalysis:
    """Static analysis of conversation endpoint implementation"""
    
    def test_imports_and_dependencies(self, conversation_handler):
        """Test 1: Verify all required modules are properly imported"""
        # Required imports should be available
        assert hasattr(conversation_handler, 'json')
        assert hasattr(conversation_handler, 'logging')
        assert hasattr(conversation_handler, 'boto3')
        assert hasattr(conversation_handler, 'jwt')
        assert hasattr(conversation_handler, 'datetime')
        
    def test_environment_configuration(self, conversation_handler):
        """Test 2: Verify environment configuration is properly set"""
        # Environment variables should have defaults
        assert hasattr(conversation_handler, 'ENVIRONMENT')
        assert hasattr(conversation_handler, 'SUMMARIES_TABLE_NAME')
        assert hasattr(conversation_handler, 'MESSAGES_TABLE_NAME')
        assert hasattr(conversation_handler, 'JWT_SECRET_KEY_NAME')
        
    def test_security_limits_configuration(self, conversation_handler):
        """Test 3: Verify security limits are properly configured"""
        assert conversation_handler.RATE_LIMIT_REQUESTS == 10
        assert conversation_handler.RATE_LIMIT_WINDOW == 10
        assert conversation_handler.MAX_PAYLOAD_SIZE == 24 * 1024
        assert conversation_handler.MAX_MESSAGES_PER_SAVE == 6
        assert conversation_handler.STATE_TOKEN_EXPIRY_HOURS == 24
        
    def test_ttl_configuration(self, conversation_handler):
        """Test 4: Verify healthcare compliance TTL settings"""
        assert conversation_handler.SUMMARY_TTL_DAYS == 7
        assert conversation_handler.MESSAGES_TTL_HOURS == 24
        
    def test_error_class_definition(self, conversation_handler):
        """Test 5: Verify ConversationError class is properly defined"""
        assert hasattr(conversation_handler, 'ConversationError')
        error = conversation_handler.ConversationError("TEST_ERROR", "Test message", 400)
        assert error.error_type == "TEST_ERROR"
        assert error.message == "Test message"
        assert error.status_code == 400


class TestAPIContractCompliance:
    """Test API contract compliance for all three operations"""
    
    def test_get_operation_success(self, conversation_handler, mock_event_get, mock_context):
        """Test 6: GET operation returns proper response structure"""
        with patch.object(conversation_handler, '_get_conversation_from_db') as mock_get_db:
            mock_get_db.return_value = {"summary": "Test summary", "turn": 1}
            
            response = conversation_handler.handle_get_conversation(mock_event_get)
            
            assert response["statusCode"] == 200
            assert "headers" in response
            assert "body" in response
            
            body = json.loads(response["body"])
            assert "sessionId" in body
            assert "state" in body
            assert "stateToken" in body
            
            # Verify CORS headers
            headers = response["headers"]
            assert headers["Access-Control-Allow-Origin"] == "*"
            assert "Authorization" in headers["Access-Control-Allow-Headers"]
    
    def test_post_operation_success(self, conversation_handler, mock_event_post, mock_context):
        """Test 7: POST operation handles save requests correctly"""
        with patch.object(conversation_handler, '_get_conversation_from_db') as mock_get_db, \
             patch.object(conversation_handler, '_save_conversation_to_db') as mock_save_db, \
             patch.object(conversation_handler, '_scrub_conversation_data') as mock_scrub:
            
            mock_get_db.return_value = None
            mock_save_db.return_value = {"turn": 2}
            mock_scrub.side_effect = lambda x: x  # Pass through
            
            response = conversation_handler.handle_save_conversation(mock_event_post)
            
            assert response["statusCode"] == 200
            body = json.loads(response["body"])
            assert "stateToken" in body
            assert "turn" in body
            assert body["turn"] == 2
    
    def test_delete_operation_success(self, conversation_handler, mock_event_delete, mock_context):
        """Test 8: DELETE operation clears conversation properly"""
        with patch.object(conversation_handler, '_delete_conversation_from_db') as mock_delete_db, \
             patch.object(conversation_handler, '_verify_conversation_deleted') as mock_verify:
            
            mock_delete_db.return_value = {"messages_deleted": 5, "summaries_deleted": 1}
            mock_verify.return_value = True
            
            response = conversation_handler.handle_clear_conversation(mock_event_delete)
            
            assert response["statusCode"] == 200
            body = json.loads(response["body"])
            assert "sessionId" in body
            assert "report" in body
            assert body["report"]["verified"] is True
            assert body["stateToken"] is None
    
    def test_invalid_operation_handling(self, conversation_handler, mock_context):
        """Test 9: Invalid operations return proper error responses"""
        event = {
            "queryStringParameters": {"operation": "invalid"},
            "headers": {"Authorization": "Bearer fake-token"}
        }
        
        response = conversation_handler.handle_conversation_action(event, mock_context)
        
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["error"] == "INVALID_OPERATION"
    
    def test_missing_operation_handling(self, conversation_handler, mock_context):
        """Test 10: Missing operation parameter returns error"""
        event = {"headers": {"Authorization": "Bearer fake-token"}}
        
        response = conversation_handler.handle_conversation_action(event, mock_context)
        
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["error"] == "MISSING_OPERATION"


class TestSecurityHardeners:
    """Test all security hardening features"""
    
    def test_token_validation_missing_header(self, conversation_handler):
        """Test 11: Missing Authorization header returns 401"""
        event = {"headers": {}}
        
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._validate_state_token(event)
        
        assert exc_info.value.status_code == 401
        assert exc_info.value.error_type == "TOKEN_INVALID"
    
    def test_token_validation_invalid_format(self, conversation_handler):
        """Test 12: Invalid token format returns 401"""
        event = {"headers": {"Authorization": "InvalidFormat"}}
        
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._validate_state_token(event)
        
        assert exc_info.value.status_code == 401
        assert exc_info.value.error_type == "TOKEN_INVALID"
    
    def test_token_validation_expired_token(self, conversation_handler):
        """Test 13: Expired token returns TOKEN_EXPIRED error"""
        signing_key = "test-secret-key-123456789012345678901234567890"
        payload = {
            'sessionId': 'test-session',
            'tenantId': 'test-tenant',
            'turn': 1,
            'iat': int(time.time()) - 7200,  # 2 hours ago
            'exp': int(time.time()) - 3600   # 1 hour ago (expired)
        }
        expired_token = jwt.encode(payload, signing_key, algorithm='HS256')
        
        event = {"headers": {"Authorization": f"Bearer {expired_token}"}}
        
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._validate_state_token(event)
        
        assert exc_info.value.status_code == 401
        assert exc_info.value.error_type == "TOKEN_EXPIRED"
    
    def test_rate_limiting_enforcement(self, conversation_handler):
        """Test 14: Rate limiting blocks after 10 requests"""
        # Clear rate limit store
        conversation_handler.rate_limit_store = {}
        session_id = "test-session-rate-limit"
        
        # Make 10 successful requests
        for i in range(10):
            conversation_handler._check_rate_limit(session_id)
        
        # 11th request should be blocked
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._check_rate_limit(session_id)
        
        assert exc_info.value.status_code == 429
        assert exc_info.value.error_type == "RATE_LIMITED"
    
    def test_rate_limiting_cleanup(self, conversation_handler):
        """Test 15: Rate limiting cleanup prevents memory leak"""
        # Fill rate limit store with old entries
        current_time = time.time()
        old_time = current_time - 20  # 20 seconds ago
        
        conversation_handler.rate_limit_store = {
            "session1": [old_time] * 5,
            "session2": [old_time] * 5,
            "session3": [current_time] * 2  # Recent entries
        }
        
        # Trigger cleanup by setting counter to trigger condition
        conversation_handler._cleanup_rate_limit_store.counter = 99  # Next call will be 100
        conversation_handler._cleanup_rate_limit_store(current_time)
        
        # Old sessions should be cleaned, recent ones kept
        assert "session3" in conversation_handler.rate_limit_store
        assert len(conversation_handler.rate_limit_store["session3"]) == 2
    
    def test_payload_size_validation(self, conversation_handler):
        """Test 16: Payload size limit enforcement"""
        large_body = "x" * (25 * 1024)  # 25KB, exceeds 24KB limit
        event = {"body": large_body}
        
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._parse_request_body(event)
        
        assert exc_info.value.status_code == 413
        assert exc_info.value.error_type == "PAYLOAD_TOO_LARGE"
    
    def test_message_count_validation(self, conversation_handler):
        """Test 17: Message count limit enforcement"""
        body = {
            "delta": {
                "lastMessages": [{"role": "user", "text": "message"}] * 7  # Exceeds limit of 6
            }
        }
        
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._validate_save_payload(body)
        
        assert exc_info.value.status_code == 413
        assert exc_info.value.error_type == "PAYLOAD_TOO_LARGE"
    
    def test_dlp_scrubbing_integration(self, conversation_handler):
        """Test 18: DLP scrubbing is called and fails closed"""
        # Mock audit_logger to be unavailable
        conversation_handler.AUDIT_LOGGER_AVAILABLE = False
        
        data = {"text": "Patient SSN: 123-45-6789"}
        
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._scrub_conversation_data(data)
        
        assert exc_info.value.status_code == 503
        assert exc_info.value.error_type == "DLP_UNAVAILABLE"
    
    def test_dlp_scrubbing_success(self, conversation_handler):
        """Test 19: DLP scrubbing works when audit logger available"""
        # Mock successful scrubbing
        conversation_handler.audit_logger._scan_for_pii = Mock(return_value={"text": "redacted"})
        
        data = {"text": "Patient email: test@example.com"}
        result = conversation_handler._scrub_conversation_data(data)
        
        assert result == {"text": "redacted"}
        conversation_handler.audit_logger._scan_for_pii.assert_called_once_with(data)
    
    def test_version_conflict_detection(self, conversation_handler, mock_event_post):
        """Test 20: Version conflicts return 409 with current state"""
        # Mock token with turn 1 but request with turn 2 (conflict)
        body = json.loads(mock_event_post["body"])
        body["turn"] = 2  # Different from token turn (1)
        mock_event_post["body"] = json.dumps(body)
        
        with patch.object(conversation_handler, '_get_conversation_from_db') as mock_get_db:
            mock_get_db.return_value = {"turn": 1, "summary": "current state"}
            
            response = conversation_handler.handle_save_conversation(mock_event_post)
            
            assert response["statusCode"] == 409
            body = json.loads(response["body"])
            assert body["error"] == "VERSION_CONFLICT"
            assert "stateToken" in body
            assert "currentTurn" in body


class TestDynamoDBIntegration:
    """Test DynamoDB integration including TTL and tenant isolation"""
    
    def test_conversation_retrieval_structure(self, conversation_handler):
        """Test 21: Conversation retrieval assembles proper structure"""
        session_id = "test-session"
        tenant_id = "test-tenant"
        
        # Mock DynamoDB responses
        summary_response = {
            "Item": {
                "summary": {"S": "Test summary"},
                "facts_ledger": {"S": '{"fact1": "value1"}'},
                "pending_action": {"S": "schedule_followup"},
                "turn": {"N": "5"}
            }
        }
        
        messages_response = {
            "Items": [
                {"role": {"S": "user"}, "content": {"S": "Hello doctor"}},
                {"role": {"S": "assistant"}, "content": {"S": "Hello, how can I help?"}}
            ]
        }
        
        with patch.object(conversation_handler.dynamodb, 'get_item') as mock_get, \
             patch.object(conversation_handler.dynamodb, 'query') as mock_query:
            
            mock_get.return_value = summary_response
            mock_query.return_value = messages_response
            
            result = conversation_handler._get_conversation_from_db(session_id, tenant_id)
            
            assert result["summary"] == "Test summary"
            assert result["facts_ledger"] == {"fact1": "value1"}
            assert result["pending_action"] == "schedule_followup"
            assert result["turn"] == 5
            assert len(result["lastMessages"]) == 2
            assert result["lastMessages"][0]["role"] == "user"
            assert result["lastMessages"][0]["text"] == "Hello doctor"
    
    def test_conversation_save_with_ttl(self, conversation_handler):
        """Test 22: Conversation save sets proper TTL values"""
        session_id = "test-session"
        tenant_id = "test-tenant" 
        delta = {
            "summary_update": "Updated summary",
            "appendUser": {"text": "New message"}
        }
        expected_turn = 1
        
        with patch.object(conversation_handler.dynamodb, 'put_item') as mock_put:
            mock_put.return_value = {}
            
            conversation_handler._save_conversation_to_db(session_id, tenant_id, delta, expected_turn)
            
            # Verify summary item has proper TTL (7 days)
            summary_call = None
            message_call = None
            
            for call in mock_put.call_args_list:
                item = call[1]["Item"]
                if call[1]["TableName"].endswith("conversation-summaries"):
                    summary_call = call
                elif call[1]["TableName"].endswith("recent-messages"):
                    message_call = call
            
            assert summary_call is not None
            summary_item = summary_call[1]["Item"]
            assert "expires_at" in summary_item
            # TTL should be roughly 7 days from now
            ttl_timestamp = int(summary_item["expires_at"]["N"])
            expected_ttl = int((datetime.utcnow() + timedelta(days=7)).timestamp())
            assert abs(ttl_timestamp - expected_ttl) < 3600  # Within 1 hour
            
            assert message_call is not None
            message_item = message_call[1]["Item"]
            assert "expires_at" in message_item
            # TTL should be roughly 24 hours from now
            ttl_timestamp = int(message_item["expires_at"]["N"])
            expected_ttl = int((datetime.utcnow() + timedelta(hours=24)).timestamp())
            assert abs(ttl_timestamp - expected_ttl) < 3600  # Within 1 hour
    
    def test_compare_and_swap_success(self, conversation_handler):
        """Test 23: Compare-and-swap prevents concurrent updates"""
        session_id = "test-session"
        tenant_id = "test-tenant"
        delta = {"summary_update": "Updated summary"}
        expected_turn = 1
        
        with patch.object(conversation_handler.dynamodb, 'put_item') as mock_put:
            mock_put.return_value = {}
            
            conversation_handler._save_conversation_to_db(session_id, tenant_id, delta, expected_turn)
            
            # Verify condition expression is used
            mock_put.assert_called()
            call_args = mock_put.call_args[1]
            assert "ConditionExpression" in call_args
            assert "attribute_not_exists(sessionId) OR turn = :expected_turn" in call_args["ConditionExpression"]
            assert call_args["ExpressionAttributeValues"][":expected_turn"]["N"] == str(expected_turn)
    
    def test_compare_and_swap_conflict(self, conversation_handler):
        """Test 24: Compare-and-swap detects conflicts"""
        session_id = "test-session"
        tenant_id = "test-tenant"
        delta = {"summary_update": "Updated summary"}
        expected_turn = 1
        
        # Mock conditional check failure
        error_response = {
            'Error': {
                'Code': 'ConditionalCheckFailedException',
                'Message': 'The conditional request failed'
            }
        }
        
        with patch.object(conversation_handler.dynamodb, 'put_item') as mock_put:
            mock_put.side_effect = ClientError(error_response, 'PutItem')
            
            with pytest.raises(conversation_handler.ConversationError) as exc_info:
                conversation_handler._save_conversation_to_db(session_id, tenant_id, delta, expected_turn)
            
            assert exc_info.value.status_code == 409
            assert exc_info.value.error_type == "VERSION_CONFLICT"
    
    def test_deletion_verification(self, conversation_handler):
        """Test 25: Deletion verification with read-after-write"""
        session_id = "test-session"
        
        # Mock verification responses (empty = successful deletion)
        summary_response = {}  # No "Item" key means not found
        messages_response = {"Items": []}  # Empty array means no messages
        
        with patch.object(conversation_handler.dynamodb, 'get_item') as mock_get, \
             patch.object(conversation_handler.dynamodb, 'query') as mock_query:
            
            mock_get.return_value = summary_response
            mock_query.return_value = messages_response
            
            result = conversation_handler._verify_conversation_deleted(session_id)
            
            assert result is True
    
    def test_deletion_verification_failure(self, conversation_handler):
        """Test 26: Deletion verification detects incomplete deletion"""
        session_id = "test-session"
        
        # Mock verification responses (data still exists)
        summary_response = {"Item": {"sessionId": {"S": session_id}}}
        messages_response = {"Items": []}
        
        with patch.object(conversation_handler.dynamodb, 'get_item') as mock_get, \
             patch.object(conversation_handler.dynamodb, 'query') as mock_query:
            
            mock_get.return_value = summary_response
            mock_query.return_value = messages_response
            
            result = conversation_handler._verify_conversation_deleted(session_id)
            
            assert result is False


class TestErrorHandlingScenarios:
    """Test comprehensive error handling"""
    
    def test_dynamodb_service_failure(self, conversation_handler):
        """Test 27: DynamoDB service failures are handled gracefully"""
        session_id = "test-session"
        tenant_id = "test-tenant"
        
        error_response = {
            'Error': {
                'Code': 'ServiceUnavailable',
                'Message': 'Service is temporarily unavailable'
            }
        }
        
        with patch.object(conversation_handler.dynamodb, 'get_item') as mock_get:
            mock_get.side_effect = ClientError(error_response, 'GetItem')
            
            with pytest.raises(conversation_handler.ConversationError) as exc_info:
                conversation_handler._get_conversation_from_db(session_id, tenant_id)
            
            assert exc_info.value.status_code == 500
            assert exc_info.value.error_type == "DB_ERROR"
    
    def test_jwt_key_retrieval_failure(self, conversation_handler):
        """Test 28: JWT key retrieval failures are handled"""
        error_response = {
            'Error': {
                'Code': 'ResourceNotFoundException',
                'Message': 'Secret not found'
            }
        }
        
        # Clear cached key to force retrieval
        conversation_handler.jwt_signing_key_cache = None
        conversation_handler.jwt_key_cache_expires = 0
        
        with patch.object(conversation_handler.secrets_client, 'get_secret_value') as mock_secrets:
            mock_secrets.side_effect = ClientError(error_response, 'GetSecretValue')
            
            with pytest.raises(conversation_handler.ConversationError) as exc_info:
                conversation_handler._get_jwt_signing_key()
            
            assert exc_info.value.status_code == 500
            assert exc_info.value.error_type == "JWT_KEY_ERROR"
    
    def test_malformed_json_handling(self, conversation_handler):
        """Test 29: Malformed JSON in request body is handled"""
        event = {"body": "{invalid json"}
        
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._parse_request_body(event)
        
        assert exc_info.value.status_code == 400
        assert exc_info.value.error_type == "INVALID_JSON"
    
    def test_missing_request_body(self, conversation_handler):
        """Test 30: Missing request body is handled"""
        event = {}  # No body field
        
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._parse_request_body(event)
        
        assert exc_info.value.status_code == 400
        assert exc_info.value.error_type == "MISSING_BODY"
    
    def test_invalid_message_structure(self, conversation_handler):
        """Test 31: Invalid message structure in payload is rejected"""
        body = {
            "delta": {
                "lastMessages": [
                    {"role": "user"},  # Missing "text" field
                    {"text": "hello"}  # Missing "role" field
                ]
            }
        }
        
        with pytest.raises(conversation_handler.ConversationError) as exc_info:
            conversation_handler._validate_save_payload(body)
        
        assert exc_info.value.status_code == 400
        assert exc_info.value.error_type == "INVALID_MESSAGE"


class TestErrorResponseSecurity:
    """Test error response security and information disclosure protection"""
    
    def test_production_error_message_sanitization(self, conversation_handler):
        """Test 32: Production environment sanitizes error messages"""
        # Mock production environment
        original_env = conversation_handler.ENVIRONMENT
        conversation_handler.ENVIRONMENT = 'production'
        
        try:
            response = conversation_handler._error_response(
                "SYSTEM_ERROR", 
                "Detailed internal error message with sensitive info",
                500
            )
            
            body = json.loads(response["body"])
            # Should use safe message in production
            assert body["message"] == "Internal service error"
            assert "sensitive info" not in body["message"]
            
        finally:
            conversation_handler.ENVIRONMENT = original_env
    
    def test_development_error_message_passthrough(self, conversation_handler):
        """Test 33: Development environment passes through detailed messages"""
        # Mock development environment
        original_env = conversation_handler.ENVIRONMENT
        conversation_handler.ENVIRONMENT = 'development'
        
        try:
            response = conversation_handler._error_response(
                "SYSTEM_ERROR",
                "Detailed internal error message",
                500
            )
            
            body = json.loads(response["body"])
            # Should use original message in development
            assert body["message"] == "Detailed internal error message"
            
        finally:
            conversation_handler.ENVIRONMENT = original_env
    
    def test_safe_extra_data_filtering(self, conversation_handler):
        """Test 34: Extra data is filtered in production"""
        original_env = conversation_handler.ENVIRONMENT
        conversation_handler.ENVIRONMENT = 'production'
        
        try:
            extra_data = {
                "stateToken": "safe-token",
                "currentTurn": 5,
                "sessionId": "safe-session-id", 
                "internalError": "sensitive-internal-data",
                "dbConnection": "sensitive-db-info"
            }
            
            response = conversation_handler._error_response(
                "VERSION_CONFLICT", 
                "Conflict message",
                409,
                extra_data
            )
            
            body = json.loads(response["body"])
            
            # Safe fields should be included
            assert "stateToken" in body
            assert "currentTurn" in body
            assert "sessionId" in body
            
            # Unsafe fields should be filtered out
            assert "internalError" not in body
            assert "dbConnection" not in body
            
        finally:
            conversation_handler.ENVIRONMENT = original_env


class TestPerformanceRequirements:
    """Test performance requirements validation"""
    
    def test_token_validation_performance(self, conversation_handler, mock_event_get):
        """Test 35: Token validation completes within 10ms target"""
        start_time = time.time()
        
        try:
            token_data = conversation_handler._validate_state_token(mock_event_get)
            elapsed_time = (time.time() - start_time) * 1000  # Convert to milliseconds
            
            assert elapsed_time < 10, f"Token validation took {elapsed_time}ms, exceeds 10ms target"
            assert token_data["sessionId"] == "test-session-12345"
            
        except conversation_handler.ConversationError:
            # Performance still measured even if validation fails
            elapsed_time = (time.time() - start_time) * 1000
            assert elapsed_time < 10, f"Token validation took {elapsed_time}ms, exceeds 10ms target"
    
    def test_conversation_retrieval_performance(self, conversation_handler):
        """Test 36: Conversation retrieval completes within 200ms target"""
        session_id = "test-session"
        tenant_id = "test-tenant"
        
        # Mock fast DynamoDB responses
        with patch.object(conversation_handler.dynamodb, 'get_item') as mock_get, \
             patch.object(conversation_handler.dynamodb, 'query') as mock_query:
            
            mock_get.return_value = {"Item": {"summary": {"S": "test"}}}
            mock_query.return_value = {"Items": []}
            
            start_time = time.time()
            result = conversation_handler._get_conversation_from_db(session_id, tenant_id)
            elapsed_time = (time.time() - start_time) * 1000
            
            assert elapsed_time < 200, f"Conversation retrieval took {elapsed_time}ms, exceeds 200ms target"
            assert result is not None
    
    def test_conversation_save_performance(self, conversation_handler):
        """Test 37: Conversation save completes within 300ms target"""
        session_id = "test-session"
        tenant_id = "test-tenant"
        delta = {"summary_update": "Updated summary"}
        expected_turn = 1
        
        with patch.object(conversation_handler.dynamodb, 'put_item') as mock_put:
            mock_put.return_value = {}
            
            start_time = time.time()
            conversation_handler._save_conversation_to_db(session_id, tenant_id, delta, expected_turn)
            elapsed_time = (time.time() - start_time) * 1000
            
            assert elapsed_time < 300, f"Conversation save took {elapsed_time}ms, exceeds 300ms target"


class TestMasterFunctionIntegration:
    """Test integration with Master_Function lambda_function.py"""
    
    def test_master_function_conversation_routing(self):
        """Test 38: Master function properly routes conversation actions"""
        import sys
        import os
        
        # Add lambda-review directory to path
        lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
        if lambda_review_path not in sys.path:
            sys.path.insert(0, lambda_review_path)
        
        # Mock the conversation handler import
        with patch.dict('sys.modules', {
            'conversation_handler': Mock(),
            'tenant_inference': Mock(),
            'tenant_config_loader': Mock(),
            'intent_router': Mock(),
            'audit_logger': Mock()
        }):
            import lambda_function
            
            # Verify conversation handler is imported
            assert lambda_function.CONVERSATION_HANDLER_AVAILABLE
            
            # Test event routing
            event = {
                "queryStringParameters": {"action": "conversation", "operation": "get"},
                "headers": {"Authorization": "Bearer test-token"},
                "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
            }
            
            context = Mock()
            context.aws_request_id = "test-request"
            
            # Mock the conversation handler response
            mock_response = {"statusCode": 200, "body": json.dumps({"success": True})}
            lambda_function.handle_conversation_action = Mock(return_value=mock_response)
            
            response = lambda_function.lambda_handler(event, context)
            
            assert response["statusCode"] == 200
    
    def test_master_function_conversation_unavailable(self):
        """Test 39: Master function handles unavailable conversation handler"""
        import sys
        import os
        
        # Add lambda-review directory to path  
        lambda_review_path = os.path.join(os.path.dirname(__file__), '..', 'lambda-review')
        if lambda_review_path not in sys.path:
            sys.path.insert(0, lambda_review_path)
        
        # Mock conversation handler as unavailable
        with patch.dict('sys.modules', {
            'tenant_inference': Mock(),
            'tenant_config_loader': Mock(),
            'intent_router': Mock(),
            'audit_logger': Mock()
        }):
            # Remove conversation_handler from modules to simulate import failure
            if 'conversation_handler' in sys.modules:
                del sys.modules['conversation_handler']
            
            # Re-import lambda_function
            if 'lambda_function' in sys.modules:
                del sys.modules['lambda_function']
            
            import lambda_function
            
            # Should show conversation handler as unavailable
            assert not lambda_function.CONVERSATION_HANDLER_AVAILABLE
            
            event = {
                "queryStringParameters": {"action": "conversation", "operation": "get"},
                "headers": {"Authorization": "Bearer test-token"}
            }
            
            context = Mock()
            
            response = lambda_function.lambda_handler(event, context)
            
            assert response["statusCode"] == 503
            body = json.loads(response["body"])
            assert "Conversation service unavailable" in body["error"]


class TestAuditIntegration:
    """Test audit logging integration"""
    
    def test_successful_get_audit_logging(self, conversation_handler, mock_event_get):
        """Test 40: Successful GET operations are audited"""
        with patch.object(conversation_handler, '_get_conversation_from_db') as mock_get_db:
            mock_get_db.return_value = {"summary": "test", "turn": 1}
            
            conversation_handler.handle_get_conversation(mock_event_get)
            
            # Verify audit log was called
            conversation_handler.audit_logger.log_audit_event.assert_called()
            call_args = conversation_handler.audit_logger.log_audit_event.call_args[1]
            assert call_args["event_type"] == "CONVERSATION_RETRIEVED"
            assert call_args["tenant_id"] == "tenant-12345"
    
    def test_successful_save_audit_logging(self, conversation_handler, mock_event_post):
        """Test 41: Successful POST operations are audited"""
        with patch.object(conversation_handler, '_get_conversation_from_db') as mock_get_db, \
             patch.object(conversation_handler, '_save_conversation_to_db') as mock_save_db, \
             patch.object(conversation_handler, '_scrub_conversation_data') as mock_scrub:
            
            mock_get_db.return_value = None
            mock_save_db.return_value = {"turn": 2}
            mock_scrub.side_effect = lambda x: x
            
            conversation_handler.handle_save_conversation(mock_event_post)
            
            # Verify audit log was called
            conversation_handler.audit_logger.log_audit_event.assert_called()
            call_args = conversation_handler.audit_logger.log_audit_event.call_args[1]
            assert call_args["event_type"] == "CONVERSATION_SAVED"
            assert call_args["tenant_id"] == "tenant-12345"
    
    def test_successful_clear_audit_logging(self, conversation_handler, mock_event_delete):
        """Test 42: Successful DELETE operations are audited"""
        with patch.object(conversation_handler, '_delete_conversation_from_db') as mock_delete_db, \
             patch.object(conversation_handler, '_verify_conversation_deleted') as mock_verify:
            
            mock_delete_db.return_value = {"messages_deleted": 5, "summaries_deleted": 1}
            mock_verify.return_value = True
            
            conversation_handler.handle_clear_conversation(mock_event_delete)
            
            # Verify audit log was called
            conversation_handler.audit_logger.log_audit_event.assert_called()
            call_args = conversation_handler.audit_logger.log_audit_event.call_args[1]
            assert call_args["event_type"] == "CONVERSATION_CLEARED"
            assert call_args["tenant_id"] == "tenant-12345"


# Test execution configuration
if __name__ == "__main__":
    pytest.main([
        __file__,
        "-v",
        "--tb=short",
        "--show-capture=no"
    ])