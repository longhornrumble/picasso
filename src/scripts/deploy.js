#!/usr/bin/env node

// scripts/deploy.js - Production Deployment Script
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ENVIRONMENTS = {
  staging: {
    bucket: 'picasso-staging',
    cloudfront: 'E1234567890ABC',
    domain: 'staging-chat.myrecruiter.ai'
  },
  production: {
    bucket: 'picasso-production', 
    cloudfront: 'E0987654321XYZ',
    domain: 'chat.myrecruiter.ai'
  }
};

class PicassoDeployer {
  constructor(environment = 'staging') {
    this.env = environment;
    this.config = ENVIRONMENTS[environment];
    
    if (!this.config) {
      throw new Error(`Unknown environment: ${environment}`);
    }
    
    console.log(`🚀 Deploying Picasso Widget to ${environment}`);
  }

  // Run shell command with error handling
  exec(command, description) {
    console.log(`📦 ${description}...`);
    try {
      const output = execSync(command, { 
        encoding: 'utf8', 
        stdio: 'pipe' 
      });
      console.log(`✅ ${description} completed`);
      return output;
    } catch (error) {
      console.error(`❌ ${description} failed:`, error.message);
      process.exit(1);
    }
  }

  // Pre-deployment validation
  validate() {
    console.log('🔍 Running pre-deployment validation...');
    
    // Check AWS CLI
    try {
      this.exec('aws --version', 'AWS CLI check');
    } catch {
      throw new Error('AWS CLI not found. Please install and configure AWS CLI.');
    }

    // Check if bucket exists
    try {
      this.exec(`aws s3 ls s3://${this.config.bucket} --max-items 1`, 'S3 bucket check');
    } catch {
      throw new Error(`S3 bucket ${this.config.bucket} not accessible`);
    }

    // Lint code
    this.exec('npm run lint', 'Code linting');
    
    // Run tests (optional)
    if (process.env.SKIP_TESTS !== 'true') {
      this.exec('npm test -- --run', 'Test suite');
    }

    console.log('✅ Pre-deployment validation passed');
  }

  // Build the widget
  build() {
    console.log('🔨 Building Picasso Widget...');
    
    // Clean previous build
    this.exec('rm -rf dist', 'Clean previous build');
    
    // Build with environment variables
    const buildEnv = {
      NODE_ENV: 'production',
      VITE_ENVIRONMENT: this.env,
      VITE_API_BASE: `https://${this.config.domain}`,
      ...process.env
    };

    const envString = Object.entries(buildEnv)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    // Build the widget
    this.exec(`${envString} npm run build:all`, 'Complete build (widget + CSS + fullpage)');
    
    // Verify build output
    this.exec('ls -la dist/', 'Build verification');
    
    // Check all required files exist
    try {
      const jsStats = execSync('stat dist/widget.js', { encoding: 'utf8' });
      console.log('📊 Widget.js size:', jsStats.split(' ')[4], 'bytes');
      
      const cssStats = execSync('stat dist/widget.css', { encoding: 'utf8' });
      console.log('📊 Widget.css size:', cssStats.split(' ')[4], 'bytes');
      
      const htmlStats = execSync('stat dist/fullpage.html', { encoding: 'utf8' });
      console.log('📊 Fullpage.html size:', htmlStats.split(' ')[4], 'bytes');
    } catch {
      throw new Error('Required files (widget.js, widget.css, fullpage.html) not found in build output');
    }

    console.log('✅ Build completed successfully');
  }

  // Generate deployment manifest
  generateManifest() {
    console.log('📋 Generating deployment manifest...');
    
    const manifest = {
      version: process.env.npm_package_version || '1.0.0',
      environment: this.env,
      buildTime: new Date().toISOString(),
      domain: this.config.domain,
      commit: this.getGitCommit(),
      files: this.getFileHashes()
    };

    writeFileSync(
      'dist/manifest.json', 
      JSON.stringify(manifest, null, 2)
    );

    console.log('✅ Manifest generated:', manifest);
    return manifest;
  }

  // Get current git commit
  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  // Get file hashes for cache busting verification
  getFileHashes() {
    try {
      const files = execSync('find dist -name "*.js" -o -name "*.css"', { 
        encoding: 'utf8' 
      }).trim().split('\n').filter(Boolean);

      return files.reduce((acc, file) => {
        try {
          const hash = execSync(`md5sum ${file}`, { encoding: 'utf8' })
            .split(' ')[0];
          acc[file.replace('dist/', '')] = hash;
        } catch {
          // Skip files that can't be hashed
        }
        return acc;
      }, {});
    } catch {
      return {};
    }
  }

