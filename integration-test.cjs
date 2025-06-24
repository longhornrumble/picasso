#!/usr/bin/env node

/**
 * Picasso Production Integration Test
 * Tests actual production endpoints and services
 */

const https = require('https');
const { URL } = require('url');

// Configuration
const CONFIG = {
    productionDomain: 'https://chat.myrecruiter.ai',
    lambdaEndpoint: 'https://chat.myrecruiter.ai/Master_Function',
    s3Bucket: 'https://picassocode.s3.amazonaws.com',
    testTenantHash: 'test-integration-' + Date.now(),
    timeout: 10000 // 10 seconds
};

// Colors for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// Test results
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, passed, message, details = null) {
    const status = passed ? 'PASS' : 'FAIL';
    const color = passed ? 'green' : 'red';
    
    log(`[${status}] ${name}: ${message}`, color);
    
    if (details) {
        console.log('  Details:', JSON.stringify(details, null, 2));
    }
    
    results.tests.push({ name, passed, message, details });
    if (passed) results.passed++;
    else results.failed++;
}

// HTTP request helper
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        
        const requestOptions = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Picasso-Integration-Test/1.0',
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

// Test 1: Widget.js availability and size
async function testWidgetAvailability() {
    log('\n📦 Testing widget.js availability...', 'cyan');
    
    try {
        const startTime = Date.now();
        const response = await makeRequest(`${CONFIG.productionDomain}/widget.js`);
        const loadTime = Date.now() - startTime;
        
        if (response.statusCode === 200) {
            const size = parseInt(response.headers['content-length'] || '0');
            const sizeKB = (size / 1024).toFixed(1);
            
            logTest('Widget Availability', true, 
                `Widget loaded in ${loadTime}ms (${sizeKB}KB)`, {
                    loadTime,
                    size,
                    contentType: response.headers['content-type']
                });
            
            // Check size limit
            if (size > 150 * 1024) {
                logTest('Widget Size', false, 
                    `Widget size (${sizeKB}KB) exceeds 150KB limit`);
            } else {
                logTest('Widget Size', true, 
                    `Widget size (${sizeKB}KB) within limits`);
            }
            
            // Check for production domain in content
            if (response.data.includes('https://chat.myrecruiter.ai')) {
                logTest('Widget Endpoints', true, 'Production endpoints configured');
            } else {
                logTest('Widget Endpoints', false, 'Production endpoints not found');
            }
            
        } else {
            logTest('Widget Availability', false, 
                `HTTP ${response.statusCode}`, response.headers);
        }
    } catch (error) {
        logTest('Widget Availability', false, error.message);
    }
}

// Test 2: Config endpoint
async function testConfigEndpoint() {
    log('\n⚙️ Testing configuration endpoint...', 'cyan');
    
    try {
        const startTime = Date.now();
        const url = `${CONFIG.lambdaEndpoint}?action=get_config&t=${CONFIG.testTenantHash}`;
        const response = await makeRequest(url);
        const responseTime = Date.now() - startTime;
        
        if (response.statusCode === 200) {
            const config = response.json();
            
            if (config) {
                logTest('Config Endpoint', true, 
                    `Config loaded in ${responseTime}ms`, {
                        responseTime,
                        configKeys: Object.keys(config)
                    });
                
                // Validate config structure
                const requiredFields = ['tenantId', 'theme', 'branding'];
                const hasAllFields = requiredFields.every(field => config[field] !== undefined);
                
                if (hasAllFields) {
                    logTest('Config Structure', true, 'All required fields present');
                } else {
                    logTest('Config Structure', false, 'Missing required config fields');
                }
            } else {
                logTest('Config Endpoint', false, 'Invalid JSON response');
            }
        } else {
            logTest('Config Endpoint', false, 
                `HTTP ${response.statusCode}`, response.data);
        }
    } catch (error) {
        logTest('Config Endpoint', false, error.message);
    }
}

