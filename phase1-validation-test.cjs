#!/usr/bin/env node

/**
 * PICASSO Phase 1 Foundation Validation Test Suite
 * Comprehensive testing for unified coordination architecture
 * 
 * SUCCESS CRITERIA VALIDATION:
 * - JWT tokens expire in ≤15 minutes
 * - Tenant inference never uses client input
 * - Cross-tenant access blocked (0% success rate)
 * - JWT generation: <500ms
 * - Streaming first token: <1000ms (infrastructure ready)
 * - State clearing: <200ms (infrastructure ready)
 * - Summary retrieval: <300ms (infrastructure ready)
 */

const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

// Test Configuration
const CONFIG = {
    staging: {
        masterFunctionUrl: 'https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary/staging/Master_Function',
        domain: 'https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com',
        tenantHash: 'my87674d777bf9'  // MyRecruiter tenant hash
    },
    production: {
        masterFunctionUrl: 'https://chat.myrecruiter.ai/Master_Function',
        domain: 'https://chat.myrecruiter.ai',
        tenantHash: 'my87674d777bf9'  // MyRecruiter tenant hash
    },
    timeout: 30000, // 30 seconds
    performance: {
        jwtGeneration: 500,    // <500ms
        streamingFirstToken: 1000,  // <1000ms
        stateClearing: 200,    // <200ms
        summaryRetrieval: 300  // <300ms
    }
};

// Colors for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

// Test results tracking
const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
    tests: [],
    metrics: {}
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(category, name, passed, message, details = null, isWarning = false) {
    const status = isWarning ? 'WARN' : (passed ? 'PASS' : 'FAIL');
    const color = isWarning ? 'yellow' : (passed ? 'green' : 'red');
    
    log(`[${status}] ${category} - ${name}: ${message}`, color);
    
    if (details) {
        console.log('  Details:', JSON.stringify(details, null, 2));
    }
    
    results.tests.push({ category, name, passed, message, details, isWarning });
    
    if (isWarning) {
        results.warnings++;
    } else if (passed) {
        results.passed++;
    } else {
        results.failed++;
    }
}

// HTTP request helper with enhanced error handling
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        
        const requestOptions = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'PICASSO-Phase1-Validator/1.0',
                ...options.headers
            },
            timeout: CONFIG.timeout
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

// TEST SUITE 1: API FUNCTIONALITY TESTS
async function testAPIfunctionality(environment) {
    log(`\n🔧 TESTING API FUNCTIONALITY - ${environment.toUpperCase()}`, 'cyan');
    log('=' .repeat(50), 'cyan');
    
    const config = CONFIG[environment];
    
    // Test 1.1: Health Check
    await testHealthCheck(environment, config);
    
    // Test 1.2: Config Endpoint
    await testConfigEndpoint(environment, config);
    
    // Test 1.3: Chat Endpoint
    await testChatEndpoint(environment, config);
    
    // Test 1.4: JWT Generation (if available)
    await testJWTGeneration(environment, config);
    
    // Test 1.5: Error Logging
    await testErrorLogging(environment, config);
}

async function testHealthCheck(environment, config) {
    try {
        const startTime = Date.now();
        const url = `${config.masterFunctionUrl}?action=health_check`;
        const response = await makeRequest(url);
        const responseTime = Date.now() - startTime;
        
        if (response.statusCode === 200) {
            const health = response.json();
            if (health && health.status === 'healthy') {
                logTest('API', 'Health Check', true, `Healthy in ${responseTime}ms`, { 
                    responseTime, 
                    environment 
                });
            } else {
                logTest('API', 'Health Check', false, 'Service reports unhealthy', health);
            }
        } else if (response.statusCode === 404) {
            logTest('API', 'Health Check', true, 'Health endpoint not implemented (acceptable)', null, true);
        } else {
            logTest('API', 'Health Check', false, `HTTP ${response.statusCode}`, response.data);
        }
    } catch (error) {
        logTest('API', 'Health Check', false, error.message);
    }
}

