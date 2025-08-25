#!/usr/bin/env node

/**
 * Test Environment Override Fix
 * 
 * This script verifies that the environment.js runtime override
 * correctly detects staging when picasso-env=staging is set.
 */

console.log('🧪 Testing Environment Override Fix...\n');

// Simulate browser environment
global.window = {
  location: {
    search: '?picasso-env=staging&t=my87674d777bf9',
    hostname: 'localhost'
  },
  URLSearchParams: global.URLSearchParams || require('url').URLSearchParams
};

global.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  currentScript: null
};

// Import the fixed configuration
let config;
try {
  // Use dynamic import to simulate browser environment
  const configModule = await import('./src/config/environment.js');
  config = configModule.config;
  console.log('✅ Configuration loaded successfully');
} catch (error) {
  console.error('❌ Failed to load configuration:', error.message);
  process.exit(1);
}

// Test 1: Environment Detection
console.log('\n📋 Test 1: Environment Detection');
console.log(`Environment: ${config.ENVIRONMENT}`);
console.log(`Expected: staging`);
if (config.ENVIRONMENT === 'staging') {
  console.log('✅ PASS: Environment correctly detected as staging');
} else {
  console.log('❌ FAIL: Environment should be staging');
}

// Test 2: API Endpoints
console.log('\n📋 Test 2: API Endpoints');
console.log(`API Base URL: ${config.API_BASE_URL}`);
console.log(`Config Endpoint: ${config.CONFIG_ENDPOINT}`);
console.log(`Chat Endpoint: ${config.CHAT_ENDPOINT}`);

const expectedStagingURL = 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws';
const productionURL = 'https://chat.myrecruiter.ai';

if (config.API_BASE_URL.includes(expectedStagingURL)) {
  console.log('✅ PASS: API Base URL correctly points to staging Lambda');
} else if (config.API_BASE_URL.includes(productionURL)) {
  console.log('❌ FAIL: API Base URL still points to production');
} else {
  console.log('⚠️  UNKNOWN: API Base URL points to unexpected location');
}

// Test 3: URL Generation
console.log('\n📋 Test 3: URL Generation');
const testTenantHash = 'my87674d777bf9';
try {
  const configUrl = config.getConfigUrl(testTenantHash);
  const chatUrl = config.getChatUrl(testTenantHash);
  
  console.log(`Config URL: ${configUrl}`);
  console.log(`Chat URL: ${chatUrl}`);
  
  if (configUrl.includes(expectedStagingURL) && chatUrl.includes(expectedStagingURL)) {
    console.log('✅ PASS: Generated URLs point to staging Lambda');
  } else {
    console.log('❌ FAIL: Generated URLs do not point to staging');
  }
} catch (error) {
  console.log('❌ FAIL: URL generation failed:', error.message);
}

// Test 4: Runtime Override Detection
console.log('\n📋 Test 4: Runtime Override Detection');
console.log(`Is Development: ${config.isDevelopment()}`);
console.log(`Is Staging: ${config.isStaging()}`);
console.log(`Is Production: ${config.isProduction()}`);

if (config.isStaging()) {
  console.log('✅ PASS: Runtime environment correctly identified as staging');
} else {
  console.log('❌ FAIL: Runtime environment not correctly identified');
}

// Summary
console.log('\n📊 Test Summary');
const tests = [
  { name: 'Environment Detection', pass: config.ENVIRONMENT === 'staging' },
  { name: 'API Endpoints', pass: config.API_BASE_URL.includes(expectedStagingURL) },
  { name: 'URL Generation', pass: config.getConfigUrl(testTenantHash).includes(expectedStagingURL) },
  { name: 'Runtime Override', pass: config.isStaging() }
];

const passed = tests.filter(t => t.pass).length;
const total = tests.length;

console.log(`Passed: ${passed}/${total} tests`);

if (passed === total) {
  console.log('🎉 ALL TESTS PASSED! Environment override fix is working correctly.');
  console.log('\n📝 Expected Behavior:');
  console.log('- When ?picasso-env=staging is set, all API calls should go to staging Lambda');
  console.log('- Network tab should show requests to: xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws');
  console.log('- NO requests should go to: chat.myrecruiter.ai');
} else {
  console.log('❌ Some tests failed. The environment override fix needs more work.');
  
  console.log('\n🔍 Debug Information:');
  console.log('Configuration object:', JSON.stringify({
    ENVIRONMENT: config.ENVIRONMENT,
    API_BASE_URL: config.API_BASE_URL,
    CONFIG_ENDPOINT: config.CONFIG_ENDPOINT,
    CHAT_ENDPOINT: config.CHAT_ENDPOINT
  }, null, 2));
}