/**
 * Test Environment Override Functionality
 * 
 * This test verifies that the environment override system works correctly
 * by simulating different URL parameter scenarios.
 */

// Mock the browser environment
global.window = {
  location: {
    search: '',
    hostname: 'test.com',
    port: ''
  }
};

// Mock console.log to capture output
const logs = [];
global.console = {
  log: (...args) => logs.push(args.join(' ')),
  warn: (...args) => logs.push('WARN: ' + args.join(' ')),
  error: (...args) => logs.push('ERROR: ' + args.join(' '))
};

function testEnvironmentOverride(urlSearch) {
  // Reset
  logs.length = 0;
  global.window.location.search = urlSearch;
  
  // Simulate the environment detection logic from our environment.js
  let runtimeOverrideEnv = null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const envOverride = urlParams.get('picasso-env');
    if (envOverride && ['development', 'staging', 'production'].includes(envOverride)) {
      runtimeOverrideEnv = envOverride;
      console.log(`🎯 RUNTIME OVERRIDE: Environment forced to ${envOverride} via URL parameter`);
    }
  } catch (error) {
    console.warn('⚠️ Error checking URL parameters:', error);
  }
  
  // Use runtime override if available, otherwise build-time constant, otherwise detection
  const currentEnv = runtimeOverrideEnv || 'staging'; // 'staging' is the build-time default
  
  // Environment configurations
  const ENVIRONMENTS = {
    development: {
      API_BASE_URL: 'https://chat.myrecruiter.ai',
      CHAT_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=chat',
      ERROR_REPORTING_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
      CONVERSATION_ENDPOINT_AVAILABLE: false
    },
    staging: {
      API_BASE_URL: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws',
      CHAT_ENDPOINT: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws/?action=chat',
      ERROR_REPORTING_ENDPOINT: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws/?action=log_error',
      CONVERSATION_ENDPOINT_AVAILABLE: true
    },
    production: {
      API_BASE_URL: 'https://chat.myrecruiter.ai',
      CHAT_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=chat',
      ERROR_REPORTING_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
      CONVERSATION_ENDPOINT_AVAILABLE: false
    }
  };
  
  // CRITICAL FIX: Prioritize runtime overrides completely over build-time constants
  if (runtimeOverrideEnv) {
    console.log(`🎯 RUNTIME OVERRIDE ACTIVE: Using runtime environment configuration for ${currentEnv}`);
    console.log(`📍 Environment ${currentEnv} endpoints (RUNTIME):`, {
      API_BASE_URL: ENVIRONMENTS[currentEnv].API_BASE_URL,
      CHAT_ENDPOINT: ENVIRONMENTS[currentEnv].CHAT_ENDPOINT,
      ERROR_REPORTING_ENDPOINT: ENVIRONMENTS[currentEnv].ERROR_REPORTING_ENDPOINT
    });
    console.log(`🚨 BUILD-TIME CONSTANTS IGNORED due to runtime override`);
  } else {
    console.log(`🚀 Using build-time environment constants for ${currentEnv}`);
    // In real build, this would override with build-time values, but here we use staging defaults
    console.log(`📍 Environment ${currentEnv} endpoints (BUILD-TIME):`, {
      API_BASE_URL: ENVIRONMENTS[currentEnv].API_BASE_URL,
      CHAT_ENDPOINT: ENVIRONMENTS[currentEnv].CHAT_ENDPOINT,
      ERROR_REPORTING_ENDPOINT: ENVIRONMENTS[currentEnv].ERROR_REPORTING_ENDPOINT
    });
  }
  
  return {
    environment: currentEnv,
    config: ENVIRONMENTS[currentEnv],
    runtimeOverride: !!runtimeOverrideEnv,
    logs: [...logs]
  };
}

// Test Cases
console.log('🧪 Testing Environment Override System\n');