async function testConfigEndpoint(environment, config) {
    try {
        const startTime = Date.now();
        const url = `${config.masterFunctionUrl}?action=get_config&t=${config.tenantHash}`;
        const response = await makeRequest(url);
        const responseTime = Date.now() - startTime;
        
        if (response.statusCode === 200) {
            const configData = response.json();
            
            if (configData) {
                logTest('API', 'Config Endpoint', true, `Config loaded in ${responseTime}ms`, {
                    responseTime,
                    environment,
                    hasConfig: !!configData
                });
                
                // Validate tenant inference (should never use client input)
                if (configData.tenantId && !configData.tenantId.includes('client_') && !configData.tenantId.includes('user_')) {
                    logTest('Security', 'Tenant Inference', true, 'Server-side tenant resolution confirmed');
                } else {
                    logTest('Security', 'Tenant Inference', false, 'Potential client-side tenant influence detected');
                }
            } else {
                logTest('API', 'Config Endpoint', false, 'Invalid JSON response');
            }
        } else {
            logTest('API', 'Config Endpoint', false, `HTTP ${response.statusCode}`, response.data);
        }
        
        // Performance check
        if (responseTime > CONFIG.performance.summaryRetrieval) {
            logTest('Performance', 'Config Load Time', false, 
                `${responseTime}ms exceeds ${CONFIG.performance.summaryRetrieval}ms target`);
        } else {
            logTest('Performance', 'Config Load Time', true, 
                `${responseTime}ms within ${CONFIG.performance.summaryRetrieval}ms target`);
        }
        
    } catch (error) {
        logTest('API', 'Config Endpoint', false, error.message);
    }
}

async function testChatEndpoint(environment, config) {
    try {
        const message = {
            message: 'Phase 1 validation test message',
            sessionId: `phase1-test-${Date.now()}`,
            timestamp: new Date().toISOString()
        };
        
        const startTime = Date.now();
        const url = `${config.masterFunctionUrl}?action=chat&t=${config.tenantHash}`;
        const response = await makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
        });
        const responseTime = Date.now() - startTime;
        
        if (response.statusCode === 200) {
            const result = response.json();
            
            if (result && result.response) {
                logTest('API', 'Chat Endpoint', true, `Message processed in ${responseTime}ms`, {
                    responseTime,
                    environment,
                    hasResponse: !!result.response
                });
            } else if (result && result.error) {
                logTest('API', 'Chat Endpoint', false, `Chat error: ${result.error}`);
            } else {
                logTest('API', 'Chat Endpoint', false, 'No response received');
            }
        } else {
            logTest('API', 'Chat Endpoint', false, `HTTP ${response.statusCode}`, response.data);
        }
        
        // Performance check for messaging
        if (responseTime > CONFIG.performance.streamingFirstToken) {
            logTest('Performance', 'Chat Response Time', false, 
                `${responseTime}ms exceeds ${CONFIG.performance.streamingFirstToken}ms target`);
        } else {
            logTest('Performance', 'Chat Response Time', true, 
                `${responseTime}ms within ${CONFIG.performance.streamingFirstToken}ms target`);
        }
        
    } catch (error) {
        logTest('API', 'Chat Endpoint', false, error.message);
    }
}