// Test 3: Chat endpoint
async function testChatEndpoint() {
    log('\n💬 Testing chat endpoint...', 'cyan');
    
    try {
        const message = {
            message: 'Integration test message',
            sessionId: 'test-session-' + Date.now(),
            timestamp: new Date().toISOString()
        };
        
        const startTime = Date.now();
        const url = `${CONFIG.lambdaEndpoint}?action=chat&t=${CONFIG.testTenantHash}`;
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
            
            if (result) {
                logTest('Chat Endpoint', true, 
                    `Message processed in ${responseTime}ms`, {
                        responseTime,
                        hasResponse: !!result.response
                    });
            } else {
                logTest('Chat Endpoint', false, 'Invalid JSON response');
            }
        } else {
            logTest('Chat Endpoint', false, 
                `HTTP ${response.statusCode}`, response.data);
        }
    } catch (error) {
        logTest('Chat Endpoint', false, error.message);
    }
}

// Test 4: Error logging endpoint
async function testErrorLogging() {
    log('\n🛡️ Testing error logging endpoint...', 'cyan');
    
    try {
        const errorData = {
            error: 'Test error from integration test',
            type: 'integration-test',
            timestamp: new Date().toISOString(),
            userAgent: 'Picasso-Integration-Test/1.0',
            url: 'integration-test'
        };
        
        const url = `${CONFIG.lambdaEndpoint}?action=log_error`;
        const response = await makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(errorData)
        });
        
        if (response.statusCode === 200) {
            logTest('Error Logging', true, 'Error logged successfully');
        } else {
            logTest('Error Logging', false, 
                `HTTP ${response.statusCode}`, response.data);
        }
    } catch (error) {
        logTest('Error Logging', false, error.message);
    }
}

// Test 5: S3 assets
async function testS3Assets() {
    log('\n📁 Testing S3 asset delivery...', 'cyan');
    
    try {
        // Test widget-frame.html
        const frameUrl = `${CONFIG.productionDomain}/widget-frame.html`;
        const response = await makeRequest(frameUrl);
        
        if (response.statusCode === 200) {
            logTest('S3 Assets', true, 'widget-frame.html accessible');
            
            // Check for correct content type
            const contentType = response.headers['content-type'];
            if (contentType && contentType.includes('text/html')) {
                logTest('S3 Content-Type', true, 'Correct content-type for HTML');
            } else {
                logTest('S3 Content-Type', false, 
                    `Wrong content-type: ${contentType}`);
            }
        } else {
            logTest('S3 Assets', false, 
                `widget-frame.html HTTP ${response.statusCode}`);
        }
    } catch (error) {
        logTest('S3 Assets', false, error.message);
    }
}

// Test 6: CORS headers
async function testCORSHeaders() {
    log('\n🔒 Testing CORS configuration...', 'cyan');
    
    try {
        const testOrigin = 'https://example.com';
        const response = await makeRequest(`${CONFIG.lambdaEndpoint}?action=get_config&t=test`, {
            headers: {
                'Origin': testOrigin
            }
        });
        
        const corsHeader = response.headers['access-control-allow-origin'];
        
        if (corsHeader) {
            if (corsHeader === '*' || corsHeader === testOrigin) {
                logTest('CORS Headers', true, 
                    `CORS header present: ${corsHeader}`);
            } else {
                logTest('CORS Headers', false, 
                    `Unexpected CORS header: ${corsHeader}`);
            }
        } else {
            logTest('CORS Headers', false, 'No CORS headers found');
        }
    } catch (error) {
        logTest('CORS Headers', false, error.message);
    }
}

