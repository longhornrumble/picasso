"""
PICASSO Conversation Endpoint Implementation
Secure conversation state management with healthcare compliance
Implements all security hardeners as specified in the implementation plan
"""

import json
import logging
import time
import boto3
import os
import hmac
import hashlib
import uuid
import jwt
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Union
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Environment Configuration
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'staging')
SUMMARIES_TABLE_NAME = os.environ.get('SUMMARIES_TABLE_NAME', f'{ENVIRONMENT}-conversation-summaries')
MESSAGES_TABLE_NAME = os.environ.get('MESSAGES_TABLE_NAME', f'{ENVIRONMENT}-recent-messages')
JWT_SECRET_KEY_NAME = os.environ.get('JWT_SECRET_KEY_NAME', 'picasso/jwt/signing-key')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Security Limits (hardcoded as per spec)
RATE_LIMIT_REQUESTS = 10
RATE_LIMIT_WINDOW = 10  # seconds
MAX_PAYLOAD_SIZE = 24 * 1024  # 24KB
MAX_MESSAGES_PER_SAVE = 6
STATE_TOKEN_EXPIRY_HOURS = 24

# TTL Configuration (healthcare compliance)
SUMMARY_TTL_DAYS = 7
MESSAGES_TTL_HOURS = 24

# AWS Clients
dynamodb = boto3.client('dynamodb', region_name=AWS_REGION)
secrets_client = boto3.client('secretsmanager', region_name=AWS_REGION)

# Global state for rate limiting and JWT key caching
rate_limit_store = {}
jwt_signing_key_cache = None
jwt_key_cache_expires = 0

# Import audit logger
try:
    from audit_logger import audit_logger
    AUDIT_LOGGER_AVAILABLE = True
    logger.info("✅ audit_logger module loaded for conversation handler")
except ImportError as e:
    logger.warning(f"⚠️ audit_logger not available: {e}")
    AUDIT_LOGGER_AVAILABLE = False

class ConversationError(Exception):
    """Base exception for conversation operations"""
    def __init__(self, error_type: str, message: str, status_code: int = 500):
        self.error_type = error_type
        self.message = message
        self.status_code = status_code
        super().__init__(message)

def handle_conversation_action(event, context):
    """
    Main router for conversation actions
    Routes to GET/POST/DELETE operations with full security hardening
    """
    try:
        # Extract operation from query parameters
        query_params = event.get("queryStringParameters") or {}
        operation = query_params.get("operation")
        
        if not operation:
            return _error_response("MISSING_OPERATION", "Operation parameter required", 400)
        
        # Route to appropriate handler
        if operation == "get":
            return handle_get_conversation(event)
        elif operation == "save":
            return handle_save_conversation(event)
        elif operation == "clear":
            return handle_clear_conversation(event)
        else:
            return _error_response("INVALID_OPERATION", f"Unknown operation: {operation}", 400)
            
    except ConversationError as e:
        return _error_response(e.error_type, e.message, e.status_code)
    except Exception as e:
        logger.exception("❌ Critical error in conversation handler")
        return _error_response("SYSTEM_ERROR", "Internal server error", 500)

def handle_get_conversation(event):
    """
    GET Operation: Retrieve conversation state
    Security: State token validation, turn rotation
    """
    try:
        # 1. Validate and parse state token
        token_data = _validate_state_token(event)
        session_id = token_data['sessionId']
        tenant_id = token_data['tenantId']
        current_turn = token_data['turn']
        
        # 2. Rate limiting check
        _check_rate_limit(session_id)
        
        logger.info(f"[{tenant_id[:8]}...] 📖 Getting conversation state for session {session_id[:12]}...")
        
        # 3. Retrieve conversation state from DynamoDB
        conversation_state = _get_conversation_from_db(session_id, tenant_id)
        
        # 4. Generate new rotated token
        new_token = _generate_rotated_token(token_data)
        
        # 5. Audit successful retrieval
        if AUDIT_LOGGER_AVAILABLE:
            audit_logger._log_audit_event(
                tenant_id=tenant_id,
                event_type='CONVERSATION_RETRIEVED',
                session_id=session_id,
                context={'turn': current_turn + 1, 'has_state': bool(conversation_state)}
            )
        
        # 6. Return response with rotated token
        response_data = {
            "sessionId": session_id,
            "state": conversation_state,
            "stateToken": new_token
        }
        
        return _success_response(response_data)
        
    except ConversationError:
        raise
    except Exception as e:
        logger.exception("❌ Error retrieving conversation")
        raise ConversationError("RETRIEVAL_FAILED", str(e), 500)

