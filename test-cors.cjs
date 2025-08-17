#!/usr/bin/env node

/**
 * CORS Test Script for Conversation Endpoint
 * Tests both OPTIONS preflight and POST requests to see CORS behavior
 */

const https = require('https');

const LAMBDA_URL = 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws';
const TENANT_HASH = 'my87674d777bf9';

function makeRequest(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, LAMBDA_URL);
        
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'User-Agent': 'CORS-Test/1.0',
                ...headers
            }
        };

        console.log(`\n🔍 Testing ${method} ${url.href}`);
        console.log(`📤 Headers:`, JSON.stringify(headers, null, 2));

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`📥 Status: ${res.statusCode} ${res.statusMessage}`);
                console.log(`📥 Response Headers:`, JSON.stringify(res.headers, null, 2));
                if (data) {
                    console.log(`📥 Response Body:`, data);
                }
                
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', (error) => {
            console.error(`❌ Request failed:`, error.message);
            reject(error);
        });

        if (body) {
            req.write(body);
        }
        
        req.end();
    });
}

async function testCORSEndpoints() {
    console.log('🚀 Starting CORS Tests for Conversation Endpoint');
    console.log('=' .repeat(60));
    
    try {
        // Test 1: OPTIONS preflight for conversation endpoint
        console.log('\n📋 TEST 1: OPTIONS Preflight for Conversation');
        await makeRequest('OPTIONS', `/?action=conversation&operation=init&t=${TENANT_HASH}`, {
            'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type'
        });

        // Test 2: OPTIONS preflight for config endpoint (for comparison)
        console.log('\n📋 TEST 2: OPTIONS Preflight for Config (comparison)');
        await makeRequest('OPTIONS', `/?action=get_config&t=${TENANT_HASH}`, {
            'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Content-Type'
        });

        // Test 3: POST to conversation endpoint (should fail due to CORS)
        console.log('\n📋 TEST 3: POST to Conversation Endpoint');
        await makeRequest('POST', `/?action=conversation&operation=init&t=${TENANT_HASH}`, {
            'Origin': 'http://localhost:3000',
            'Content-Type': 'application/json'
        }, '{}');

        // Test 4: GET config endpoint (should work with CORS)
        console.log('\n📋 TEST 4: GET Config Endpoint');
        await makeRequest('GET', `/?action=get_config&t=${TENANT_HASH}`, {
            'Origin': 'http://localhost:3000'
        });

    } catch (error) {
        console.error('❌ Test suite failed:', error);
    }

    console.log('\n🏁 CORS Tests Complete');
    console.log('=' .repeat(60));
}

// Run the tests
testCORSEndpoints();