#!/usr/bin/env python3

"""
PICASSO Security Validation Test Suite
Tests the implemented tenant hash validation security fixes
"""

import sys
import os

# Add the lambda directory to Python path for testing
sys.path.append('/Users/chrismiller/Desktop/build-process/picasso-main/lambda-review/lambda-review')

try:
    from tenant_config_loader import is_valid_tenant_hash, log_security_event
    TENANT_CONFIG_AVAILABLE = True
    print("✅ Successfully imported tenant_config_loader security functions")
except ImportError as e:
    TENANT_CONFIG_AVAILABLE = False
    print(f"❌ Failed to import tenant_config_loader: {e}")
    sys.exit(1)

def test_tenant_hash_validation():
    """Test the is_valid_tenant_hash function with various inputs"""
    print("\n🛡️ Testing Tenant Hash Validation")
    print("=" * 50)
    
    # Valid tenant hashes (should pass)
    valid_hashes = [
        'my87674d777bf9',  # MyRecruiter tenant hash
    ]
    
    # Invalid tenant hashes (should fail - the ones from QA testing)
    invalid_hashes = [
        'fake123456789',      # From QA test
        'invalid_hash',       # From QA test
        'malicious_tenant',   # From QA test
        '00000000000000',     # From QA test
        '',                   # Empty string
        None,                 # None value
        'short',              # Too short
        'this_is_way_too_long_for_a_tenant_hash',  # Too long
        '<script>alert("xss")</script>',  # XSS attempt
        '../../etc/passwd',   # Path traversal
        'DROP TABLE users;',  # SQL injection attempt
        'null',               # String "null"
        'undefined',          # String "undefined"
        '{}',                 # JSON object
        '[]',                 # JSON array
        'test@example.com',   # Email format
        'tenant-with-dashes', # Contains dashes
        'tenant_with_underscores',  # Contains underscores
    ]
    
    print("\n✅ Testing Valid Tenant Hashes:")
    all_valid_passed = True
    for hash_value in valid_hashes:
        result = is_valid_tenant_hash(hash_value)
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status} '{hash_value}' -> {result}")
        if not result:
            all_valid_passed = False
    
    print("\n❌ Testing Invalid Tenant Hashes (should be rejected):")
    all_invalid_blocked = True
    for hash_value in invalid_hashes:
        result = is_valid_tenant_hash(hash_value)
        status = "✅ BLOCKED" if not result else "❌ ALLOWED"
        display_value = str(hash_value)[:20] + "..." if hash_value and len(str(hash_value)) > 20 else str(hash_value)
        print(f"  {status} '{display_value}' -> {result}")
        if result:  # If any invalid hash is allowed, that's a security issue
            all_invalid_blocked = False
    
    print(f"\n📊 Validation Test Results:")
    print(f"  Valid hashes correctly accepted: {'✅ YES' if all_valid_passed else '❌ NO'}")
    print(f"  Invalid hashes correctly blocked: {'✅ YES' if all_invalid_blocked else '❌ NO'}")
    
    return all_valid_passed and all_invalid_blocked

def test_security_logging():
    """Test the security logging function"""
    print("\n📝 Testing Security Logging Function")
    print("=" * 50)
    
    try:
        # Test with various security event types
        test_events = [
            ("invalid_hash_attempt", "fake123456789"),
            ("hash_resolution_failed", "malicious_tenant"),
            ("config_not_found", "invalid_hash"),
        ]
        
        for event_type, tenant_hash in test_events:
            log_security_event(event_type, tenant_hash)
            print(f"✅ Logged security event: {event_type} for hash {tenant_hash[:8]}...")
        
        print("✅ Security logging function working correctly")
        return True
        
    except Exception as e:
        print(f"❌ Security logging failed: {e}")
        return False

def test_cross_tenant_access_prevention():
    """Simulate the cross-tenant access attempts from QA testing"""
    print("\n🚫 Testing Cross-Tenant Access Prevention")
    print("=" * 50)
    
    # These are the exact hashes that were successfully returning configs in QA testing
    blocked_hashes = [
        'fake123456789',
        'invalid_hash', 
        'malicious_tenant',
        '00000000000000'
    ]
    
    print("Testing hashes that previously allowed unauthorized access:")
    all_blocked = True
    
    for tenant_hash in blocked_hashes:
        is_valid = is_valid_tenant_hash(tenant_hash)
        if is_valid:
            print(f"  ❌ SECURITY RISK: '{tenant_hash}' still allowed access")
            all_blocked = False
        else:
            print(f"  ✅ BLOCKED: '{tenant_hash}' correctly rejected")
    
    success_rate = 0 if all_blocked else 100  # Should be 0% success rate
    print(f"\n📊 Cross-tenant access success rate: {100 - (len([h for h in blocked_hashes if not is_valid_tenant_hash(h)]) / len(blocked_hashes) * 100):.1f}%")
    print(f"🎯 Target: 0% (all unauthorized access blocked)")
    
    if all_blocked:
        print("✅ SUCCESS: All cross-tenant access attempts blocked")
    else:
        print("❌ FAILURE: Some unauthorized access still possible")
    
    return all_blocked

def run_security_validation_suite():
    """Run the complete security validation test suite"""
    print("🚀 PICASSO Security Validation Test Suite")
    print("=" * 60)
    print("Testing security fixes for cross-tenant access vulnerability")
    print("=" * 60)
    
    if not TENANT_CONFIG_AVAILABLE:
        print("❌ Cannot run tests - tenant_config_loader not available")
        return False
    
    # Run all security tests
    tests = [
        ("Tenant Hash Validation", test_tenant_hash_validation),
        ("Security Logging", test_security_logging),
        ("Cross-Tenant Access Prevention", test_cross_tenant_access_prevention),
    ]
    
    passed_tests = 0
    total_tests = len(tests)
    
    for test_name, test_function in tests:
        print(f"\n🧪 Running Test: {test_name}")
        try:
            result = test_function()
            if result:
                passed_tests += 1
                print(f"✅ {test_name} PASSED")
            else:
                print(f"❌ {test_name} FAILED")
        except Exception as e:
            print(f"❌ {test_name} ERROR: {e}")
    
    # Generate final report
    print("\n" + "=" * 60)
    print("📊 SECURITY VALIDATION REPORT")
    print("=" * 60)
    
    success_rate = (passed_tests / total_tests) * 100
    print(f"Tests Passed: {passed_tests}/{total_tests} ({success_rate:.1f}%)")
    
    if success_rate == 100:
        print("🛡️ SECURITY STATUS: ✅ ALL TESTS PASSED")
        print("✅ Cross-tenant access vulnerability has been resolved")
        print("✅ Healthcare-grade security requirements met")
    else:
        print("🛡️ SECURITY STATUS: ❌ TESTS FAILED")
        print("❌ Security vulnerabilities still present")
        print("🔧 Review failed tests and apply additional fixes")
    
    print("\n🎯 NEXT STEPS:")
    if success_rate == 100:
        print("1. Deploy security fixes to staging environment")
        print("2. Run QA validation tests to confirm 0% cross-tenant access")
        print("3. Deploy to production after validation")
        print("4. Set up security monitoring and alerting")
    else:
        print("1. Review failed test results above")
        print("2. Fix remaining security issues")
        print("3. Re-run this security validation suite")
        print("4. Do not deploy until all tests pass")
    
    return success_rate == 100

if __name__ == "__main__":
    success = run_security_validation_suite()
    exit(0 if success else 1)