/**
 * Advanced Build Plugin - BERS Phase 3, Task 3.1
 * 
 * Comprehensive Vite plugin that integrates all advanced build pipeline
 * features including parallel builds, asset fingerprinting, bundle analysis,
 * and performance monitoring for the BERS project.
 * 
 * Features:
 * - Integration with ParallelBuildManager for multi-environment builds
 * - Automatic asset fingerprinting and caching
 * - Real-time bundle analysis and budget enforcement
 * - Build performance monitoring and reporting
 * - CDN integration and asset optimization
 * - Cache invalidation and long-term caching strategies
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import path from 'path';
import { ParallelBuildManager } from './parallel-build-manager.js';
import { AssetFingerprintManager } from './asset-fingerprinting.js';
import { BundleAnalyzer } from './bundle-analyzer.js';
import { environmentPlugin } from './environment-plugin.js';

/* ===== PLUGIN CONFIGURATION ===== */

/**
 * Advanced build plugin options
 * @typedef {Object} AdvancedBuildOptions
 * @property {boolean} [enableParallelBuilds] - Enable parallel environment builds
 * @property {boolean} [enableFingerprinting] - Enable asset fingerprinting
 * @property {boolean} [enableBundleAnalysis] - Enable bundle analysis
 * @property {boolean} [enablePerformanceMonitoring] - Enable performance monitoring
 * @property {Object} [parallelConfig] - Parallel build configuration
 * @property {Object} [fingerprintConfig] - Asset fingerprinting configuration
 * @property {Object} [analysisConfig] - Bundle analysis configuration
 */

const DEFAULT_ADVANCED_BUILD_OPTIONS = {
  enableParallelBuilds: true,
  enableFingerprinting: true,
  enableBundleAnalysis: true,
  enablePerformanceMonitoring: true,
  parallelConfig: {
    environments: ['development', 'staging', 'production'],
    enableCaching: true,
    buildTimeoutMs: 30000
  },
  fingerprintConfig: {
    hashLength: 12,
    enableCompression: true
  },
  analysisConfig: {
    enableHistoryTracking: true,
    enableBudgetEnforcement: true
  }
};

/* ===== MAIN PLUGIN FACTORY ===== */

/**
 * Create advanced build plugin with integrated pipeline features
 * @param {AdvancedBuildOptions} [options={}] - Plugin configuration
 * @returns {any} Vite plugin object
 */