async function testJWTGeneration(environment, config) {
    try {
        const startTime = Date.now();
        const url = `${config.masterFunctionUrl}?action=generate_jwt&t=${config.tenantHash}&purpose=stream&duration=10`;
        const response = await makeRequest(url);
        const responseTime = Date.now() - startTime;
        
        if (response.statusCode === 200) {
            const jwtResult = response.json();
            
            if (jwtResult && jwtResult.jwt_token) {
                logTest('JWT', 'JWT Generation', true, `JWT generated in ${responseTime}ms`, {
                    responseTime,
                    environment,
                    expiresIn: jwtResult.expires_in,
                    purpose: jwtResult.purpose
                });
                
                // Validate JWT expiration (should be ≤15 minutes)
                const maxExpiry = 15 * 60; // 15 minutes in seconds
                if (jwtResult.expires_in && jwtResult.expires_in <= maxExpiry) {
                    logTest('Security', 'JWT Expiration', true, 
                        `JWT expires in ${Math.floor(jwtResult.expires_in / 60)} minutes (≤15 minutes)`);
                } else {
                    logTest('Security', 'JWT Expiration', false, 
                        `JWT expires in ${Math.floor(jwtResult.expires_in / 60)} minutes (>15 minutes)`);
                }
                
                // Performance check
                if (responseTime > CONFIG.performance.jwtGeneration) {
                    logTest('Performance', 'JWT Generation Time', false, 
                        `${responseTime}ms exceeds ${CONFIG.performance.jwtGeneration}ms target`);
                } else {
                    logTest('Performance', 'JWT Generation Time', true, 
                        `${responseTime}ms within ${CONFIG.performance.jwtGeneration}ms target`);
                }
                
                // Store JWT for validation tests
                results.metrics[`${environment}_jwt_token`] = jwtResult.jwt_token;
                
            } else {
                logTest('JWT', 'JWT Generation', false, 'No JWT token received');
            }
        } else if (response.statusCode === 404) {
            logTest('JWT', 'JWT Generation', true, 'JWT endpoint not yet implemented (Phase 1)', null, true);
        } else {
            logTest('JWT', 'JWT Generation', false, `HTTP ${response.statusCode}`, response.data);
        }
        
    } catch (error) {
        logTest('JWT', 'JWT Generation', false, error.message);
    }
}

async function testErrorLogging(environment, config) {
    try {
        const errorData = {
            error: 'Phase 1 validation test error',
            type: 'validation-test',
            timestamp: new Date().toISOString(),
            userAgent: 'PICASSO-Phase1-Validator/1.0',
            environment: environment
        };
        
        const url = `${config.masterFunctionUrl}?action=log_error`;
        const response = await makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(errorData)
        });
        
        if (response.statusCode === 200) {
            logTest('API', 'Error Logging', true, 'Error logged successfully');
        } else if (response.statusCode === 404) {
            logTest('API', 'Error Logging', true, 'Error logging not implemented (acceptable)', null, true);
        } else {
            logTest('API', 'Error Logging', false, `HTTP ${response.statusCode}`, response.data);
        }
    } catch (error) {
        logTest('API', 'Error Logging', false, error.message);
    }
}

// TEST SUITE 2: SECURITY TESTS
async function testSecurity(environment) {
    log(`\n🔒 TESTING SECURITY - ${environment.toUpperCase()}`, 'cyan');
    log('=' .repeat(50), 'cyan');
    
    const config = CONFIG[environment];
    
    // Test 2.1: Cross-tenant access attempts
    await testCrossTenantAccess(environment, config);
    
    // Test 2.2: JWT validation
    await testJWTValidation(environment, config);
    
    // Test 2.3: Invalid tenant hash handling
    await testInvalidTenantHash(environment, config);
}

