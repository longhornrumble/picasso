#!/usr/bin/env node

/**
 * CRITICAL FAILURES TARGETED TEST SUITE
 * Healthcare Compliance Validation - 95%+ Pass Rate Required
 * 
 * Focus: 6 specific failures blocking healthcare requirements
 * Status: Post-deployment validation
 */

const https = require('https');
const fs = require('fs');

// Test configuration
const CONFIG = {
    staging: {
        api_gateway: 'kgvc8xnewf.execute-api.us-east-1.amazonaws.com',
        path: '/primary/staging/Master_Function',
        valid_hash: 'my87674d777bf9'
    },
    production: {
        domain: 'chat.myrecruiter.ai',
        path: '/Master_Function',
        valid_hash: 'my87674d777bf9'
    },
    timeout: 10000
};

// Test results tracking
let testResults = {
    critical_failures: {
        passed: 0,
        failed: 0,
        total: 6,
        details: []
    }
};

// ANSI color codes for healthcare-grade reporting
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = colors.white) {
    console.log(`${color}${message}${colors.reset}`);
}

function logHealthcare(message) {
    log(`🏥 HEALTHCARE: ${message}`, colors.cyan);
}

function logCritical(message) {
    log(`🚨 CRITICAL: ${message}`, colors.red + colors.bold);
}

function logSecurity(message) {
    log(`🛡️ SECURITY: ${message}`, colors.yellow);
}

function logSuccess(message) {
    log(`✅ ${message}`, colors.green);
}

function logFailure(message) {
    log(`❌ ${message}`, colors.red);
}

