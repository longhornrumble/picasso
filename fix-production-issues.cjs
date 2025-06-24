#!/usr/bin/env node

/**
 * Quick fixes for production issues
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing production issues...\n');

// 1. Remove dev-widget-frame.html from dist
const devFramePath = path.join(__dirname, 'dist/dev-widget-frame.html');
if (fs.existsSync(devFramePath)) {
    fs.unlinkSync(devFramePath);
    console.log('✅ Removed dev-widget-frame.html from dist');
}

// 2. Remove console.log statements from widget.js
const widgetPath = path.join(__dirname, 'dist/widget.js');
if (fs.existsSync(widgetPath)) {
    let content = fs.readFileSync(widgetPath, 'utf8');
    
    // Remove console.log, console.debug, console.info statements
    // Keep console.error and console.warn for production debugging
    content = content.replace(/console\.(log|debug|info)\([^)]*\);?/g, '');
    
    // Remove localhost references (replace with production domain)
    content = content.replace(/localhost:\d{4}/g, 'chat.myrecruiter.ai');
    content = content.replace(/http:\/\/localhost/g, 'https://chat.myrecruiter.ai');
    
    fs.writeFileSync(widgetPath, content);
    console.log('✅ Removed console.log statements from widget.js');
    console.log('✅ Replaced localhost references with production domain');
}

// 3. Check other built files
const assetFiles = [
    'dist/assets/iframe.js',
    'dist/assets/main.js',
    'dist/assets/widget-frame.js'
];

assetFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Remove console statements
        const originalLength = content.length;
        content = content.replace(/console\.(log|debug|info)\([^)]*\);?/g, '');
        
        if (content.length < originalLength) {
            fs.writeFileSync(filePath, content);
            console.log(`✅ Cleaned console statements from ${file}`);
        }
    }
});

console.log('\n🎉 Production fixes applied!');
console.log('⚠️  Note: These are quick fixes. For a proper production build:');
console.log('   1. Run "npm run build:production" with proper environment variables');
console.log('   2. Ensure Vite is configured for production minification');
console.log('   3. Add proper error handling and monitoring');