// Test 7: Health check
async function testHealthCheck() {
    log('\n❤️ Testing health check endpoint...', 'cyan');
    
    try {
        const healthUrl = `${CONFIG.productionDomain}/health`;
        const response = await makeRequest(healthUrl);
        
        if (response.statusCode === 200) {
            const health = response.json();
            if (health && health.status === 'healthy') {
                logTest('Health Check', true, 'Service is healthy', health);
            } else {
                logTest('Health Check', false, 'Service unhealthy', health);
            }
        } else if (response.statusCode === 404) {
            logTest('Health Check', true, 
                'Health endpoint not implemented (optional)');
        } else {
            logTest('Health Check', false, 
                `HTTP ${response.statusCode}`, response.data);
        }
    } catch (error) {
        logTest('Health Check', false, error.message);
    }
}

// Test 8: Performance metrics
async function testPerformanceMetrics() {
    log('\n⚡ Testing performance metrics...', 'cyan');
    
    const metrics = {
        widgetLoad: null,
        configLoad: null,
        firstMessage: null
    };
    
    try {
        // Measure widget load time
        const widgetStart = Date.now();
        await makeRequest(`${CONFIG.productionDomain}/widget.js`);
        metrics.widgetLoad = Date.now() - widgetStart;
        
        // Measure config load time
        const configStart = Date.now();
        await makeRequest(`${CONFIG.lambdaEndpoint}?action=get_config&t=perf-test`);
        metrics.configLoad = Date.now() - configStart;
        
        // Measure first message time
        const messageStart = Date.now();
        await makeRequest(`${CONFIG.lambdaEndpoint}?action=chat&t=perf-test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'perf test' })
        });
        metrics.firstMessage = Date.now() - messageStart;
        
        // Check against targets
        const targets = {
            widgetLoad: 500,
            configLoad: 200,
            firstMessage: 1000
        };
        
        let allWithinTarget = true;
        Object.entries(metrics).forEach(([key, value]) => {
            const withinTarget = value <= targets[key];
            if (!withinTarget) allWithinTarget = false;
            
            logTest(`Performance - ${key}`, withinTarget,
                `${value}ms (target: ${targets[key]}ms)`);
        });
        
        if (allWithinTarget) {
            logTest('Performance Overall', true, 'All metrics within targets', metrics);
        } else {
            logTest('Performance Overall', false, 'Some metrics exceed targets', metrics);
        }
        
    } catch (error) {
        logTest('Performance Metrics', false, error.message);
    }
}

// Main execution
async function runIntegrationTests() {
    console.clear();
    log('🚀 PICASSO PRODUCTION INTEGRATION TESTS', 'blue');
    log('=' .repeat(50), 'blue');
    log(`Environment: ${CONFIG.productionDomain}`);
    log(`Started: ${new Date().toISOString()}`);
    log('=' .repeat(50), 'blue');
    
    // Run all tests
    await testWidgetAvailability();
    await testConfigEndpoint();
    await testChatEndpoint();
    await testErrorLogging();
    await testS3Assets();
    await testCORSHeaders();
    await testHealthCheck();
    await testPerformanceMetrics();
    
    // Summary
    log('\n' + '=' .repeat(50), 'blue');
    log('📊 TEST SUMMARY', 'blue');
    log('=' .repeat(50), 'blue');
    log(`✅ Passed: ${results.passed}`, 'green');
    log(`❌ Failed: ${results.failed}`, 'red');
    log(`📈 Total: ${results.tests.length}`);
    
    // Detailed results
    if (results.failed > 0) {
        log('\n❌ FAILED TESTS:', 'red');
        results.tests.filter(t => !t.passed).forEach(test => {
            log(`  - ${test.name}: ${test.message}`, 'red');
        });
    }
    
    // Exit code
    const exitCode = results.failed > 0 ? 1 : 0;
    log(`\n${results.failed > 0 ? '❌ TESTS FAILED' : '✅ ALL TESTS PASSED'}`, 
        results.failed > 0 ? 'red' : 'green');
    
    process.exit(exitCode);
}

// Handle errors
process.on('unhandledRejection', (error) => {
    log(`\n❌ Unhandled error: ${error.message}`, 'red');
    process.exit(1);
});

// Run tests
runIntegrationTests();