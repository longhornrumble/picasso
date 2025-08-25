/**
 * Comprehensive Tests for Asset Fingerprinting System - BERS Phase 3, Task 3.1
 * 
 * This test suite validates the advanced asset management system including:
 * - Content-based fingerprinting with SHA-256 hashing
 * - Long-term browser caching strategies
 * - Asset compression (gzip/brotli) and optimization
 * - CDN-friendly asset naming and distribution
 * - Cache invalidation mechanisms
 * - Asset manifest generation and management
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS) - Test Engineer
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip, createBrotliCompress } from 'zlib';
import path from 'path';
import crypto from 'crypto';
import { AssetFingerprintManager, fingerprintAssets, generateCacheInvalidationMap } from '../asset-fingerprinting.js';

// Mock dependencies
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    createReadStream: vi.fn(),
    createWriteStream: vi.fn()
  };
});

vi.mock('zlib', () => ({
  createGzip: vi.fn(),
  createBrotliCompress: vi.fn()
}));

vi.mock('stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/')),
    relative: vi.fn((from, to) => to.replace(from, '').replace(/^\//, '')),
    parse: vi.fn((filepath) => {
      const parts = filepath.split('/');
      const filename = parts[parts.length - 1];
      const dotIndex = filename.lastIndexOf('.');
      return {
        dir: parts.slice(0, -1).join('/'),
        name: dotIndex > 0 ? filename.substring(0, dotIndex) : filename,
        ext: dotIndex > 0 ? filename.substring(dotIndex) : ''
      };
    }),
    extname: vi.fn((file) => {
      const parts = file.split('.');
      return parts.length > 1 ? '.' + parts[parts.length - 1] : '';
    }),
    basename: vi.fn((file) => file.split('/').pop())
  };
});

describe('AssetFingerprintManager', () => {
  let fingerprintManager;
  let mockFs;
  let mockCrypto;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockFs = {
      readdir: fs.readdir,
      stat: fs.stat,
      readFile: fs.readFile,
      writeFile: fs.writeFile,
      rename: fs.rename
    };
    
    // Setup mock crypto hash
    mockCrypto = {
      update: vi.fn(),
      digest: vi.fn().mockReturnValue('abcdef1234567890abcdef1234567890abcdef12')
    };
    
    vi.spyOn(crypto, 'createHash').mockReturnValue(mockCrypto);
    
    // Setup mock streams
    const mockReadStream = {
      on: vi.fn((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('test content')), 0);
        } else if (event === 'end') {
          setTimeout(callback, 5);
        }
      })
    };
    
    createReadStream.mockReturnValue(mockReadStream);
    createWriteStream.mockReturnValue({ write: vi.fn(), end: vi.fn() });
    
    fingerprintManager = new AssetFingerprintManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration and Initialization', () => {
    test('should initialize with default configuration', () => {
      const manager = new AssetFingerprintManager();
      
      expect(manager.config.algorithm).toBe('sha256');
      expect(manager.config.hashLength).toBe(12);
      expect(manager.config.extensions).toContain('.js');
      expect(manager.config.extensions).toContain('.css');
      expect(manager.config.compression.gzip.enabled).toBe(true);
      expect(manager.config.compression.brotli.enabled).toBe(true);
    });
    
    test('should merge custom configuration with defaults', () => {
      const customConfig = {
        hashLength: 16,
        algorithm: 'md5',
        compression: {
          gzip: { enabled: false }
        }
      };
      
      const manager = new AssetFingerprintManager(customConfig);
      
      expect(manager.config.hashLength).toBe(16);
      expect(manager.config.algorithm).toBe('md5');
      expect(manager.config.compression.gzip.enabled).toBe(false);
      expect(manager.config.compression.brotli.enabled).toBe(true); // Should remain default
    });
    
    test('should initialize asset registry and compression stats', () => {
      expect(fingerprintManager.assetRegistry).toBeInstanceOf(Map);
      expect(fingerprintManager.compressionStats).toMatchObject({
        gzip: { files: 0, originalSize: 0, compressedSize: 0 },
        brotli: { files: 0, originalSize: 0, compressedSize: 0 }
      });
    });
  });

  describe('Asset Discovery', () => {
    test('should find assets with supported extensions', async () => {
      const mockFiles = [
        '/dist/main.js',
        '/dist/style.css',
        '/dist/logo.png',
        '/dist/font.woff2',
        '/dist/index.html',
        '/dist/readme.txt' // Should be ignored
      ];
      
      vi.spyOn(fingerprintManager, 'getAllFiles').mockResolvedValue(mockFiles);
      
      const assets = await fingerprintManager.findAssets('/dist');
      
      expect(assets).toHaveLength(4);
      expect(assets).toContain('/dist/main.js');
      expect(assets).toContain('/dist/style.css');
      expect(assets).toContain('/dist/logo.png');
      expect(assets).toContain('/dist/font.woff2');
      expect(assets).not.toContain('/dist/readme.txt');
    });
    
    test('should recursively scan directories', async () => {
      mockFs.readdir.mockImplementation((dir) => {
        if (dir === '/dist') {
          return Promise.resolve([
            { name: 'assets', isDirectory: () => true, isFile: () => false },
            { name: 'index.html', isDirectory: () => false, isFile: () => true }
          ]);
        }
        if (dir === '/dist/assets') {
          return Promise.resolve([
            { name: 'main.js', isDirectory: () => false, isFile: () => true },
            { name: 'style.css', isDirectory: () => false, isFile: () => true }
          ]);
        }
        return Promise.resolve([]);
      });
      
      const files = await fingerprintManager.getAllFiles('/dist');
      
      expect(files).toHaveLength(3);
      expect(files).toContain('/dist/index.html');
      expect(files).toContain('/dist/assets/main.js');
      expect(files).toContain('/dist/assets/style.css');
    });
  });

  describe('Content Hashing', () => {
    test('should generate SHA-256 hash for file content', async () => {
      const filePath = '/test/file.js';
      
      const hash = await fingerprintManager.generateContentHash(filePath);
      
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
      expect(mockCrypto.update).toHaveBeenCalledWith(Buffer.from('test content'));
      expect(mockCrypto.digest).toHaveBeenCalledWith('hex');
      expect(hash).toBe('abcdef1234567890abcdef1234567890abcdef12');
    });
    
    test('should handle file read errors during hashing', async () => {
      const mockReadStream = {
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('File not found')), 0);
          }
        })
      };
      
      createReadStream.mockReturnValue(mockReadStream);
      
      await expect(
        fingerprintManager.generateContentHash('/nonexistent/file.js')
      ).rejects.toThrow('File not found');
    });
  });

  describe('Asset Processing', () => {
    test('should process single asset with fingerprinting', async () => {
      const assetPath = '/dist/main.js';
      const outputDir = '/dist';
      
      mockFs.stat.mockResolvedValue({ size: 5000 });
      vi.spyOn(fingerprintManager, 'generateContentHash')
        .mockResolvedValue('abcdef1234567890abcdef1234567890abcdef12');
      
      await fingerprintManager.processAsset(assetPath, outputDir, 'production');
      
      expect(mockFs.rename).toHaveBeenCalledWith(
        '/dist/main.js',
        '/dist/main-abcdef123456.js'
      );
      
      const assetInfo = fingerprintManager.assetRegistry.get('main.js');
      expect(assetInfo).toMatchObject({
        originalPath: 'main.js',
        fingerprintedPath: 'main-abcdef123456.js',
        hash: 'abcdef123456',
        size: 5000,
        cacheStrategy: 'immutable'
      });
    });
    
    test('should determine correct cache strategy for different file types', () => {
      expect(fingerprintManager.determineCacheStrategy('.js')).toBe('immutable');
      expect(fingerprintManager.determineCacheStrategy('.css')).toBe('immutable');
      expect(fingerprintManager.determineCacheStrategy('.png')).toBe('immutable');
      expect(fingerprintManager.determineCacheStrategy('.html')).toBe('mutable');
      expect(fingerprintManager.determineCacheStrategy('.xml')).toBe('mutable');
    });
    
    test('should generate CDN URLs for different environments', () => {
      const testCases = [
        { env: 'development', path: 'main.js', expected: '' },
        { env: 'staging', path: 'main.js', expected: 'https://cdn-staging.myrecruiter.ai/main.js' },
        { env: 'production', path: 'main.js', expected: 'https://cdn.myrecruiter.ai/main.js' }
      ];
      
      testCases.forEach(({ env, path, expected }) => {
        const url = fingerprintManager.generateCdnUrl(path, env);
        expect(url).toBe(expected);
      });
    });
  });

  describe('Asset Compression', () => {
    beforeEach(() => {
      createGzip.mockReturnValue({});
      createBrotliCompress.mockReturnValue({});
    });
    
    test('should compress assets above threshold', () => {
      expect(fingerprintManager.shouldCompress(2048)).toBe(true);
      expect(fingerprintManager.shouldCompress(512)).toBe(false);
      expect(fingerprintManager.shouldCompress(1024)).toBe(true);
    });
    
    test('should perform gzip compression', async () => {
      const assetPath = '/dist/main-hash123.js';
      const assetInfo = { size: 5000, compressed: {} };
      
      mockFs.stat.mockResolvedValue({ size: 2000 });
      
      await fingerprintManager.compressAsset(assetPath, assetInfo);
      
      expect(createGzip).toHaveBeenCalledWith({ level: 6 });
      expect(assetInfo.compressed.gzip).toMatchObject({
        path: 'main-hash123.js.gz',
        size: 2000,
        ratio: '60.0'
      });
      
      expect(fingerprintManager.compressionStats.gzip.files).toBe(1);
      expect(fingerprintManager.compressionStats.gzip.originalSize).toBe(5000);
      expect(fingerprintManager.compressionStats.gzip.compressedSize).toBe(2000);
    });
    
    test('should perform brotli compression', async () => {
      const assetPath = '/dist/style-hash456.css';
      const assetInfo = { size: 3000, compressed: {} };
      
      mockFs.stat.mockResolvedValue({ size: 1200 });
      
      await fingerprintManager.compressAsset(assetPath, assetInfo);
      
      expect(createBrotliCompress).toHaveBeenCalledWith({
        params: {
          [crypto.constants.BROTLI_PARAM_QUALITY]: 6
        }
      });
      
      expect(assetInfo.compressed.brotli).toMatchObject({
        path: 'style-hash456.css.br',
        size: 1200,
        ratio: '60.0'
      });
    });
    
    test('should handle compression errors gracefully', async () => {
      const { pipeline } = await import('stream/promises');
      pipeline.mockRejectedValue(new Error('Compression failed'));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const assetInfo = { size: 5000, compressed: {} };
      await fingerprintManager.compressAsset('/test/file.js', assetInfo);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Gzip compression failed'),
        'Compression failed'
      );
    });
  });

  describe('HTML Reference Updates', () => {
    test('should update asset references in HTML files', async () => {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/assets/style.css">
          <script src="/assets/main.js"></script>
        </head>
        </html>
      `;
      
      const updatedContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="stylesheet" href="/assets/style-abc123.css">
          <script src="/assets/main-def456.js"></script>
        </head>
        </html>
      `;
      
      vi.spyOn(fingerprintManager, 'findHtmlFiles')
        .mockResolvedValue(['/dist/index.html']);
      
      mockFs.readFile.mockResolvedValue(htmlContent);
      
      // Setup asset registry
      fingerprintManager.assetRegistry.set('assets/style.css', {
        fingerprintedPath: 'assets/style-abc123.css'
      });
      fingerprintManager.assetRegistry.set('assets/main.js', {
        fingerprintedPath: 'assets/main-def456.js'
      });
      
      await fingerprintManager.updateHtmlReferences('/dist');
      
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/dist/index.html',
        expect.stringContaining('style-abc123.css')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/dist/index.html',
        expect.stringContaining('main-def456.js')
      );
    });
    
    test('should handle HTML files without asset references', async () => {
      const htmlContent = '<html><body>No assets here</body></html>';
      
      vi.spyOn(fingerprintManager, 'findHtmlFiles')
        .mockResolvedValue(['/dist/simple.html']);
      
      mockFs.readFile.mockResolvedValue(htmlContent);
      
      await fingerprintManager.updateHtmlReferences('/dist');
      
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
    
    test('should find HTML files correctly', async () => {
      const mockFiles = [
        '/dist/index.html',
        '/dist/about.html',
        '/dist/main.js',
        '/dist/style.css'
      ];
      
      vi.spyOn(fingerprintManager, 'getAllFiles').mockResolvedValue(mockFiles);
      
      const htmlFiles = await fingerprintManager.findHtmlFiles('/dist');
      
      expect(htmlFiles).toHaveLength(2);
      expect(htmlFiles).toContain('/dist/index.html');
      expect(htmlFiles).toContain('/dist/about.html');
    });
  });

  describe('Asset Manifest Generation', () => {
    test('should generate comprehensive asset manifest', async () => {
      const environment = 'production';
      
      // Setup asset registry
      fingerprintManager.assetRegistry.set('main.js', {
        fingerprintedPath: 'main-abc123.js',
        hash: 'abc123',
        size: 5000,
        compressed: { gzip: { size: 2000, ratio: '60.0' } },
        cacheStrategy: 'immutable',
        cdnUrl: 'https://cdn.myrecruiter.ai/main-abc123.js'
      });
      
      fingerprintManager.assetRegistry.set('index.html', {
        fingerprintedPath: 'index.html',
        hash: 'def456',
        size: 1200,
        compressed: {},
        cacheStrategy: 'mutable',
        cdnUrl: ''
      });
      
      await fingerprintManager.generateManifest('/dist', environment);
      
      const manifestCall = mockFs.writeFile.mock.calls.find(call => 
        call[0] === '/dist/asset-manifest.json'
      );
      
      expect(manifestCall).toBeTruthy();
      
      const manifestContent = JSON.parse(manifestCall[1]);
      expect(manifestContent).toMatchObject({
        version: '2.0.0',
        environment: 'production',
        timestamp: expect.any(String),
        buildId: expect.stringMatching(/^build-\d+$/),
        assets: {
          'main.js': {
            fingerprinted: 'main-abc123.js',
            hash: 'abc123',
            size: 5000,
            cacheStrategy: 'immutable'
          },
          'index.html': {
            fingerprinted: 'index.html',
            hash: 'def456',
            size: 1200,
            cacheStrategy: 'mutable'
          }
        },
        caching: {
          immutableAssets: ['main-abc123.js'],
          mutableAssets: ['index.html']
        },
        cdn: {
          baseUrl: 'https://cdn.myrecruiter.ai',
          environment: 'production'
        }
      });
    });
    
    test('should include compression statistics in manifest', async () => {
      fingerprintManager.compressionStats = {
        gzip: { files: 3, originalSize: 15000, compressedSize: 6000 },
        brotli: { files: 2, originalSize: 10000, compressedSize: 3500 }
      };
      
      await fingerprintManager.generateManifest('/dist', 'production');
      
      const manifestCall = mockFs.writeFile.mock.calls.find(call => 
        call[0] === '/dist/asset-manifest.json'
      );
      
      const manifestContent = JSON.parse(manifestCall[1]);
      expect(manifestContent.compression).toEqual(fingerprintManager.compressionStats);
    });
  });

  describe('Cache Headers and Strategy', () => {
    test('should return correct cache headers for immutable assets', () => {
      fingerprintManager.assetRegistry.set('original.js', {
        fingerprintedPath: 'main-abc123.js',
        cacheStrategy: 'immutable'
      });
      
      const headers = fingerprintManager.getCacheHeaders('main-abc123.js');
      
      expect(headers).toEqual({
        maxAge: 31536000,
        immutable: true
      });
    });
    
    test('should return correct cache headers for mutable assets', () => {
      fingerprintManager.assetRegistry.set('index.html', {
        fingerprintedPath: 'index.html',
        cacheStrategy: 'mutable'
      });
      
      const headers = fingerprintManager.getCacheHeaders('index.html');
      
      expect(headers).toEqual({
        maxAge: 3600,
        mustRevalidate: true
      });
    });
    
    test('should return default mutable headers for unknown assets', () => {
      const headers = fingerprintManager.getCacheHeaders('unknown-file.txt');
      
      expect(headers).toEqual({
        maxAge: 3600,
        mustRevalidate: true
      });
    });
  });

  describe('Compression Reporting', () => {
    test('should generate compression report with statistics', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      fingerprintManager.compressionStats = {
        gzip: { files: 5, originalSize: 50000, compressedSize: 20000 },
        brotli: { files: 3, originalSize: 30000, compressedSize: 10000 }
      };
      
      fingerprintManager.generateCompressionReport();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Compression Report')
      );
      expect(consoleSpy).toHaveBeenCalledWith('📦 Gzip: 5 files');
      expect(consoleSpy).toHaveBeenCalledWith('   Reduction: 60.0%');
      expect(consoleSpy).toHaveBeenCalledWith('📦 Brotli: 3 files');
      expect(consoleSpy).toHaveBeenCalledWith('   Reduction: 66.7%');
    });
    
    test('should handle empty compression statistics', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      fingerprintManager.generateCompressionReport();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Compression Report')
      );
      // Should not log specific compression stats if no files were compressed
    });
  });

  describe('Integration Tests', () => {
    test('should complete full asset processing workflow', async () => {
      const outputDir = '/dist';
      const environment = 'production';
      
      // Mock file discovery
      vi.spyOn(fingerprintManager, 'getAllFiles').mockResolvedValue([
        '/dist/main.js',
        '/dist/style.css',
        '/dist/index.html'
      ]);
      
      // Mock file stats
      mockFs.stat.mockImplementation((path) => {
        const sizes = {
          '/dist/main.js': 8000,
          '/dist/style.css': 3000,
          '/dist/main-abc123.js': 8000,
          '/dist/style-def456.css': 3000,
          '/dist/main-abc123.js.gz': 3200,
          '/dist/style-def456.css.gz': 1200
        };
        return Promise.resolve({ size: sizes[path] || 1000 });
      });
      
      // Mock hashing
      vi.spyOn(fingerprintManager, 'generateContentHash')
        .mockResolvedValueOnce('abcdef1234567890abcdef1234567890abcdef12')
        .mockResolvedValueOnce('fedcba0987654321fedcba0987654321fedcba09');
      
      // Mock HTML processing
      vi.spyOn(fingerprintManager, 'findHtmlFiles')
        .mockResolvedValue(['/dist/index.html']);
      mockFs.readFile.mockResolvedValue('<script src="/main.js"></script>');
      
      const result = await fingerprintManager.processAssets(outputDir, environment);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2); // main.js and style.css (html files are not fingerprinted)
      
      // Verify asset registry contains expected entries
      expect(result.has('main.js')).toBe(true);
      expect(result.has('style.css')).toBe(true);
      
      // Verify manifest generation
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/dist/asset-manifest.json',
        expect.any(String)
      );
      
      // Verify HTML updates
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/dist/index.html',
        expect.any(String)
      );
    });
    
    test('should handle errors gracefully during processing', async () => {
      vi.spyOn(fingerprintManager, 'getAllFiles').mockRejectedValue(new Error('Directory not found'));
      
      await expect(
        fingerprintManager.processAssets('/nonexistent')
      ).rejects.toThrow('Directory not found');
    });
  });
});

describe('Convenience Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('fingerprintAssets should create manager and process assets', async () => {
    const mockResult = new Map([
      ['main.js', { fingerprintedPath: 'main-abc123.js' }]
    ]);
    
    vi.spyOn(AssetFingerprintManager.prototype, 'processAssets')
      .mockResolvedValue(mockResult);
    
    const result = await fingerprintAssets('/dist', 'production', { hashLength: 16 });
    
    expect(result).toBe(mockResult);
    expect(AssetFingerprintManager.prototype.processAssets)
      .toHaveBeenCalledWith('/dist', 'production');
  });

  test('generateCacheInvalidationMap should process manifest correctly', async () => {
    const mockManifest = {
      timestamp: '2024-01-01T00:00:00.000Z',
      environment: 'production',
      assets: {
        'main.js': {
          fingerprintedPath: 'main-abc123.js',
          hash: 'abc123',
          cacheStrategy: 'immutable',
          cdnUrl: 'https://cdn.example.com/main-abc123.js'
        },
        'index.html': {
          fingerprintedPath: 'index.html',
          hash: 'def456',
          cacheStrategy: 'mutable'
        }
      }
    };
    
    mockFs.readFile.mockResolvedValue(JSON.stringify(mockManifest));
    
    const invalidationMap = await generateCacheInvalidationMap('/dist/asset-manifest.json');
    
    expect(invalidationMap).toMatchObject({
      timestamp: '2024-01-01T00:00:00.000Z',
      environment: 'production',
      toInvalidate: [
        {
          path: 'index.html',
          hash: 'def456'
        }
      ],
      toCache: [
        {
          path: 'main-abc123.js',
          hash: 'abc123',
          cdnUrl: 'https://cdn.example.com/main-abc123.js'
        }
      ]
    });
  });

  test('generateCacheInvalidationMap should handle file read errors', async () => {
    mockFs.readFile.mockRejectedValue(new Error('File not found'));
    
    await expect(
      generateCacheInvalidationMap('/nonexistent/manifest.json')
    ).rejects.toThrow('File not found');
  });
});