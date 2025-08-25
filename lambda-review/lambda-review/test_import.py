#!/usr/bin/env python3
"""Test script to debug conversation_handler import issues"""

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("Testing imports step by step...")

# Test 1: Basic imports
try:
    import json
    print("✅ json imported")
except ImportError as e:
    print(f"❌ json import failed: {e}")

try:
    import boto3
    print("✅ boto3 imported")
except ImportError as e:
    print(f"❌ boto3 import failed: {e}")

try:
    import jwt
    print("✅ jwt imported")
except ImportError as e:
    print(f"❌ jwt import failed: {e}")

# Test 2: Local module imports
try:
    import aws_client_manager
    print("✅ aws_client_manager imported")
except ImportError as e:
    print(f"❌ aws_client_manager import failed: {e}")

try:
    import audit_logger
    print("✅ audit_logger imported")
except ImportError as e:
    print(f"❌ audit_logger import failed: {e}")

try:
    import token_blacklist
    print("✅ token_blacklist imported")
except ImportError as e:
    print(f"❌ token_blacklist import failed: {e}")

# Test 3: The main module
try:
    print("\nAttempting to import conversation_handler...")
    import conversation_handler
    print("✅ conversation_handler imported successfully!")
    
    # Check if key functions are available
    if hasattr(conversation_handler, 'handle_conversation_action'):
        print("✅ handle_conversation_action function found")
    if hasattr(conversation_handler, '_get_conversation_from_db'):
        print("✅ _get_conversation_from_db function found")
    if hasattr(conversation_handler, '_save_conversation_to_db'):
        print("✅ _save_conversation_to_db function found")
        
except ImportError as e:
    print(f"❌ conversation_handler import failed: {e}")
    import traceback
    print("\nFull traceback:")
    traceback.print_exc()
except Exception as e:
    print(f"❌ Unexpected error: {e}")
    import traceback
    print("\nFull traceback:")
    traceback.print_exc()

print("\nPython version:", sys.version)
print("Python executable:", sys.executable)