def handle_save_conversation(event):
    """
    POST Operation: Save conversation state with delta updates
    Security: Compare-and-swap, DLP scrubbing, payload validation
    """
    try:
        # 1. Validate and parse state token
        token_data = _validate_state_token(event)
        session_id = token_data['sessionId']
        tenant_id = token_data['tenantId']
        current_turn = token_data['turn']
        
        # 2. Rate limiting check
        _check_rate_limit(session_id)
        
        # 3. Parse and validate request body
        body = _parse_request_body(event)
        request_turn = body.get('turn')
        delta = body.get('delta', {})
        
        if not request_turn or request_turn != current_turn:
            # Version conflict - return server's current state
            current_state = _get_conversation_from_db(session_id, tenant_id)
            server_token = _generate_rotated_token(token_data, increment_turn=False)
            
            return _error_response(
                "VERSION_CONFLICT",
                "Conversation state changed by another session",
                409,
                extra_data={
                    "stateToken": server_token,
                    "currentTurn": current_turn
                }
            )
        
        # 4. Validate payload limits
        _validate_save_payload(body)
        
        logger.info(f"[{tenant_id[:8]}...] 💾 Saving conversation delta for session {session_id[:12]}...")
        
        # 5. Apply DLP scrubbing to delta
        scrubbed_delta = _scrub_conversation_data(delta)
        
        # 6. Compare-and-swap update to DynamoDB
        updated_state = _save_conversation_to_db(session_id, tenant_id, scrubbed_delta, current_turn)
        
        # 7. Generate new rotated token
        new_token = _generate_rotated_token(token_data)
        
        # 8. Audit successful save
        if AUDIT_LOGGER_AVAILABLE:
            audit_logger._log_audit_event(
                tenant_id=tenant_id,
                event_type='CONVERSATION_SAVED',
                session_id=session_id,
                context={
                    'turn': current_turn + 1,
                    'delta_keys': list(scrubbed_delta.keys()),
                    'message_count': len(scrubbed_delta.get('lastMessages', []))
                }
            )
        
        # 9. Return success with rotated token
        response_data = {
            "stateToken": new_token,
            "turn": current_turn + 1
        }
        
        return _success_response(response_data)
        
    except ConversationError:
        raise
    except Exception as e:
        logger.exception("❌ Error saving conversation")
        raise ConversationError("SAVE_FAILED", str(e), 500)

def handle_clear_conversation(event):
    """
    DELETE Operation: Clear conversation with verified deletion
    Security: Read-after-write verification, comprehensive audit
    """
    try:
        # 1. Validate and parse state token
        token_data = _validate_state_token(event)
        session_id = token_data['sessionId']
        tenant_id = token_data['tenantId']
        
        # 2. Rate limiting check
        _check_rate_limit(session_id)
        
        logger.info(f"[{tenant_id[:8]}...] 🧹 Clearing conversation for session {session_id[:12]}...")
        
        # 3. Delete from both tables
        deletion_report = _delete_conversation_from_db(session_id, tenant_id)
        
        # 4. Verify deletion with read-after-write
        verification_result = _verify_conversation_deleted(session_id)
        
        # 5. Audit successful clear
        if AUDIT_LOGGER_AVAILABLE:
            audit_logger._log_audit_event(
                tenant_id=tenant_id,
                event_type='CONVERSATION_CLEARED',
                session_id=session_id,
                context={
                    'messages_deleted': deletion_report['messages_deleted'],
                    'summaries_deleted': deletion_report['summaries_deleted'],
                    'verified': verification_result
                }
            )
        
        # 6. Return deletion report
        response_data = {
            "sessionId": session_id,
            "report": {
                "messages_deleted": deletion_report['messages_deleted'],
                "summaries_deleted": deletion_report['summaries_deleted'],
                "verified": verification_result
            },
            "stateToken": None  # No token after clear
        }
        
        return _success_response(response_data)
        
    except ConversationError:
        raise
    except Exception as e:
        logger.exception("❌ Error clearing conversation")
        raise ConversationError("CLEAR_FAILED", str(e), 500)

