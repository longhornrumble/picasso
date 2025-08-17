/**
 * Bundle Analyzer - BERS Phase 3, Task 3.1
 * 
 * Automated bundle analysis system with performance budget enforcement,
 * dependency analysis, tree-shaking effectiveness measurement, and
 * comprehensive bundle optimization recommendations.
 * 
 * Features:
 * - Automated bundle size tracking and analysis
 * - Performance budget enforcement with configurable thresholds
 * - Dependency analysis and duplicate detection
 * - Tree-shaking effectiveness measurement
 * - Bundle composition visualization and reporting
 * - Historical size tracking and trend analysis
 * - Optimization recommendations and alerts
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===== CONFIGURATION ===== */

/**
 * Bundle analysis configuration
 * @typedef {Object} BundleAnalysisConfig
 * @property {Object} budgets - Performance budgets per environment
 * @property {Object} thresholds - Warning and error thresholds
 * @property {string[]} criticalAssets - Assets that have stricter budgets
 * @property {boolean} enableHistoryTracking - Track bundle size history
 * @property {number} historyRetentionDays - Days to retain history
 * @property {Object} optimization - Optimization analysis settings
 */

const DEFAULT_ANALYSIS_CONFIG = {
  budgets: {
    development: {
      totalBundleSize: 2048000,    // 2MB
      initialJS: 1024000,          // 1MB
      initialCSS: 256000,          // 256KB
      chunkSize: 512000,           // 512KB per chunk
      assetCount: 100              // Max number of assets
    },
    staging: {
      totalBundleSize: 1536000,    // 1.5MB
      initialJS: 768000,           // 768KB
      initialCSS: 192000,          // 192KB
      chunkSize: 384000,           // 384KB per chunk
      assetCount: 80
    },
    production: {
      totalBundleSize: 1024000,    // 1MB
      initialJS: 512000,           // 512KB
      initialCSS: 128000,          // 128KB
      chunkSize: 256000,           // 256KB per chunk
      assetCount: 60
    }
  },
  thresholds: {
    warning: 0.8,  // 80% of budget
    error: 1.0     // 100% of budget
  },
  criticalAssets: ['main.js', 'iframe.js', 'widget-frame.html'],
  enableHistoryTracking: true,
  historyRetentionDays: 30,
  optimization: {
    duplicateDetection: true,
    treeshakeAnalysis: true,
    dependencyAnalysis: true,
    compressionAnalysis: true
  }
};

/**
 * Bundle analysis result structure
 * @typedef {Object} BundleAnalysisResult
 * @property {string} environment - Target environment
 * @property {string} buildId - Unique build identifier
 * @property {Date} timestamp - Analysis timestamp
 * @property {Object} metrics - Bundle metrics
 * @property {Object} budgetCompliance - Budget compliance results
 * @property {Object} optimization - Optimization analysis
 * @property {string[]} warnings - Warning messages
 * @property {string[]} errors - Error messages
 * @property {Object} recommendations - Optimization recommendations
 */

/* ===== MAIN BUNDLE ANALYZER CLASS ===== */

export class BundleAnalyzer {
  constructor(config = {}) {
    this.config = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
    this.historyDir = path.join(process.cwd(), '.bers-cache', 'bundle-history');
    this.initializeHistory();
  }

  /**
   * Initialize bundle history tracking
   */
  async initializeHistory() {
    if (this.config.enableHistoryTracking) {
      try {
        await fs.mkdir(this.historyDir, { recursive: true });
        await this.cleanupOldHistory();
      } catch (error) {
        console.warn('⚠️  Failed to initialize bundle history:', error.message);
      }
    }
  }

