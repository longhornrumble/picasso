#!/usr/bin/env node

/**
 * Production Build Validation Script
 * Comprehensive validation of production build quality
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, type = 'info') {
    const color = type === 'pass' ? colors.green : 
                  type === 'fail' ? colors.red : 
                  type === 'warn' ? colors.yellow : 
                  type === 'info' ? colors.cyan :
                  colors.blue;
    console.log(`${color}${message}${colors.reset}`);
}

function validateBuild() {
    log('\n🔍 COMPREHENSIVE BUILD VALIDATION', 'info');
    log('================================', 'info');
    
    const results = {
        passed: 0,
        warnings: 0,
        failed: 0,
        details: []
    };
    
    function addResult(test, status, message, details = '') {
        results[status === 'pass' ? 'passed' : status === 'warn' ? 'warnings' : 'failed']++;
        results.details.push({ test, status, message, details });
        log(`[${status.toUpperCase()}] ${test}: ${message}`, status);
        if (details) log(`  ${details}`, 'info');
    }
    
    // 1. File Size Analysis
    log('\n📊 File Size Analysis:', 'info');
    const widgetPath = path.join(DIST_DIR, 'widget.js');
    const iframePath = path.join(DIST_DIR, 'assets', 'iframe.js');
    
    if (fs.existsSync(widgetPath)) {
        const stats = fs.statSync(widgetPath);
        const sizeKB = (stats.size / 1024).toFixed(1);
        if (stats.size < 10 * 1024) { // Less than 10KB
            addResult('Widget Size', 'pass', `${sizeKB}KB (excellent compression)`);
        } else if (stats.size < 20 * 1024) { // Less than 20KB
            addResult('Widget Size', 'warn', `${sizeKB}KB (good compression)`);
        } else {
            addResult('Widget Size', 'fail', `${sizeKB}KB (needs optimization)`);
        }
    }
    
    if (fs.existsSync(iframePath)) {
        const stats = fs.statSync(iframePath);
        const sizeKB = (stats.size / 1024).toFixed(1);
        if (stats.size < 50 * 1024) { // Less than 50KB
            addResult('Iframe Bundle', 'pass', `${sizeKB}KB (well optimized)`);
        } else if (stats.size < 100 * 1024) { // Less than 100KB
            addResult('Iframe Bundle', 'warn', `${sizeKB}KB (acceptable size)`);
        } else {
            addResult('Iframe Bundle', 'fail', `${sizeKB}KB (too large)`);
        }
    }
    
    // 2. Code Quality Checks
    log('\n🔬 Code Quality Analysis:', 'info');
    if (fs.existsSync(widgetPath)) {
        const content = fs.readFileSync(widgetPath, 'utf8');
        
        // Check for minification quality
        const avgLineLength = content.length / content.split('\\n').length;
        if (avgLineLength > 1000) {
            addResult('Minification', 'pass', 'Highly minified code');
        } else if (avgLineLength > 200) {
            addResult('Minification', 'warn', 'Moderately minified');
        } else {
            addResult('Minification', 'fail', 'Not properly minified');
        }
        
        // Check for console statements
        const consoleMatches = content.match(/console\\./g);
        if (!consoleMatches || consoleMatches.length === 0) {
            addResult('Console Cleanup', 'pass', 'No console statements found');
        } else {
            addResult('Console Cleanup', 'fail', `Found ${consoleMatches.length} console statements`);
        }
        
        // Check for localhost references
        const localhostMatches = content.match(/localhost/gi);
        if (!localhostMatches || localhostMatches.length === 0) {
            addResult('Environment Config', 'pass', 'No localhost references found');
        } else {
            addResult('Environment Config', 'fail', `Found ${localhostMatches.length} localhost references`);
        }
        
        // Check for security features
        if (content.includes('origin') && content.includes('postMessage')) {
            addResult('Security Features', 'pass', 'Origin validation present');
        } else {
            addResult('Security Features', 'warn', 'Security features may be missing');
        }
    }
    
    // 3. Asset Optimization
    log('\n🎨 Asset Analysis:', 'info');
    const assetDir = path.join(DIST_DIR, 'assets');
    if (fs.existsSync(assetDir)) {
        const assets = fs.readdirSync(assetDir);
        const cssFiles = assets.filter(file => file.endsWith('.css'));
        const jsFiles = assets.filter(file => file.endsWith('.js'));
        
        addResult('Asset Organization', 'pass', `${cssFiles.length} CSS, ${jsFiles.length} JS files`, 
                 `CSS: ${cssFiles.join(', ')}\\nJS: ${jsFiles.join(', ')}`);
        
        // Check CSS file sizes
        cssFiles.forEach(file => {
            const filePath = path.join(assetDir, file);
            const stats = fs.statSync(filePath);
            const sizeKB = (stats.size / 1024).toFixed(1);
            if (stats.size < 50 * 1024) {
                addResult('CSS Size', 'pass', `${file}: ${sizeKB}KB`);
            } else {
                addResult('CSS Size', 'warn', `${file}: ${sizeKB}KB (consider optimization)`);
            }
        });
    }
    
    // 4. Development Artifacts Check
    log('\n🧹 Development Artifacts Check:', 'info');
    const devArtifacts = [
        'dev-widget-frame.html',
        'test.html',
        'debug.html',
        '.env',
        '.env.local'
    ];
    
    let foundArtifacts = 0;
    devArtifacts.forEach(artifact => {
        if (fs.existsSync(path.join(DIST_DIR, artifact))) {
            foundArtifacts++;
            addResult('Dev Artifacts', 'fail', `Found development file: ${artifact}`);
        }
    });
    
    if (foundArtifacts === 0) {
        addResult('Dev Artifacts', 'pass', 'No development artifacts found');
    }
    
    // 5. Required Files Check
    log('\n📁 Required Files Check:', 'info');
    const requiredFiles = [
        'widget.js',
        'widget-frame.html',
        'index.html',
        'fullpage.html'
    ];
    
    requiredFiles.forEach(file => {
        if (fs.existsSync(path.join(DIST_DIR, file))) {
            addResult('Required Files', 'pass', `${file} exists`);
        } else {
            addResult('Required Files', 'fail', `${file} missing`);
        }
    });
    
    // 6. Performance Score
    log('\n⚡ Performance Score:', 'info');
    let score = 100;
    
    // Deduct points for large files
    if (fs.existsSync(widgetPath)) {
        const widgetSize = fs.statSync(widgetPath).size;
        if (widgetSize > 20 * 1024) score -= 10;
        if (widgetSize > 50 * 1024) score -= 20;
    }
    
    // Deduct points for warnings and failures
    score -= results.warnings * 5;
    score -= results.failed * 15;
    
    if (score >= 90) {
        addResult('Performance Score', 'pass', `${score}/100 (Excellent)`);
    } else if (score >= 75) {
        addResult('Performance Score', 'warn', `${score}/100 (Good)`);
    } else {
        addResult('Performance Score', 'fail', `${score}/100 (Needs Improvement)`);
    }
    
    // Summary
    log('\\n' + '='.repeat(50), 'info');
    log('📊 VALIDATION SUMMARY', 'info');
    log('='.repeat(50), 'info');
    log(`✅ Passed: ${results.passed}`, 'pass');
    log(`⚠️  Warnings: ${results.warnings}`, 'warn');
    log(`❌ Failed: ${results.failed}`, 'fail');
    
    if (results.failed === 0 && results.warnings === 0) {
        log('\\n🎉 PERFECT BUILD! Ready for production deployment.', 'pass');
        return 0;
    } else if (results.failed === 0) {
        log('\\n✅ BUILD VALIDATION PASSED with warnings. Review warnings before deployment.', 'warn');
        return 0;
    } else {
        log('\\n❌ BUILD VALIDATION FAILED. Fix critical issues before deployment.', 'fail');
        return 1;
    }
}

// Export for use in other scripts
module.exports = { validateBuild };

// Run if called directly
if (require.main === module) {
    const exitCode = validateBuild();
    process.exit(exitCode);
}