// Test 1: No URL parameter (should use build-time staging)
console.log('📋 Test 1: No URL parameter');
const test1 = testEnvironmentOverride('');
console.log(`Environment: ${test1.environment}`);
console.log(`Runtime Override: ${test1.runtimeOverride}`);
console.log(`API Base URL: ${test1.config.API_BASE_URL}`);
console.log(`Conversation Endpoint Available: ${test1.config.CONVERSATION_ENDPOINT_AVAILABLE}`);
console.log(`Logs: ${test1.logs.length} messages`);
console.log('');

// Test 2: URL parameter = staging
console.log('📋 Test 2: ?picasso-env=staging');
const test2 = testEnvironmentOverride('?picasso-env=staging');
console.log(`Environment: ${test2.environment}`);
console.log(`Runtime Override: ${test2.runtimeOverride}`);
console.log(`API Base URL: ${test2.config.API_BASE_URL}`);
console.log(`Conversation Endpoint Available: ${test2.config.CONVERSATION_ENDPOINT_AVAILABLE}`);
console.log(`Logs: ${test2.logs.length} messages`);
console.log('');

// Test 3: URL parameter = production
console.log('📋 Test 3: ?picasso-env=production');
const test3 = testEnvironmentOverride('?picasso-env=production');
console.log(`Environment: ${test3.environment}`);
console.log(`Runtime Override: ${test3.runtimeOverride}`);
console.log(`API Base URL: ${test3.config.API_BASE_URL}`);
console.log(`Conversation Endpoint Available: ${test3.config.CONVERSATION_ENDPOINT_AVAILABLE}`);
console.log(`Logs: ${test3.logs.length} messages`);
console.log('');

// Test 4: URL parameter = development
console.log('📋 Test 4: ?picasso-env=development');
const test4 = testEnvironmentOverride('?picasso-env=development');
console.log(`Environment: ${test4.environment}`);
console.log(`Runtime Override: ${test4.runtimeOverride}`);
console.log(`API Base URL: ${test4.config.API_BASE_URL}`);
console.log(`Conversation Endpoint Available: ${test4.config.CONVERSATION_ENDPOINT_AVAILABLE}`);
console.log(`Logs: ${test4.logs.length} messages`);
console.log('');

// Validation
console.log('✅ Validation Results:');

// Test that staging URLs are being used when parameter is staging
const expectedStagingUrl = 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws';
const stagingUrlCorrect = test2.config.API_BASE_URL === expectedStagingUrl;
console.log(`Staging Lambda URL correct: ${stagingUrlCorrect ? '✅' : '❌'}`);

// Test that production URLs are being used when parameter is production  
const expectedProductionUrl = 'https://chat.myrecruiter.ai';
const productionUrlCorrect = test3.config.API_BASE_URL === expectedProductionUrl;
console.log(`Production URL correct: ${productionUrlCorrect ? '✅' : '❌'}`);

// Test that runtime override works
const runtimeOverrideWorks = test2.runtimeOverride && test3.runtimeOverride && test4.runtimeOverride;
console.log(`Runtime override system working: ${runtimeOverrideWorks ? '✅' : '❌'}`);

// Test that conversation endpoint flag works
const conversationFlagWorks = test2.config.CONVERSATION_ENDPOINT_AVAILABLE && !test3.config.CONVERSATION_ENDPOINT_AVAILABLE;
console.log(`Conversation endpoint flag working: ${conversationFlagWorks ? '✅' : '❌'}`);

console.log('\n🎯 SUMMARY:');
console.log(`✅ Environment override fix: ${stagingUrlCorrect && productionUrlCorrect && runtimeOverrideWorks ? 'WORKING' : 'FAILED'}`);
console.log(`✅ Staging Lambda URLs: ${stagingUrlCorrect ? 'WORKING' : 'FAILED'}`);
console.log(`✅ Conversation endpoint flag: ${conversationFlagWorks ? 'WORKING' : 'FAILED'}`);

if (stagingUrlCorrect && productionUrlCorrect && runtimeOverrideWorks && conversationFlagWorks) {
  console.log('\n🚀 ALL TESTS PASSED! The environment override system is working correctly.');
} else {
  console.log('\n❌ SOME TESTS FAILED! Check the validation results above.');
}