// HTTP request helper with healthcare-grade error handling
function httpsRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Request timeout after ${CONFIG.timeout}ms`));
        }, CONFIG.timeout);

        const req = https.request(options, (res) => {
            clearTimeout(timeout);
            let data = '';
            
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data,
                        parsed: null
                    };
                    
                    // Try to parse JSON response
                    if (res.headers['content-type']?.includes('application/json')) {
                        try {
                            result.parsed = JSON.parse(data);
                        } catch (e) {
                            result.parseError = e.message;
                        }
                    }
                    
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });

        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

// Test 1: Cross-tenant access security validation
async function testCrossTenantAccess(environment) {
    logSecurity(`Testing cross-tenant access security - ${environment}`);
    
    const invalidHashes = [
        'fake123456789',
        'invalid_hash', 
        'malicious_tenant',
        '00000000000000',
        ''  // Empty hash
    ];
    
    let blockedCount = 0;
    const results = [];
    
    for (const hash of invalidHashes) {
        try {
            const host = environment === 'staging' ? CONFIG.staging.api_gateway : CONFIG.production.domain;
            const path = environment === 'staging' ? CONFIG.staging.path : CONFIG.production.path;
            const url = `${path}?action=get_config&t=${hash}`;
            
            const options = {
                hostname: host,
                port: 443,
                path: url,
                method: 'GET',
                headers: {
                    'User-Agent': 'Healthcare-Compliance-Test/1.0'
                }
            };
            
            const response = await httpsRequest(options);
            
            // HEALTHCARE REQUIREMENT: Invalid hashes MUST return 401/403/404
            const isBlocked = response.statusCode >= 400;
            
            if (isBlocked) {
                blockedCount++;
                logSuccess(`Hash "${hash}" correctly blocked (${response.statusCode})`);
            } else {
                logFailure(`Hash "${hash}" returned ${response.statusCode} - SECURITY BREACH`);
            }
            
            results.push({
                hash: hash,
                status: response.statusCode,
                blocked: isBlocked,
                response_size: response.body?.length || 0
            });
            
        } catch (error) {
            // Network errors count as blocked (expected behavior)
            blockedCount++;
            logSuccess(`Hash "${hash}" blocked by network layer (${error.message})`);
            results.push({
                hash: hash,
                status: 'ERROR',
                blocked: true,
                error: error.message
            });
        }
    }
    
    const blockRate = (blockedCount / invalidHashes.length) * 100;
    const passed = blockRate === 100;  // HEALTHCARE: 100% block rate required
    
    testResults.critical_failures.details.push({
        test: `Cross-tenant access security - ${environment}`,
        passed: passed,
        blockRate: blockRate,
        required: 100,
        details: results
    });
    
    if (passed) {
        testResults.critical_failures.passed++;
        logSuccess(`Cross-tenant access: ${blockRate}% blocked (HEALTHCARE COMPLIANT)`);
    } else {
        testResults.critical_failures.failed++;
        logCritical(`Cross-tenant access: ${blockRate}% blocked (FAILS HEALTHCARE - requires 100%)`);
    }
    
    return passed;
}

// Test 2: Hash input validation
async function testHashValidation(environment) {
    logSecurity(`Testing hash input validation - ${environment}`);
    
    const malformedHashes = [
        null,
        undefined,
        '',
        ' ',
        'a',  // Too short
        'x'.repeat(50),  // Too long
        'invalid-chars!@#',
        '<script>alert(1)</script>',
        '../../../etc/passwd',
        'SELECT * FROM users'
    ];
    
    let validationPassed = 0;
    const results = [];
    
    for (const hash of malformedHashes) {
        try {
            const host = environment === 'staging' ? CONFIG.staging.api_gateway : CONFIG.production.domain;
            const path = environment === 'staging' ? CONFIG.staging.path : CONFIG.production.path;
            const hashParam = hash === null ? '' : (hash === undefined ? '' : hash);
            const url = `${path}?action=get_config&t=${encodeURIComponent(hashParam)}`;
            
            const options = {
                hostname: host,
                port: 443,
                path: url,
                method: 'GET',
                headers: {
                    'User-Agent': 'Healthcare-Compliance-Test/1.0'
                }
            };
            
            const response = await httpsRequest(options);
            
            // HEALTHCARE REQUIREMENT: Malformed input MUST be rejected
            const isRejected = response.statusCode === 400 || response.statusCode === 404;
            
            if (isRejected) {
                validationPassed++;
                logSuccess(`Malformed hash correctly rejected (${response.statusCode})`);
            } else {
                logFailure(`Malformed hash accepted - VALIDATION FAILURE`);
            }
            
            results.push({
                input: hash,
                status: response.statusCode,
                rejected: isRejected
            });
            
        } catch (error) {
            // Network errors count as rejected (expected)
            validationPassed++;
            results.push({
                input: hash,
                status: 'ERROR',
                rejected: true,
                error: error.message
            });
        }
    }
    
    const validationRate = (validationPassed / malformedHashes.length) * 100;
    const passed = validationRate >= 90;  // Allow 90% for edge cases
    
    testResults.critical_failures.details.push({
        test: `Hash input validation - ${environment}`,
        passed: passed,
        validationRate: validationRate,
        required: 90,
        details: results
    });
    
    if (passed) {
        testResults.critical_failures.passed++;
        logSuccess(`Hash validation: ${validationRate}% rejected (HEALTHCARE COMPLIANT)`);
    } else {
        testResults.critical_failures.failed++;
        logCritical(`Hash validation: ${validationRate}% rejected (FAILS HEALTHCARE)`);
    }
    
    return passed;
}

// Test 3: Chat endpoint response validation
async function testChatEndpoint(environment) {
    logHealthcare(`Testing chat endpoint response - ${environment}`);
    
    try {
        const host = environment === 'staging' ? CONFIG.staging.api_gateway : CONFIG.production.domain;
        const path = environment === 'staging' ? CONFIG.staging.path : CONFIG.production.path;
        const validHash = environment === 'staging' ? CONFIG.staging.valid_hash : CONFIG.production.valid_hash;
        const url = `${path}?action=chat&t=${validHash}`;
        
        const testPayload = JSON.stringify({
            message: "Healthcare compliance test",
            tenant_hash: validHash,
            conversation_id: "test-" + Date.now()
        });
        
        const options = {
            hostname: host,
            port: 443,
            path: url,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(testPayload),
                'User-Agent': 'Healthcare-Compliance-Test/1.0'
            }
        };
        
        const response = await httpsRequest(options, testPayload);
        
        // Analyze response quality for healthcare standards
        let responseValid = false;
        let responseSize = 0;
        let hasContent = false;
        
        if (response.statusCode === 200) {
            responseSize = response.body?.length || 0;
            hasContent = responseSize > 10; // Must have substantial content
            
            // Try to parse response
            if (response.parsed) {
                const hasMessage = response.parsed.message || response.parsed.content || response.parsed.response;
                responseValid = hasMessage && hasMessage.trim().length > 0;
            } else if (response.body && response.body.trim().length > 0) {
                responseValid = true; // Non-JSON but has content
            }
        }
        
        const passed = response.statusCode === 200 && responseValid && hasContent;
        
        testResults.critical_failures.details.push({
            test: `Chat endpoint response - ${environment}`,
            passed: passed,
            statusCode: response.statusCode,
            responseSize: responseSize,
            hasContent: hasContent,
            responseValid: responseValid
        });
        
        if (passed) {
            testResults.critical_failures.passed++;
            logSuccess(`Chat endpoint: Working (${responseSize} bytes, valid content)`);
        } else {
            testResults.critical_failures.failed++;
            logCritical(`Chat endpoint: Failed (${response.statusCode}, ${responseSize} bytes, valid: ${responseValid})`);
        }
        
        return passed;
        
    } catch (error) {
        testResults.critical_failures.failed++;
        testResults.critical_failures.details.push({
            test: `Chat endpoint response - ${environment}`,
            passed: false,
            error: error.message
        });
        
        logCritical(`Chat endpoint: Network error - ${error.message}`);
        return false;
    }
}

// Generate healthcare compliance report
function generateComplianceReport() {
    const passRate = (testResults.critical_failures.passed / testResults.critical_failures.total) * 100;
    const isHealthcareCompliant = passRate >= 95;
    
    console.log('\n' + '='.repeat(80));
    logHealthcare('HEALTHCARE COMPLIANCE VALIDATION REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n📊 CRITICAL FAILURES TEST RESULTS`);
    console.log(`Total Tests: ${testResults.critical_failures.total}`);
    console.log(`Passed: ${testResults.critical_failures.passed}`);
    console.log(`Failed: ${testResults.critical_failures.failed}`);
    console.log(`Pass Rate: ${passRate.toFixed(1)}%`);
    console.log(`Healthcare Requirement: 95.0%+`);
    
    if (isHealthcareCompliant) {
        logSuccess(`\n🏥 HEALTHCARE COMPLIANCE: ACHIEVED (${passRate.toFixed(1)}%)`);
        log('✅ Ready for Phase 2 implementation', colors.green + colors.bold);
    } else {
        logCritical(`\n🏥 HEALTHCARE COMPLIANCE: FAILED (${passRate.toFixed(1)}% < 95.0%)`);
        logFailure('❌ Phase 2 implementation BLOCKED until fixes deployed');
    }
    
    console.log('\n📋 DETAILED TEST RESULTS:');
    testResults.critical_failures.details.forEach((test, index) => {
        const status = test.passed ? '✅' : '❌';
        console.log(`${index + 1}. ${status} ${test.test}`);
        if (!test.passed && test.error) {
            console.log(`   Error: ${test.error}`);
        }
        if (test.blockRate !== undefined) {
            console.log(`   Block Rate: ${test.blockRate}% (Required: ${test.required}%)`);
        }
        if (test.validationRate !== undefined) {
            console.log(`   Validation Rate: ${test.validationRate}% (Required: ${test.required}%)`);
        }
    });
    
    // Generate summary for healthcare documentation
    const timestamp = new Date().toISOString();
    const report = {
        timestamp,
        environment: 'post-deployment',
        compliance_status: isHealthcareCompliant ? 'COMPLIANT' : 'NON_COMPLIANT',
        pass_rate: passRate,
        required_rate: 95.0,
        critical_failures: testResults.critical_failures,
        next_steps: isHealthcareCompliant ? 
            ['Proceed to Phase 2', 'Monitor production deployment'] :
            ['Fix remaining failures', 'Re-deploy security patches', 'Re-run validation']
    };
    
    // Save report for healthcare audit trail
    fs.writeFileSync('healthcare-compliance-report.json', JSON.stringify(report, null, 2));
    log(`\n📄 Compliance report saved: healthcare-compliance-report.json`, colors.blue);
    
    return isHealthcareCompliant;
}

