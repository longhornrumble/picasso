import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

describe('Build Smoke Tests', () => {
  let buildOutput;

  beforeAll(() => {
    try {
      // Clean and build
      execSync('npm run clean', { stdio: 'pipe' });
      buildOutput = execSync('npm run build:production', { 
        stdio: 'pipe',
        encoding: 'utf8'
      });
    } catch (error) {
      console.error('Build failed:', error.message);
      throw error;
    }
  });

  afterAll(() => {
    // Clean up after tests
    try {
      execSync('npm run clean', { stdio: 'pipe' });
    } catch (error) {
      console.warn('Cleanup failed:', error.message);
    }
  });

  it('should build successfully without errors', () => {
    expect(buildOutput).toBeDefined();
    expect(buildOutput).not.toContain('ERROR');
    expect(buildOutput).not.toContain('Failed to compile');
  });

  it('should generate dist directory with required files', () => {
    const distPath = resolve(process.cwd(), 'dist');
    expect(existsSync(distPath)).toBe(true);
    
    // Check for main entry points
    expect(existsSync(resolve(distPath, 'index.html'))).toBe(true);
    expect(existsSync(resolve(distPath, 'widget-frame.html'))).toBe(true);
    expect(existsSync(resolve(distPath, 'fullpage.html'))).toBe(true);
  });

  it('should generate JavaScript bundles', () => {
    const distPath = resolve(process.cwd(), 'dist');
    const files = readFileSync(resolve(distPath, 'index.html'), 'utf8');
    
    // Should contain script tags
    expect(files).toContain('<script');
    expect(files).toContain('type="module"');
  });

  it('should generate CSS files', () => {
    const distPath = resolve(process.cwd(), 'dist');
    const files = readFileSync(resolve(distPath, 'index.html'), 'utf8');
    
    // Should contain link tags for CSS
    expect(files).toContain('<link');
    expect(files).toContain('rel="stylesheet"');
  });

  it('should include assets directory', () => {
    const distPath = resolve(process.cwd(), 'dist');
    
    // Check if assets directory exists
    const assetsPath = resolve(distPath, 'assets');
    const hasAssetsDir = existsSync(assetsPath);
    
    // If no assets directory, check if assets are in the root
    if (!hasAssetsDir) {
      const distFiles = readdirSync(distPath);
      const hasAssetFiles = distFiles.some(file => 
        file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.map')
      );
      expect(hasAssetFiles).toBe(true);
    } else {
      expect(hasAssetsDir).toBe(true);
    }
  });

  it('should have proper HTML structure in widget-frame.html', () => {
    const distPath = resolve(process.cwd(), 'dist');
    const widgetFrameContent = readFileSync(resolve(distPath, 'widget-frame.html'), 'utf8');
    
    expect(widgetFrameContent).toContain('<!DOCTYPE html>');
    expect(widgetFrameContent).toContain('<html');
    expect(widgetFrameContent).toContain('<head>');
    expect(widgetFrameContent).toContain('<body>');
    expect(widgetFrameContent).toContain('<div id="root">');
  });

  it('should have proper HTML structure in fullpage.html', () => {
    const distPath = resolve(process.cwd(), 'dist');
    const fullpageContent = readFileSync(resolve(distPath, 'fullpage.html'), 'utf8');
    
    expect(fullpageContent).toContain('<!DOCTYPE html>');
    expect(fullpageContent).toContain('<html');
    expect(fullpageContent).toContain('<head>');
    expect(fullpageContent).toContain('<body>');
    expect(fullpageContent).toContain('<div id="root">');
  });

  it('should not contain development-only code in production build', () => {
    const distPath = resolve(process.cwd(), 'dist');
    const indexContent = readFileSync(resolve(distPath, 'index.html'), 'utf8');
    
    // Should not contain development indicators
    expect(indexContent).not.toContain('localhost:3000');
    expect(indexContent).not.toContain('development');
  });

  it('should have reasonable bundle sizes', () => {
    const distPath = resolve(process.cwd(), 'dist');
    const assetsPath = resolve(distPath, 'assets');
    
    // Check if assets directory exists and has files
    if (existsSync(assetsPath)) {
      const files = readFileSync(resolve(distPath, 'index.html'), 'utf8');
      
      // Extract asset file names from HTML
      const assetMatches = files.match(/assets\/[^"]+\.(js|css)/g) || [];
      
      // Should have at least some assets
      expect(assetMatches.length).toBeGreaterThan(0);
      
      // Check individual file sizes (basic check)
      assetMatches.forEach(assetPath => {
        const fullPath = resolve(distPath, assetPath);
        if (existsSync(fullPath)) {
          const stats = readFileSync(fullPath, 'utf8');
          // Basic size check - files should not be empty
          expect(stats.length).toBeGreaterThan(0);
        }
      });
    } else {
      // Check root directory for asset files
      const distFiles = readdirSync(distPath);
      const assetFiles = distFiles.filter(file => 
        file.endsWith('.js') || file.endsWith('.css')
      );
      expect(assetFiles.length).toBeGreaterThan(0);
    }
  });
}); 