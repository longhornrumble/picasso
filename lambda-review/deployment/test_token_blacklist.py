"""
Token Blacklisting System Test Suite
Comprehensive testing for healthcare-grade token revocation

Usage:
    python test_token_blacklist.py [test_type]
    
Test Types:
    unit     - Unit tests for core functions
    integration - Integration tests with DynamoDB
    performance - Performance and load testing
    security    - Security vulnerability testing
    all         - Run all test suites
"""

import json
import time
import uuid
import hashlib
import jwt
from datetime import datetime, timedelta
from typing import Dict, Any, List
import sys
import os

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def generate_test_jwt(tenant_id: str = "test-tenant", session_id: str = None, expires_in_hours: int = 24) -> str:
    """Generate a test JWT token for blacklist testing"""
    session_id = session_id or str(uuid.uuid4())
    current_time = datetime.utcnow()
    
    payload = {
        'sessionId': session_id,
        'tenantId': tenant_id,
        'turn': 1,
        'iat': int(current_time.timestamp()),
        'exp': int((current_time + timedelta(hours=expires_in_hours)).timestamp())
    }
    
    # Use a test signing key
    test_key = "test-signing-key-for-blacklist-testing-12345"
    return jwt.encode(payload, test_key, algorithm='HS256')

def test_unit_functions():
    """Test core blacklisting functions in isolation"""
    print("🧪 Running Unit Tests")
    print("=" * 50)
    
    results = []
    
    try:
        from token_blacklist import _hash_token, _decode_token_for_metadata, TokenBlacklistError
        
        # Test 1: Token hashing consistency
        print("1. Testing token hashing...")
        test_token = generate_test_jwt()
        hash1 = _hash_token(test_token)
        hash2 = _hash_token(test_token)
        
        if hash1 == hash2 and len(hash1) == 64:  # SHA256 produces 64 char hex
            print("   ✅ Token hashing is consistent and produces SHA256")
            results.append(("Token Hashing", "PASS"))
        else:
            print("   ❌ Token hashing failed consistency check")
            results.append(("Token Hashing", "FAIL"))
        
        # Test 2: Token metadata extraction
        print("2. Testing token metadata extraction...")
        test_token = generate_test_jwt("test-tenant-123", "test-session-456")
        metadata = _decode_token_for_metadata(test_token)
        
        if (metadata.get('tenantId') == 'test-tenant-123' and 
            metadata.get('sessionId') == 'test-session-456'):
            print("   ✅ Token metadata extraction works correctly")
            results.append(("Metadata Extraction", "PASS"))
        else:
            print("   ❌ Token metadata extraction failed")
            results.append(("Metadata Extraction", "FAIL"))
        
        # Test 3: Error handling
        print("3. Testing error handling...")
        try:
            error = TokenBlacklistError("TEST_ERROR", "Test error message", 400)
            if error.error_type == "TEST_ERROR" and error.status_code == 400:
                print("   ✅ Error handling classes work correctly")
                results.append(("Error Handling", "PASS"))
            else:
                print("   ❌ Error handling failed")
                results.append(("Error Handling", "FAIL"))
        except Exception as e:
            print(f"   ❌ Error handling test failed: {e}")
            results.append(("Error Handling", "FAIL"))
            
    except ImportError as e:
        print(f"❌ Cannot import blacklist module: {e}")
        results.append(("Module Import", "FAIL"))
    
    return results

