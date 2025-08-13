"""
Original Conversation Memory Failure Validation Testing

This module provides comprehensive testing specifically for the original conversation 
memory failure scenario that caused staging deployment failure. This was the critical 
issue identified in the staging assessment:

"Turn 4 conversation summary was a complete miss with no memory of previous conversations"

Original Failure Details:
- 4-turn conversation memory test failed completely
- Memory system was "FAILING" with 3 turns losing memory
- Summary test showed "FAILED" status
- Turn 4 had no recollection of previous conversation context
- Original assessment showed 0 turns completed successfully

Test Scenarios Validated:
1. 4-turn conversation memory retention across all turns
2. Context preservation between conversation saves
3. Summary generation that includes historical context
4. Message history maintenance across conversation lifecycle
5. Session persistence and state management
6. Memory retrieval performance under conversation load

Critical Success Criteria:
- 4-turn conversation completes with full memory retention
- Turn 4 summary includes context from turns 1-3
- Message history preserved across all conversation turns
- Context retrieval time <200ms for any turn
- Zero memory loss between conversation saves
- Summary quality demonstrates conversation understanding
"""

import pytest
import json
import time
import uuid
import jwt
import os
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
import boto3
from moto import mock_dynamodb2, mock_secretsmanager
from botocore.exceptions import ClientError

# Test markers
pytestmark = [
    pytest.mark.critical,
    pytest.mark.conversation,
    pytest.mark.memory,
    pytest.mark.regression,
    pytest.mark.integration
]


class TestOriginalConversationMemoryFailure:
    """
    Test suite specifically validating the original conversation memory failure is fixed
    """

    @pytest.fixture(autouse=True)
    def setup_conversation_environment(self):
        """Setup conversation memory testing environment"""
        os.environ.update({
            'ENVIRONMENT': 'test',
            'AWS_REGION': 'us-east-1',
            'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key',
            'DYNAMODB_SUMMARIES_TABLE': 'test-conversation-summaries',
            'DYNAMODB_MESSAGES_TABLE': 'test-recent-messages'
        })
        
        yield
        
        # Cleanup
        env_vars = [
            'ENVIRONMENT', 'AWS_REGION', 'JWT_SECRET_KEY_NAME',
            'DYNAMODB_SUMMARIES_TABLE', 'DYNAMODB_MESSAGES_TABLE'
        ]
        for var in env_vars:
            os.environ.pop(var, None)

    @pytest.fixture
    def conversation_test_secret_key(self):
        """Secret key for conversation testing"""
        return "conversation-memory-test-secret-key-for-authentication-validation"

    @pytest.fixture
    def original_failure_session_id(self):
        """Unique session ID representing the original failure scenario"""
        return f"original-failure-test-{int(time.time())}-{uuid.uuid4().hex[:8]}"

    @pytest.fixture
    def healthcare_conversation_scenario(self):
        """
        Healthcare conversation scenario that mirrors the original failure
        This represents the type of complex, multi-turn conversation that failed
        """
        return [
            {
                'turn': 1,
                'user_message': "Hi, I'm a 45-year-old patient with diabetes and high blood pressure. I've been experiencing some concerning symptoms lately.",
                'assistant_message': "Hello, I understand you're concerned about some symptoms. As someone with diabetes and high blood pressure, it's important we discuss these carefully. Can you tell me more about the specific symptoms you've been experiencing?",
                'expected_context': ['diabetes', 'high blood pressure', 'age 45', 'symptoms']
            },
            {
                'turn': 2,
                'user_message': "I've been having frequent headaches, especially in the morning, and sometimes I feel dizzy when I stand up. My blood sugar readings have also been more erratic than usual.",
                'assistant_message': "Thank you for providing those details. Morning headaches and dizziness when standing could be related to your blood pressure, and erratic blood sugar is concerning given your diabetes. Let me ask - are you currently taking medications for both conditions?",
                'expected_context': ['diabetes', 'high blood pressure', 'headaches', 'dizziness', 'erratic blood sugar', 'morning symptoms']
            },
            {
                'turn': 3,
                'user_message': "Yes, I take metformin for diabetes and lisinopril for blood pressure. I've been taking them as prescribed, but I'm wondering if my symptoms could be side effects or if my conditions are getting worse.",
                'assistant_message': "It's good that you're taking your medications as prescribed. Metformin and lisinopril are both effective treatments. The combination of morning headaches, dizziness, and erratic blood sugar could indicate your blood pressure isn't optimally controlled, or there could be other factors at play. Have you been monitoring your blood pressure at home?",
                'expected_context': ['metformin', 'lisinopril', 'diabetes', 'high blood pressure', 'morning headaches', 'dizziness', 'medication compliance']
            },
            {
                'turn': 4,
                'user_message': "I haven't been checking my blood pressure at home regularly. Can you help me understand what I should do next and summarize our conversation so I can discuss it with my doctor?",
                'assistant_message': "Absolutely, I'd be happy to help summarize our discussion and provide guidance for your next steps.",
                'expected_context': ['diabetes', 'high blood pressure', 'metformin', 'lisinopril', 'morning headaches', 'dizziness', 'erratic blood sugar', 'home monitoring', 'doctor discussion']
            }
        ]


