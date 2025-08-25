#!/usr/bin/env node

/**
 * Custom build script for widget-loader.js
 * Processes the widget loader to remove console statements and localhost references
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const WIDGET_LOADER_SOURCE = path.join(__dirname, '..', 'public', 'src', 'widget', 'widget-loader.js');
const WIDGET_OUTPUT = path.join(__dirname, '..', 'dist', 'widget.js');

async function processWidgetLoader() {
  console.log('🔧 Processing widget loader for production...');
  
  try {
    // Read the source file
    let source = fs.readFileSync(WIDGET_LOADER_SOURCE, 'utf8');
    
    console.log('📝 Original widget.js size:', (source.length / 1024).toFixed(1), 'KB');
    
    // Fix environment detection issues - replace localhost hardcodes
    source = source.replace(
      /widgetDomain = `\${window\.location\.protocol}\/\/\${window\.location\.hostname}:5174`;/g,
      'widgetDomain = "https://chat.myrecruiter.ai";'
    );
    
    // Remove development-specific localhost detection for production
    source = source.replace(
      /const isLocalhost = window\.location\.hostname === 'localhost' \|\| window\.location\.hostname === '127\.0\.0\.1';/g,
      'const isLocalhost = false; // Disabled in production build'
    );
    
    source = source.replace(
      /isLocalhost; \/\/ Auto-detect localhost as dev mode/g,
      'false; // Localhost detection disabled in production'
    );
    
    // Fix localhost origin validation - make it more restrictive for production
    source = source.replace(
      /const isLocalhost = origin\.includes\('localhost'\) \|\| origin\.includes\('127\.0\.0\.1'\);/g,
      'const isLocalhost = false; // Localhost disabled in production'
    );
    
    console.log('✅ Applied environment fixes');
    
    // Apply Terser minification with aggressive console removal
    const result = await minify(source, {
      compress: {
        drop_console: true,        // Remove all console.* statements
        drop_debugger: true,       // Remove debugger statements
        pure_funcs: [
          'console.log', 'console.info', 'console.debug', 'console.warn', 
          'console.error', 'console.trace', 'console.time', 'console.timeEnd'
        ],
        passes: 2,                 // Run compression passes
        dead_code: true,           // Remove dead code
        unused: true,              // Remove unused variables
        conditionals: true,        // Optimize if-s and conditional expressions
        comparisons: true,         // Optimize comparisons
        evaluate: true,            // Evaluate constant expressions
        booleans: true,            // Optimize boolean expressions
        loops: true,               // Optimize loops
        if_return: true,           // Optimize if-return and if-continue
        join_vars: true,           // Join consecutive var statements
        sequences: true,           // Join consecutive simple statements with comma operator
        collapse_vars: true,       // Collapse single-use variables
        reduce_vars: true,         // Reduce variables assigned once
        properties: true,          // Optimize property access
      },
      mangle: {
        safari10: true,            // Work around Safari 10/11 bugs
        toplevel: true,            // Mangle top-level variable names
        properties: {
          reserved: ['PicassoWidget', 'init', 'open', 'close', 'toggle', 'isOpen', 'isLoaded', 'updateConfig', 'destroy', 'onEvent', 'health']
        }
      },
      format: {
        comments: false,           // Remove all comments
        beautify: false,           // Don't beautify code
        semicolons: true,          // Always use semicolons
        preserve_annotations: false, // Don't preserve annotations
        ecma: 2020,               // Use modern JS features
      },
      sourceMap: false,           // Don't generate source maps
      toplevel: true,             // Enable top-level minification
      nameCache: {},              // Use name cache for consistency
    });
    
    if (result.error) {
      throw result.error;
    }
    
    if (!result.code) {
      throw new Error('Minification produced no output');
    }
    
    console.log('✅ Applied Terser minification');
    console.log('📦 Minified widget.js size:', (result.code.length / 1024).toFixed(1), 'KB');
    console.log('📉 Size reduction:', ((1 - result.code.length / source.length) * 100).toFixed(1), '%');
    
    // Verify no console statements remain
    const consoleMatches = result.code.match(/console\./g);
    if (consoleMatches && consoleMatches.length > 0) {
      console.warn('⚠️  Warning: Found', consoleMatches.length, 'remaining console statements');
    } else {
      console.log('✅ All console statements removed');
    }
    
    // Verify no localhost references remain
    const localhostMatches = result.code.match(/localhost/gi);
    if (localhostMatches && localhostMatches.length > 0) {
      console.warn('⚠️  Warning: Found', localhostMatches.length, 'localhost references:', localhostMatches);
    } else {
      console.log('✅ No localhost references found');
    }
    
    // Write the processed file
    fs.writeFileSync(WIDGET_OUTPUT, result.code, 'utf8');
    console.log('✅ Production widget.js written to:', WIDGET_OUTPUT);
    
    return {
      originalSize: source.length,
      minifiedSize: result.code.length,
      compressionRatio: (1 - result.code.length / source.length) * 100,
      consoleStatementsRemoved: !consoleMatches || consoleMatches.length === 0,
      localhostReferencesRemoved: !localhostMatches || localhostMatches.length === 0
    };
    
  } catch (error) {
    console.error('❌ Error processing widget loader:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  processWidgetLoader()
    .then((stats) => {
      console.log('\n✅ Widget loader processing complete!');
      console.log('📊 Statistics:');
      console.log('  - Original size:', (stats.originalSize / 1024).toFixed(1), 'KB');
      console.log('  - Minified size:', (stats.minifiedSize / 1024).toFixed(1), 'KB');
      console.log('  - Compression ratio:', stats.compressionRatio.toFixed(1), '%');
      console.log('  - Console statements removed:', stats.consoleStatementsRemoved ? '✅' : '❌');
      console.log('  - Localhost references removed:', stats.localhostReferencesRemoved ? '✅' : '❌');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Build failed:', error);
      process.exit(1);
    });
}

module.exports = { processWidgetLoader };