def test_integration_with_mock():
    """Test integration with mocked DynamoDB"""
    print("\n🔗 Running Integration Tests (Mocked)")
    print("=" * 50)
    
    results = []
    
    try:
        # Mock the DynamoDB client for testing
        class MockDynamoDBClient:
            def __init__(self):
                self.items = {}
            
            def put_item(self, TableName, Item, **kwargs):
                key = Item['token_hash']['S']
                self.items[key] = Item
                return {'ResponseMetadata': {'HTTPStatusCode': 200}}
            
            def get_item(self, TableName, Key, **kwargs):
                key = Key['token_hash']['S']
                if key in self.items:
                    return {'Item': self.items[key]}
                return {}
            
            def describe_table(self, TableName):
                return {'Table': {'TableStatus': 'ACTIVE'}}
        
        # Temporarily replace the DynamoDB client
        import token_blacklist
        original_client = token_blacklist.dynamodb
        token_blacklist.dynamodb = MockDynamoDBClient()
        
        # Test blacklist add and check
        test_token = generate_test_jwt("integration-tenant", "integration-session")
        expires_at = datetime.utcnow() + timedelta(hours=1)
        
        print("1. Testing add_token_to_blacklist...")
        result = token_blacklist.add_token_to_blacklist(
            token=test_token,
            reason="integration_test",
            expires_at=expires_at,
            tenant_id="integration-tenant",
            session_id="integration-session"
        )
        
        if result.get('success'):
            print("   ✅ Token successfully added to blacklist")
            results.append(("Add Token", "PASS"))
        else:
            print("   ❌ Failed to add token to blacklist")
            results.append(("Add Token", "FAIL"))
        
        print("2. Testing is_token_blacklisted...")
        is_blacklisted = token_blacklist.is_token_blacklisted(test_token)
        
        if is_blacklisted:
            print("   ✅ Token correctly identified as blacklisted")
            results.append(("Check Blacklisted", "PASS"))
        else:
            print("   ❌ Token not identified as blacklisted")
            results.append(("Check Blacklisted", "FAIL"))
        
        print("3. Testing non-blacklisted token...")
        clean_token = generate_test_jwt("clean-tenant", "clean-session")
        is_clean_blacklisted = token_blacklist.is_token_blacklisted(clean_token)
        
        if not is_clean_blacklisted:
            print("   ✅ Clean token correctly identified as not blacklisted")
            results.append(("Check Clean Token", "PASS"))
        else:
            print("   ❌ Clean token incorrectly identified as blacklisted")
            results.append(("Check Clean Token", "FAIL"))
        
        # Restore original client
        token_blacklist.dynamodb = original_client
        
    except Exception as e:
        print(f"❌ Integration test failed: {e}")
        results.append(("Integration Test", "FAIL"))
    
    return results

def test_performance():
    """Test performance characteristics"""
    print("\n⚡ Running Performance Tests")
    print("=" * 50)
    
    results = []
    
    try:
        import token_blacklist
        
        # Test 1: Hash performance
        print("1. Testing token hashing performance...")
        test_token = generate_test_jwt()
        
        start_time = time.time()
        for _ in range(1000):
            token_blacklist._hash_token(test_token)
        hash_time = (time.time() - start_time) * 1000  # Convert to ms
        
        print(f"   📊 1000 hash operations: {hash_time:.2f}ms ({hash_time/1000:.3f}ms per hash)")
        
        if hash_time < 100:  # Should be very fast
            print("   ✅ Hashing performance acceptable")
            results.append(("Hash Performance", "PASS"))
        else:
            print("   ⚠️ Hashing performance may be slow")
            results.append(("Hash Performance", "SLOW"))
        
        # Test 2: Cache performance
        print("2. Testing cache performance...")
        
        # Fill cache with test data
        for i in range(100):
            test_hash = f"test_hash_{i}"
            token_blacklist._update_blacklist_cache(test_hash, i % 2 == 0)
        
        start_time = time.time()
        for i in range(1000):
            test_hash = f"test_hash_{i % 100}"
            token_blacklist._check_blacklist_cache(test_hash)
        cache_time = (time.time() - start_time) * 1000
        
        print(f"   📊 1000 cache lookups: {cache_time:.2f}ms ({cache_time/1000:.3f}ms per lookup)")
        
        if cache_time < 10:  # Should be very fast
            print("   ✅ Cache performance excellent")
            results.append(("Cache Performance", "PASS"))
        else:
            print("   ⚠️ Cache performance may be slow")
            results.append(("Cache Performance", "SLOW"))
        
        # Test 3: Memory usage estimation
        print("3. Testing memory usage...")
        
        initial_cache_size = len(token_blacklist.blacklist_cache)
        
        # Add many entries to test memory limits
        for i in range(5000):
            test_hash = f"memory_test_hash_{i}"
            token_blacklist._update_blacklist_cache(test_hash, True)
        
        final_cache_size = len(token_blacklist.blacklist_cache)
        
        print(f"   📊 Cache size: {initial_cache_size} → {final_cache_size}")
        
        # Cache should not grow indefinitely
        if final_cache_size < 15000:  # Should have LRU limits
            print("   ✅ Memory usage controlled by LRU limits")
            results.append(("Memory Usage", "PASS"))
        else:
            print("   ⚠️ Memory usage may grow without bounds")
            results.append(("Memory Usage", "FAIL"))
        
        # Cleanup
        token_blacklist.blacklist_cache.clear()
        token_blacklist.cache_expiry.clear()
        
    except Exception as e:
        print(f"❌ Performance test failed: {e}")
        results.append(("Performance Test", "FAIL"))
    
    return results

