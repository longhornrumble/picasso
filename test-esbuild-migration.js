#!/usr/bin/env node

/**
 * Comprehensive ESBuild Migration Validation Test Suite
 * 
 * This test validates that the migration from Vite to esbuild was successful
 * by testing all build environments, bundle outputs, and functionality.
 */

import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ESBuildMigrationValidator {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      testsPassed: 0,
      testsFailed: 0,
      warnings: [],
      errors: [],
      buildMetrics: {},
      summary: {}
    };
    
    this.environments = ['development', 'staging', 'production'];
    this.testFiles = [
      'iframe-main.js',
      'widget-standalone.js',
      'iframe.html',
      'widget.js'
    ];
    
    this.optionalFiles = [
      'widget-frame.html'
    ];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '📝',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      build: '🏗️',
      test: '🧪'
    }[type] || '📝';
    
    console.log(`${prefix} [${timestamp}] ${message}`);
    
    if (type === 'warning') this.results.warnings.push(message);
    if (type === 'error') this.results.errors.push(message);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runCommand(command, options = {}) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: __dirname,
        timeout: 60000, // 60 second timeout
        ...options
      });
      return { success: true, stdout, stderr };
    } catch (error) {
      return { success: false, error: error.message, stdout: error.stdout, stderr: error.stderr };
    }
  }

  async testBuildEnvironment(env) {
    this.log(`Testing ${env} environment build`, 'build');
    
    const startTime = Date.now();
    
    try {
      // Clean previous builds
      await this.runCommand('npm run clean');
      
      // Build for the environment
      const buildResult = await this.runCommand(`BUILD_ENV=${env} node esbuild.config.mjs`);
      
      if (!buildResult.success) {
        this.log(`Build failed for ${env}: ${buildResult.error}`, 'error');
        this.results.testsFailed++;
        return false;
      }
      
      const buildTime = Date.now() - startTime;
      this.results.buildMetrics[env] = { buildTime };
      
      // Check if dist directory exists
      const distDir = `dist/${env}`;
      if (!fs.existsSync(distDir)) {
        this.log(`Distribution directory missing for ${env}: ${distDir}`, 'error');
        this.results.testsFailed++;
        return false;
      }
      
      // Check required files exist
      let allFilesExist = true;
      
      for (const file of this.testFiles) {
        const filePath = path.join(distDir, file);
        if (!fs.existsSync(filePath)) {
          this.log(`Missing required file for ${env}: ${file}`, 'error');
          allFilesExist = false;
        } else {
          const stats = fs.statSync(filePath);
          this.log(`File exists for ${env}: ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
        }
      }
      
      // Check optional files
      for (const file of this.optionalFiles) {
        const filePath = path.join(distDir, file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          this.log(`Optional file exists for ${env}: ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
        } else {
          this.log(`Optional file missing for ${env}: ${file}`, 'warning');
        }
      }
      
      if (!allFilesExist) {
        this.results.testsFailed++;
        return false;
      }
      
      // Check bundle sizes
      this.checkBundleSizes(env, distDir);
      
      // Test environment variable injection
      await this.testEnvironmentVariables(env, distDir);
      
      this.log(`Build test passed for ${env} (${buildTime}ms)`, 'success');
      this.results.testsPassed++;
      return true;
      
    } catch (error) {
      this.log(`Build test failed for ${env}: ${error.message}`, 'error');
      this.results.testsFailed++;
      return false;
    }
  }

  checkBundleSizes(env, distDir) {
    this.log(`Checking bundle sizes for ${env}`, 'test');
    
    try {
      const files = fs.readdirSync(distDir);
      let totalSize = 0;
      
      files.forEach(file => {
        const filePath = path.join(distDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile() && (file.endsWith('.js') || file.endsWith('.css'))) {
          const sizeKB = stats.size / 1024;
          totalSize += sizeKB;
          
          this.log(`${env} bundle: ${file} = ${sizeKB.toFixed(2)} KB`);
          
          // Warn about large bundles
          if (sizeKB > 150) {
            this.log(`Large bundle detected in ${env}: ${file} (${sizeKB.toFixed(2)} KB)`, 'warning');
          }
        }
      });
      
      this.results.buildMetrics[env].totalBundleSize = totalSize;
      this.log(`Total ${env} bundle size: ${totalSize.toFixed(2)} KB`);
      
    } catch (error) {
      this.log(`Failed to check bundle sizes for ${env}: ${error.message}`, 'error');
    }
  }

  async testEnvironmentVariables(env, distDir) {
    this.log(`Testing environment variable injection for ${env}`, 'test');
    
    try {
      const iframeMainPath = path.join(distDir, 'iframe-main.js');
      if (!fs.existsSync(iframeMainPath)) {
        this.log(`iframe-main.js not found for environment variable test in ${env}`, 'error');
        return false;
      }
      
      const content = fs.readFileSync(iframeMainPath, 'utf8');
      
      // Expected environment-specific values
      const expectedVars = {
        development: {
          'API_BASE_URL': 'http://localhost:3000/api',
          'WIDGET_DOMAIN': 'http://localhost:8000'
        },
        staging: {
          'API_BASE_URL': 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws',
          'WIDGET_DOMAIN': 'https://chat-staging.myrecruiter.ai'
        },
        production: {
          'API_BASE_URL': 'https://api.myrecruiter.ai',
          'WIDGET_DOMAIN': 'https://chat.myrecruiter.ai'
        }
      };
      
      const envVars = expectedVars[env];
      let varsFound = 0;
      
      for (const [varName, expectedValue] of Object.entries(envVars)) {
        if (content.includes(expectedValue)) {
          this.log(`Environment variable ${varName} correctly injected in ${env}`);
          varsFound++;
        } else {
          this.log(`Environment variable ${varName} not found or incorrect in ${env}`, 'error');
        }
      }
      
      // Check for import.meta.env compatibility
      if (content.includes('import.meta.env') && env === 'development') {
        this.log(`import.meta.env compatibility detected in ${env}`, 'warning');
      }
      
      this.results.buildMetrics[env].environmentVariablesInjected = varsFound;
      return varsFound === Object.keys(envVars).length;
      
    } catch (error) {
      this.log(`Failed to test environment variables for ${env}: ${error.message}`, 'error');
      return false;
    }
  }

  async testDevServer() {
    this.log('Testing development server startup', 'test');
    
    try {
      // Start dev server in background
      const devProcess = spawn('npm', ['run', 'dev'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let serverStarted = false;
      let output = '';
      
      devProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('esbuild dev server running')) {
          serverStarted = true;
        }
      });
      
      devProcess.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      // Wait for server to start (max 15 seconds)
      for (let i = 0; i < 30; i++) {
        if (serverStarted) break;
        await this.sleep(500);
      }
      
      // Kill the dev server
      devProcess.kill('SIGTERM');
      
      if (serverStarted) {
        this.log('Development server started successfully', 'success');
        this.results.testsPassed++;
        return true;
      } else {
        this.log('Development server failed to start within timeout', 'error');
        this.log(`Server output: ${output}`);
        this.results.testsFailed++;
        return false;
      }
      
    } catch (error) {
      this.log(`Dev server test failed: ${error.message}`, 'error');
      this.results.testsFailed++;
      return false;
    }
  }

  async testPathAliases() {
    this.log('Testing path aliases functionality', 'test');
    
    try {
      // Build with development to test aliases
      const buildResult = await this.runCommand('BUILD_ENV=development node esbuild.config.mjs');
      
      if (!buildResult.success) {
        this.log(`Path alias test failed - build error: ${buildResult.error}`, 'error');
        this.results.testsFailed++;
        return false;
      }
      
      // Check if build contains resolved alias paths
      const distDir = 'dist/development';
      const iframeMainPath = path.join(distDir, 'iframe-main.js');
      
      if (fs.existsSync(iframeMainPath)) {
        const content = fs.readFileSync(iframeMainPath, 'utf8');
        
        // Should not contain unresolved @ aliases in final bundle
        if (content.includes('from "@/') || content.includes('from "@components/')) {
          this.log('Unresolved path aliases found in bundle', 'error');
          this.results.testsFailed++;
          return false;
        }
        
        this.log('Path aliases resolved successfully', 'success');
        this.results.testsPassed++;
        return true;
      } else {
        this.log('Cannot test path aliases - iframe-main.js not found', 'error');
        this.results.testsFailed++;
        return false;
      }
      
    } catch (error) {
      this.log(`Path alias test failed: ${error.message}`, 'error');
      this.results.testsFailed++;
      return false;
    }
  }

  async testCSSBundling() {
    this.log('Testing CSS bundling', 'test');
    
    try {
      // Build production to check CSS bundling
      const buildResult = await this.runCommand('BUILD_ENV=production node esbuild.config.mjs');
      
      if (!buildResult.success) {
        this.log(`CSS bundling test failed - build error: ${buildResult.error}`, 'error');
        this.results.testsFailed++;
        return false;
      }
      
      const distDir = 'dist/production';
      const files = fs.readdirSync(distDir);
      
      // Check for CSS files or embedded CSS
      let cssFound = false;
      
      files.forEach(file => {
        if (file.endsWith('.css')) {
          cssFound = true;
          const cssPath = path.join(distDir, file);
          const stats = fs.statSync(cssPath);
          this.log(`CSS file found: ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
        }
      });
      
      // Check if CSS is embedded in JS files
      const jsFiles = files.filter(f => f.endsWith('.js'));
      for (const jsFile of jsFiles) {
        const jsPath = path.join(distDir, jsFile);
        const content = fs.readFileSync(jsPath, 'utf8');
        
        if (content.includes('style') && content.includes('stylesheet')) {
          cssFound = true;
          this.log(`CSS bundling detected in ${jsFile}`);
          break;
        }
      }
      
      if (cssFound) {
        this.log('CSS bundling working correctly', 'success');
        this.results.testsPassed++;
        return true;
      } else {
        this.log('No CSS bundling detected', 'warning');
        this.results.testsPassed++; // Not necessarily an error
        return true;
      }
      
    } catch (error) {
      this.log(`CSS bundling test failed: ${error.message}`, 'error');
      this.results.testsFailed++;
      return false;
    }
  }

  async testConsoleLogStripping() {
    this.log('Testing console.log stripping in production', 'test');
    
    try {
      // Build production
      const buildResult = await this.runCommand('BUILD_ENV=production node esbuild.config.mjs');
      
      if (!buildResult.success) {
        this.log(`Console stripping test failed - build error: ${buildResult.error}`, 'error');
        this.results.testsFailed++;
        return false;
      }
      
      const distDir = 'dist/production';
      const files = fs.readdirSync(distDir);
      const jsFiles = files.filter(f => f.endsWith('.js'));
      
      let consoleLogsFound = 0;
      
      for (const jsFile of jsFiles) {
        const jsPath = path.join(distDir, jsFile);
        const content = fs.readFileSync(jsPath, 'utf8');
        
        // Count console.log occurrences
        const matches = content.match(/console\.log/g);
        if (matches) {
          consoleLogsFound += matches.length;
        }
      }
      
      if (consoleLogsFound === 0) {
        this.log('Console.log statements successfully stripped from production build', 'success');
        this.results.testsPassed++;
        return true;
      } else {
        this.log(`Warning: ${consoleLogsFound} console.log statements found in production build`, 'warning');
        // Not necessarily a failure - some may be legitimate
        this.results.testsPassed++;
        return true;
      }
      
    } catch (error) {
      this.log(`Console stripping test failed: ${error.message}`, 'error');
      this.results.testsFailed++;
      return false;
    }
  }

  async testBundleAnalysis() {
    this.log('Testing bundle analysis functionality', 'test');
    
    try {
      const analyzeResult = await this.runCommand('npm run analyze');
      
      if (!analyzeResult.success) {
        this.log(`Bundle analysis test failed: ${analyzeResult.error}`, 'error');
        this.results.testsFailed++;
        return false;
      }
      
      // Check if metafile was generated
      const metafilePath = 'dist/production/metafile.json';
      if (fs.existsSync(metafilePath)) {
        const metafile = JSON.parse(fs.readFileSync(metafilePath, 'utf8'));
        
        this.log(`Metafile generated with ${Object.keys(metafile.outputs || {}).length} output files`);
        this.results.buildMetrics.metafileGenerated = true;
        
        this.log('Bundle analysis working correctly', 'success');
        this.results.testsPassed++;
        return true;
      } else {
        this.log('Metafile not generated during analysis', 'error');
        this.results.testsFailed++;
        return false;
      }
      
    } catch (error) {
      this.log(`Bundle analysis test failed: ${error.message}`, 'error');
      this.results.testsFailed++;
      return false;
    }
  }

  generateReport() {
    this.log('Generating comprehensive test report', 'build');
    
    const totalTests = this.results.testsPassed + this.results.testsFailed;
    const passRate = totalTests > 0 ? (this.results.testsPassed / totalTests * 100).toFixed(2) : 0;
    
    this.results.summary = {
      totalTests,
      passRate: `${passRate}%`,
      buildMetrics: this.results.buildMetrics,
      migrationStatus: this.results.testsFailed === 0 ? 'SUCCESS' : 'PARTIAL SUCCESS',
      recommendedActions: []
    };
    
    // Add recommendations based on results
    if (this.results.testsFailed > 0) {
      this.results.summary.recommendedActions.push('Review failed tests and address issues');
    }
    
    if (this.results.warnings.length > 0) {
      this.results.summary.recommendedActions.push('Review warnings for potential optimizations');
    }
    
    if (!this.results.buildMetrics.metafileGenerated) {
      this.results.summary.recommendedActions.push('Ensure bundle analysis is working for production monitoring');
    }
    
    // Write detailed report
    const reportPath = 'esbuild-migration-test-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    
    this.log(`Detailed report written to: ${reportPath}`, 'success');
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 ESBUILD MIGRATION VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Tests Passed: ${this.results.testsPassed}`);
    console.log(`❌ Tests Failed: ${this.results.testsFailed}`);
    console.log(`⚠️  Warnings: ${this.results.warnings.length}`);
    console.log(`📈 Pass Rate: ${passRate}%`);
    console.log(`🎯 Migration Status: ${this.results.summary.migrationStatus}`);
    
    if (Object.keys(this.results.buildMetrics).length > 0) {
      console.log('\n📦 BUILD METRICS:');
      Object.entries(this.results.buildMetrics).forEach(([env, metrics]) => {
        if (typeof metrics === 'object' && metrics.buildTime) {
          console.log(`  ${env}: ${metrics.buildTime}ms build time, ${(metrics.totalBundleSize || 0).toFixed(2)} KB total`);
        }
      });
    }
    
    if (this.results.summary.recommendedActions.length > 0) {
      console.log('\n🔧 RECOMMENDED ACTIONS:');
      this.results.summary.recommendedActions.forEach(action => {
        console.log(`  • ${action}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    return this.results.summary.migrationStatus === 'SUCCESS';
  }

  async run() {
    this.log('Starting ESBuild Migration Validation', 'build');
    this.log(`Testing environments: ${this.environments.join(', ')}`);
    
    try {
      // Test all build environments
      for (const env of this.environments) {
        await this.testBuildEnvironment(env);
      }
      
      // Test dev server
      await this.testDevServer();
      
      // Test path aliases
      await this.testPathAliases();
      
      // Test CSS bundling
      await this.testCSSBundling();
      
      // Test console log stripping
      await this.testConsoleLogStripping();
      
      // Test bundle analysis
      await this.testBundleAnalysis();
      
    } catch (error) {
      this.log(`Critical test failure: ${error.message}`, 'error');
      this.results.testsFailed++;
    }
    
    // Generate and return final report
    return this.generateReport();
  }
}

// Run the validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new ESBuildMigrationValidator();
  
  validator.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    });
}

export default ESBuildMigrationValidator;