def _validate_state_token(event):
    """
    Validate HMAC/JWT state token and extract claims
    Security hardener: Token validation with expiry check
    """
    try:
        # Extract Bearer token from Authorization header
        headers = event.get("headers", {}) or {}
        auth_header = headers.get("Authorization") or headers.get("authorization")
        
        if not auth_header or not auth_header.startswith("Bearer "):
            raise ConversationError("TOKEN_INVALID", "Missing or invalid Authorization header", 401)
        
        token = auth_header[7:]  # Remove "Bearer " prefix
        
        # Get JWT signing key
        signing_key = _get_jwt_signing_key()
        
        # Decode and validate JWT
        try:
            payload = jwt.decode(token, signing_key, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            raise ConversationError("TOKEN_EXPIRED", "State token has expired", 401)
        except jwt.InvalidTokenError as e:
            raise ConversationError("TOKEN_INVALID", f"Invalid token: {str(e)}", 401)
        
        # Validate required fields
        required_fields = ['sessionId', 'tenantId', 'turn', 'iat', 'exp']
        for field in required_fields:
            if field not in payload:
                raise ConversationError("TOKEN_INVALID", f"Missing required field: {field}", 401)
        
        logger.info(f"[{payload['tenantId'][:8]}...] ✅ Valid state token for turn {payload['turn']}")
        return payload
        
    except ConversationError:
        raise
    except Exception as e:
        logger.error(f"❌ Token validation error: {str(e)}")
        raise ConversationError("TOKEN_INVALID", "Token validation failed", 401)

def _check_rate_limit(session_id):
    """
    Rate limiting: 10 requests per 10 seconds per session
    Security hardener: Prevent abuse with memory leak protection
    """
    current_time = time.time()
    window_start = current_time - RATE_LIMIT_WINDOW
    
    # Periodic cleanup to prevent memory leak
    _cleanup_rate_limit_store(current_time)
    
    # Clean old entries for this session
    if session_id in rate_limit_store:
        rate_limit_store[session_id] = [
            timestamp for timestamp in rate_limit_store[session_id]
            if timestamp > window_start
        ]
    else:
        rate_limit_store[session_id] = []
    
    # Check if limit exceeded
    if len(rate_limit_store[session_id]) >= RATE_LIMIT_REQUESTS:
        raise ConversationError("RATE_LIMITED", "Too many requests", 429)
    
    # Add current request
    rate_limit_store[session_id].append(current_time)

def _cleanup_rate_limit_store(current_time):
    """
    Cleanup expired rate limit entries to prevent memory leak
    Security fix: Prevent unbounded memory growth
    """
    global rate_limit_store
    
    # Only cleanup every 100 requests to avoid performance impact
    cleanup_counter = getattr(_cleanup_rate_limit_store, 'counter', 0) + 1
    _cleanup_rate_limit_store.counter = cleanup_counter
    
    if cleanup_counter % 100 == 0:
        window_start = current_time - RATE_LIMIT_WINDOW
        sessions_to_remove = []
        
        for session_id, timestamps in rate_limit_store.items():
            # Remove expired timestamps
            active_timestamps = [ts for ts in timestamps if ts > window_start]
            if active_timestamps:
                rate_limit_store[session_id] = active_timestamps
            else:
                sessions_to_remove.append(session_id)
        
        # Remove empty sessions
        for session_id in sessions_to_remove:
            del rate_limit_store[session_id]
        
        logger.info(f"🧹 Rate limit cleanup: removed {len(sessions_to_remove)} expired sessions")

def _parse_request_body(event):
    """
    Parse and validate request body
    Security hardener: Payload size validation
    """
    body_str = event.get("body", "")
    if not body_str:
        raise ConversationError("MISSING_BODY", "Request body required", 400)
    
    # Check payload size
    body_size = len(body_str.encode('utf-8'))
    if body_size > MAX_PAYLOAD_SIZE:
        raise ConversationError("PAYLOAD_TOO_LARGE", f"Payload size {body_size} exceeds {MAX_PAYLOAD_SIZE} bytes", 413)
    
    try:
        return json.loads(body_str)
    except json.JSONDecodeError as e:
        raise ConversationError("INVALID_JSON", f"Invalid JSON in request body: {str(e)}", 400)

def _validate_save_payload(body):
    """
    Validate save operation payload
    Security hardener: Message count and structure validation
    """
    delta = body.get('delta', {})
    
    # Validate message count in lastMessages
    last_messages = delta.get('lastMessages', [])
    if len(last_messages) > MAX_MESSAGES_PER_SAVE:
        raise ConversationError("PAYLOAD_TOO_LARGE", f"Too many messages: {len(last_messages)} > {MAX_MESSAGES_PER_SAVE}", 413)
    
    # Validate message structure
    for msg in last_messages:
        if not isinstance(msg, dict) or 'role' not in msg or 'text' not in msg:
            raise ConversationError("INVALID_MESSAGE", "Messages must have 'role' and 'text' fields", 400)

def _scrub_conversation_data(data):
    """
    DLP scrubbing pipeline using audit_logger patterns
    Security hardener: PII protection with fail-safe
    Security fix: Fail-closed approach - reject operation if scrubbing fails
    """
    if not AUDIT_LOGGER_AVAILABLE:
        logger.error("❌ DLP scrubbing unavailable - audit_logger not loaded")
        raise ConversationError("DLP_UNAVAILABLE", "Data protection service unavailable", 503)
    
    try:
        # Use audit_logger's PII scanning
        scrubbed_data = audit_logger._scan_for_pii(data)
        logger.info("🛡️ Applied DLP scrubbing to conversation data")
        
        # Validate that scrubbing actually occurred by checking for redacted patterns
        data_str = json.dumps(data, separators=(',', ':'))
        scrubbed_str = json.dumps(scrubbed_data, separators=(',', ':'))
        
        # If data contains potential PII patterns, ensure scrubbing happened
        if len(data_str) > 50 and data_str == scrubbed_str:
            # Quick check for common PII patterns that should have been scrubbed
            import re
            email_pattern = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
            phone_pattern = re.compile(r'\b\d{3}-?\d{3}-?\d{4}\b')
            
            if email_pattern.search(scrubbed_str) or phone_pattern.search(scrubbed_str):
                logger.error("❌ DLP scrubbing verification failed - PII detected in output")
                raise ConversationError("DLP_FAILED", "Data protection validation failed", 500)
        
        return scrubbed_data
    except ConversationError:
        raise
    except Exception as e:
        logger.error(f"❌ DLP scrubbing failed: {str(e)}")
        # Fail-closed: reject the operation rather than storing unscrubbed data
        raise ConversationError("DLP_FAILED", "Data protection service error", 500)

def _get_conversation_from_db(session_id, tenant_id):
    """
    Retrieve conversation state from DynamoDB tables
    """
    try:
        # Get summary from conversation-summaries table
        summary_response = dynamodb.get_item(
            TableName=SUMMARIES_TABLE_NAME,
            Key={'sessionId': {'S': session_id}}
        )
        
        # Get recent messages from recent-messages table
        messages_response = dynamodb.query(
            TableName=MESSAGES_TABLE_NAME,
            KeyConditionExpression='sessionId = :sid',
            ExpressionAttributeValues={':sid': {'S': session_id}},
            ScanIndexForward=True,  # Oldest first
            Limit=50  # Reasonable limit
        )
        
        # Build state object
        state = {}
        
        if 'Item' in summary_response:
            item = summary_response['Item']
            state = {
                'summary': item.get('summary', {}).get('S', ''),
                'facts_ledger': json.loads(item.get('facts_ledger', {}).get('S', '{}')),
                'pending_action': item.get('pending_action', {}).get('S'),
                'turn': int(item.get('turn', {}).get('N', '0'))
            }
        
        if 'Items' in messages_response and messages_response['Items']:
            messages = []
            for item in messages_response['Items']:
                messages.append({
                    'role': item.get('role', {}).get('S', ''),
                    'text': item.get('content', {}).get('S', '')
                })
            state['lastMessages'] = messages
        
        return state if state else None
        
    except ClientError as e:
        logger.error(f"❌ DynamoDB error retrieving conversation: {e}")
        raise ConversationError("DB_ERROR", "Database error during retrieval", 500)

def _save_conversation_to_db(session_id, tenant_id, delta, expected_turn):
    """
    Save conversation state to DynamoDB with compare-and-swap
    Security hardener: Concurrency control
    """
    try:
        current_time = datetime.utcnow()
        summary_ttl = int((current_time + timedelta(days=SUMMARY_TTL_DAYS)).timestamp())
        message_ttl = int((current_time + timedelta(hours=MESSAGES_TTL_HOURS)).timestamp())
        
        # Update summary if provided
        if any(key in delta for key in ['summary_update', 'facts_update', 'pending_action']):
            summary_item = {
                'sessionId': {'S': session_id},
                'tenantId': {'S': tenant_id},
                'turn': {'N': str(expected_turn + 1)},
                'updatedAt': {'S': current_time.isoformat() + 'Z'},
                'expires_at': {'N': str(summary_ttl)}
            }
            
            if 'summary_update' in delta:
                summary_item['summary'] = {'S': delta['summary_update']}
            if 'facts_update' in delta:
                summary_item['facts_ledger'] = {'S': json.dumps(delta['facts_update'])}
            if 'pending_action' in delta:
                summary_item['pending_action'] = {'S': delta['pending_action']}
            
            # Compare-and-swap: only update if turn matches
            try:
                dynamodb.put_item(
                    TableName=SUMMARIES_TABLE_NAME,
                    Item=summary_item,
                    ConditionExpression='attribute_not_exists(sessionId) OR turn = :expected_turn',
                    ExpressionAttributeValues={':expected_turn': {'N': str(expected_turn)}}
                )
            except ClientError as e:
                if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                    raise ConversationError("VERSION_CONFLICT", "Concurrent update detected", 409)
                raise
        
        # Save new messages if provided
        if 'appendUser' in delta or 'appendAssistant' in delta:
            timestamp_base = int(current_time.timestamp() * 1000)  # milliseconds
            
            for i, (role, message_data) in enumerate([
                ('user', delta.get('appendUser')),
                ('assistant', delta.get('appendAssistant'))
            ]):
                if message_data:
                    message_item = {
                        'sessionId': {'S': session_id},
                        'timestamp': {'N': str(timestamp_base + i)},
                        'messageId': {'S': str(uuid.uuid4())},
                        'role': {'S': role},
                        'content': {'S': message_data.get('text', '')},
                        'expires_at': {'N': str(message_ttl)}
                    }
                    
                    dynamodb.put_item(
                        TableName=MESSAGES_TABLE_NAME,
                        Item=message_item
                    )
        
        logger.info(f"[{tenant_id[:8]}...] ✅ Conversation saved successfully")
        
    except ConversationError:
        raise
    except ClientError as e:
        logger.error(f"❌ DynamoDB error saving conversation: {e}")
        raise ConversationError("DB_ERROR", "Database error during save", 500)

def _delete_conversation_from_db(session_id, tenant_id):
    """
    Delete conversation from both tables with counting
    """
    try:
        messages_deleted = 0
        summaries_deleted = 0
        
        # Delete from messages table
        messages_response = dynamodb.query(
            TableName=MESSAGES_TABLE_NAME,
            KeyConditionExpression='sessionId = :sid',
            ExpressionAttributeValues={':sid': {'S': session_id}},
            ProjectionExpression='sessionId, #ts',
            ExpressionAttributeNames={'#ts': 'timestamp'}
        )
        
        for item in messages_response.get('Items', []):
            dynamodb.delete_item(
                TableName=MESSAGES_TABLE_NAME,
                Key={
                    'sessionId': {'S': session_id},
                    'timestamp': item['timestamp']
                }
            )
            messages_deleted += 1
        
        # Delete from summaries table
        try:
            dynamodb.delete_item(
                TableName=SUMMARIES_TABLE_NAME,
                Key={'sessionId': {'S': session_id}}
            )
            summaries_deleted = 1
        except ClientError as e:
            if e.response['Error']['Code'] != 'ResourceNotFoundException':
                raise
        
        return {
            'messages_deleted': messages_deleted,
            'summaries_deleted': summaries_deleted
        }
        
    except ClientError as e:
        logger.error(f"❌ DynamoDB error deleting conversation: {e}")
        raise ConversationError("DB_ERROR", "Database error during deletion", 500)

def _verify_conversation_deleted(session_id):
    """
    Verify deletion with read-after-write
    Security hardener: Verified clear operation
    """
    try:
        # Check summaries table
        summary_response = dynamodb.get_item(
            TableName=SUMMARIES_TABLE_NAME,
            Key={'sessionId': {'S': session_id}}
        )
        
        # Check messages table
        messages_response = dynamodb.query(
            TableName=MESSAGES_TABLE_NAME,
            KeyConditionExpression='sessionId = :sid',
            ExpressionAttributeValues={':sid': {'S': session_id}},
            Limit=1
        )
        
        # Verification passes if both tables are empty
        summary_empty = 'Item' not in summary_response
        messages_empty = not messages_response.get('Items', [])
        
        verified = summary_empty and messages_empty
        logger.info(f"🔍 Deletion verification: {'✅ PASSED' if verified else '❌ FAILED'}")
        
        return verified
        
    except ClientError as e:
        logger.error(f"❌ DynamoDB error during verification: {e}")
        return False

def _generate_rotated_token(token_data, increment_turn=True):
    """
    Generate new state token with incremented turn
    Security hardener: Token rotation
    """
    try:
        signing_key = _get_jwt_signing_key()
        
        new_payload = {
            'sessionId': token_data['sessionId'],
            'tenantId': token_data['tenantId'],
            'turn': token_data['turn'] + (1 if increment_turn else 0),
            'iat': int(time.time()),
            'exp': int(time.time()) + (STATE_TOKEN_EXPIRY_HOURS * 3600)
        }
        
        return jwt.encode(new_payload, signing_key, algorithm='HS256')
        
    except Exception as e:
        logger.error(f"❌ Token generation error: {str(e)}")
        raise ConversationError("TOKEN_GENERATION_FAILED", "Failed to generate new token", 500)

def _get_jwt_signing_key():
    """
    Get JWT signing key from AWS Secrets Manager with secure caching
    Security fix: Reduced cache time to 60 seconds for better key rotation support
    """
    global jwt_signing_key_cache, jwt_key_cache_expires
    
    current_time = time.time()
    if jwt_signing_key_cache and current_time < jwt_key_cache_expires:
        return jwt_signing_key_cache
    
    try:
        response = secrets_client.get_secret_value(SecretId=JWT_SECRET_KEY_NAME)
        key = response['SecretString']
        
        # Validate key format before caching
        if not key or len(key) < 32:
            logger.error("❌ Invalid JWT signing key format")
            raise ConversationError("JWT_KEY_ERROR", "Invalid signing key", 500)
        
        jwt_signing_key_cache = key
        jwt_key_cache_expires = current_time + 60  # Reduced to 60 seconds for security
        return jwt_signing_key_cache
    except ClientError as e:
        logger.error(f"❌ Failed to get JWT signing key: {e}")
        # Clear cache on failure
        jwt_signing_key_cache = None
        jwt_key_cache_expires = 0
        raise ConversationError("JWT_KEY_ERROR", "Authentication service unavailable", 500)

def _success_response(data):
    """Create successful response with CORS headers"""
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS"
        },
        "body": json.dumps(data, separators=(',', ':'))
    }