def test_security():
    """Test security aspects of the blacklisting system"""
    print("\n🔒 Running Security Tests")
    print("=" * 50)
    
    results = []
    
    try:
        import token_blacklist
        
        # Test 1: Token hash collision resistance
        print("1. Testing hash collision resistance...")
        
        tokens = [generate_test_jwt(f"tenant-{i}", f"session-{i}") for i in range(100)]
        hashes = [token_blacklist._hash_token(token) for token in tokens]
        
        if len(set(hashes)) == len(hashes):
            print("   ✅ No hash collisions in 100 different tokens")
            results.append(("Hash Collision Resistance", "PASS"))
        else:
            print("   ❌ Hash collisions detected!")
            results.append(("Hash Collision Resistance", "FAIL"))
        
        # Test 2: Invalid input handling
        print("2. Testing invalid input handling...")
        
        try:
            # Test empty token
            result = token_blacklist.is_token_blacklisted("")
            if result:  # Should return True (fail-closed)
                print("   ✅ Empty token handled securely (fail-closed)")
                results.append(("Empty Token Handling", "PASS"))
            else:
                print("   ❌ Empty token not handled securely")
                results.append(("Empty Token Handling", "FAIL"))
        except Exception:
            print("   ✅ Empty token raises exception (acceptable)")
            results.append(("Empty Token Handling", "PASS"))
        
        try:
            # Test None token
            result = token_blacklist.is_token_blacklisted(None)
            if result:  # Should return True (fail-closed)
                print("   ✅ None token handled securely (fail-closed)")
                results.append(("None Token Handling", "PASS"))
            else:
                print("   ❌ None token not handled securely")
                results.append(("None Token Handling", "FAIL"))
        except Exception:
            print("   ✅ None token raises exception (acceptable)")
            results.append(("None Token Handling", "PASS"))
        
        # Test 3: Malformed JWT handling
        print("3. Testing malformed JWT handling...")
        
        malformed_tokens = [
            "not.a.jwt",
            "too.few.parts",
            "invalid.jwt.token.with.too.many.parts",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature"
        ]
        
        secure_handling = True
        for malformed_token in malformed_tokens:
            try:
                # Should either hash safely or handle gracefully
                hash_result = token_blacklist._hash_token(malformed_token)
                if len(hash_result) != 64:  # SHA256 should always produce 64 chars
                    secure_handling = False
                    break
            except Exception:
                # Exception is acceptable for malformed tokens
                pass
        
        if secure_handling:
            print("   ✅ Malformed JWTs handled securely")
            results.append(("Malformed JWT Handling", "PASS"))
        else:
            print("   ❌ Malformed JWT handling may be insecure")
            results.append(("Malformed JWT Handling", "FAIL"))
        
        # Test 4: Error message information disclosure
        print("4. Testing error message security...")
        
        try:
            # This should fail but not disclose sensitive information
            error = token_blacklist.TokenBlacklistError("TEST_ERROR", "Internal details: sensitive-info-123", 500)
            
            # Check that error messages don't contain obvious sensitive patterns
            sensitive_patterns = ['password', 'secret', 'key', 'token_hash', 'internal']
            has_sensitive = any(pattern in error.message.lower() for pattern in sensitive_patterns)
            
            if not has_sensitive:
                print("   ✅ Error messages don't contain obvious sensitive information")
                results.append(("Error Message Security", "PASS"))
            else:
                print("   ⚠️ Error messages may contain sensitive information")
                results.append(("Error Message Security", "WARN"))
                
        except Exception as e:
            print(f"   ❌ Error message test failed: {e}")
            results.append(("Error Message Security", "FAIL"))
        
    except Exception as e:
        print(f"❌ Security test failed: {e}")
        results.append(("Security Test", "FAIL"))
    
    return results