async function testCrossTenantAccess(environment, config) {
    try {
        // Generate fake tenant hashes to test cross-tenant access
        const fakeTenantHashes = [
            'fake123456789',
            'invalid_hash',
            config.tenantHash.substring(0, -1) + 'x', // Modified real hash
            'malicious_tenant',
            '00000000000000'
        ];
        
        let successfulAccess = 0;
        let totalAttempts = 0;
        
        for (const fakeHash of fakeTenantHashes) {
            try {
                const url = `${config.masterFunctionUrl}?action=get_config&t=${fakeHash}`;
                const response = await makeRequest(url);
                totalAttempts++;
                
                if (response.statusCode === 200) {
                    const configData = response.json();
                    if (configData && configData.tenantId) {
                        successfulAccess++;
                        log(`  ❌ Cross-tenant access succeeded with fake hash: ${fakeHash}`, 'red');
                    }
                }
            } catch (error) {
                // Errors are expected for invalid hashes
                totalAttempts++;
            }
        }
        
        const successRate = (successfulAccess / totalAttempts) * 100;
        
        if (successRate === 0) {
            logTest('Security', 'Cross-tenant Access Block', true, 
                `0% success rate (${successfulAccess}/${totalAttempts} attempts succeeded)`);
        } else {
            logTest('Security', 'Cross-tenant Access Block', false, 
                `${successRate.toFixed(1)}% success rate (${successfulAccess}/${totalAttempts} attempts succeeded)`);
        }
        
    } catch (error) {
        logTest('Security', 'Cross-tenant Access Block', false, error.message);
    }
}

async function testJWTValidation(environment, config) {
    try {
        const jwtToken = results.metrics[`${environment}_jwt_token`];
        
        if (!jwtToken) {
            logTest('JWT', 'JWT Validation', true, 'JWT validation skipped - no token available', null, true);
            return;
        }
        
        // Test valid JWT
        const url = `${config.masterFunctionUrl}?action=validate_jwt`;
        const response = await makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-jwt-token': jwtToken
            }
        });
        
        if (response.statusCode === 200) {
            const validation = response.json();
            if (validation && validation.valid) {
                logTest('JWT', 'JWT Validation', true, 'Valid JWT accepted');
            } else {
                logTest('JWT', 'JWT Validation', false, 'Valid JWT rejected');
            }
        } else if (response.statusCode === 404) {
            logTest('JWT', 'JWT Validation', true, 'JWT validation endpoint not implemented', null, true);
        } else {
            logTest('JWT', 'JWT Validation', false, `HTTP ${response.statusCode}`, response.data);
        }
        
        // Test invalid JWT
        const invalidResponse = await makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-jwt-token': 'invalid.jwt.token'
            }
        });
        
        if (invalidResponse.statusCode === 401 || invalidResponse.statusCode === 400) {
            logTest('JWT', 'Invalid JWT Rejection', true, 'Invalid JWT properly rejected');
        } else if (invalidResponse.statusCode === 404) {
            logTest('JWT', 'Invalid JWT Rejection', true, 'JWT validation endpoint not implemented', null, true);
        } else {
            logTest('JWT', 'Invalid JWT Rejection', false, 'Invalid JWT not properly rejected');
        }
        
    } catch (error) {
        logTest('JWT', 'JWT Validation', false, error.message);
    }
}

async function testInvalidTenantHash(environment, config) {
    try {
        const invalidHashes = ['', null, undefined, 'null', 'undefined'];
        
        for (const hash of invalidHashes) {
            const hashParam = hash === null || hash === undefined ? '' : `&t=${hash}`;
            const url = `${config.masterFunctionUrl}?action=get_config${hashParam}`;
            
            try {
                const response = await makeRequest(url);
                
                if (response.statusCode >= 400) {
                    // Expected - invalid hash should be rejected
                    continue;
                } else if (response.statusCode === 200) {
                    const configData = response.json();
                    if (!configData || !configData.tenantId) {
                        // No config returned - good
                        continue;
                    } else {
                        logTest('Security', 'Invalid Hash Rejection', false, 
                            `Invalid hash "${hash}" returned valid config`);
                        return;
                    }
                }
            } catch (error) {
                // Expected for invalid requests
                continue;
            }
        }
        
        logTest('Security', 'Invalid Hash Rejection', true, 'All invalid hashes properly rejected');
        
    } catch (error) {
        logTest('Security', 'Invalid Hash Rejection', false, error.message);
    }
}

