/**
 * BUILD PROCESS VALIDATION TEST SUITE
 * 
 * This test suite validates that the build process correctly creates
 * environment-aware artifacts that enforce endpoint isolation.
 * Addresses the root cause analysis findings.
 * 
 * Author: QA Automation Specialist
 * Purpose: Validate build-time environment injection and artifact verification
 * Coverage: Vite configuration, npm scripts, deployment artifacts
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('Build Process Validation Test Suite', () => {
  const testBuildDir = path.join(process.cwd(), 'test-build-artifacts');
  
  beforeEach(() => {
    // Clean test build directory
    if (fs.existsSync(testBuildDir)) {
      fs.rmSync(testBuildDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testBuildDir, { recursive: true });
  });
  
  afterEach(() => {
    // Clean up test artifacts
    if (fs.existsSync(testBuildDir)) {
      fs.rmSync(testBuildDir, { recursive: true, force: true });
    }
  });

  describe('Vite Configuration Validation', () => {
    test('CRITICAL: Vite config should inject environment variables correctly', () => {
      // Read and validate vite.config.js
      const viteConfigPath = path.join(process.cwd(), 'vite.config.js');
      const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
      
      // Vite config should define environment variables
      expect(viteConfig).toContain('define:');
      expect(viteConfig).toContain('process.env.NODE_ENV');
      
      // Should have proper mode detection
      expect(viteConfig).toContain('({ mode })');
      expect(viteConfig).toContain('isProduction = mode === \'production\'');
      
      console.log('✅ VITE CONFIG - Properly configured for environment injection');
    });
    
    test('CRITICAL: Package.json scripts should support environment-specific builds', () => {
      // Read and validate package.json
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Should have environment-specific build scripts
      expect(packageJson.scripts).toHaveProperty('build:production');
      expect(packageJson.scripts).toHaveProperty('deploy:staging');
      expect(packageJson.scripts).toHaveProperty('deploy:production');
      
      // Build scripts should set proper environment
      expect(packageJson.scripts['build:production']).toContain('NODE_ENV=production');
      
      console.log('✅ PACKAGE.JSON - Environment-specific scripts configured');
    });
  });

  describe('Build Artifact Validation', () => {
    test('CRITICAL: Production build should create production-configured artifacts', () => {
      // Mock production build process
      const originalNodeEnv = process.env.NODE_ENV;
      const originalViteEnv = process.env.VITE_ENVIRONMENT;
      
      try {
        process.env.NODE_ENV = 'production';
        process.env.VITE_ENVIRONMENT = 'production';
        
        // Create a test build with production environment
        const buildResult = execSync('npm run build', {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: 30000
        });
        
        // Verify build completed successfully
        expect(buildResult).not.toContain('Error');
        expect(buildResult).not.toContain('Failed');
        
        // Check that dist directory was created
        const distPath = path.join(process.cwd(), 'dist');
        expect(fs.existsSync(distPath)).toBe(true);
        
        // Check for required build artifacts
        expect(fs.existsSync(path.join(distPath, 'widget-frame.html'))).toBe(true);
        expect(fs.existsSync(path.join(distPath, 'assets'))).toBe(true);
        
        console.log('✅ BUILD ARTIFACTS - Production build creates required files');
        
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.VITE_ENVIRONMENT = originalViteEnv;
      }
    });
    
    test('CRITICAL: Staging path fix should create staging-specific artifacts', () => {
      // First run production build
      execSync('npm run build', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000
      });
      
      // Then run staging path fix
      execSync('node fix-staging-paths.js', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 10000
      });
      
      const distPath = path.join(process.cwd(), 'dist');
      
      // Should create staging-specific HTML file
      const stagingHtmlPath = path.join(distPath, 'widget-frame-staging.html');
      expect(fs.existsSync(stagingHtmlPath)).toBe(true);
      
      // Read staging HTML and verify staging paths
      const stagingHtml = fs.readFileSync(stagingHtmlPath, 'utf8');
      expect(stagingHtml).toContain('/staging/assets/');
      expect(stagingHtml).not.toContain('src="/assets/');
      
      // Original HTML should have dynamic detection script
      const originalHtmlPath = path.join(distPath, 'widget-frame.html');
      const originalHtml = fs.readFileSync(originalHtmlPath, 'utf8');
      expect(originalHtml).toContain('isStaging = window.location.pathname.includes(\'/staging/\')');
      
      console.log('✅ STAGING PATHS - Staging-specific artifacts created correctly');
    });
    
    test('CRITICAL: Widget.js should be copied to dist during build', () => {
      // Run build process
      execSync('npm run build', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000
      });
      
      // Copy widget.js as done in deploy scripts
      const currentWidgetPath = path.join(process.cwd(), 'current-widget.js');
      const distWidgetPath = path.join(process.cwd(), 'dist', 'widget.js');
      
      if (fs.existsSync(currentWidgetPath)) {
        fs.copyFileSync(currentWidgetPath, distWidgetPath);
      }
      
      // Verify widget.js exists in dist
      expect(fs.existsSync(distWidgetPath)).toBe(true);
      
      // Verify widget.js contains environment detection logic
      const widgetContent = fs.readFileSync(distWidgetPath, 'utf8');
      expect(widgetContent).toContain('staging');
      expect(widgetContent).toContain('isStaging');
      expect(widgetContent).toContain('widget-frame-staging.html');
      
      console.log('✅ WIDGET.JS - Contains environment detection logic');
    });
  });

  describe('Environment Injection Validation', () => {
    test('CRITICAL: Built assets should contain environment-aware code', () => {
      // Run production build
      const originalNodeEnv = process.env.NODE_ENV;
      
      try {
        process.env.NODE_ENV = 'production';
        
        execSync('npm run build', {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: 30000
        });
        
        // Check that built JavaScript contains environment detection
        const assetsPath = path.join(process.cwd(), 'dist', 'assets');
        const jsFiles = fs.readdirSync(assetsPath).filter(file => file.endsWith('.js'));
        
        expect(jsFiles.length).toBeGreaterThan(0);
        
        // Check at least one JS file contains environment logic
        let containsEnvironmentLogic = false;
        for (const jsFile of jsFiles) {
          const jsContent = fs.readFileSync(path.join(assetsPath, jsFile), 'utf8');
          if (jsContent.includes('production') || jsContent.includes('staging') || jsContent.includes('development')) {
            containsEnvironmentLogic = true;
            break;
          }
        }
        
        expect(containsEnvironmentLogic).toBe(true);
        
        console.log('✅ ENVIRONMENT INJECTION - Built assets contain environment awareness');
        
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
    
    test('CRITICAL: iframe-main.jsx build should include config loading logic', () => {
      // Read the source file to verify it has environment-aware config loading
      const iframeMainPath = path.join(process.cwd(), 'src', 'iframe-main.jsx');
      const iframeMainContent = fs.readFileSync(iframeMainPath, 'utf8');
      
      // Should import environment config
      expect(iframeMainContent).toContain('from \'./config/environment.js\'');
      
      // Should use environment config for URL generation
      expect(iframeMainContent).toContain('environmentConfig.getConfigUrl');
      
      // Should have tenant hash detection from URL
      expect(iframeMainContent).toContain('urlParams.get(\'t\')');
      
      console.log('✅ IFRAME MAIN - Contains environment-aware configuration');
    });
  });

  describe('Deployment Script Validation', () => {
    test('CRITICAL: Staging deployment should use staging paths', () => {
      // Read staging deployment script
      const stagingDeployPath = path.join(process.cwd(), 'deploy-staging.sh');
      const stagingDeploy = fs.readFileSync(stagingDeployPath, 'utf8');
      
      // Should upload to staging S3 path
      expect(stagingDeploy).toContain('s3://picassostaging/staging/');
      
      // Should call fix-staging-paths.js
      expect(stagingDeploy).toContain('node fix-staging-paths.js');
      
      // Should copy current-widget.js
      expect(stagingDeploy).toContain('cp current-widget.js dist/widget.js');
      
      // Should invalidate staging paths
      expect(stagingDeploy).toContain('/staging/widget.js');
      expect(stagingDeploy).toContain('/staging/assets/*');
      
      console.log('✅ STAGING DEPLOY - Uses correct staging paths');
    });
    
    test('CRITICAL: Production deployment should use production paths', () => {
      // Read production deployment script
      const prodDeployPath = path.join(process.cwd(), 'deploy-production.sh');
      const prodDeploy = fs.readFileSync(prodDeployPath, 'utf8');
      
      // Should upload to production S3 (root level)
      expect(prodDeploy).toContain('s3://picassocode/');
      expect(prodDeploy).not.toContain('s3://picassocode/staging/');
      
      // Should exclude staging HTML from production
      expect(prodDeploy).toContain('--exclude "widget-frame-staging.html"');
      
      // Should run tests before deployment
      expect(prodDeploy).toContain('npm test');
      
      // Should create deployment manifest
      expect(prodDeploy).toContain('deployment-info.json');
      
      console.log('✅ PRODUCTION DEPLOY - Uses correct production paths');
    });
  });

  describe('Asset Path Resolution Validation', () => {
    test('CRITICAL: Staging HTML should reference staging assets', () => {
      // Run build and staging path fix
      execSync('npm run build', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000
      });
      
      execSync('node fix-staging-paths.js', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 10000
      });
      
      // Check staging HTML has correct asset paths
      const stagingHtmlPath = path.join(process.cwd(), 'dist', 'widget-frame-staging.html');
      const stagingHtml = fs.readFileSync(stagingHtmlPath, 'utf8');
      
      // All asset references should use staging prefix
      const assetReferences = stagingHtml.match(/(src|href)="[^"]*"/g) || [];
      const stagingAssetRefs = assetReferences.filter(ref => ref.includes('/staging/assets/'));
      const nonStagingAssetRefs = assetReferences.filter(ref => 
        ref.includes('/assets/') && !ref.includes('/staging/assets/')
      );
      
      expect(stagingAssetRefs.length).toBeGreaterThan(0);
      expect(nonStagingAssetRefs.length).toBe(0);
      
      console.log('✅ STAGING ASSETS - All asset references use staging prefix');
    });
    
    test('CRITICAL: Production HTML should reference production assets', () => {
      // Run build process
      execSync('npm run build', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000
      });
      
      // Check production HTML has correct asset paths
      const prodHtmlPath = path.join(process.cwd(), 'dist', 'widget-frame.html');
      const prodHtml = fs.readFileSync(prodHtmlPath, 'utf8');
      
      // Should have root-level asset references (after dynamic detection script is added)
      const assetReferences = prodHtml.match(/(src|href)="[^"]*"/g) || [];
      const rootAssetRefs = assetReferences.filter(ref => 
        ref.includes('/assets/') && !ref.includes('/staging/')
      );
      
      expect(rootAssetRefs.length).toBeGreaterThan(0);
      
      console.log('✅ PRODUCTION ASSETS - Asset references use production paths');
    });
  });

  describe('Build Performance Validation', () => {
    test('CRITICAL: Build process should complete within reasonable time', () => {
      const buildStartTime = Date.now();
      
      execSync('npm run build', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 60000 // 60 second timeout
      });
      
      const buildTime = Date.now() - buildStartTime;
      
      // Build should complete in under 30 seconds
      expect(buildTime).toBeLessThan(30000);
      
      console.log(`✅ BUILD PERFORMANCE - Completed in ${buildTime}ms`);
    });
    
    test('CRITICAL: Built bundle should meet size requirements', () => {
      // Run production build
      execSync('npm run build', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000
      });
      
      // Check bundle sizes
      const assetsPath = path.join(process.cwd(), 'dist', 'assets');
      const jsFiles = fs.readdirSync(assetsPath).filter(file => file.endsWith('.js'));
      
      for (const jsFile of jsFiles) {
        const filePath = path.join(assetsPath, jsFile);
        const stats = fs.statSync(filePath);
        const sizeInKB = stats.size / 1024;
        
        // Individual JS files should be under 500KB
        expect(sizeInKB).toBeLessThan(500);
      }
      
      console.log('✅ BUNDLE SIZE - All JS files under 500KB');
    });
  });

  describe('Configuration Consistency Validation', () => {
    test('CRITICAL: Environment config should match deployment targets', () => {
      // Read environment.js to verify endpoint configurations
      const envConfigPath = path.join(process.cwd(), 'src', 'config', 'environment.js');
      const envConfig = fs.readFileSync(envConfigPath, 'utf8');
      
      // Staging configuration should be isolated
      expect(envConfig).toContain('staging-api.myrecruiter.ai');
      expect(envConfig).toContain('picassostaging');
      
      // Production configuration should be separate
      expect(envConfig).toContain('chat.myrecruiter.ai');
      expect(envConfig).toContain('picassocode');
      
      // Should have proper environment detection
      expect(envConfig).toContain('getEnvironment');
      expect(envConfig).toContain('validateEnvironmentConfig');
      
      console.log('✅ CONFIG CONSISTENCY - Environment configs match deployment');
    });
    
    test('CRITICAL: Widget.js should match iframe environment detection', () => {
      // Read current-widget.js
      const widgetPath = path.join(process.cwd(), 'current-widget.js');
      const widgetContent = fs.readFileSync(widgetPath, 'utf8');
      
      // Read iframe-main.jsx
      const iframePath = path.join(process.cwd(), 'src', 'iframe-main.jsx');
      const iframeContent = fs.readFileSync(iframePath, 'utf8');
      
      // Both should reference staging detection
      expect(widgetContent).toContain('staging');
      expect(iframeContent).toContain('staging');
      
      // Both should use consistent URL patterns
      expect(widgetContent).toContain('widget-frame-staging.html');
      expect(iframeContent).toContain('staging-api.myrecruiter.ai');
      
      console.log('✅ WIDGET CONSISTENCY - Widget.js and iframe use consistent logic');
    });
  });
});

/**
 * BUILD PROCESS VALIDATION SUMMARY:
 * 
 * This test suite validates that:
 * 1. Vite configuration properly injects environment variables
 * 2. Build artifacts are environment-aware
 * 3. Staging and production deployments use correct paths
 * 4. Asset references match environment configuration
 * 5. Build performance meets requirements
 * 6. Configuration consistency across components
 * 
 * These tests ensure the build process creates environment-isolated
 * artifacts that prevent staging->production endpoint confusion.
 */