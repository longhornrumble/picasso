#!/usr/bin/env node
/**
 * Bundle Analysis CLI - BERS Phase 3, Task 3.1
 * 
 * Command-line interface for automated bundle analysis with
 * performance budget enforcement and optimization recommendations.
 * 
 * Usage:
 *   node tools/build/analyze-bundle.js
 *   node tools/build/analyze-bundle.js --environment=production
 *   node tools/build/analyze-bundle.js --all-environments
 *   node tools/build/analyze-bundle.js --output-dir=dist-production
 *   node tools/build/analyze-bundle.js --budget-only
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import { BundleAnalyzer } from './bundle-analyzer.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===== CLI CONFIGURATION ===== */

const CLI_OPTIONS = {
  environment: 'production',
  outputDir: null,
  allEnvironments: false,
  budgetOnly: false,
  saveReport: true,
  verbose: false,
  help: false
};

/* ===== MAIN CLI FUNCTION ===== */

async function main() {
  try {
    // Parse command line arguments
    const options = parseArguments();
    
    // Show help if requested
    if (options.help) {
      showHelp();
      process.exit(0);
    }
    
    console.log('📊 BERS Bundle Analysis CLI');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Determine environments to analyze
    const environments = options.allEnvironments 
      ? ['development', 'staging', 'production']
      : [options.environment];
    
    console.log(`📋 Environments: ${environments.join(', ')}`);
    console.log(`🎯 Budget Enforcement: ${options.budgetOnly ? 'only' : 'enabled'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Create bundle analyzer
    const analyzer = new BundleAnalyzer({
      enableHistoryTracking: true,
      enableBudgetEnforcement: true,
      optimization: {
        duplicateDetection: !options.budgetOnly,
        treeshakeAnalysis: !options.budgetOnly,
        dependencyAnalysis: !options.budgetOnly,
        compressionAnalysis: !options.budgetOnly
      }
    });
    
    const analysisResults = [];
    let overallCompliant = true;
    
    // Analyze each environment
    for (const env of environments) {
      console.log(`\n📊 Analyzing ${env} environment...`);
      
      // Determine output directory
      const outputDir = options.outputDir || (env === 'production' ? 'dist' : `dist-${env}`);
      const fullOutputDir = path.resolve(process.cwd(), outputDir);
      
      // Check if output directory exists
      try {
        await fs.access(fullOutputDir);
      } catch (error) {
        console.warn(`⚠️  Output directory not found: ${fullOutputDir}`);
        console.warn(`   Skipping ${env} environment analysis`);
        continue;
      }
      
      // Perform analysis
      try {
        const result = await analyzer.analyzeBuild(fullOutputDir, env);
        analysisResults.push(result);
        
        // Track overall compliance
        if (!result.budgetCompliance.compliant) {
          overallCompliant = false;
        }
        
        // Print environment summary
        printEnvironmentSummary(result);
        
      } catch (error) {
        console.error(`❌ Analysis failed for ${env}:`, error.message);
        overallCompliant = false;
      }
    }
    
    // Generate comprehensive report
    if (analysisResults.length > 1) {
      printComparisonReport(analysisResults);
    }
    
    // Save detailed reports
    if (options.saveReport && analysisResults.length > 0) {
      await saveDetailedReports(analysisResults);
    }
    
    // Print final summary
    printFinalSummary(analysisResults, overallCompliant);
    
    // Exit with appropriate code
    if (!overallCompliant) {
      console.error('\n❌ Bundle analysis failed: Performance budgets exceeded');
      process.exit(1);
    } else {
      console.log('\n✅ Bundle analysis completed successfully');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Bundle analysis failed:', error.message);
    if (process.env.NODE_ENV === 'development' || CLI_OPTIONS.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/* ===== REPORTING FUNCTIONS ===== */

/**
 * Print environment-specific summary
 * @param {Object} result - Analysis result
 */
function printEnvironmentSummary(result) {
  const metrics = result.metrics;
  const compliance = result.budgetCompliance;
  
  console.log(`\n📊 ${result.environment} Summary:`);
  console.log(`  Bundle Size: ${(metrics.totalSize / 1024).toFixed(1)}KB`);
  console.log(`  Assets: ${metrics.totalAssets}`);
  console.log(`  Chunks: ${metrics.chunks.length}`);
  console.log(`  Initial Load: ${(metrics.initialLoad.total / 1024).toFixed(1)}KB`);
  
  if (metrics.compression.gzip.enabled || metrics.compression.brotli.enabled) {
    console.log('  Compression:');
    if (metrics.compression.gzip.enabled) {
      console.log(`    Gzip: ${metrics.compression.gzip.ratio}% reduction`);
    }
    if (metrics.compression.brotli.enabled) {
      console.log(`    Brotli: ${metrics.compression.brotli.ratio}% reduction`);
    }
  }
  
  console.log(`  Budget: ${compliance.compliant ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (compliance.overages && compliance.overages.length > 0) {
    console.log('  Overages:');
    compliance.overages.forEach(overage => {
      console.log(`    ❌ ${overage.name}: ${overage.percentage}% of budget`);
    });
  }
  
  if (compliance.warnings && compliance.warnings.length > 0) {
    console.log('  Warnings:');
    compliance.warnings.forEach(warning => {
      console.log(`    ⚠️  ${warning.name}: ${warning.percentage}% of budget`);
    });
  }
  
  if (result.recommendations.length > 0) {
    console.log('  Top Recommendations:');
    result.recommendations.slice(0, 3).forEach(rec => {
      console.log(`    💡 ${rec}`);
    });
  }
}

/**
 * Print comparison report for multiple environments
 * @param {Object[]} results - Analysis results
 */
function printComparisonReport(results) {
  console.log('\n📊 Environment Comparison:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Header
  const environments = results.map(r => r.environment);
  console.log(`Environment          ${environments.map(env => env.padEnd(12)).join(' ')}`);
  console.log('─'.repeat(80));
  
  // Bundle sizes
  const bundleSizes = results.map(r => `${(r.metrics.totalSize / 1024).toFixed(1)}KB`.padEnd(12));
  console.log(`Bundle Size          ${bundleSizes.join(' ')}`);
  
  // Asset counts
  const assetCounts = results.map(r => `${r.metrics.totalAssets}`.padEnd(12));
  console.log(`Assets               ${assetCounts.join(' ')}`);
  
  // Initial load
  const initialLoads = results.map(r => `${(r.metrics.initialLoad.total / 1024).toFixed(1)}KB`.padEnd(12));
  console.log(`Initial Load         ${initialLoads.join(' ')}`);
  
  // Budget compliance
  const budgetStatus = results.map(r => (r.budgetCompliance.compliant ? '✅ PASS' : '❌ FAIL').padEnd(12));
  console.log(`Budget Status        ${budgetStatus.join(' ')}`);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Print final summary
 * @param {Object[]} results - Analysis results
 * @param {boolean} overallCompliant - Overall compliance status
 */
function printFinalSummary(results, overallCompliant) {
  console.log('\n🎯 Final Analysis Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Environments Analyzed: ${results.length}`);
  console.log(`💰 Budget Compliance: ${overallCompliant ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
  
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalRecommendations = results.reduce((sum, r) => sum + r.recommendations.length, 0);
  
  console.log(`⚠️  Total Warnings: ${totalWarnings}`);
  console.log(`❌ Total Errors: ${totalErrors}`);
  console.log(`💡 Total Recommendations: ${totalRecommendations}`);
  
  // Show most common recommendations
  const allRecommendations = results.flatMap(r => r.recommendations);
  const recommendationCounts = {};
  allRecommendations.forEach(rec => {
    recommendationCounts[rec] = (recommendationCounts[rec] || 0) + 1;
  });
  
  const topRecommendations = Object.entries(recommendationCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);
  
  if (topRecommendations.length > 0) {
    console.log('\n💡 Top Recommendations:');
    topRecommendations.forEach(([rec, count]) => {
      console.log(`  ${count}x ${rec}`);
    });
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Save detailed analysis reports
 * @param {Object[]} results - Analysis results
 */
async function saveDetailedReports(results) {
  try {
    const reportsDir = path.join(process.cwd(), '.bers-cache', 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    for (const result of results) {
      const reportPath = path.join(reportsDir, `bundle-analysis-${result.environment}-${timestamp}.json`);
      await fs.writeFile(reportPath, JSON.stringify(result, null, 2));
      console.log(`📄 Detailed report saved: ${path.relative(process.cwd(), reportPath)}`);
    }
    
    // Save comparison report if multiple environments
    if (results.length > 1) {
      const comparisonReport = {
        timestamp: new Date().toISOString(),
        environments: results.map(r => r.environment),
        comparison: {
          bundleSizes: results.map(r => ({ env: r.environment, size: r.metrics.totalSize })),
          budgetCompliance: results.map(r => ({ env: r.environment, compliant: r.budgetCompliance.compliant })),
          recommendations: results.map(r => ({ env: r.environment, count: r.recommendations.length }))
        },
        summary: {
          totalEnvironments: results.length,
          allCompliant: results.every(r => r.budgetCompliance.compliant),
          totalWarnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
          totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0)
        }
      };
      
      const comparisonPath = path.join(reportsDir, `bundle-comparison-${timestamp}.json`);
      await fs.writeFile(comparisonPath, JSON.stringify(comparisonReport, null, 2));
      console.log(`📊 Comparison report saved: ${path.relative(process.cwd(), comparisonPath)}`);
    }
    
  } catch (error) {
    console.warn('⚠️  Failed to save detailed reports:', error.message);
  }
}

/* ===== HELPER FUNCTIONS ===== */

/**
 * Parse command line arguments
 * @returns {Object} Parsed options
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const options = { ...CLI_OPTIONS };
  
  for (const arg of args) {
    if (arg.startsWith('--environment=')) {
      options.environment = arg.split('=')[1];
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.split('=')[1];
    } else if (arg === '--all-environments') {
      options.allEnvironments = true;
    } else if (arg === '--budget-only') {
      options.budgetOnly = true;
    } else if (arg === '--no-save-report') {
      options.saveReport = false;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  
  return options;
}

/**
 * Show CLI help
 */
function showHelp() {
  console.log(`
📊 BERS Bundle Analysis CLI

Usage:
  node tools/build/analyze-bundle.js [options]

Options:
  --environment=<env>      Environment to analyze
                          Default: production
                          
  --output-dir=<dir>       Build output directory to analyze
                          Default: dist (or dist-<env> for non-production)
                          
  --all-environments       Analyze all environments (dev, staging, prod)
                          
  --budget-only           Only check performance budgets (skip optimization analysis)
                          
  --no-save-report        Don't save detailed reports to .bers-cache/reports/
                          
  --verbose, -v           Enable verbose output
                          
  --help, -h              Show this help message

Examples:
  # Analyze production build
  node tools/build/analyze-bundle.js
  
  # Analyze all environments
  node tools/build/analyze-bundle.js --all-environments
  
  # Quick budget check only
  node tools/build/analyze-bundle.js --budget-only
  
  # Analyze specific directory
  node tools/build/analyze-bundle.js --output-dir=custom-dist
  
Budget Configuration:
  Performance budgets are defined in vite.config.js under advancedOptions.analysisConfig.budgets
  
  Production defaults:
  - Total Bundle: 1MB
  - Initial JS: 512KB  
  - Initial CSS: 128KB
  - Chunk Size: 256KB
  - Asset Count: 60
  
Report Outputs:
  .bers-cache/reports/bundle-analysis-<env>-<date>.json
  .bers-cache/reports/bundle-comparison-<date>.json (for multi-env)
`);
}

/* ===== EXECUTE CLI ===== */

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ CLI execution failed:', error);
    process.exit(1);
  });
}