class TestFourTurnConversationMemorySuccess:
    """Test the critical 4-turn conversation memory scenario that originally failed"""

    def test_original_failure_scenario_four_turn_success(self, setup_conversation_environment,
                                                        conversation_test_secret_key,
                                                        original_failure_session_id,
                                                        healthcare_conversation_scenario):
        """
        CRITICAL: Test the exact 4-turn conversation scenario that originally failed
        
        This test validates the specific failure from the staging assessment:
        "Turn 4 conversation summary was a complete miss with no memory of previous conversations"
        
        Success criteria:
        - All 4 turns complete successfully
        - Turn 4 summary includes context from turns 1-3
        - No memory loss between any turns
        - Context quality demonstrates understanding
        """
        with mock_dynamodb2(), mock_secretsmanager():
            # Setup AWS services
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': conversation_test_secret_key})
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
                conversation_handler.jwt_signing_key_cache = conversation_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                # Track conversation state across all turns
                conversation_states = []
                turn_performance = []
                
                # Execute the 4-turn conversation that originally failed
                for turn_data in healthcare_conversation_scenario:
                    turn_number = turn_data['turn']
                    
                    print(f"Executing Turn {turn_number}: Testing memory retention...")
                    
                    # Create JWT token for this turn
                    current_time = int(time.time())
                    jwt_payload = {
                        'sessionId': original_failure_session_id,
                        'tenantId': 'healthcare_tenant_original_failure',
                        'turn': turn_number,
                        'iat': current_time,
                        'exp': current_time + 3600
                    }
                    jwt_token = jwt.encode(jwt_payload, conversation_test_secret_key, algorithm='HS256')
                    
                    # SAVE operation for this turn
                    save_event = {
                        "httpMethod": "POST",
                        "queryStringParameters": {"operation": "save"},
                        "headers": {"Authorization": f"Bearer {jwt_token}"},
                        "body": json.dumps({
                            "sessionId": original_failure_session_id,
                            "turn": turn_number,
                            "delta": {
                                "summary_update": f"Turn {turn_number}: {turn_data['user_message'][:100]}... Discussion about {', '.join(turn_data['expected_context'][:3])}",
                                "appendUser": {"text": turn_data['user_message']},
                                "appendAssistant": {"text": turn_data['assistant_message']}
                            }
                        }),
                        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                    }
                    
                    # Measure save performance
                    save_start = time.perf_counter()
                    
                    with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                        save_response = conversation_handler.handle_save_conversation(save_event)
                    
                    save_time = (time.perf_counter() - save_start) * 1000
                    turn_performance.append(('save', turn_number, save_time))
                    
                    # Validate save succeeded
                    assert save_response["statusCode"] == 200, f"Turn {turn_number} save must succeed (original failure point)"
                    
                    # GET operation to verify memory retention
                    get_event = {
                        "httpMethod": "GET",
                        "queryStringParameters": {"operation": "get"},
                        "headers": {"Authorization": f"Bearer {jwt_token}"},
                        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                    }
                    
                    # Measure retrieval performance
                    get_start = time.perf_counter()
                    get_response = conversation_handler.handle_get_conversation(get_event)
                    get_time = (time.perf_counter() - get_start) * 1000
                    turn_performance.append(('get', turn_number, get_time))
                    
                    # Validate retrieval succeeded
                    assert get_response["statusCode"] == 200, f"Turn {turn_number} get must succeed (original failure point)"
                    
                    # Extract and validate conversation state
                    response_body = json.loads(get_response["body"])
                    conversation_state = response_body["state"]
                    conversation_states.append((turn_number, conversation_state))
                    
                    # CRITICAL: Validate memory retention for this turn
                    assert conversation_state is not None, f"Turn {turn_number} must have conversation state"
                    assert "summary" in conversation_state, f"Turn {turn_number} must have summary"
                    assert "lastMessages" in conversation_state, f"Turn {turn_number} must have message history"
                    assert "turn" in conversation_state, f"Turn {turn_number} must track turn number"
                    
                    # Validate turn number progression
                    assert conversation_state["turn"] == turn_number, f"Turn number should be {turn_number}"
                    
                    # Validate message count increases with each turn
                    expected_message_count = turn_number * 2  # User + Assistant per turn
                    actual_message_count = len(conversation_state["lastMessages"])
                    assert actual_message_count >= expected_message_count - 2, \
                        f"Turn {turn_number} should have at least {expected_message_count-2} messages, got {actual_message_count}"
                    
                    # Validate context accumulation
                    summary = conversation_state["summary"].lower()
                    context_found = sum(1 for context in turn_data['expected_context'] if context.lower() in summary)
                    min_expected_context = max(1, len(turn_data['expected_context']) // 2)
                    assert context_found >= min_expected_context, \
                        f"Turn {turn_number} summary should contain at least {min_expected_context} context items, found {context_found}"
                    
                    print(f"Turn {turn_number} SUCCESS: Memory retained, context preserved")
                
                # CRITICAL VALIDATION: Turn 4 comprehensive memory test
                final_turn, final_state = conversation_states[-1]
                assert final_turn == 4, "Should have completed all 4 turns"
                
                # Turn 4 summary must demonstrate memory of entire conversation
                final_summary = final_state["summary"].lower()
                final_messages = final_state["lastMessages"]
                
                # Memory validation: All critical conversation elements must be present in Turn 4
                critical_context = [
                    'diabetes', 'high blood pressure', 'headaches', 'dizziness', 
                    'metformin', 'lisinopril', 'blood sugar', 'symptoms'
                ]
                
                context_retention_count = sum(1 for context in critical_context if context.lower() in final_summary)
                context_retention_percentage = (context_retention_count / len(critical_context)) * 100
                
                # ORIGINAL FAILURE POINT: Turn 4 must remember conversation context
                assert context_retention_percentage >= 75, \
                    f"Turn 4 must remember ≥75% of conversation context, got {context_retention_percentage:.1f}% ({context_retention_count}/{len(critical_context)} items)"
                
                # Message history validation
                assert len(final_messages) >= 6, f"Turn 4 should have ≥6 messages (user+assistant per turn), got {len(final_messages)}"
                
                # Performance validation: All operations should be fast
                slow_operations = [(op, turn, time_ms) for op, turn, time_ms in turn_performance if time_ms > 200]
                assert len(slow_operations) == 0, f"No operations should exceed 200ms: {slow_operations}"
                
                print(f"SUCCESS: Original failure scenario fixed!")
                print(f"- 4 turns completed successfully")
                print(f"- Context retention: {context_retention_percentage:.1f}%")
                print(f"- Final message count: {len(final_messages)}")
                print(f"- Average performance: {sum(time_ms for _, _, time_ms in turn_performance) / len(turn_performance):.1f}ms")

    def test_conversation_memory_context_quality_validation(self, setup_conversation_environment,
                                                           conversation_test_secret_key,
                                                           healthcare_conversation_scenario):
        """
        Test conversation memory maintains high-quality context across turns
        """
        with mock_dynamodb2(), mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': conversation_test_secret_key})
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
                conversation_handler.jwt_signing_key_cache = conversation_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                session_id = f"context-quality-test-{int(time.time())}"
                
                # Execute conversation with context quality tracking
                for turn_data in healthcare_conversation_scenario:
                    turn_number = turn_data['turn']
                    
                    current_time = int(time.time())
                    jwt_payload = {
                        'sessionId': session_id,
                        'tenantId': 'context_quality_tenant',
                        'turn': turn_number,
                        'iat': current_time,
                        'exp': current_time + 3600
                    }
                    jwt_token = jwt.encode(jwt_payload, conversation_test_secret_key, algorithm='HS256')
                    
                    # Save conversation turn with rich context
                    save_event = {
                        "httpMethod": "POST",
                        "queryStringParameters": {"operation": "save"},
                        "headers": {"Authorization": f"Bearer {jwt_token}"},
                        "body": json.dumps({
                            "sessionId": session_id,
                            "turn": turn_number,
                            "delta": {
                                "summary_update": f"Turn {turn_number}: Patient with diabetes and hypertension discusses {', '.join(turn_data['expected_context'][:5])}. Key symptoms and medications reviewed.",
                                "appendUser": {"text": turn_data['user_message']},
                                "appendAssistant": {"text": turn_data['assistant_message']},
                                "facts_ledger": {
                                    "medical_conditions": ["diabetes", "high blood pressure"],
                                    "medications": ["metformin", "lisinopril"] if turn_number >= 3 else [],
                                    "symptoms": ["headaches", "dizziness", "erratic blood sugar"] if turn_number >= 2 else []
                                }
                            }
                        }),
                        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                    }
                    
                    with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                        save_response = conversation_handler.handle_save_conversation(save_event)
                    
                    assert save_response["statusCode"] == 200, f"Context quality save for turn {turn_number} should succeed"
                    
                    # Retrieve and validate context quality
                    get_event = {
                        "httpMethod": "GET",
                        "queryStringParameters": {"operation": "get"},
                        "headers": {"Authorization": f"Bearer {jwt_token}"},
                        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                    }
                    
                    get_response = conversation_handler.handle_get_conversation(get_event)
                    assert get_response["statusCode"] == 200, f"Context quality get for turn {turn_number} should succeed"
                    
                    conversation_state = json.loads(get_response["body"])["state"]
                    
                    # Validate progressive context accumulation
                    summary = conversation_state["summary"]
                    
                    if turn_number >= 2:
                        # Should have medical context
                        assert any(condition in summary.lower() for condition in ['diabetes', 'blood pressure']), \
                            f"Turn {turn_number} should maintain medical condition context"
                    
                    if turn_number >= 3:
                        # Should have medication context  
                        assert any(med in summary.lower() for med in ['metformin', 'lisinopril']), \
                            f"Turn {turn_number} should maintain medication context"
                    
                    if turn_number == 4:
                        # Turn 4 should have comprehensive context
                        context_elements = ['diabetes', 'blood pressure', 'headaches', 'dizziness', 'metformin', 'lisinopril']
                        found_elements = [elem for elem in context_elements if elem.lower() in summary.lower()]
                        context_completeness = len(found_elements) / len(context_elements)
                        
                        assert context_completeness >= 0.7, \
                            f"Turn 4 context should be ≥70% complete, got {context_completeness:.1%} ({found_elements})"

    def test_conversation_memory_under_error_conditions(self, setup_conversation_environment,
                                                       conversation_test_secret_key):
        """
        Test conversation memory resilience under error conditions
        """
        with mock_dynamodb2(), mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': conversation_test_secret_key})
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
                conversation_handler.jwt_signing_key_cache = conversation_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                session_id = f"error-resilience-test-{int(time.time())}"
                
                # Establish baseline conversation
                current_time = int(time.time())
                jwt_payload = {
                    'sessionId': session_id,
                    'tenantId': 'error_resilience_tenant',
                    'turn': 1,
                    'iat': current_time,
                    'exp': current_time + 3600
                }
                jwt_token = jwt.encode(jwt_payload, conversation_test_secret_key, algorithm='HS256')
                
                # Save initial conversation
                save_event = {
                    "httpMethod": "POST",
                    "queryStringParameters": {"operation": "save"},
                    "headers": {"Authorization": f"Bearer {jwt_token}"},
                    "body": json.dumps({
                        "sessionId": session_id,
                        "turn": 1,
                        "delta": {
                            "summary_update": "Initial conversation about patient symptoms and medical history",
                            "appendUser": {"text": "I have been experiencing symptoms"},
                            "appendAssistant": {"text": "Tell me more about your symptoms"}
                        }
                    }),
                    "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                }
                
                with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                    save_response = conversation_handler.handle_save_conversation(save_event)
                
                assert save_response["statusCode"] == 200, "Baseline conversation should save successfully"
                
                # Simulate error condition - corrupted data
                jwt_payload['turn'] = 2
                jwt_token = jwt.encode(jwt_payload, conversation_test_secret_key, algorithm='HS256')
                
                corrupted_save_event = {
                    "httpMethod": "POST",
                    "queryStringParameters": {"operation": "save"},
                    "headers": {"Authorization": f"Bearer {jwt_token}"},
                    "body": json.dumps({
                        "sessionId": session_id,
                        "turn": 2,
                        "delta": {
                            "summary_update": None,  # Corrupted data
                            "appendUser": {"text": ""},  # Empty message
                            "appendAssistant": None  # Corrupted message
                        }
                    }),
                    "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                }
                
                # System should handle corrupted data gracefully
                with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                    corrupted_response = conversation_handler.handle_save_conversation(corrupted_save_event)
                
                # Should either handle gracefully or fail with proper error
                assert corrupted_response["statusCode"] in [200, 400], "Should handle corrupted data gracefully"
                
                # Verify original conversation memory is preserved
                get_event = {
                    "httpMethod": "GET",
                    "queryStringParameters": {"operation": "get"},
                    "headers": {"Authorization": f"Bearer {jwt_token}"},
                    "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                }
                
                get_response = conversation_handler.handle_get_conversation(get_event)
                assert get_response["statusCode"] == 200, "Should still be able to retrieve conversation after error"
                
                conversation_state = json.loads(get_response["body"])["state"]
                assert "symptoms" in conversation_state["summary"].lower(), "Original memory should be preserved despite error"


class TestConversationMemoryPerformanceRegression:
    """Test conversation memory performance doesn't regress under load"""

    def test_conversation_memory_performance_under_load(self, setup_conversation_environment,
                                                       conversation_test_secret_key):
        """
        Test conversation memory performance under concurrent load
        """
        with mock_dynamodb2(), mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': conversation_test_secret_key})
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
                conversation_handler.jwt_signing_key_cache = conversation_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                # Test multiple conversation sessions simultaneously
                performance_results = []
                
                for session_num in range(10):
                    session_id = f"load-test-session-{session_num}"
                    
                    for turn in range(1, 5):  # 4-turn conversation
                        current_time = int(time.time())
                        jwt_payload = {
                            'sessionId': session_id,
                            'tenantId': f'load_test_tenant_{session_num}',
                            'turn': turn,
                            'iat': current_time,
                            'exp': current_time + 3600
                        }
                        jwt_token = jwt.encode(jwt_payload, conversation_test_secret_key, algorithm='HS256')
                        
                        save_event = {
                            "httpMethod": "POST",
                            "queryStringParameters": {"operation": "save"},
                            "headers": {"Authorization": f"Bearer {jwt_token}"},
                            "body": json.dumps({
                                "sessionId": session_id,
                                "turn": turn,
                                "delta": {
                                    "summary_update": f"Session {session_num} Turn {turn}: Load testing conversation memory performance",
                                    "appendUser": {"text": f"Load test message {session_num}-{turn}"},
                                    "appendAssistant": {"text": f"Response to load test {session_num}-{turn}"}
                                }
                            }),
                            "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                        }
                        
                        # Measure save performance
                        save_start = time.perf_counter()
                        
                        with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                            save_response = conversation_handler.handle_save_conversation(save_event)
                        
                        save_time = (time.perf_counter() - save_start) * 1000
                        
                        # Measure get performance
                        get_event = {
                            "httpMethod": "GET",
                            "queryStringParameters": {"operation": "get"},
                            "headers": {"Authorization": f"Bearer {jwt_token}"},
                            "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                        }
                        
                        get_start = time.perf_counter()
                        get_response = conversation_handler.handle_get_conversation(get_event)
                        get_time = (time.perf_counter() - get_start) * 1000
                        
                        performance_results.append({
                            'session': session_num,
                            'turn': turn,
                            'save_time': save_time,
                            'get_time': get_time,
                            'save_success': save_response["statusCode"] == 200,
                            'get_success': get_response["statusCode"] == 200
                        })
                        
                        # Each operation should meet performance targets
                        assert save_time < 200, f"Save time {save_time:.2f}ms should be <200ms"
                        assert get_time < 200, f"Get time {get_time:.2f}ms should be <200ms"
                
                # Analyze overall performance
                save_times = [r['save_time'] for r in performance_results if r['save_success']]
                get_times = [r['get_time'] for r in performance_results if r['get_success']]
                
                import statistics
                avg_save_time = statistics.mean(save_times)
                avg_get_time = statistics.mean(get_times)
                success_rate = len([r for r in performance_results if r['save_success'] and r['get_success']]) / len(performance_results)
                
                # Performance under load should still be excellent
                assert avg_save_time < 150, f"Average save time under load {avg_save_time:.2f}ms should be <150ms"
                assert avg_get_time < 150, f"Average get time under load {avg_get_time:.2f}ms should be <150ms"
                assert success_rate >= 0.95, f"Success rate {success_rate:.1%} should be ≥95%"

    def test_conversation_memory_large_context_handling(self, setup_conversation_environment,
                                                       conversation_test_secret_key):
        """
        Test conversation memory handles large context efficiently
        """
        with mock_dynamodb2(), mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            secrets_client.create_secret(
                Name='test-picasso/jwt/signing-key',
                SecretString=json.dumps({'signingKey': conversation_test_secret_key})
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
                conversation_handler.jwt_signing_key_cache = conversation_test_secret_key
                conversation_handler.jwt_key_cache_expires = time.time() + 3600
                
                session_id = f"large-context-test-{int(time.time())}"
                
                # Create conversation with progressively larger context
                for turn in range(1, 5):
                    current_time = int(time.time())
                    jwt_payload = {
                        'sessionId': session_id,
                        'tenantId': 'large_context_tenant',
                        'turn': turn,
                        'iat': current_time,
                        'exp': current_time + 3600
                    }
                    jwt_token = jwt.encode(jwt_payload, conversation_test_secret_key, algorithm='HS256')
                    
                    # Create large message content
                    large_user_message = f"This is turn {turn} with extensive medical history. " * 50  # ~2500 chars
                    large_assistant_message = f"Comprehensive response for turn {turn} including detailed analysis. " * 50  # ~3500 chars
                    
                    save_event = {
                        "httpMethod": "POST",
                        "queryStringParameters": {"operation": "save"},
                        "headers": {"Authorization": f"Bearer {jwt_token}"},
                        "body": json.dumps({
                            "sessionId": session_id,
                            "turn": turn,
                            "delta": {
                                "summary_update": f"Turn {turn}: Extensive conversation with detailed medical history and comprehensive analysis covering multiple symptoms, medications, and treatment plans",
                                "appendUser": {"text": large_user_message},
                                "appendAssistant": {"text": large_assistant_message}
                            }
                        }),
                        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                    }
                    
                    # Measure performance with large context
                    start_time = time.perf_counter()
                    
                    with patch.object(conversation_handler, '_scrub_conversation_data', side_effect=lambda x: x):
                        save_response = conversation_handler.handle_save_conversation(save_event)
                    
                    save_time = (time.perf_counter() - start_time) * 1000
                    
                    assert save_response["statusCode"] == 200, f"Large context save for turn {turn} should succeed"
                    assert save_time < 300, f"Large context save time {save_time:.2f}ms should be <300ms"
                    
                    # Verify retrieval performance with large context
                    get_event = {
                        "httpMethod": "GET",
                        "queryStringParameters": {"operation": "get"},
                        "headers": {"Authorization": f"Bearer {jwt_token}"},
                        "requestContext": {"identity": {"sourceIp": "192.168.1.1"}}
                    }
                    
                    get_start = time.perf_counter()
                    get_response = conversation_handler.handle_get_conversation(get_event)
                    get_time = (time.perf_counter() - get_start) * 1000
                    
                    assert get_response["statusCode"] == 200, f"Large context get for turn {turn} should succeed"
                    assert get_time < 300, f"Large context get time {get_time:.2f}ms should be <300ms"
                    
                    # Verify memory integrity with large context
                    conversation_state = json.loads(get_response["body"])["state"]
                    assert len(conversation_state["lastMessages"]) >= turn * 2, f"Should maintain message history even with large context"
                    assert f"turn {turn}" in conversation_state["summary"].lower(), f"Should maintain context from turn {turn}"


if __name__ == "__main__":
    pytest.main([
        __file__,
        "-v",
        "--tb=short",
        "--show-capture=no"
    ])