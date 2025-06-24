#!/usr/bin/env node

/**
 * Production Checklist Script
 * Validates the Picasso widget is ready for production deployment
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

// Test results tracking
const results = {
    passed: [],
    failed: [],
    warnings: []
};

function log(message, type = 'info') {
    const color = type === 'pass' ? colors.green : 
                  type === 'fail' ? colors.red : 
                  type === 'warn' ? colors.yellow : 
                  colors.blue;
    console.log(`${color}${message}${colors.reset}`);
}

function addResult(test, status, message) {
    const result = { test, message };
    if (status === 'pass') results.passed.push(result);
    else if (status === 'fail') results.failed.push(result);
    else if (status === 'warn') results.warnings.push(result);
    
    log(`[${status.toUpperCase()}] ${test}: ${message}`, status);
}

// Test 1: Check for console.log statements in production files
function checkConsoleLogs() {
    log('\n🔍 Checking for console.log statements...');
    
    const filesToCheck = [
        'dist/widget.js',
        'dist/assets/iframe.js',
        'dist/assets/main.js',
        'dist/assets/widget-frame.js'
    ];
    
    let consoleLogsFound = false;
    const consolePatterns = [
        /console\.(log|debug|info)\(/g,
        /debugger/g
    ];
    
    filesToCheck.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            
            consolePatterns.forEach(pattern => {
                const matches = content.match(pattern);
                if (matches && matches.length > 0) {
                    consoleLogsFound = true;
                    addResult('Console Logs', 'fail', 
                        `Found ${matches.length} console statements in ${file}`);
                }
            });
        }
    });
    
    if (!consoleLogsFound) {
        addResult('Console Logs', 'pass', 'No console.log statements found in production files');
    }
}

// Test 2: Check bundle sizes
function checkBundleSize() {
    log('\n📦 Checking bundle sizes...');
    
    const maxSizes = {
        'dist/widget.js': 150 * 1024, // 150KB
        'dist/assets/iframe.js': 300 * 1024, // 300KB for main app
        'dist/assets/vendor-react-*.js': 200 * 1024 // 200KB for React vendor
    };
    
    Object.entries(maxSizes).forEach(([pattern, maxSize]) => {
        const files = pattern.includes('*') 
            ? fs.readdirSync(path.join(__dirname, 'dist/assets'))
                .filter(f => f.match(new RegExp(pattern.replace('*', '.*'))))
                .map(f => `dist/assets/${f}`)
            : [pattern];
            
        files.forEach(file => {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                const sizeKB = (stats.size / 1024).toFixed(1);
                const maxKB = (maxSize / 1024).toFixed(0);
                
                if (stats.size > maxSize) {
                    addResult('Bundle Size', 'fail', 
                        `${file} is ${sizeKB}KB (max: ${maxKB}KB)`);
                } else {
                    addResult('Bundle Size', 'pass', 
                        `${file} is ${sizeKB}KB (within ${maxKB}KB limit)`);
                }
            }
        });
    });
}

// Test 3: Validate endpoint configuration
function checkEndpoints() {
    log('\n🌐 Checking endpoint configuration...');
    
    const productionEndpoints = [
        'https://chat.myrecruiter.ai',
        'https://picassocode.s3.amazonaws.com'
    ];
    
    const stagingEndpoints = [
        'staging-chat.myrecruiter.ai',
        'picassostaging.s3.amazonaws.com',
        'localhost'
    ];
    
    // Check widget.js
    const widgetPath = path.join(__dirname, 'dist/widget.js');
    if (fs.existsSync(widgetPath)) {
        const widgetContent = fs.readFileSync(widgetPath, 'utf8');
        
        // Check for production endpoints
        let hasProductionEndpoints = false;
        productionEndpoints.forEach(endpoint => {
            if (widgetContent.includes(endpoint)) {
                hasProductionEndpoints = true;
            }
        });
        
        // Check for staging endpoints (should not be in production)
        let hasStagingEndpoints = false;
        stagingEndpoints.forEach(endpoint => {
            if (widgetContent.includes(endpoint)) {
                hasStagingEndpoints = true;
                addResult('Endpoints', 'fail', 
                    `Found staging endpoint "${endpoint}" in production build`);
            }
        });
        
        if (hasProductionEndpoints && !hasStagingEndpoints) {
            addResult('Endpoints', 'pass', 'Production endpoints correctly configured');
        } else if (!hasProductionEndpoints) {
            addResult('Endpoints', 'fail', 'Production endpoints not found');
        }
    }
}

// Test 4: Check postMessage security
function checkPostMessageSecurity() {
    log('\n🔒 Checking postMessage security...');
    
    const widgetPath = path.join(__dirname, 'dist/widget.js');
    if (fs.existsSync(widgetPath)) {
        const content = fs.readFileSync(widgetPath, 'utf8');
        
        // Check for origin validation
        if (content.includes('isValidOrigin') || content.includes('event.origin')) {
            addResult('PostMessage Security', 'pass', 'Origin validation found');
        } else {
            addResult('PostMessage Security', 'fail', 'No origin validation found');
        }
        
        // Check for wildcard origins
        if (content.includes("'*'") && content.includes('postMessage')) {
            addResult('PostMessage Security', 'warn', 
                'Wildcard origin (*) found in postMessage calls');
        }
    }
}

// Test 5: Validate required files
function checkRequiredFiles() {
    log('\n📁 Checking required files...');
    
    const requiredFiles = [
        'dist/widget.js',
        'dist/widget-frame.html',
        'dist/assets/iframe.js',
        'dist/index.html',
        'dist/fullpage.html'
    ];
    
    requiredFiles.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            addResult('Required Files', 'pass', `${file} exists`);
        } else {
            addResult('Required Files', 'fail', `${file} is missing`);
        }
    });
}

// Test 6: Check for development artifacts
function checkDevArtifacts() {
    log('\n🧹 Checking for development artifacts...');
    
    const devPatterns = [
        /localhost:\d{4}/g,
        /VITE_/g,
        /import\.meta\.env/g,
        /process\.env\.NODE_ENV/g
    ];
    
    const widgetPath = path.join(__dirname, 'dist/widget.js');
    if (fs.existsSync(widgetPath)) {
        const content = fs.readFileSync(widgetPath, 'utf8');
        
        devPatterns.forEach((pattern, index) => {
            const matches = content.match(pattern);
            if (matches && matches.length > 0) {
                addResult('Dev Artifacts', 'warn', 
                    `Found ${matches.length} instances of dev pattern: ${pattern.source}`);
            }
        });
        
        // Check for source maps
        if (content.includes('//# sourceMappingURL')) {
            addResult('Dev Artifacts', 'warn', 'Source maps found in production build');
        }
    }
    
    // Check for dev-specific files
    const devFiles = ['dist/dev-widget-frame.html', 'dist/.env'];
    devFiles.forEach(file => {
        if (fs.existsSync(path.join(__dirname, file))) {
            addResult('Dev Artifacts', 'fail', `Development file ${file} found in dist`);
        }
    });
}

// Test 7: Validate error handling
function checkErrorHandling() {
    log('\n🛡️ Checking error handling...');
    
    const widgetPath = path.join(__dirname, 'dist/widget.js');
    if (fs.existsSync(widgetPath)) {
        const content = fs.readFileSync(widgetPath, 'utf8');
        
        // Check for try-catch blocks
        const tryCatchCount = (content.match(/try\s*{/g) || []).length;
        if (tryCatchCount > 5) {
            addResult('Error Handling', 'pass', 
                `Found ${tryCatchCount} try-catch blocks`);
        } else {
            addResult('Error Handling', 'warn', 
                `Only ${tryCatchCount} try-catch blocks found`);
        }
        
        // Check for error reporting endpoint
        if (content.includes('log_error') || content.includes('errorReporting')) {
            addResult('Error Handling', 'pass', 'Error reporting endpoint configured');
        } else {
            addResult('Error Handling', 'warn', 'No error reporting endpoint found');
        }
    }
}

// Test 8: Performance checks
function checkPerformance() {
    log('\n⚡ Checking performance optimizations...');
    
    // Check for minification
    const widgetPath = path.join(__dirname, 'dist/widget.js');
    if (fs.existsSync(widgetPath)) {
        const content = fs.readFileSync(widgetPath, 'utf8');
        const lines = content.split('\n');
        
        // Minified files typically have very long lines
        const avgLineLength = content.length / lines.length;
        if (avgLineLength > 500) {
            addResult('Performance', 'pass', 'Code appears to be minified');
        } else {
            addResult('Performance', 'fail', 'Code does not appear to be minified');
        }
        
        // Check for performance monitoring
        if (content.includes('performance.now') || content.includes('performanceTracking')) {
            addResult('Performance', 'pass', 'Performance monitoring found');
        } else {
            addResult('Performance', 'warn', 'No performance monitoring found');
        }
    }
}

// Main execution
function runChecklist() {
    log(`\n${'='.repeat(60)}`);
    log('🚀 PICASSO PRODUCTION CHECKLIST');
    log(`${'='.repeat(60)}`);
    log(`Checking build in: ${path.join(__dirname, 'dist')}`);
    log(`Time: ${new Date().toLocaleString()}`);
    
    // Check if dist folder exists
    if (!fs.existsSync(path.join(__dirname, 'dist'))) {
        log('\n❌ ERROR: dist folder not found. Run "npm run build:production" first.', 'fail');
        process.exit(1);
    }
    
    // Run all checks
    checkConsoleLogs();
    checkBundleSize();
    checkEndpoints();
    checkPostMessageSecurity();
    checkRequiredFiles();
    checkDevArtifacts();
    checkErrorHandling();
    checkPerformance();
    
    // Summary
    log(`\n${'='.repeat(60)}`);
    log('📊 SUMMARY');
    log(`${'='.repeat(60)}`);
    log(`✅ Passed: ${results.passed.length}`, 'pass');
    log(`⚠️  Warnings: ${results.warnings.length}`, 'warn');
    log(`❌ Failed: ${results.failed.length}`, 'fail');
    
    // Exit code based on failures
    if (results.failed.length > 0) {
        log('\n❌ PRODUCTION READINESS: FAILED', 'fail');
        log('Fix the above issues before deploying to production.');
        process.exit(1);
    } else if (results.warnings.length > 0) {
        log('\n⚠️  PRODUCTION READINESS: PASSED WITH WARNINGS', 'warn');
        log('Review warnings before deploying.');
        process.exit(0);
    } else {
        log('\n✅ PRODUCTION READINESS: PASSED', 'pass');
        log('Ready for production deployment!');
        process.exit(0);
    }
}

// Run the checklist
runChecklist();