#!/usr/bin/env python3
"""
Test script to verify Lambda conversation memory functionality locally
"""

import json
import sys
import os
import base64

# Add lambda-review directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lambda-review'))

from lambda_function import lambda_handler

def test_conversation_memory():
    """Test that conversation memory works through the Lambda"""
    
    print("🧪 Testing Lambda conversation memory...")
    
    # Test tenant hash
    tenant_hash = "my87674d777bf9"
    session_id = "test_session_123"
    
    # Step 1: Initialize session to get state token
    print("\n1️⃣ Initializing session...")
    init_event = {
        'httpMethod': 'POST',
        'queryStringParameters': {
            'action': 'init_session',
            't': tenant_hash
        },
        'body': json.dumps({
            'session_id': session_id
        })
    }
    
    init_response = lambda_handler(init_event, None)
    print(f"Init response status: {init_response['statusCode']}")
    
    if init_response['statusCode'] != 200:
        print(f"❌ Init failed: {init_response['body']}")
        return False
    
    init_data = json.loads(init_response['body'])
    state_token = init_data.get('state_token')
    print(f"✅ Got state token: {state_token[:30]}...")
    
    # Step 2: Send first message introducing ourselves
    print("\n2️⃣ Sending first message (introducing as Chris)...")
    
    chat_event_1 = {
        'httpMethod': 'POST',
        'headers': {
            'Authorization': f'Bearer {state_token}'
        },
        'queryStringParameters': {
            'action': 'chat',
            't': tenant_hash
        },
        'body': json.dumps({
            'tenant_hash': tenant_hash,
            'user_input': "Hi, my name is Chris and I'm a veteran looking for hospice care",
            'session_id': session_id,
            'conversation_id': session_id,
            'turn': 0,
            'conversation_context': {
                'messages': []
            }
        })
    }
    
    chat_response_1 = lambda_handler(chat_event_1, None)
    print(f"First chat response status: {chat_response_1['statusCode']}")
    
    if chat_response_1['statusCode'] != 200:
        print(f"❌ First chat failed: {chat_response_1['body']}")
        return False
    
    chat_data_1 = json.loads(chat_response_1['body'])
    print(f"✅ First response (truncated): {chat_data_1.get('content', '')[:200]}...")
    
    # Step 3: Send second message asking for our name
    print("\n3️⃣ Sending second message (asking 'What's my name?')...")
    
    # Build conversation context with previous messages
    conversation_messages = [
        {
            'role': 'user',
            'content': "Hi, my name is Chris and I'm a veteran looking for hospice care"
        },
        {
            'role': 'assistant',
            'content': chat_data_1.get('content', '')
        }
    ]
    
    chat_event_2 = {
        'httpMethod': 'POST',
        'headers': {
            'Authorization': f'Bearer {state_token}'
        },
        'queryStringParameters': {
            'action': 'chat',
            't': tenant_hash
        },
        'body': json.dumps({
            'tenant_hash': tenant_hash,
            'user_input': "What's my name?",
            'session_id': session_id,
            'conversation_id': session_id,
            'turn': 1,
            'conversation_context': {
                'messages': conversation_messages
            }
        })
    }
    
    chat_response_2 = lambda_handler(chat_event_2, None)
    print(f"Second chat response status: {chat_response_2['statusCode']}")
    
    if chat_response_2['statusCode'] != 200:
        print(f"❌ Second chat failed: {chat_response_2['body']}")
        return False
    
    chat_data_2 = json.loads(chat_response_2['body'])
    response_text = chat_data_2.get('content', '')
    print(f"✅ Second response: {response_text}")
    
    # Check if the response mentions "Chris"
    if 'Chris' in response_text:
        print("\n✅✅✅ SUCCESS! The Lambda remembered the user's name (Chris)!")
        return True
    else:
        print("\n❌ FAILED: The Lambda did not remember the user's name")
        print("Response should have mentioned 'Chris' but didn't")
        return False

if __name__ == "__main__":
    # Set up minimal environment
    os.environ['ENVIRONMENT'] = 'staging'
    
    try:
        success = test_conversation_memory()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)