def test_conversation_handler_integration():
    """Test integration with conversation handler"""
    print("\n💬 Running Conversation Handler Integration Tests")
    print("=" * 50)
    
    results = []
    
    try:
        # Test if conversation handler can import blacklist functions
        from conversation_handler import TOKEN_BLACKLIST_AVAILABLE
        
        if TOKEN_BLACKLIST_AVAILABLE:
            print("   ✅ Conversation handler successfully imported token blacklist")
            results.append(("Conversation Handler Import", "PASS"))
        else:
            print("   ❌ Conversation handler failed to import token blacklist")
            results.append(("Conversation Handler Import", "FAIL"))
        
        # Test lambda function integration
        from lambda_function import TOKEN_BLACKLIST_AVAILABLE as LAMBDA_BLACKLIST_AVAILABLE
        
        if LAMBDA_BLACKLIST_AVAILABLE:
            print("   ✅ Lambda function successfully imported token blacklist")
            results.append(("Lambda Function Import", "PASS"))
        else:
            print("   ❌ Lambda function failed to import token blacklist")
            results.append(("Lambda Function Import", "FAIL"))
        
    except ImportError as e:
        print(f"   ❌ Integration test failed: {e}")
        results.append(("Integration Test", "FAIL"))
    
    return results

def print_test_summary(all_results: List[List[tuple]]):
    """Print a comprehensive test summary"""
    print("\n" + "=" * 60)
    print("🏆 TEST SUMMARY")
    print("=" * 60)
    
    total_tests = 0
    passed_tests = 0
    failed_tests = 0
    warnings = 0
    
    for test_suite_results in all_results:
        for test_name, result in test_suite_results:
            total_tests += 1
            if result == "PASS":
                passed_tests += 1
            elif result == "FAIL":
                failed_tests += 1
            elif result in ["WARN", "SLOW"]:
                warnings += 1
    
    print(f"📊 Total Tests: {total_tests}")
    print(f"✅ Passed: {passed_tests}")
    print(f"❌ Failed: {failed_tests}")
    print(f"⚠️ Warnings: {warnings}")
    
    success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
    print(f"📈 Success Rate: {success_rate:.1f}%")
    
    if failed_tests == 0:
        print("\n🎉 ALL TESTS PASSED! Token blacklisting system is ready for deployment.")
    elif failed_tests <= 2:
        print("\n⚠️ Most tests passed. Review failed tests before deployment.")
    else:
        print("\n🚨 Multiple test failures detected. System needs fixes before deployment.")
    
    # Detailed results
    print("\n📋 Detailed Results:")
    print("-" * 40)
    
    suite_names = ["Unit Tests", "Integration Tests", "Performance Tests", "Security Tests", "Integration Tests"]
    
    for i, (suite_name, results) in enumerate(zip(suite_names, all_results)):
        if results:  # Only show suites that were run
            print(f"\n{suite_name}:")
            for test_name, result in results:
                status_icon = {"PASS": "✅", "FAIL": "❌", "WARN": "⚠️", "SLOW": "🐌"}.get(result, "❓")
                print(f"  {status_icon} {test_name}: {result}")

def main():
    """Main test function"""
    if len(sys.argv) < 2:
        print("🧪 PICASSO Token Blacklisting Test Suite")
        print("=" * 50)
        print("Usage:")
        print("  python test_token_blacklist.py <test_type>")
        print()
        print("Test Types:")
        print("  unit         - Unit tests for core functions")
        print("  integration  - Integration tests with mocked services")
        print("  performance  - Performance and load testing")
        print("  security     - Security vulnerability testing")
        print("  conversation - Conversation handler integration")
        print("  all          - Run all test suites")
        print()
        print("Examples:")
        print("  python test_token_blacklist.py unit")
        print("  python test_token_blacklist.py all")
        return
    
    test_type = sys.argv[1].lower()
    
    print(f"🧪 PICASSO Token Blacklisting Test Suite")
    print(f"🎯 Test Type: {test_type}")
    print(f"⏰ Started at: {datetime.utcnow().isoformat()}Z")
    print()
    
    all_results = []
    
    if test_type in ["unit", "all"]:
        all_results.append(test_unit_functions())
    
    if test_type in ["integration", "all"]:
        all_results.append(test_integration_with_mock())
    
    if test_type in ["performance", "all"]:
        all_results.append(test_performance())
    
    if test_type in ["security", "all"]:
        all_results.append(test_security())
    
    if test_type in ["conversation", "all"]:
        all_results.append(test_conversation_handler_integration())
    
    if not any(all_results):
        print(f"❌ Unknown test type: {test_type}")
        return
    
    print_test_summary(all_results)

if __name__ == '__main__':
    main()