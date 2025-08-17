#!/usr/bin/env python3
"""
Test script for endpoint rate limiting functionality
Verifies that the new rate limiting protects init_session, revoke_token, and blacklist_status endpoints
"""

import sys
import time
import json
from lambda_function import (
    _check_endpoint_rate_limit,
    _cleanup_endpoint_rate_limits,
    endpoint_rate_limit_store,
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW
)

def test_rate_limiting_basic():
    """Test basic rate limiting functionality"""
    print("Testing basic rate limiting functionality...")
    
    # Clear the rate limit store
    global endpoint_rate_limit_store
    endpoint_rate_limit_store.clear()
    
    endpoint = "init_session"
    identifier = "test_tenant+192.168.1.1"
    
    # Should allow first RATE_LIMIT_REQUESTS requests
    for i in range(RATE_LIMIT_REQUESTS):
        result = _check_endpoint_rate_limit(endpoint, identifier)
        if result is not None:
            print(f"❌ FAIL: Request {i+1} was rate limited when it should be allowed")
            return False
        print(f"✅ Request {i+1} allowed")
    
    # The next request should be rate limited
    result = _check_endpoint_rate_limit(endpoint, identifier)
    if result is None:
        print(f"❌ FAIL: Request {RATE_LIMIT_REQUESTS+1} was allowed when it should be rate limited")
        return False
    
    print(f"✅ Request {RATE_LIMIT_REQUESTS+1} correctly rate limited")
    
    # Check the response format
    if isinstance(result, dict) and result.get('statusCode') == 429:
        print("✅ Correct 429 status code returned")
        body = json.loads(result.get('body', '{}'))
        if body.get('error') == 'RATE_LIMITED':
            print("✅ Correct error type returned")
        else:
            print(f"❌ FAIL: Wrong error type: {body.get('error')}")
            return False
    else:
        print(f"❌ FAIL: Wrong response format: {result}")
        return False
    
    print("✅ Basic rate limiting test passed")
    return True

def test_different_endpoints():
    """Test that different endpoints have separate rate limits"""
    print("\nTesting endpoint separation...")
    
    # Clear the rate limit store
    global endpoint_rate_limit_store
    endpoint_rate_limit_store.clear()
    
    identifier = "test_tenant+192.168.1.2"
    
    # Use up the rate limit on init_session
    for i in range(RATE_LIMIT_REQUESTS):
        result = _check_endpoint_rate_limit("init_session", identifier)
        if result is not None:
            print(f"❌ FAIL: init_session request {i+1} was rate limited")
            return False
    
    # init_session should now be rate limited
    result = _check_endpoint_rate_limit("init_session", identifier)
    if result is None:
        print("❌ FAIL: init_session should be rate limited")
        return False
    
    # But revoke_token should still work
    result = _check_endpoint_rate_limit("revoke_token", identifier)
    if result is not None:
        print("❌ FAIL: revoke_token was rate limited when it should be separate")
        return False
    
    print("✅ Endpoint separation test passed")
    return True

def test_different_identifiers():
    """Test that different identifiers have separate rate limits"""
    print("\nTesting identifier separation...")
    
    # Clear the rate limit store
    global endpoint_rate_limit_store
    endpoint_rate_limit_store.clear()
    
    endpoint = "init_session"
    identifier1 = "tenant1+192.168.1.3"
    identifier2 = "tenant2+192.168.1.4"
    
    # Use up the rate limit for identifier1
    for i in range(RATE_LIMIT_REQUESTS):
        result = _check_endpoint_rate_limit(endpoint, identifier1)
        if result is not None:
            print(f"❌ FAIL: identifier1 request {i+1} was rate limited")
            return False
    
    # identifier1 should now be rate limited
    result = _check_endpoint_rate_limit(endpoint, identifier1)
    if result is None:
        print("❌ FAIL: identifier1 should be rate limited")
        return False
    
    # But identifier2 should still work
    result = _check_endpoint_rate_limit(endpoint, identifier2)
    if result is not None:
        print("❌ FAIL: identifier2 was rate limited when it should be separate")
        return False
    
    print("✅ Identifier separation test passed")
    return True

def test_time_window_reset():
    """Test that rate limits reset after the time window"""
    print("\nTesting time window reset...")
    
    # Clear the rate limit store
    global endpoint_rate_limit_store
    endpoint_rate_limit_store.clear()
    
    endpoint = "blacklist_status"
    identifier = "test_tenant+192.168.1.5"
    
    # Use up the rate limit
    for i in range(RATE_LIMIT_REQUESTS):
        result = _check_endpoint_rate_limit(endpoint, identifier)
        if result is not None:
            print(f"❌ FAIL: Request {i+1} was rate limited")
            return False
    
    # Should be rate limited now
    result = _check_endpoint_rate_limit(endpoint, identifier)
    if result is None:
        print("❌ FAIL: Should be rate limited")
        return False
    
    print(f"Waiting {RATE_LIMIT_WINDOW + 1} seconds for rate limit window to reset...")
    time.sleep(RATE_LIMIT_WINDOW + 1)
    
    # Should work again after the window
    result = _check_endpoint_rate_limit(endpoint, identifier)
    if result is not None:
        print("❌ FAIL: Rate limit should have reset after time window")
        return False
    
    print("✅ Time window reset test passed")
    return True

def test_cleanup_functionality():
    """Test the cleanup functionality"""
    print("\nTesting cleanup functionality...")
    
    # Import the global cleanup time variable to reset it
    from lambda_function import last_endpoint_cleanup_time
    import lambda_function
    
    # Clear the rate limit store and reset cleanup time
    global endpoint_rate_limit_store
    endpoint_rate_limit_store.clear()
    lambda_function.last_endpoint_cleanup_time = 0  # Force cleanup to run
    
    # Add some old entries manually
    current_time = time.time()
    old_time = current_time - (RATE_LIMIT_WINDOW + 100)  # Way past the window
    
    endpoint_rate_limit_store["old_endpoint:old_identifier"] = [old_time, old_time + 1]
    endpoint_rate_limit_store["new_endpoint:new_identifier"] = [current_time - 1]
    
    print(f"Before cleanup: {list(endpoint_rate_limit_store.keys())}")
    
    # Run cleanup
    _cleanup_endpoint_rate_limits(current_time)
    
    print(f"After cleanup: {list(endpoint_rate_limit_store.keys())}")
    
    # Old entry should be removed, new entry should remain
    if "old_endpoint:old_identifier" in endpoint_rate_limit_store:
        print("❌ FAIL: Old entries not cleaned up")
        return False
    
    if "new_endpoint:new_identifier" not in endpoint_rate_limit_store:
        print("❌ FAIL: Recent entries were incorrectly cleaned up")
        return False
    
    print("✅ Cleanup functionality test passed")
    return True

def run_all_tests():
    """Run all rate limiting tests"""
    print("🧪 Starting endpoint rate limiting tests...\n")
    
    tests = [
        test_rate_limiting_basic,
        test_different_endpoints,
        test_different_identifiers,
        test_time_window_reset,
        test_cleanup_functionality
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ FAIL: {test.__name__} raised exception: {e}")
            failed += 1
    
    print(f"\n📊 Test Results:")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"📈 Success Rate: {(passed / (passed + failed)) * 100:.1f}%")
    
    if failed == 0:
        print("\n🎉 All endpoint rate limiting tests passed!")
        return True
    else:
        print(f"\n⚠️ {failed} test(s) failed. Please review the implementation.")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)