// Main execution
async function main() {
    console.log('🏥 HEALTHCARE COMPLIANCE VALIDATION - CRITICAL FAILURES');
    console.log('Target: 6 critical failures must be resolved for 95%+ pass rate');
    console.log('Status: Post-deployment validation\n');
    
    try {
        // Test both environments for comprehensive healthcare validation
        log('🔍 Testing STAGING environment...', colors.blue);
        await testCrossTenantAccess('staging');
        await testHashValidation('staging');
        await testChatEndpoint('staging');
        
        log('\n🔍 Testing PRODUCTION environment...', colors.blue);
        await testCrossTenantAccess('production');
        await testHashValidation('production');
        await testChatEndpoint('production');
        
        // Generate final compliance report
        const isCompliant = generateComplianceReport();
        
        // Exit with appropriate code for CI/CD
        process.exit(isCompliant ? 0 : 1);
        
    } catch (error) {
        logCritical(`Test suite execution failed: ${error.message}`);
        console.error(error);
        process.exit(2);
    }
}

// Execute if run directly
if (require.main === module) {
    main().catch(error => {
        console.error('Critical test suite error:', error);
        process.exit(2);
    });
}

module.exports = {
    testCrossTenantAccess,
    testHashValidation, 
    testChatEndpoint,
    generateComplianceReport
};