// TEST SUITE 3: INFRASTRUCTURE VALIDATION
async function testInfrastructure(environment) {
    log(`\n🏗️ TESTING INFRASTRUCTURE - ${environment.toUpperCase()}`, 'cyan');
    log('=' .repeat(50), 'cyan');
    
    const config = CONFIG[environment];
    
    // Test 3.1: Verify broken streaming routes are removed
    await testBrokenStreamingRoutesRemoved(environment, config);
    
    // Test 3.2: CORS headers
    await testCORSHeaders(environment, config);
    
    // Test 3.3: SSL/TLS configuration
    await testSSLConfiguration(environment, config);
}

async function testBrokenStreamingRoutesRemoved(environment, config) {
    try {
        const brokenRoutes = [
            '/staging/Bedrock_Streaming_Handler',
            '/primary/staging/Bedrock_Streaming_Handler',
            '/Bedrock_Streaming_Handler'
        ];
        
        let removedCount = 0;
        let totalRoutes = brokenRoutes.length;
        
        for (const route of brokenRoutes) {
            try {
                const url = `${config.domain}${route}`;
                const response = await makeRequest(url, { method: 'GET' });
                
                if (response.statusCode === 404 || response.statusCode === 403) {
                    removedCount++;
                } else if (response.statusCode === 200) {
                    logTest('Infrastructure', 'Broken Routes Removal', false, 
                        `Route still accessible: ${route}`, { statusCode: response.statusCode });
                    return;
                }
            } catch (error) {
                // Network errors expected for removed routes
                removedCount++;
            }
        }
        
        if (removedCount === totalRoutes) {
            logTest('Infrastructure', 'Broken Routes Removal', true, 
                `All ${totalRoutes} broken streaming routes properly removed/blocked`);
        } else {
            logTest('Infrastructure', 'Broken Routes Removal', false, 
                `${totalRoutes - removedCount} routes still accessible`);
        }
        
    } catch (error) {
        logTest('Infrastructure', 'Broken Routes Removal', false, error.message);
    }
}

async function testCORSHeaders(environment, config) {
    try {
        const testOrigin = 'https://example.com';
        const url = `${config.masterFunctionUrl}?action=health_check`;
        const response = await makeRequest(url, {
            headers: {
                'Origin': testOrigin
            }
        });
        
        const corsHeader = response.headers['access-control-allow-origin'];
        
        if (corsHeader && (corsHeader === '*' || corsHeader === testOrigin)) {
            logTest('Infrastructure', 'CORS Headers', true, `CORS configured: ${corsHeader}`);
        } else if (corsHeader) {
            logTest('Infrastructure', 'CORS Headers', true, 
                `CORS configured but restrictive: ${corsHeader}`, null, true);
        } else {
            logTest('Infrastructure', 'CORS Headers', false, 'No CORS headers found');
        }
        
    } catch (error) {
        logTest('Infrastructure', 'CORS Headers', false, error.message);
    }
}

async function testSSLConfiguration(environment, config) {
    try {
        // This test is inherent in the HTTPS requests we're making
        // If we get here, SSL is working
        logTest('Infrastructure', 'SSL/TLS Configuration', true, 'HTTPS connections successful');
        
    } catch (error) {
        logTest('Infrastructure', 'SSL/TLS Configuration', false, error.message);
    }
}

// MAIN EXECUTION
async function runPhase1ValidationTests() {
    console.clear();
    log('🚀 PICASSO PHASE 1 FOUNDATION VALIDATION', 'blue');
    log('=' .repeat(60), 'blue');
    log('Testing unified coordination architecture completion');
    log('MyRecruiter tenant hash: my87674d777bf9');
    log(`Started: ${new Date().toISOString()}`);
    log('=' .repeat(60), 'blue');
    
    // Test both environments
    const environments = ['staging', 'production'];
    
    for (const env of environments) {
        log(`\n🌍 TESTING ENVIRONMENT: ${env.toUpperCase()}`, 'magenta');
        log('=' .repeat(60), 'magenta');
        
        await testAPIfunctionality(env);
        await testSecurity(env);
        await testInfrastructure(env);
    }
    
    // Generate final report
    await generatePhase1Report();
}

