#!/usr/bin/env python3
"""
Local test script for the Bedrock streaming handler
"""

import json
import os

# Set environment variables for testing
os.environ['CONFIG_BUCKET'] = 'myrecruiter-picasso'

# Import the handler
from bedrock_streaming_handler import lambda_handler

def test_streaming():
    """Test the streaming handler locally"""
    
    # Test event simulating a POST request
    test_event = {
        'httpMethod': 'POST',
        'body': json.dumps({
            'tenant_hash': 'my87674d777bf9',  # MyRecruiter default tenant
            'session_id': 'test_session_123',
            'user_input': 'Hello, what services do you offer?'
        })
    }
    
    print("Testing streaming handler...")
    print("-" * 50)
    
    try:
        # Call the handler
        result = lambda_handler(test_event, None)
        
        print(f"Status Code: {result['statusCode']}")
        print(f"Headers: {json.dumps(result['headers'], indent=2)}")
        
        # Parse SSE body
        body = result['body']
        print("\nSSE Response Body:")
        print("-" * 30)
        
        # Split by SSE data lines
        lines = body.split('\n')
        for line in lines[:10]:  # Show first 10 lines
            if line.startswith('data: '):
                try:
                    data = line[6:]  # Remove 'data: ' prefix
                    if data != '[DONE]':
                        parsed = json.loads(data)
                        print(f"  Type: {parsed.get('type')}, Content: {parsed.get('content', '')[:50]}")
                except:
                    print(f"  {line}")
        
        if len(lines) > 10:
            print(f"  ... and {len(lines) - 10} more lines")
            
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_streaming()