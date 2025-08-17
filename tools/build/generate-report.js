#!/usr/bin/env node
/**
 * Build Report Generator CLI - BERS Phase 3, Task 3.1
 * 
 * Comprehensive build report generator that consolidates performance,
 * bundle analysis, and optimization data into detailed reports.
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import path from 'path';
import fs from 'fs/promises';
import { generatePerformanceSummary } from './performance-monitor.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===== MAIN CLI FUNCTION ===== */

async function main() {
  try {
    console.log('📊 BERS Build Report Generator');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const report = await generateComprehensiveReport();
    
    // Save report
    const reportsDir = path.join(process.cwd(), '.bers-cache', 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `comprehensive-report-${timestamp}.json`);
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Comprehensive report generated: ${path.relative(process.cwd(), reportPath)}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Report generation failed:', error.message);
    process.exit(1);
  }
}

/**
 * Generate comprehensive build report
 * @returns {Promise<Object>} Complete report
 */
async function generateComprehensiveReport() {
  const report = {
    generated: new Date().toISOString(),
    version: '3.1.0',
    summary: {},
    environments: {},
    performance: {},
    recommendations: []
  };

  // Generate performance summaries for each environment
  const environments = ['development', 'staging', 'production'];
  
  for (const env of environments) {
    console.log(`📊 Analyzing ${env} environment...`);
    report.performance[env] = await generatePerformanceSummary(env, 7);
  }

  // Load recent bundle analyses
  console.log('📦 Loading bundle analysis data...')
  await loadBundleAnalysisData(report);

  // Generate overall summary
  report.summary = generateOverallSummary(report);

  // Generate recommendations
  report.recommendations = generateRecommendations(report);

  return report;
}

/**
 * Load bundle analysis data
 * @param {Object} report - Report object to populate
 */
async function loadBundleAnalysisData(report) {
  try {
    const reportsDir = path.join(process.cwd(), '.bers-cache', 'reports');
    const files = await fs.readdir(reportsDir);
    
    const bundleFiles = files
      .filter(f => f.startsWith('bundle-analysis-') && f.endsWith('.json'))
      .sort()
      .slice(-9); // Last 3 per environment max

    for (const file of bundleFiles) {
      const filePath = path.join(reportsDir, file);
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      if (!report.environments[data.environment]) {
        report.environments[data.environment] = {
          bundleAnalyses: [],
          latestMetrics: null
        };
      }
      
      report.environments[data.environment].bundleAnalyses.push({
        timestamp: data.timestamp,
        budgetCompliant: data.budgetCompliance.compliant,
        bundleSize: data.metrics.totalSize,
        recommendations: data.recommendations.length
      });
    }

    // Get latest metrics for each environment
    Object.keys(report.environments).forEach(env => {
      const analyses = report.environments[env].bundleAnalyses;
      if (analyses.length > 0) {
        report.environments[env].latestMetrics = analyses[analyses.length - 1];
      }
    });

  } catch (error) {
    console.warn('⚠️  Failed to load bundle analysis data:', error.message);
  }
}

/**
 * Generate overall summary
 * @param {Object} report - Report data
 * @returns {Object} Summary data
 */
function generateOverallSummary(report) {
  const summary = {
    totalEnvironments: Object.keys(report.performance).length,
    healthyEnvironments: 0,
    totalBuilds: 0,
    averageBuildTime: 0,
    budgetCompliance: {
      compliant: 0,
      total: 0
    }
  };

  // Analyze performance data
  let totalBuildTime = 0;
  let buildCount = 0;

  Object.values(report.performance).forEach(perfData => {
    if (perfData.totalBuilds) {
      summary.totalBuilds += perfData.totalBuilds;
      totalBuildTime += perfData.averageBuildTime * perfData.totalBuilds;
      buildCount += perfData.totalBuilds;

      // Consider environment healthy if >80% builds are within target
      const healthyRate = (perfData.buildsWithinTarget / perfData.totalBuilds) * 100;
      if (healthyRate >= 80) {
        summary.healthyEnvironments++;
      }
    }
  });

  if (buildCount > 0) {
    summary.averageBuildTime = totalBuildTime / buildCount;
  }

  // Analyze budget compliance
  Object.values(report.environments).forEach(envData => {
    if (envData.latestMetrics) {
      summary.budgetCompliance.total++;
      if (envData.latestMetrics.budgetCompliant) {
        summary.budgetCompliance.compliant++;
      }
    }
  });

  return summary;
}

/**
 * Generate optimization recommendations
 * @param {Object} report - Report data
 * @returns {string[]} Recommendations
 */
function generateRecommendations(report) {
  const recommendations = [];

  // Performance-based recommendations
  Object.entries(report.performance).forEach(([env, perfData]) => {
    if (perfData.averageBuildTime > 25000) { // > 25 seconds
      recommendations.push(`Consider optimizing ${env} build time (current: ${(perfData.averageBuildTime / 1000).toFixed(1)}s)`);
    }

    if (perfData.averageCacheHitRate < 60) {
      recommendations.push(`Improve caching effectiveness in ${env} (current: ${perfData.averageCacheHitRate.toFixed(1)}%)`);
    }
  });

  // Bundle-based recommendations
  Object.entries(report.environments).forEach(([env, envData]) => {
    if (envData.latestMetrics && !envData.latestMetrics.budgetCompliant) {
      recommendations.push(`Address performance budget violations in ${env} environment`);
    }

    if (envData.latestMetrics && envData.latestMetrics.bundleSize > 1536000) { // > 1.5MB
      recommendations.push(`Consider bundle size optimization for ${env} (current: ${(envData.latestMetrics.bundleSize / 1024).toFixed(1)}KB)`);
    }
  });

  // Overall system recommendations
  if (report.summary.healthyEnvironments < report.summary.totalEnvironments) {
    recommendations.push('Focus on improving build consistency across all environments');
  }

  if (report.summary.budgetCompliance.compliant / report.summary.budgetCompliance.total < 0.8) {
    recommendations.push('Review and adjust performance budgets or optimize bundle sizes');
  }

  return recommendations;
}

/* ===== EXECUTE CLI ===== */

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ CLI execution failed:', error);
    process.exit(1);
  });
}