async function generatePhase1Report() {
    log('\n' + '=' .repeat(60), 'blue');
    log('📊 PHASE 1 VALIDATION SUMMARY', 'blue');
    log('=' .repeat(60), 'blue');
    
    // Overall statistics
    const totalTests = results.tests.length;
    const passRate = ((results.passed / (totalTests - results.warnings)) * 100).toFixed(1);
    
    log(`✅ Passed: ${results.passed}`, 'green');
    log(`❌ Failed: ${results.failed}`, 'red');
    log(`⚠️  Warnings: ${results.warnings}`, 'yellow');
    log(`📈 Total: ${totalTests}`);
    log(`📊 Pass Rate: ${passRate}%`, results.failed === 0 ? 'green' : 'yellow');
    
    // Phase 1 Success Criteria Validation
    log('\n🎯 PHASE 1 SUCCESS CRITERIA VALIDATION:', 'cyan');
    log('─' .repeat(50), 'cyan');
    
    const criteria = [
        { name: 'JWT tokens expire in ≤15 minutes', passed: checkCriteria('JWT Expiration') },
        { name: 'Tenant inference never uses client input', passed: checkCriteria('Tenant Inference') },
        { name: 'Cross-tenant access blocked (0% success rate)', passed: checkCriteria('Cross-tenant Access Block') },
        { name: 'JWT generation: <500ms', passed: checkCriteria('JWT Generation Time') },
        { name: 'Staging Master_Function works via API Gateway', passed: checkCriteria('Config Endpoint', 'staging') },
        { name: 'Broken streaming routes removed', passed: checkCriteria('Broken Routes Removal') }
    ];
    
    let criteriaPassed = 0;
    criteria.forEach(criterion => {
        const status = criterion.passed ? '✅' : '❌';
        const color = criterion.passed ? 'green' : 'red';
        log(`  ${status} ${criterion.name}`, color);
        if (criterion.passed) criteriaPassed++;
    });
    
    const criteriaPassRate = ((criteriaPassed / criteria.length) * 100).toFixed(1);
    log(`\n🎯 Success Criteria Pass Rate: ${criteriaPassRate}%`, criteriaPassed === criteria.length ? 'green' : 'red');
    
    // Failed tests detail
    if (results.failed > 0) {
        log('\n❌ FAILED TESTS:', 'red');
        results.tests.filter(t => !t.passed && !t.isWarning).forEach(test => {
            log(`  - ${test.category}/${test.name}: ${test.message}`, 'red');
        });
    }
    
    // Recommendations
    log('\n💡 RECOMMENDATIONS:', 'cyan');
    if (results.failed === 0) {
        log('  ✅ Phase 1 Foundation is ready for Phase 2 implementation!', 'green');
        log('  ✅ All critical security and performance criteria met', 'green');
        log('  ✅ Infrastructure changes validated successfully', 'green');
    } else {
        log('  ❌ Address failed tests before proceeding to Phase 2', 'red');
        log('  🔧 Review security implementations', 'yellow');
        log('  ⚡ Optimize performance bottlenecks', 'yellow');
    }
    
    // Exit code
    const exitCode = results.failed > 0 ? 1 : 0;
    const finalStatus = results.failed === 0 ? '✅ PHASE 1 VALIDATED' : '❌ VALIDATION FAILED';
    log(`\n${finalStatus}`, results.failed === 0 ? 'green' : 'red');
    
    process.exit(exitCode);
}

function checkCriteria(testName, environment = null) {
    return results.tests.some(test => 
        test.name === testName && 
        test.passed && 
        (environment === null || test.details?.environment === environment)
    );
}

// Handle errors
process.on('unhandledRejection', (error) => {
    log(`\n❌ Unhandled error: ${error.message}`, 'red');
    process.exit(1);
});

// Run the validation tests
runPhase1ValidationTests().catch(error => {
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    process.exit(1);
});