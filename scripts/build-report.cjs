#!/usr/bin/env node

/**
 * Production Build Report Generator
 * Generates a comprehensive report of build metrics and optimizations
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PACKAGE_JSON = path.join(__dirname, '..', 'package.json');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.cyan) {
    console.log(`${color}${message}${colors.reset}`);
}

function formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function getCompressionRatio(original, compressed) {
    return ((1 - compressed / original) * 100).toFixed(1) + '%';
}

async function generateBuildReport() {
    log('\\n' + '='.repeat(60), colors.bright);
    log('🚀 PICASSO PRODUCTION BUILD REPORT', colors.bright);
    log('='.repeat(60), colors.bright);
    
    const report = {
        timestamp: new Date().toISOString(),
        version: 'unknown',
        files: {},
        totals: {
            files: 0,
            totalSize: 0,
            gzippedSize: 0
        },
        optimizations: {},
        recommendations: []
    };
    
    // Get version from package.json
    try {
        const packageData = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
        report.version = packageData.version;
        log(`📦 Version: ${report.version}`, colors.cyan);
        log(`🕒 Generated: ${new Date(report.timestamp).toLocaleString()}`, colors.cyan);
    } catch (error) {
        log('⚠️  Could not read package.json', colors.yellow);
    }
    
    log('\\n📊 FILE ANALYSIS', colors.bright);
    log('-'.repeat(40), colors.blue);
    
    if (!fs.existsSync(DIST_DIR)) {
        log('❌ Dist directory not found!', colors.red);
        return report;
    }
    
    // Analyze all files in dist
    function analyzeDirectory(dirPath, relativePath = '') {
        const items = fs.readdirSync(dirPath);
        
        items.forEach(item => {
            const itemPath = path.join(dirPath, item);
            const relativeItemPath = path.join(relativePath, item);
            const stats = fs.lstatSync(itemPath);
            
            if (stats.isDirectory()) {
                analyzeDirectory(itemPath, relativeItemPath);
            } else if (stats.isFile()) {
                report.files[relativeItemPath] = {
                    size: stats.size,
                    type: path.extname(item).toLowerCase()
                };
                report.totals.files++;
                report.totals.totalSize += stats.size;
                
                // Log file info
                const sizeStr = formatBytes(stats.size);
                const typeIcon = getFileIcon(path.extname(item));
                log(`  ${typeIcon} ${relativeItemPath.padEnd(40)} ${sizeStr}`, colors.cyan);
            }
        });
    }
    
    analyzeDirectory(DIST_DIR);
    
    // Key file analysis
    log('\\n🎯 KEY FILES ANALYSIS', colors.bright);
    log('-'.repeat(40), colors.blue);
    
    const keyFiles = [
        { name: 'widget.js', description: 'Main widget loader', maxSize: 15 * 1024 },
        { name: 'widget-frame.html', description: 'Widget iframe HTML', maxSize: 10 * 1024 },
        { name: 'assets/iframe.js', description: 'React app bundle', maxSize: 100 * 1024 },
        { name: 'index.html', description: 'Main HTML page', maxSize: 20 * 1024 }
    ];
    
    keyFiles.forEach(({ name, description, maxSize }) => {
        const filePath = path.join(DIST_DIR, name);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const sizeStr = formatBytes(stats.size);
            const status = stats.size <= maxSize ? '✅' : '⚠️ ';
            const statusColor = stats.size <= maxSize ? colors.green : colors.yellow;
            
            log(`  ${status} ${name}`, statusColor);
            log(`     ${description}: ${sizeStr}`, colors.cyan);
            
            if (stats.size > maxSize) {
                report.recommendations.push(`Consider optimizing ${name} (${sizeStr} > ${formatBytes(maxSize)})`);
            }
        } else {
            log(`  ❌ ${name} - MISSING`, colors.red);
            report.recommendations.push(`Missing required file: ${name}`);
        }
    });
    
    // Bundle analysis
    log('\\n📈 BUNDLE ANALYSIS', colors.bright);
    log('-'.repeat(40), colors.blue);
    
    const assetFiles = Object.entries(report.files)
        .filter(([name]) => name.startsWith('assets/'))
        .sort(([, a], [, b]) => b.size - a.size);
    
    if (assetFiles.length > 0) {
        log('  Largest bundles:', colors.cyan);
        assetFiles.slice(0, 5).forEach(([name, info]) => {
            log(`    📄 ${name}: ${formatBytes(info.size)}`, colors.cyan);
        });
        
        // Asset type breakdown
        const assetTypes = {};
        assetFiles.forEach(([name, info]) => {
            const type = info.type || '.unknown';
            if (!assetTypes[type]) {
                assetTypes[type] = { count: 0, size: 0 };
            }
            assetTypes[type].count++;
            assetTypes[type].size += info.size;
        });
        
        log('\\n  Asset breakdown:', colors.cyan);
        Object.entries(assetTypes).forEach(([type, data]) => {
            const icon = getFileIcon(type);
            log(`    ${icon} ${type}: ${data.count} files, ${formatBytes(data.size)}`, colors.cyan);
        });
    }
    
    // Performance metrics
    log('\\n⚡ PERFORMANCE METRICS', colors.bright);
    log('-'.repeat(40), colors.blue);
    
    const widgetPath = path.join(DIST_DIR, 'widget.js');
    if (fs.existsSync(widgetPath)) {
        const content = fs.readFileSync(widgetPath, 'utf8');
        const size = Buffer.byteLength(content, 'utf8');
        
        // Minification analysis
        const lines = content.split('\\n').length;
        const avgLineLength = content.length / lines;
        const isMinified = avgLineLength > 500;
        
        log(`  🔧 Widget.js minification: ${isMinified ? '✅ Minified' : '❌ Not minified'}`, 
            isMinified ? colors.green : colors.red);
        log(`     File size: ${formatBytes(size)}`, colors.cyan);
        log(`     Lines: ${lines}, Avg line length: ${avgLineLength.toFixed(0)} chars`, colors.cyan);
        
        // Console statements check
        const consoleMatches = content.match(/console\\./g);
        const consoleCount = consoleMatches ? consoleMatches.length : 0;
        log(`  🧹 Console statements: ${consoleCount === 0 ? '✅ Removed' : `❌ ${consoleCount} found`}`, 
            consoleCount === 0 ? colors.green : colors.red);
        
        // Localhost references
        const localhostMatches = content.match(/localhost/gi);
        const localhostCount = localhostMatches ? localhostMatches.length : 0;
        log(`  🌐 Localhost references: ${localhostCount === 0 ? '✅ Removed' : `❌ ${localhostCount} found`}`, 
            localhostCount === 0 ? colors.green : colors.red);
        
        report.optimizations = {
            minified: isMinified,
            consoleStatementsRemoved: consoleCount === 0,
            localhostReferencesRemoved: localhostCount === 0,
            widgetSize: size
        };
    }
    
    // Deployment readiness
    log('\\n🚢 DEPLOYMENT READINESS', colors.bright);
    log('-'.repeat(40), colors.blue);
    
    const readinessChecks = [
        { name: 'All key files present', passed: keyFiles.every(f => fs.existsSync(path.join(DIST_DIR, f.name))) },
        { name: 'Widget.js minified', passed: report.optimizations.minified },
        { name: 'Console statements removed', passed: report.optimizations.consoleStatementsRemoved },
        { name: 'No localhost references', passed: report.optimizations.localhostReferencesRemoved },
        { name: 'Bundle size acceptable', passed: report.totals.totalSize < 500 * 1024 } // Under 500KB total
    ];
    
    const passedChecks = readinessChecks.filter(check => check.passed).length;
    const totalChecks = readinessChecks.length;
    const readinessScore = Math.round((passedChecks / totalChecks) * 100);
    
    readinessChecks.forEach(check => {
        const status = check.passed ? '✅' : '❌';
        const color = check.passed ? colors.green : colors.red;
        log(`  ${status} ${check.name}`, color);
    });
    
    log(`\\n  🎯 Readiness Score: ${readinessScore}%`, 
        readinessScore >= 90 ? colors.green : readinessScore >= 70 ? colors.yellow : colors.red);
    
    // Recommendations
    if (report.recommendations.length > 0) {
        log('\\n💡 RECOMMENDATIONS', colors.bright);
        log('-'.repeat(40), colors.blue);
        report.recommendations.forEach(rec => {
            log(`  • ${rec}`, colors.yellow);
        });
    }
    
    // Summary
    log('\\n📋 BUILD SUMMARY', colors.bright);
    log('-'.repeat(40), colors.blue);
    log(`  Total files: ${report.totals.files}`, colors.cyan);
    log(`  Total size: ${formatBytes(report.totals.totalSize)}`, colors.cyan);
    log(`  Readiness: ${readinessScore}%`, colors.cyan);
    
    if (readinessScore === 100) {
        log('\\n🎉 PERFECT BUILD! Ready for production deployment.', colors.green);
    } else if (readinessScore >= 90) {
        log('\\n✅ Excellent build quality. Ready for production.', colors.green);
    } else if (readinessScore >= 70) {
        log('\\n⚠️  Good build quality. Review recommendations.', colors.yellow);
    } else {
        log('\\n❌ Build needs improvement before production deployment.', colors.red);
    }
    
    // Save report to file
    const reportPath = path.join(__dirname, '..', 'build-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`\\n📄 Detailed report saved to: build-report.json`, colors.blue);
    
    log('\\n' + '='.repeat(60), colors.bright);
    
    return report;
}

function getFileIcon(ext) {
    const icons = {
        '.js': '📜',
        '.css': '🎨',
        '.html': '📄',
        '.json': '📋',
        '.png': '🖼️',
        '.jpg': '🖼️',
        '.jpeg': '🖼️',
        '.svg': '🎯',
        '.ico': '🎭',
        '.txt': '📝',
        '.md': '📚'
    };
    return icons[ext] || '📄';
}

// Export for use in other scripts
module.exports = { generateBuildReport };

// Run if called directly
if (require.main === module) {
    generateBuildReport()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('❌ Error generating build report:', error);
            process.exit(1);
        });
}