def _error_response(error_type, message, status_code, extra_data=None):
    """
    Create typed error response for client handling
    Security hardener: Standardized error contract with information disclosure protection
    Security fix: Sanitize error messages to prevent internal information disclosure
    """
    # Sanitize error messages in production to avoid revealing internal details
    production_env = ENVIRONMENT.lower() == 'production'
    
    # Safe error messages for production
    safe_messages = {
        "TOKEN_INVALID": "Invalid authentication token",
        "TOKEN_EXPIRED": "Authentication token expired",
        "VERSION_CONFLICT": "Conversation state changed by another session",
        "RATE_LIMITED": "Too many requests",
        "PAYLOAD_TOO_LARGE": "Request payload too large",
        "DLP_FAILED": "Data protection validation failed",
        "DLP_UNAVAILABLE": "Data protection service unavailable",
        "DB_ERROR": "Database service temporarily unavailable",
        "SYSTEM_ERROR": "Internal service error"
    }
    
    # Use safe message in production or original message in development
    safe_message = safe_messages.get(error_type, "Service error") if production_env else message
    
    error_data = {
        "error": error_type,
        "message": safe_message
    }
    
    # Only include extra data in non-production environments or for safe fields
    if extra_data:
        safe_extra_fields = {'stateToken', 'currentTurn', 'sessionId'}
        if production_env:
            # Only include safe fields in production
            safe_extra = {k: v for k, v in extra_data.items() if k in safe_extra_fields}
            error_data.update(safe_extra)
        else:
            error_data.update(extra_data)
    
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS"
        },
        "body": json.dumps(error_data, separators=(',', ':'))
    }