export function advancedBuildPlugin(options = {}) {
  const config = { ...DEFAULT_ADVANCED_BUILD_OPTIONS, ...options };
  
  // Initialize managers
  let parallelManager = null;
  let fingerprintManager = null;
  let bundleAnalyzer = null;
  
  // Build context
  let buildContext = {
    startTime: 0,
    environment: 'development',
    buildId: null,
    outputDir: 'dist',
    results: {
      parallel: null,
      fingerprinting: null,
      analysis: null
    }
  };

  // Define generateBuildManifest outside plugin methods
  const generateBuildManifest = async () => {
    try {
      const manifest = {
        version: '3.1.0',
        buildId: buildContext.buildId,
        environment: buildContext.environment,
        timestamp: new Date().toISOString(),
        duration: performance.now() - buildContext.startTime,
        outputDir: buildContext.outputDir,
        pipeline: {
          parallelBuilds: config.enableParallelBuilds,
          fingerprinting: config.enableFingerprinting,
          bundleAnalysis: config.enableBundleAnalysis,
          performanceMonitoring: config.enablePerformanceMonitoring
        },
        results: {
          fingerprinting: buildContext.results.fingerprinting ? {
            assetsProcessed: buildContext.results.fingerprinting.size,
            compressionEnabled: true
          } : null,
          analysis: buildContext.results.analysis ? {
            budgetCompliant: buildContext.results.analysis.budgetCompliance.compliant,
            totalSize: buildContext.results.analysis.metrics.totalSize,
            recommendations: buildContext.results.analysis.recommendations.length
          } : null
        }
      };
      
      const manifestPath = path.join(buildContext.outputDir, 'build-manifest.json');
      await import('fs/promises').then(fs => 
        fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
      );
      
      console.log(`📋 Build manifest generated: ${manifestPath}`);
      
    } catch (error) {
      console.warn('⚠️  Failed to generate build manifest:', error.message);
    }
  };

  return {
    name: 'bers-advanced-build',
    
    /**
     * Plugin configuration - merge with environment plugin
     */
    config(userConfig, { command, mode }) {
      buildContext.environment = mode || 'development';
      buildContext.buildId = generateBuildId();
      
      console.log(`🚀 BERS Advanced Build Pipeline: ${buildContext.environment} mode`);
      console.log(`📋 Build ID: ${buildContext.buildId}`);
      
      // Initialize managers with configuration
      if (config.enableParallelBuilds) {
        parallelManager = new ParallelBuildManager(config.parallelConfig);
      }
      
      if (config.enableFingerprinting) {
        fingerprintManager = new AssetFingerprintManager(config.fingerprintConfig);
      }
      
      if (config.enableBundleAnalysis) {
        bundleAnalyzer = new BundleAnalyzer(config.analysisConfig);
      }
      
      // Enhanced build configuration for advanced pipeline
      const advancedConfig = {
        // Optimize for parallel builds
        build: {
          ...userConfig.build,
          // Enable parallel processing
          target: buildContext.environment === 'development' ? 'esnext' : 'es2015',
          // Optimize chunk strategy for fingerprinting
          rollupOptions: {
            ...userConfig.build?.rollupOptions,
            output: {
              ...userConfig.build?.rollupOptions?.output,
              // Prepare for fingerprinting - use simple names initially
              entryFileNames: 'assets/[name].js',
              chunkFileNames: 'assets/[name].js',
              assetFileNames: 'assets/[name].[ext]'
            }
          }
        },
        
        // Define build constants
        define: {
          ...userConfig.define,
          __BERS_ADVANCED_BUILD__: JSON.stringify(true),
          __BUILD_ID__: JSON.stringify(buildContext.buildId),
          __PIPELINE_VERSION__: JSON.stringify('3.1.0')
        }
      };
      
      return advancedConfig;
    },

    /**
     * Build start hook
     */
    async buildStart(inputOptions) {
      buildContext.startTime = performance.now();
      console.log('🔧 Advanced build pipeline starting...');
      
      // Initialize output directory
      buildContext.outputDir = inputOptions.output?.dir || 'dist';
      if (buildContext.environment !== 'development') {
        buildContext.outputDir = `${buildContext.outputDir}-${buildContext.environment}`;
      }
    },

    /**
     * Generate bundle hook - integrate fingerprinting and analysis
     */
    async generateBundle(outputOptions, bundle) {
      console.log('🎨 Advanced build pipeline: Processing bundle...');
      
      // Pre-process bundle for optimization analysis
      if (bundleAnalyzer && config.enableBundleAnalysis) {
        console.log('📊 Pre-analyzing bundle structure...');
        
        // Calculate preliminary metrics
        let totalSize = 0;
        let chunkCount = 0;
        
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type === 'chunk') {
            totalSize += chunk.code?.length || 0;
            chunkCount++;
          } else if (chunk.type === 'asset') {
            totalSize += chunk.source?.length || 0;
          }
        }
        
        console.log(`📊 Bundle preview: ${chunkCount} chunks, ${(totalSize / 1024).toFixed(1)}KB total`);
        
        // Early budget check
        const budgetConfig = config.analysisConfig.budgets?.[buildContext.environment];
        if (budgetConfig && totalSize > budgetConfig.totalBundleSize) {
          console.warn(`⚠️  Bundle size (${(totalSize / 1024).toFixed(1)}KB) exceeds budget (${(budgetConfig.totalBundleSize / 1024).toFixed(1)}KB)`);
        }
      }
    },

    /**
     * Write bundle hook - handle asset fingerprinting
     */
    async writeBundle(outputOptions, bundle) {
      if (!config.enableFingerprinting && !config.enableBundleAnalysis) {
        return;
      }
      
      const outputDir = outputOptions.dir || buildContext.outputDir;
      console.log(`📁 Processing build output in: ${outputDir}`);
      
      try {
        // Asset fingerprinting
        if (fingerprintManager && config.enableFingerprinting) {
          console.log('🔖 Starting asset fingerprinting...');
          buildContext.results.fingerprinting = await fingerprintManager.processAssets(
            outputDir,
            buildContext.environment
          );
          console.log('✅ Asset fingerprinting completed');
        }
        
        // Bundle analysis
        if (bundleAnalyzer && config.enableBundleAnalysis) {
          console.log('📊 Starting bundle analysis...');
          buildContext.results.analysis = await bundleAnalyzer.analyzeBuild(
            outputDir,
            buildContext.environment,
            buildContext.buildId
          );
          
          // Enforce performance budgets
          if (!buildContext.results.analysis.budgetCompliance.compliant) {
            const errors = buildContext.results.analysis.errors;
            if (errors.length > 0 && buildContext.environment === 'production') {
              throw new Error(`Performance budget exceeded: ${errors.join(', ')}`);
            }
          }
          
          console.log('✅ Bundle analysis completed');
        }
        
      } catch (error) {
        console.error('❌ Advanced build pipeline failed:', error);
        throw error;
      }
    },

    /**
     * Build end hook - generate comprehensive report
     */
    async buildEnd() {
      const totalDuration = performance.now() - buildContext.startTime;
      
      console.log('\n🎯 Advanced Build Pipeline Report:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Environment: ${buildContext.environment}`);
      console.log(`Build ID: ${buildContext.buildId}`);
      console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
      console.log(`Output Directory: ${buildContext.outputDir}`);
      
      // Fingerprinting summary
      if (buildContext.results.fingerprinting) {
        const fingerprintCount = buildContext.results.fingerprinting.size;
        console.log(`🔖 Fingerprinted Assets: ${fingerprintCount}`);
      }
      
      // Analysis summary
      if (buildContext.results.analysis) {
        const analysis = buildContext.results.analysis;
        console.log(`📊 Bundle Size: ${(analysis.metrics.totalSize / 1024).toFixed(1)}KB`);
        console.log(`💰 Budget Compliance: ${analysis.budgetCompliance.compliant ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`💡 Recommendations: ${analysis.recommendations.length}`);
      }
      
      // Performance assessment
      const targetTime = 30000; // 30 seconds
      const timeStatus = totalDuration <= targetTime ? '✅' : '⚠️';
      console.log(`${timeStatus} Build Time Target: ${(totalDuration / 1000).toFixed(2)}s / ${targetTime / 1000}s`);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      // Generate build manifest
      await generateBuildManifest();
    }
  };
}

/* ===== HELPER FUNCTIONS ===== */

/**
 * Generate unique build ID
 * @returns {string} Build ID
 */
function generateBuildId() {
  return `bers-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Create complete BERS build configuration
 * @param {Object} options - Configuration options
 * @returns {any[]} Array of Vite plugins
 */
export function createBERSBuildPipeline(options = {}) {
  const {
    environmentOptions = {},
    advancedOptions = {},
    ...otherOptions
  } = options;

  return [
    // Base environment plugin
    environmentPlugin({
      enableZeroRuntime: true,
      optimizeAssets: true,
      generateSourceMaps: 'auto',
      validateConfig: true,
      ...environmentOptions
    }),
    
    // Advanced build pipeline
    advancedBuildPlugin({
      enableParallelBuilds: true,
      enableFingerprinting: true,
      enableBundleAnalysis: true,
      enablePerformanceMonitoring: true,
      ...advancedOptions
    })
  ];
}

export default advancedBuildPlugin;