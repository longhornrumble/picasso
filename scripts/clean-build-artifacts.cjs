#!/usr/bin/env node

/**
 * Clean development artifacts from production build
 * Removes files that should not be in production
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');

// Files and patterns that should be removed from production build
const DEV_ARTIFACTS = [
  'dev-widget-frame.html',
  '.env',
  '.env.local',
  '.env.development',
  'test.html',
  'harsh-css-test.html',
  'lex-test.html',
  'mobile-test.html',
  'persistence-test.html',
  'persistence-test-2.html',
  'persistence-test-3.html',
  'quick-test.html',
  'size-test.html',
  'test-iframe.html',
  'test-large-iframe.html',
  'test-now.html'
];

// Patterns for files that should be removed
const DEV_PATTERNS = [
  /\.map$/,           // Source maps
  /test.*\.html$/,    // Test HTML files
  /debug.*\.html$/,   // Debug HTML files
  /dev-.*\.html$/,    // Development HTML files
];

function cleanBuildArtifacts() {
  console.log('🧹 Cleaning development artifacts from build...');
  
  if (!fs.existsSync(DIST_DIR)) {
    console.log('❌ Dist directory does not exist');
    return { removedFiles: [], errors: [] };
  }
  
  const removedFiles = [];
  const errors = [];
  
  // Remove specific development files
  DEV_ARTIFACTS.forEach(fileName => {
    const filePath = path.join(DIST_DIR, fileName);
    
    if (fs.existsSync(filePath)) {
      try {
        if (fs.lstatSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
          console.log('🗑️  Removed directory:', fileName);
        } else {
          fs.unlinkSync(filePath);
          console.log('🗑️  Removed file:', fileName);
        }
        removedFiles.push(fileName);
      } catch (error) {
        console.error('❌ Error removing', fileName, ':', error.message);
        errors.push({ file: fileName, error: error.message });
      }
    }
  });
  
  // Recursively check for pattern-based artifacts
  function scanDirectory(dirPath, relativePath = '') {
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
      const itemPath = path.join(dirPath, item);
      const relativeItemPath = path.join(relativePath, item);
      const stats = fs.lstatSync(itemPath);
      
      if (stats.isDirectory()) {
        // Recursively scan subdirectories
        scanDirectory(itemPath, relativeItemPath);
      } else if (stats.isFile()) {
        // Check if file matches any development patterns
        const shouldRemove = DEV_PATTERNS.some(pattern => pattern.test(item));
        
        if (shouldRemove) {
          try {
            fs.unlinkSync(itemPath);
            console.log('🗑️  Removed pattern match:', relativeItemPath);
            removedFiles.push(relativeItemPath);
          } catch (error) {
            console.error('❌ Error removing', relativeItemPath, ':', error.message);
            errors.push({ file: relativeItemPath, error: error.message });
          }
        }
      }
    });
  }
  
  scanDirectory(DIST_DIR);
  
  console.log('✅ Build artifact cleanup complete');
  console.log('📊 Removed', removedFiles.length, 'files');
  
  if (errors.length > 0) {
    console.warn('⚠️  Encountered', errors.length, 'errors during cleanup');
    errors.forEach(({ file, error }) => {
      console.warn(`  - ${file}: ${error}`);
    });
  }
  
  return { removedFiles, errors };
}

// Run if called directly
if (require.main === module) {
  try {
    const result = cleanBuildArtifacts();
    
    if (result.errors.length === 0) {
      console.log('\n✅ All development artifacts cleaned successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Cleanup completed with errors');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

module.exports = { cleanBuildArtifacts };