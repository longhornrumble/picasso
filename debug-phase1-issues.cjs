#!/usr/bin/env node

/**
 * Debug Phase 1 Issues - Detailed Investigation
 * Focus on understanding the specific failures found in validation
 */

const https = require('https');
const { URL } = require('url');

const CONFIG = {
    staging: {
        masterFunctionUrl: 'https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary/staging/Master_Function',
        tenantHash: 'my87674d777bf9'
    },
    production: {
        masterFunctionUrl: 'https://chat.myrecruiter.ai/Master_Function',
        tenantHash: 'my87674d777bf9'
    }
};

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        
        const requestOptions = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Debug-Phase1-Issues/1.0',
                ...options.headers
            },
            timeout: 30000
        };
        
        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: data,
                    json: () => {
                        try {
                            return JSON.parse(data);
                        } catch (e) {
                            return null;
                        }
                    }
                });
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (options.body) {
            req.write(options.body);
        }
        
        req.end();
    });
}

async function debugIssues() {
    console.log('🔍 DEBUGGING PHASE 1 VALIDATION ISSUES');
    console.log('=====================================\n');
    
    // Issue 1: Chat endpoint returning 400 "Missing tenant information"
    console.log('1. 🐛 DEBUGGING CHAT ENDPOINT ISSUE');
    console.log('   Problem: Chat returns "Missing tenant information or user input"');
    console.log('   Investigating...\n');
    
    await debugChatEndpoint();
    
    // Issue 2: JWT and Error Logging endpoints not found
    console.log('\n2. 🐛 DEBUGGING MISSING ENDPOINTS');
    console.log('   Problem: JWT and Error Logging return "Invalid request format"');
    console.log('   Investigating available actions...\n');
    
    await debugAvailableActions();
    
    // Issue 3: Tenant inference concern
    console.log('\n3. 🐛 DEBUGGING TENANT INFERENCE');
    console.log('   Problem: Config response suggests client influence');
    console.log('   Investigating response structure...\n');
    
    await debugTenantInference();
}

async function debugChatEndpoint() {
    const environments = ['staging', 'production'];
    
    for (const env of environments) {
        console.log(`   Testing ${env.toUpperCase()} chat endpoint...`);
        const config = CONFIG[env];
        
        try {
            // Test different chat request formats
            const formats = [
                {
                    name: 'Standard format',
                    message: { 
                        message: 'test', 
                        sessionId: 'debug-' + Date.now() 
                    }
                },
                {
                    name: 'With user_input field',
                    message: { 
                        user_input: 'test',
                        message: 'test',
                        sessionId: 'debug-' + Date.now() 
                    }
                },
                {
                    name: 'Minimal format',
                    message: 'test'
                }
            ];
            
            for (const format of formats) {
                console.log(`     Trying: ${format.name}`);
                
                const url = `${config.masterFunctionUrl}?action=chat&t=${config.tenantHash}`;
                const response = await makeRequest(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(format.message)
                });
                
                console.log(`       Status: ${response.statusCode}`);
                if (response.statusCode !== 200) {
                    const error = response.json();
                    console.log(`       Error: ${error?.error || response.data}`);
                } else {
                    console.log('       ✅ SUCCESS!');
                    return;
                }
            }
        } catch (error) {
            console.log(`       Network Error: ${error.message}`);
        }
    }
}

async function debugAvailableActions() {
    const environments = ['staging', 'production'];
    
    for (const env of environments) {
        console.log(`   Checking ${env.toUpperCase()} available actions...`);
        const config = CONFIG[env];
        
        try {
            // Get available actions from error response
            const url = `${config.masterFunctionUrl}?action=invalid_action&t=${config.tenantHash}`;
            const response = await makeRequest(url);
            
            const result = response.json();
            if (result?.valid_actions) {
                console.log(`       Available actions: ${result.valid_actions.join(', ')}`);
                
                // Check if JWT actions might be available under different names
                const possibleJWTActions = ['jwt', 'token', 'auth', 'generate_token'];
                for (const action of possibleJWTActions) {
                    const testUrl = `${config.masterFunctionUrl}?action=${action}&t=${config.tenantHash}`;
                    const testResponse = await makeRequest(testUrl);
                    if (testResponse.statusCode === 200) {
                        console.log(`       ✅ Found working action: ${action}`);
                    }
                }
            }
        } catch (error) {
            console.log(`       Network Error: ${error.message}`);
        }
    }
}

async function debugTenantInference() {
    const environments = ['staging', 'production'];
    
    for (const env of environments) {
        console.log(`   Analyzing ${env.toUpperCase()} tenant inference...`);
        const config = CONFIG[env];
        
        try {
            const url = `${config.masterFunctionUrl}?action=get_config&t=${config.tenantHash}`;
            const response = await makeRequest(url);
            
            if (response.statusCode === 200) {
                const configData = response.json();
                
                console.log('       Response structure:');
                console.log('       - Keys:', Object.keys(configData || {}));
                
                if (configData?.tenantId) {
                    console.log(`       - Tenant ID: ${configData.tenantId}`);
                    
                    // Analyze if tenant ID shows server-side inference
                    const hasClientIndicators = [
                        configData.tenantId.includes('client_'),
                        configData.tenantId.includes('user_'),
                        configData.tenantId.includes('input_'),
                        configData.tenantId === config.tenantHash
                    ].some(Boolean);
                    
                    if (hasClientIndicators) {
                        console.log('       ⚠️  Tenant ID suggests client influence');
                    } else {
                        console.log('       ✅ Tenant ID appears server-generated');
                    }
                }
                
                // Check for server-side tenant resolution indicators
                if (configData?.resolved_from_hash) {
                    console.log('       ✅ Server-side hash resolution confirmed');
                } else {
                    console.log('       ⚠️  No explicit hash resolution indicator');
                }
            }
        } catch (error) {
            console.log(`       Network Error: ${error.message}`);
        }
    }
}

// Additional diagnostic: Check current Lambda implementation
async function checkLambdaImplementation() {
    console.log('\n4. 🔍 CHECKING LAMBDA IMPLEMENTATION STATUS');
    console.log('   Reviewing what\'s currently deployed...\n');
    
    // This would require examining the deployed Lambda code
    // For now, we'll infer from API responses
    
    const environments = ['staging', 'production'];
    
    for (const env of environments) {
        console.log(`   ${env.toUpperCase()} Lambda Analysis:`);
        const config = CONFIG[env];
        
        try {
            // Check cache_status action (specific to current implementation)
            const url = `${config.masterFunctionUrl}?action=cache_status&t=${config.tenantHash}`;
            const response = await makeRequest(url);
            
            if (response.statusCode === 200) {
                const result = response.json();
                console.log('       ✅ Cache status available - indicates current implementation');
                console.log(`       Cache info: ${JSON.stringify(result, null, 8)}`);
            } else {
                console.log('       ⚠️  Cache status not available');
            }
        } catch (error) {
            console.log(`       Network Error: ${error.message}`);
        }
    }
}

debugIssues()
    .then(() => checkLambdaImplementation())
    .catch(error => {
        console.error('Debug failed:', error.message);
        process.exit(1);
    });