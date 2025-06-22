#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Validating "Unexpected token exports" Fix\n');

// Files to check
const sourceFile = './widget-frame.html';
const distFile = './dist/widget-frame.html';
const iframeJsFile = './dist/iframe-main.js';

console.log('📁 Checking files...');

// Check if files exist
const checks = [
  { file: sourceFile, name: 'Source widget-frame.html' },
  { file: distFile, name: 'Built widget-frame.html' },
  { file: iframeJsFile, name: 'Built iframe-main.js' }
];

for (const check of checks) {
  if (fs.existsSync(check.file)) {
    console.log(`✅ ${check.name} exists`);
  } else {
    console.log(`❌ ${check.name} missing: ${check.file}`);
    process.exit(1);
  }
}

console.log('\n📜 Analyzing iframe-main.js for ES module exports...');
const iframeContent = fs.readFileSync(iframeJsFile, 'utf8');

// Check for export statements (indicates ES module)
const exportPatterns = [
  /export\s+default/,
  /export\s*\{/,
  /export\s+const/,
  /export\s+function/,
  /export\s+class/
];

let hasExports = false;
const foundExports = [];

for (const pattern of exportPatterns) {
  const matches = iframeContent.match(pattern);
  if (matches) {
    hasExports = true;
    foundExports.push(matches[0]);
  }
}

if (hasExports) {
  console.log('✅ iframe-main.js contains ES module exports:');
  foundExports.forEach(exp => console.log(`   - ${exp}`));
} else {
  console.log('⚠️  No ES module exports found in iframe-main.js');
}

console.log('\n📜 Analyzing widget-frame.html files...');

function analyzeWidgetFrame(filePath, label) {
  console.log(`\n🔍 Checking ${label}:`);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for the production script loading section
  const productionSectionMatch = content.match(/\/\/ Production mode[\s\S]*?script\.src = ['"]\/iframe-main\.js['"];/);
  
  if (productionSectionMatch) {
    const section = productionSectionMatch[0];
    console.log('   Production loading code found:');
    console.log('   ```');
    console.log('   ' + section.replace(/\n/g, '\n   '));
    console.log('   ```');
    
    // Check if script.type = 'module' is present
    const hasModuleType = section.includes("script.type = 'module'");
    
    if (hasModuleType) {
      console.log('   ✅ script.type = "module" is SET - ES modules will load correctly');
      return true;
    } else {
      console.log('   ❌ script.type = "module" is MISSING - would cause exports error');
      return false;
    }
  } else {
    console.log('   ❌ Production loading section not found');
    return false;
  }
}

const sourceOk = analyzeWidgetFrame(sourceFile, 'Source file');
const distOk = analyzeWidgetFrame(distFile, 'Built file');

console.log('\n📊 Final Validation Results:');
console.log(`   iframe-main.js has exports: ${hasExports ? '✅' : '❌'}`);
console.log(`   Source file has module type: ${sourceOk ? '✅' : '❌'}`);
console.log(`   Built file has module type: ${distOk ? '✅' : '❌'}`);

if (hasExports && sourceOk && distOk) {
  console.log('\n🎉 VALIDATION PASSED!');
  console.log('   The "Unexpected token exports" error should be completely resolved.');
  console.log('   ✅ iframe-main.js contains ES module syntax');
  console.log('   ✅ widget-frame.html loads it with type="module"');
  console.log('   ✅ Both source and built versions are correct');
  
  console.log('\n🚀 Ready for production deployment!');
  console.log('   Upload the dist/ folder contents to your server and test.');
  
} else {
  console.log('\n❌ VALIDATION FAILED!');
  
  if (!hasExports) {
    console.log('   - iframe-main.js does not contain ES module exports');
  }
  if (!sourceOk) {
    console.log('   - Source widget-frame.html missing module type setting');
  }
  if (!distOk) {
    console.log('   - Built widget-frame.html missing module type setting');
    console.log('   - Run "npm run build" to rebuild with the fix');
  }
}

console.log('\n🔗 Next steps:');
console.log('   1. If validation passed: Deploy dist/ folder to production');
console.log('   2. Test on client site and check browser console');
console.log('   3. Verify no "Unexpected token exports" errors appear'); 