#!/usr/bin/env node

/**
 * Environment Switch Verification Test
 * Tests switching from staging back to production APIs
 */

import fetch from 'node-fetch';

const ENDPOINTS = {
  production: {
    name: 'Production',
    base: 'https://chat.myrecruiter.ai',
    config: 'https://chat.myrecruiter.ai/Master_Function?action=get_config',
    chat: 'https://chat.myrecruiter.ai/Master_Function?action=chat'
  },
  staging: {
    name: 'Staging Lambda',
    base: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws',
    config: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws/?action=get_config',
    chat: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws/?action=chat'
  }
};

const TENANT_HASH = 'my87674d777bf9';

async function testEndpoint(name, url) {
  try {
    console.log(`Testing ${name}: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Picasso-Test-Client/1.0'
      }
    });
    
    if (response.ok) {
      console.log(`✅ ${name} - HTTP ${response.status} - WORKING`);
      return true;
    } else {
      console.log(`❌ ${name} - HTTP ${response.status} - FAILED`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${name} - Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🔄 Environment Switch Verification Test');
  console.log('=' .repeat(50));
  console.log(`Tenant Hash: ${TENANT_HASH}`);
  console.log('');
  
  // Test Production Endpoints
  console.log('🚀 PRODUCTION ENDPOINTS:');
  const prodConfigUrl = `${ENDPOINTS.production.config}&t=${TENANT_HASH}`;
  const prodChatUrl = `${ENDPOINTS.production.chat}&t=${TENANT_HASH}`;
  
  const prodConfigOk = await testEndpoint('Production Config', prodConfigUrl);
  const prodChatOk = await testEndpoint('Production Chat', prodChatUrl);
  
  console.log('');
  
  // Test Staging Endpoints
  console.log('🧪 STAGING ENDPOINTS (for comparison):');
  const stagingConfigUrl = `${ENDPOINTS.staging.config}&t=${TENANT_HASH}`;
  const stagingChatUrl = `${ENDPOINTS.staging.chat}&t=${TENANT_HASH}`;
  
  const stagingConfigOk = await testEndpoint('Staging Config', stagingConfigUrl);
  const stagingChatOk = await testEndpoint('Staging Chat', stagingChatUrl);
  
  console.log('');
  console.log('=' .repeat(50));
  console.log('SUMMARY:');
  
  if (prodConfigOk && prodChatOk) {
    console.log('✅ Production APIs are READY for use');
    console.log('✅ You can switch back to production by:');
    console.log('   1. Testing at: http://localhost:5173/ (no URL parameters)');
    console.log('   2. Testing at: http://localhost:5174/ (no URL parameters)');
    console.log('   3. Explicitly: http://localhost:5173/?picasso-env=production');
    console.log('   4. With tenant: http://localhost:5173/?tenant=my87674d777bf9');
  } else {
    console.log('❌ Production APIs have issues - investigate before switching');
  }
  
  if (stagingConfigOk && stagingChatOk) {
    console.log('ℹ️  Staging APIs are also working (for comparison)');
  } else {
    console.log('⚠️  Staging APIs have issues');
  }
  
  console.log('');
  console.log('NEXT STEPS:');
  console.log('1. Open: http://localhost:5173/ (defaults to production)');
  console.log('2. Verify the widget loads with production endpoints');
  console.log('3. Check browser console for endpoint confirmation');
  console.log('4. Test chat functionality with MyRecruiter tenant');
}

main().catch(console.error);