  // Deploy to S3
  deployToS3() {
    console.log(`☁️ Deploying to S3: s3://${this.config.bucket}`);
    
    // Set cache headers for different file types
    const deployCommands = [
      // JavaScript files - short cache (5 minutes) for widget.js
      {
        pattern: 'widget.js',
        cache: 'max-age=300, public',
        description: 'Deploy widget.js (short cache)'
      },
      
      // CSS files - short cache (5 minutes) for widget.css
      {
        pattern: 'widget.css',
        cache: 'max-age=300, public',
        description: 'Deploy widget.css (short cache)'
      },
      
      // HTML files - short cache (5 minutes) for fullpage.html
      {
        pattern: 'fullpage.html',
        cache: 'max-age=300, public',
        description: 'Deploy fullpage.html (short cache)'
      },
      
      // Hashed assets - long cache (1 year)
      {
        pattern: 'assets/',
        cache: 'max-age=31536000, public, immutable',
        description: 'Deploy hashed assets (long cache)'
      },
      
      // HTML and other files - medium cache (1 hour)
      {
        pattern: '.',
        cache: 'max-age=3600, public',
        exclude: '--exclude "widget.js" --exclude "widget.css" --exclude "fullpage.html" --exclude "assets/*"',
        description: 'Deploy other files (medium cache)'
      }
    ];

    deployCommands.forEach(({ pattern, cache, exclude = '', description }) => {
      const command = `aws s3 sync dist/ s3://${this.config.bucket}/ \
        --cache-control "${cache}" \
        --delete \
        ${exclude} \
        ${pattern === '.' ? '' : `--include "*" --exclude "*" --include "${pattern}*"`}`;
      
      this.exec(command, description);
    });

    console.log('✅ S3 deployment completed');
  }

  // Invalidate CloudFront
  invalidateCloudFront() {
    if (!this.config.cloudfront) {
      console.log('⏭️ No CloudFront distribution configured, skipping invalidation');
      return;
    }

    console.log(`🌐 Invalidating CloudFront: ${this.config.cloudfront}`);
    
    const paths = ['/widget.js', '/widget.css', '/fullpage.html', '/manifest.json', '/*'];
    const pathsString = paths.join(' ');
    
    const invalidationId = this.exec(
      `aws cloudfront create-invalidation \
        --distribution-id ${this.config.cloudfront} \
        --paths ${pathsString} \
        --query 'Invalidation.Id' \
        --output text`,
      'CloudFront invalidation'
    ).trim();

    console.log(`📡 Invalidation created: ${invalidationId}`);
    
    // Optional: Wait for invalidation to complete
    if (process.env.WAIT_FOR_INVALIDATION === 'true') {
      console.log('⏳ Waiting for invalidation to complete...');
      this.exec(
        `aws cloudfront wait invalidation-completed \
          --distribution-id ${this.config.cloudfront} \
          --id ${invalidationId}`,
        'Waiting for invalidation'
      );
    }

    console.log('✅ CloudFront invalidation completed');
  }

  // Post-deployment verification
  verify() {
    console.log('🧪 Running post-deployment verification...');
    
    const widgetUrl = `https://${this.config.domain}/widget.js`;
    
    // Test widget.js and widget.css load
    this.exec(
      `curl -f -s -o /dev/null -w "%{http_code}" ${widgetUrl}`,
      'Widget JS accessibility test'
    );

    const cssUrl = `https://${this.config.domain}/widget.css`;
    this.exec(
      `curl -f -s -o /dev/null -w "%{http_code}" ${cssUrl}`,
      'Widget CSS accessibility test'
    );

    const fullpageUrl = `https://${this.config.domain}/fullpage.html`;
    this.exec(
      `curl -f -s -o /dev/null -w "%{http_code}" ${fullpageUrl}`,
      'Fullpage HTML accessibility test'
    );

    // Test manifest.json
    const manifestUrl = `https://${this.config.domain}/manifest.json`;
    this.exec(
      `curl -f -s ${manifestUrl} | jq .version`,
      'Manifest validation'
    );

    console.log('✅ Post-deployment verification passed');
    console.log(`🎉 Deployment successful! Widget available at: ${widgetUrl}`);
  }

  // Run full deployment
  async deploy() {
    const startTime = Date.now();
    
    try {
      this.validate();
      this.build();
      this.generateManifest();
      this.deployToS3();
      this.invalidateCloudFront();
      this.verify();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n🎉 Deployment completed successfully in ${duration}s`);
      console.log(`🔗 Widget URL: https://${this.config.domain}/widget.js`);
      
    } catch (error) {
      console.error('\n❌ Deployment failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const environment = process.argv[2] || 'staging';
  const deployer = new PicassoDeployer(environment);
  deployer.deploy();
}

export default PicassoDeployer;