  /**
   * Analyze bundle from build output directory
   * @param {string} outputDir - Build output directory
   * @param {string} environment - Target environment
   * @param {string} [buildId] - Build identifier
   * @returns {Promise<BundleAnalysisResult>} Analysis result
   */
  async analyzeBuild(outputDir, environment, buildId = null) {
    const analysisId = buildId || this.generateAnalysisId();
    const startTime = performance.now();

    console.log(`📊 Starting bundle analysis for ${environment} environment...`);
    console.log(`📋 Analysis ID: ${analysisId}`);

    const result = {
      environment,
      buildId: analysisId,
      timestamp: new Date(),
      metrics: {},
      budgetCompliance: {},
      optimization: {},
      warnings: [],
      errors: [],
      recommendations: []
    };

    try {
      // Collect bundle metrics
      result.metrics = await this.collectBundleMetrics(outputDir);
      
      // Check budget compliance
      result.budgetCompliance = await this.checkBudgetCompliance(result.metrics, environment);
      
      // Perform optimization analysis
      if (this.config.optimization.duplicateDetection || 
          this.config.optimization.treeshakeAnalysis || 
          this.config.optimization.dependencyAnalysis) {
        result.optimization = await this.performOptimizationAnalysis(outputDir, result.metrics);
      }

      // Generate recommendations
      result.recommendations = this.generateRecommendations(result);

      // Collect warnings and errors
      this.collectIssues(result);

      // Save to history
      if (this.config.enableHistoryTracking) {
        await this.saveToHistory(result);
      }

      const duration = performance.now() - startTime;
      console.log(`✅ Bundle analysis completed in ${(duration / 1000).toFixed(2)}s`);

      // Print analysis report
      this.printAnalysisReport(result);

      return result;

    } catch (error) {
      console.error('❌ Bundle analysis failed:', error);
      result.errors.push(`Analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Collect comprehensive bundle metrics
   * @param {string} outputDir - Build output directory
   * @returns {Promise<Object>} Bundle metrics
   */
  async collectBundleMetrics(outputDir) {
    console.log('📊 Collecting bundle metrics...');

    const metrics = {
      totalSize: 0,
      totalAssets: 0,
      assetTypes: {
        js: { count: 0, size: 0, files: [] },
        css: { count: 0, size: 0, files: [] },
        html: { count: 0, size: 0, files: [] },
        images: { count: 0, size: 0, files: [] },
        fonts: { count: 0, size: 0, files: [] },
        other: { count: 0, size: 0, files: [] }
      },
      chunks: [],
      initialLoad: {
        js: 0,
        css: 0,
        total: 0
      },
      compression: {
        gzip: { enabled: false, ratio: 0, totalSize: 0 },
        brotli: { enabled: false, ratio: 0, totalSize: 0 }
      }
    };

    // Scan all files in output directory
    const files = await this.getAllFiles(outputDir);

    for (const file of files) {
      const stats = await fs.stat(file);
      const relativePath = path.relative(outputDir, file);
      const ext = path.extname(file).toLowerCase();

      metrics.totalSize += stats.size;
      metrics.totalAssets++;

      // Categorize by type
      const category = this.categorizeAsset(ext);
      metrics.assetTypes[category].count++;
      metrics.assetTypes[category].size += stats.size;
      metrics.assetTypes[category].files.push({
        path: relativePath,
        size: stats.size
      });

      // Check for initial load assets
      if (this.isInitialLoadAsset(relativePath)) {
        if (category === 'js') {
          metrics.initialLoad.js += stats.size;
        } else if (category === 'css') {
          metrics.initialLoad.css += stats.size;
        }
        metrics.initialLoad.total += stats.size;
      }

      // Check for chunks
      if (this.isChunk(relativePath)) {
        metrics.chunks.push({
          path: relativePath,
          size: stats.size,
          type: category
        });
      }

      // Check for compressed versions
      if (ext === '.gz') {
        metrics.compression.gzip.enabled = true;
        metrics.compression.gzip.totalSize += stats.size;
      } else if (ext === '.br') {
        metrics.compression.brotli.enabled = true;
        metrics.compression.brotli.totalSize += stats.size;
      }
    }

    // Calculate compression ratios
    if (metrics.compression.gzip.enabled) {
      const uncompressedSize = metrics.assetTypes.js.size + metrics.assetTypes.css.size;
      metrics.compression.gzip.ratio = uncompressedSize > 0 
        ? ((uncompressedSize - metrics.compression.gzip.totalSize) / uncompressedSize * 100).toFixed(1)
        : 0;
    }

    if (metrics.compression.brotli.enabled) {
      const uncompressedSize = metrics.assetTypes.js.size + metrics.assetTypes.css.size;
      metrics.compression.brotli.ratio = uncompressedSize > 0 
        ? ((uncompressedSize - metrics.compression.brotli.totalSize) / uncompressedSize * 100).toFixed(1)
        : 0;
    }

    // Sort files by size for analysis
    Object.values(metrics.assetTypes).forEach(type => {
      type.files.sort((a, b) => b.size - a.size);
    });

    metrics.chunks.sort((a, b) => b.size - a.size);

    console.log(`📊 Collected metrics for ${metrics.totalAssets} assets (${(metrics.totalSize / 1024).toFixed(1)}KB total)`);

    return metrics;
  }

  /**
   * Check budget compliance for all metrics
   * @param {Object} metrics - Bundle metrics
   * @param {string} environment - Target environment
   * @returns {Promise<Object>} Budget compliance results
   */
  async checkBudgetCompliance(metrics, environment) {
    console.log('💰 Checking budget compliance...');

    const budget = this.config.budgets[environment];
    if (!budget) {
      console.warn(`⚠️  No budget defined for environment: ${environment}`);
      return { compliant: true, budgetFound: false };
    }

    const compliance = {
      compliant: true,
      budgetFound: true,
      checks: {},
      overages: [],
      warnings: []
    };

    // Check total bundle size
    compliance.checks.totalBundleSize = this.checkBudgetItem(
      'Total Bundle Size',
      metrics.totalSize,
      budget.totalBundleSize
    );

    // Check initial JS size
    compliance.checks.initialJS = this.checkBudgetItem(
      'Initial JavaScript',
      metrics.initialLoad.js,
      budget.initialJS
    );

    // Check initial CSS size
    compliance.checks.initialCSS = this.checkBudgetItem(
      'Initial CSS',
      metrics.initialLoad.css,
      budget.initialCSS
    );

    // Check individual chunk sizes
    const oversizedChunks = metrics.chunks.filter(chunk => chunk.size > budget.chunkSize);
    compliance.checks.chunkSizes = {
      passed: oversizedChunks.length === 0,
      budget: budget.chunkSize,
      oversizedChunks: oversizedChunks.map(chunk => ({
        path: chunk.path,
        size: chunk.size,
        overage: chunk.size - budget.chunkSize
      }))
    };

    // Check asset count
    compliance.checks.assetCount = this.checkBudgetItem(
      'Asset Count',
      metrics.totalAssets,
      budget.assetCount
    );

    // Determine overall compliance
    const checks = Object.values(compliance.checks);
    compliance.compliant = checks.every(check => check.passed);

    // Collect overages and warnings
    checks.forEach(check => {
      if (!check.passed) {
        if (check.usage / check.budget >= this.config.thresholds.error) {
          compliance.overages.push(check);
        } else if (check.usage / check.budget >= this.config.thresholds.warning) {
          compliance.warnings.push(check);
        }
      }
    });

    console.log(`💰 Budget compliance: ${compliance.compliant ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Overages: ${compliance.overages.length}, Warnings: ${compliance.warnings.length}`);

    return compliance;
  }

  /**
   * Check individual budget item
   * @param {string} name - Budget item name
   * @param {number} usage - Actual usage
   * @param {number} budget - Budget limit
   * @returns {Object} Budget check result
   */
  checkBudgetItem(name, usage, budget) {
    const ratio = usage / budget;
    const passed = ratio <= this.config.thresholds.error;

    return {
      name,
      usage,
      budget,
      ratio,
      passed,
      overage: Math.max(0, usage - budget),
      percentage: (ratio * 100).toFixed(1)
    };
  }

  /**
   * Perform optimization analysis
   * @param {string} outputDir - Build output directory
   * @param {Object} metrics - Bundle metrics
   * @returns {Promise<Object>} Optimization analysis results
   */
  async performOptimizationAnalysis(outputDir, metrics) {
    console.log('🔍 Performing optimization analysis...');

    const analysis = {
      duplicates: {},
      treeshaking: {},
      dependencies: {},
      compression: {}
    };

    // Duplicate detection
    if (this.config.optimization.duplicateDetection) {
      analysis.duplicates = await this.detectDuplicates(outputDir, metrics);
    }

    // Tree-shaking analysis
    if (this.config.optimization.treeshakeAnalysis) {
      analysis.treeshaking = await this.analyzeTreeshaking(outputDir, metrics);
    }

    // Dependency analysis
    if (this.config.optimization.dependencyAnalysis) {
      analysis.dependencies = await this.analyzeDependencies(outputDir, metrics);
    }

    // Compression analysis
    if (this.config.optimization.compressionAnalysis) {
      analysis.compression = this.analyzeCompression(metrics);
    }

    return analysis;
  }

  /**
   * Detect duplicate code and dependencies
   * @param {string} outputDir - Build output directory
   * @param {Object} metrics - Bundle metrics
   * @returns {Promise<Object>} Duplicate detection results
   */
  async detectDuplicates(outputDir, metrics) {
    console.log('🔍 Analyzing duplicates...');

    const duplicates = {
      found: false,
      files: [],
      estimatedWaste: 0
    };

    // Simple duplicate detection based on file sizes and names
    const sizeGroups = new Map();

    metrics.assetTypes.js.files.forEach(file => {
      const size = file.size;
      if (!sizeGroups.has(size)) {
        sizeGroups.set(size, []);
      }
      sizeGroups.get(size).push(file);
    });

    // Find potential duplicates (same size)
    for (const [size, files] of sizeGroups) {
      if (files.length > 1 && size > 10240) { // Only consider files > 10KB
        duplicates.found = true;
        duplicates.files.push({
          size,
          count: files.length,
          files: files.map(f => f.path),
          potentialWaste: size * (files.length - 1)
        });
        duplicates.estimatedWaste += size * (files.length - 1);
      }
    }

    console.log(`🔍 Duplicate analysis: ${duplicates.found ? 'Found potential duplicates' : 'No duplicates detected'}`);

    return duplicates;
  }

  /**
   * Analyze tree-shaking effectiveness
   * @param {string} outputDir - Build output directory
   * @param {Object} metrics - Bundle metrics
   * @returns {Promise<Object>} Tree-shaking analysis results
   */
  async analyzeTreeshaking(outputDir, metrics) {
    console.log('🌳 Analyzing tree-shaking effectiveness...');

    const analysis = {
      effectiveness: 'unknown',
      unusedEstimate: 0,
      recommendations: []
    };

    // Simple heuristic: if we have many small chunks, tree-shaking is likely effective
    const smallChunks = metrics.chunks.filter(chunk => chunk.size < 50000); // < 50KB
    const largeChunks = metrics.chunks.filter(chunk => chunk.size > 200000); // > 200KB

    if (smallChunks.length > largeChunks.length) {
      analysis.effectiveness = 'good';
    } else if (largeChunks.length > 0) {
      analysis.effectiveness = 'poor';
      analysis.recommendations.push('Consider enabling more aggressive tree-shaking');
      analysis.recommendations.push('Review large chunks for unused code');
    } else {
      analysis.effectiveness = 'moderate';
    }

    // Estimate unused code based on vendor bundle size
    const vendorChunks = metrics.chunks.filter(chunk => 
      chunk.path.includes('vendor') || chunk.path.includes('node_modules')
    );

    if (vendorChunks.length > 0) {
      const vendorSize = vendorChunks.reduce((sum, chunk) => sum + chunk.size, 0);
      // Rough estimate: 20-30% of vendor code might be unused
      analysis.unusedEstimate = Math.round(vendorSize * 0.25);
    }

    console.log(`🌳 Tree-shaking effectiveness: ${analysis.effectiveness}`);

    return analysis;
  }

  /**
   * Analyze dependencies
   * @param {string} outputDir - Build output directory
   * @param {Object} metrics - Bundle metrics
   * @returns {Promise<Object>} Dependency analysis results
   */
  async analyzeDependencies(outputDir, metrics) {
    console.log('📦 Analyzing dependencies...');

    const analysis = {
      heavyDependencies: [],
      recommendations: []
    };

    // Identify heavy dependencies from chunk names
    const heavyThreshold = 100000; // 100KB
    const vendorChunks = metrics.chunks.filter(chunk => 
      chunk.path.includes('vendor') && chunk.size > heavyThreshold
    );

    analysis.heavyDependencies = vendorChunks.map(chunk => ({
      path: chunk.path,
      size: chunk.size,
      impact: 'high'
    }));

    // Generate recommendations
    if (analysis.heavyDependencies.length > 0) {
      analysis.recommendations.push('Consider lazy loading heavy dependencies');
      analysis.recommendations.push('Evaluate if all features of heavy libraries are needed');
      analysis.recommendations.push('Look for lighter alternatives to heavy dependencies');
    }

    console.log(`📦 Found ${analysis.heavyDependencies.length} heavy dependencies`);

    return analysis;
  }

  /**
   * Analyze compression effectiveness
   * @param {Object} metrics - Bundle metrics
   * @returns {Object} Compression analysis results
   */
  analyzeCompression(metrics) {
    console.log('📦 Analyzing compression...');

    const analysis = {
      gzip: {
        enabled: metrics.compression.gzip.enabled,
        ratio: metrics.compression.gzip.ratio,
        effectiveness: 'none'
      },
      brotli: {
        enabled: metrics.compression.brotli.enabled,
        ratio: metrics.compression.brotli.ratio,
        effectiveness: 'none'
      },
      recommendations: []
    };

    // Analyze gzip effectiveness
    if (analysis.gzip.enabled) {
      const ratio = parseFloat(analysis.gzip.ratio);
      if (ratio > 60) {
        analysis.gzip.effectiveness = 'excellent';
      } else if (ratio > 40) {
        analysis.gzip.effectiveness = 'good';
      } else if (ratio > 20) {
        analysis.gzip.effectiveness = 'moderate';
      } else {
        analysis.gzip.effectiveness = 'poor';
      }
    } else {
      analysis.recommendations.push('Enable gzip compression for better performance');
    }

    // Analyze brotli effectiveness
    if (analysis.brotli.enabled) {
      const ratio = parseFloat(analysis.brotli.ratio);
      if (ratio > 65) {
        analysis.brotli.effectiveness = 'excellent';
      } else if (ratio > 45) {
        analysis.brotli.effectiveness = 'good';
      } else if (ratio > 25) {
        analysis.brotli.effectiveness = 'moderate';
      } else {
        analysis.brotli.effectiveness = 'poor';
      }
    } else {
      analysis.recommendations.push('Enable brotli compression for even better performance');
    }

    console.log(`📦 Compression: Gzip ${analysis.gzip.effectiveness}, Brotli ${analysis.brotli.effectiveness}`);

    return analysis;
  }

  /**
   * Generate optimization recommendations
   * @param {BundleAnalysisResult} result - Analysis result
   * @returns {string[]} Array of recommendations
   */
  generateRecommendations(result) {
    const recommendations = [];

    // Budget-based recommendations
    if (!result.budgetCompliance.compliant) {
      recommendations.push('Bundle size exceeds performance budget');
      
      if (result.budgetCompliance.checks.totalBundleSize && !result.budgetCompliance.checks.totalBundleSize.passed) {
        recommendations.push('Consider code splitting to reduce initial bundle size');
      }
      
      if (result.budgetCompliance.checks.initialJS && !result.budgetCompliance.checks.initialJS.passed) {
        recommendations.push('Move non-critical JavaScript to separate chunks');
      }
      
      if (result.budgetCompliance.checks.initialCSS && !result.budgetCompliance.checks.initialCSS.passed) {
        recommendations.push('Consider critical CSS extraction');
      }
    }

    // Add optimization-specific recommendations
    if (result.optimization.duplicates?.found) {
      recommendations.push('Duplicate code detected - consider deduplication');
    }

    if (result.optimization.treeshaking?.effectiveness === 'poor') {
      recommendations.push('Tree-shaking is ineffective - review imports and build configuration');
    }

    if (result.optimization.dependencies?.heavyDependencies.length > 0) {
      recommendations.push('Heavy dependencies detected - consider lazy loading or alternatives');
    }

    // Add compression recommendations
    if (result.optimization.compression?.recommendations) {
      recommendations.push(...result.optimization.compression.recommendations);
    }

    return recommendations;
  }

  /**
   * Collect warnings and errors from analysis
   * @param {BundleAnalysisResult} result - Analysis result
   */
  collectIssues(result) {
    // Budget warnings
    result.budgetCompliance.warnings?.forEach(warning => {
      result.warnings.push(`Budget warning: ${warning.name} at ${warning.percentage}% of budget`);
    });

    // Budget errors
    result.budgetCompliance.overages?.forEach(overage => {
      result.errors.push(`Budget exceeded: ${overage.name} is ${(overage.overage / 1024).toFixed(1)}KB over budget`);
    });

    // Critical asset issues
    this.config.criticalAssets.forEach(assetPattern => {
      const matches = result.metrics.assetTypes.js.files.filter(file => 
        file.path.includes(assetPattern)
      );
      
      matches.forEach(match => {
        if (match.size > 512000) { // 512KB
          result.warnings.push(`Critical asset ${match.path} is large: ${(match.size / 1024).toFixed(1)}KB`);
        }
      });
    });
  }

  /**
   * Save analysis result to history
   * @param {BundleAnalysisResult} result - Analysis result
   */
  async saveToHistory(result) {
    try {
      const historyFile = path.join(
        this.historyDir, 
        `${result.environment}-${result.buildId}.json`
      );
      
      await fs.writeFile(historyFile, JSON.stringify(result, null, 2));
      console.log(`📊 Analysis saved to history: ${path.basename(historyFile)}`);
      
    } catch (error) {
      console.warn('⚠️  Failed to save analysis to history:', error.message);
    }
  }

  /**
   * Print comprehensive analysis report
   * @param {BundleAnalysisResult} result - Analysis result
   */
  printAnalysisReport(result) {
    console.log('\n📊 Bundle Analysis Report:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Environment: ${result.environment}`);
    console.log(`Build ID: ${result.buildId}`);
    console.log(`Timestamp: ${result.timestamp.toISOString()}`);
    
    console.log('\n📊 Bundle Metrics:');
    console.log(`  Total Size: ${(result.metrics.totalSize / 1024).toFixed(1)}KB`);
    console.log(`  Total Assets: ${result.metrics.totalAssets}`);
    console.log(`  Initial Load: ${(result.metrics.initialLoad.total / 1024).toFixed(1)}KB`);
    console.log(`    JavaScript: ${(result.metrics.initialLoad.js / 1024).toFixed(1)}KB`);
    console.log(`    CSS: ${(result.metrics.initialLoad.css / 1024).toFixed(1)}KB`);
    console.log(`  Chunks: ${result.metrics.chunks.length}`);

    if (result.metrics.compression.gzip.enabled || result.metrics.compression.brotli.enabled) {
      console.log('\n📦 Compression:');
      if (result.metrics.compression.gzip.enabled) {
        console.log(`  Gzip: ${result.metrics.compression.gzip.ratio}% reduction`);
      }
      if (result.metrics.compression.brotli.enabled) {
        console.log(`  Brotli: ${result.metrics.compression.brotli.ratio}% reduction`);
      }
    }

    console.log('\n💰 Budget Compliance:');
    if (result.budgetCompliance.budgetFound) {
      console.log(`  Status: ${result.budgetCompliance.compliant ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`  Warnings: ${result.warnings.length}`);
      console.log(`  Errors: ${result.errors.length}`);
    } else {
      console.log('  Status: ⚠️  No budget configured');
    }

    if (result.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      result.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warning => {
        console.log(`  • ${warning}`);
      });
    }

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => {
        console.log(`  • ${error}`);
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Helper methods
   */

  categorizeAsset(ext) {
    switch (ext) {
      case '.js': return 'js';
      case '.css': return 'css';
      case '.html': return 'html';
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
      case '.webp':
      case '.svg': return 'images';
      case '.woff':
      case '.woff2':
      case '.ttf':
      case '.eot': return 'fonts';
      default: return 'other';
    }
  }

  isInitialLoadAsset(path) {
    // Assets loaded on initial page load
    return path.includes('main.') || path.includes('iframe.') || path.includes('index.');
  }

  isChunk(path) {
    // Identify build chunks
    return path.includes('chunk') || path.includes('-') && path.match(/[a-f0-9]{8}/);
  }

  async getAllFiles(dir) {
    const files = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.getAllFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory might not exist
    }
    return files;
  }

  generateAnalysisId() {
    return `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async cleanupOldHistory() {
    try {
      const files = await fs.readdir(this.historyDir);
      const maxAge = this.config.historyRetentionDays * 24 * 60 * 60 * 1000;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.historyDir, file);
          const stats = await fs.stat(filePath);
          const age = Date.now() - stats.mtime.getTime();
          
          if (age > maxAge) {
            await fs.unlink(filePath);
            console.log(`🗑️  Cleaned up old analysis: ${file}`);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️  Failed to cleanup old history:', error.message);
    }
  }
}

/* ===== CONVENIENCE FUNCTIONS ===== */

/**
 * Analyze bundle from build output
 * @param {string} outputDir - Build output directory
 * @param {string} environment - Target environment
 * @param {Object} config - Custom configuration
 * @returns {Promise<BundleAnalysisResult>} Analysis result
 */
export async function analyzeBundle(outputDir, environment, config = {}) {
  const analyzer = new BundleAnalyzer(config);
  return await analyzer.analyzeBuild(outputDir, environment);
}

/**
 * Check if build meets performance budgets
 * @param {string} outputDir - Build output directory
 * @param {string} environment - Target environment
 * @returns {Promise<boolean>} True if budget compliant
 */
export async function checkPerformanceBudget(outputDir, environment) {
  const analyzer = new BundleAnalyzer();
  const result = await analyzer.analyzeBuild(outputDir, environment);
  return result.budgetCompliance.compliant;
}

export default BundleAnalyzer;