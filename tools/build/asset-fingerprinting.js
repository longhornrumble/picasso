/**
 * Asset Fingerprinting & Caching System - BERS Phase 3, Task 3.1
 * 
 * Advanced asset management system that provides content-based hashing,
 * long-term caching strategies, cache invalidation mechanisms, and
 * CDN-friendly asset naming for optimal performance.
 * 
 * Features:
 * - Content-based fingerprinting with SHA-256 hashing
 * - Long-term browser caching with immutable assets
 * - Intelligent cache invalidation based on content changes
 * - CDN-optimized asset naming and distribution
 * - Asset compression and optimization tracking
 * - Cache performance monitoring and reporting
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip, createBrotliCompress } from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===== CONFIGURATION ===== */

/**
 * Asset fingerprinting configuration
 * @typedef {Object} FingerprintConfig
 * @property {string} algorithm - Hashing algorithm (sha256, md5, etc.)
 * @property {number} hashLength - Length of hash in filename (8-32)
 * @property {string[]} extensions - File extensions to fingerprint
 * @property {Object} compression - Compression settings
 * @property {Object} caching - Browser caching directives
 * @property {Object} cdn - CDN configuration
 */

const DEFAULT_FINGERPRINT_CONFIG = {
  algorithm: 'sha256',
  hashLength: 12,
  extensions: ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2'],
  compression: {
    gzip: {
      enabled: true,
      level: 6,
      threshold: 1024 // Only compress files > 1KB
    },
    brotli: {
      enabled: true,
      quality: 6,
      threshold: 1024
    }
  },
  caching: {
    immutable: {
      maxAge: 31536000, // 1 year
      immutable: true
    },
    mutable: {
      maxAge: 3600, // 1 hour
      mustRevalidate: true
    }
  },
  cdn: {
    development: '',
    staging: 'https://cdn-staging.myrecruiter.ai',
    production: 'https://cdn.myrecruiter.ai'
  }
};

/**
 * Asset information structure
 * @typedef {Object} AssetInfo
 * @property {string} originalPath - Original asset path
 * @property {string} fingerprintedPath - Path with fingerprint
 * @property {string} hash - Content hash
 * @property {number} size - File size in bytes
 * @property {Object} compressed - Compression information
 * @property {string} cacheStrategy - Caching strategy applied
 * @property {string} cdnUrl - CDN URL if applicable
 */

/* ===== MAIN FINGERPRINTING CLASS ===== */

export class AssetFingerprintManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_FINGERPRINT_CONFIG, ...config };
    this.assetRegistry = new Map();
    this.compressionStats = {
      gzip: { files: 0, originalSize: 0, compressedSize: 0 },
      brotli: { files: 0, originalSize: 0, compressedSize: 0 }
    };
  }

  /**
   * Process all assets in build output directory
   * @param {string} outputDir - Build output directory
   * @param {string} environment - Target environment
   * @returns {Promise<Map<string, AssetInfo>>} Asset registry with fingerprinted assets
   */
  async processAssets(outputDir, environment = 'production') {
    console.log(`🔖 Starting asset fingerprinting for ${environment} environment...`);
    const startTime = performance.now();

    try {
      // Find all assets to fingerprint
      const assets = await this.findAssets(outputDir);
      console.log(`📦 Found ${assets.length} assets to process`);

      // Process each asset
      for (const assetPath of assets) {
        await this.processAsset(assetPath, outputDir, environment);
      }

      // Update HTML files with fingerprinted asset references
      await this.updateHtmlReferences(outputDir);

      // Generate asset manifest
      await this.generateManifest(outputDir, environment);

      // Generate compression report
      this.generateCompressionReport();

      const duration = performance.now() - startTime;
      console.log(`✅ Asset fingerprinting completed in ${(duration / 1000).toFixed(2)}s`);

      return this.assetRegistry;

    } catch (error) {
      console.error('❌ Asset fingerprinting failed:', error);
      throw error;
    }
  }

  /**
   * Find all assets that should be fingerprinted
   * @param {string} outputDir - Output directory to scan
   * @returns {Promise<string[]>} Array of asset file paths
   */
  async findAssets(outputDir) {
    const assets = [];
    const files = await this.getAllFiles(outputDir);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (this.config.extensions.includes(ext)) {
        assets.push(file);
      }
    }

    return assets;
  }

  /**
   * Process a single asset
   * @param {string} assetPath - Path to asset file
   * @param {string} outputDir - Output directory
   * @param {string} environment - Target environment
   */
  async processAsset(assetPath, outputDir, environment) {
    const relativePath = path.relative(outputDir, assetPath);
    const stats = await fs.stat(assetPath);
    
    console.log(`🔖 Processing: ${relativePath}`);

    // Generate content hash
    const hash = await this.generateContentHash(assetPath);
    const shortHash = hash.substring(0, this.config.hashLength);

    // Generate fingerprinted filename
    const { dir, name, ext } = path.parse(assetPath);
    const fingerprintedName = `${name}-${shortHash}${ext}`;
    const fingerprintedPath = path.join(dir, fingerprintedName);

    // Create asset info
    const assetInfo = {
      originalPath: relativePath,
      fingerprintedPath: path.relative(outputDir, fingerprintedPath),
      hash: shortHash,
      size: stats.size,
      compressed: {},
      cacheStrategy: this.determineCacheStrategy(ext),
      cdnUrl: this.generateCdnUrl(path.relative(outputDir, fingerprintedPath), environment)
    };

    try {
      // Check if source asset still exists (parallel build safety)
      try {
        await fs.access(assetPath);
      } catch (accessError) {
        // File already processed by another worker
        console.log(`  ⚠️  ${relativePath} already processed by another worker`);
        return;
      }
      
      // Check if fingerprinted file already exists (race condition protection)
      try {
        await fs.access(fingerprintedPath);
        console.log(`  ⚠️  ${path.relative(outputDir, fingerprintedPath)} already exists, skipping`);
        return;
      } catch (notExistsError) {
        // Good, fingerprinted file doesn't exist yet
      }
      
      // Rename file with fingerprint (with retry for race conditions)
      try {
        await fs.rename(assetPath, fingerprintedPath);
      } catch (renameError) {
        if (renameError.code === 'ENOENT') {
          // Source file disappeared between access check and rename (race condition)
          console.log(`  ⚠️  ${relativePath} was processed by another worker during rename`);
          return;
        }
        throw renameError;
      }

      // Compress asset if configured
      if (this.shouldCompress(stats.size)) {
        await this.compressAsset(fingerprintedPath, assetInfo);
      }

      // Register asset
      this.assetRegistry.set(relativePath, assetInfo);
      
      console.log(`  ✅ ${relativePath} → ${assetInfo.fingerprintedPath} (${shortHash})`);

    } catch (error) {
      console.error(`  ❌ Failed to process ${relativePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate content-based hash for file
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} Content hash
   */
  async generateContentHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(this.config.algorithm);
      const stream = createReadStream(filePath);

      stream.on('data', (chunk) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', reject);
    });
  }

  /**
   * Compress asset using gzip and brotli
   * @param {string} assetPath - Path to asset
   * @param {AssetInfo} assetInfo - Asset information object
   */
  async compressAsset(assetPath, assetInfo) {
    const originalSize = assetInfo.size;

    // Gzip compression
    if (this.config.compression.gzip.enabled) {
      try {
        const gzipPath = `${assetPath}.gz`;
        const gzipStream = createGzip({ 
          level: this.config.compression.gzip.level 
        });

        await pipeline(
          createReadStream(assetPath),
          gzipStream,
          createWriteStream(gzipPath)
        );

        const gzipStats = await fs.stat(gzipPath);
        const compressionRatio = ((originalSize - gzipStats.size) / originalSize * 100).toFixed(1);

        assetInfo.compressed.gzip = {
          path: path.basename(gzipPath),
          size: gzipStats.size,
          ratio: compressionRatio
        };

        this.compressionStats.gzip.files++;
        this.compressionStats.gzip.originalSize += originalSize;
        this.compressionStats.gzip.compressedSize += gzipStats.size;

        console.log(`    📦 Gzip: ${gzipStats.size} bytes (${compressionRatio}% reduction)`);

      } catch (error) {
        console.warn(`    ⚠️  Gzip compression failed: ${error.message}`);
      }
    }

    // Brotli compression
    if (this.config.compression.brotli.enabled) {
      try {
        const brotliPath = `${assetPath}.br`;
        const brotliStream = createBrotliCompress({
          params: {
            [crypto.constants.BROTLI_PARAM_QUALITY]: this.config.compression.brotli.quality
          }
        });

        await pipeline(
          createReadStream(assetPath),
          brotliStream,
          createWriteStream(brotliPath)
        );

        const brotliStats = await fs.stat(brotliPath);
        const compressionRatio = ((originalSize - brotliStats.size) / originalSize * 100).toFixed(1);

        assetInfo.compressed.brotli = {
          path: path.basename(brotliPath),
          size: brotliStats.size,
          ratio: compressionRatio
        };

        this.compressionStats.brotli.files++;
        this.compressionStats.brotli.originalSize += originalSize;
        this.compressionStats.brotli.compressedSize += brotliStats.size;

        console.log(`    📦 Brotli: ${brotliStats.size} bytes (${compressionRatio}% reduction)`);

      } catch (error) {
        console.warn(`    ⚠️  Brotli compression failed: ${error.message}`);
      }
    }
  }

  /**
   * Update HTML files with fingerprinted asset references
   * @param {string} outputDir - Output directory
   */
  async updateHtmlReferences(outputDir) {
    console.log('🔗 Updating HTML asset references...');

    const htmlFiles = await this.findHtmlFiles(outputDir);

    for (const htmlFile of htmlFiles) {
      try {
        let content = await fs.readFile(htmlFile, 'utf8');
        let updated = false;

        // Update each registered asset reference
        for (const [originalPath, assetInfo] of this.assetRegistry) {
          const oldRef = originalPath.startsWith('/') ? originalPath : `/${originalPath}`;
          const newRef = assetInfo.fingerprintedPath.startsWith('/') ? 
            assetInfo.fingerprintedPath : 
            `/${assetInfo.fingerprintedPath}`;

          if (content.includes(oldRef)) {
            content = content.replace(new RegExp(oldRef, 'g'), newRef);
            updated = true;
          }
        }

        if (updated) {
          await fs.writeFile(htmlFile, content);
          const relativePath = path.relative(outputDir, htmlFile);
          console.log(`  ✅ Updated references in: ${relativePath}`);
        }

      } catch (error) {
        console.error(`  ❌ Failed to update ${htmlFile}:`, error.message);
      }
    }
  }

  /**
   * Generate asset manifest file
   * @param {string} outputDir - Output directory
   * @param {string} environment - Target environment
   */
  async generateManifest(outputDir, environment) {
    console.log('📋 Generating asset manifest...');

    const manifest = {
      version: '2.0.0',
      environment,
      timestamp: new Date().toISOString(),
      buildId: `build-${Date.now()}`,
      assets: {},
      compression: this.compressionStats,
      caching: {
        immutableAssets: [],
        mutableAssets: []
      },
      cdn: {
        baseUrl: this.config.cdn[environment] || '',
        environment
      }
    };

    // Build asset manifest
    for (const [originalPath, assetInfo] of this.assetRegistry) {
      manifest.assets[originalPath] = {
        fingerprinted: assetInfo.fingerprintedPath,
        hash: assetInfo.hash,
        size: assetInfo.size,
        compressed: assetInfo.compressed,
        cacheStrategy: assetInfo.cacheStrategy,
        cdnUrl: assetInfo.cdnUrl
      };

      // Categorize by cache strategy
      if (assetInfo.cacheStrategy === 'immutable') {
        manifest.caching.immutableAssets.push(assetInfo.fingerprintedPath);
      } else {
        manifest.caching.mutableAssets.push(assetInfo.fingerprintedPath);
      }
    }

    // Write manifest file
    const manifestPath = path.join(outputDir, 'asset-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`📋 Asset manifest generated: ${path.relative(process.cwd(), manifestPath)}`);
    console.log(`  📦 ${Object.keys(manifest.assets).length} assets registered`);
    console.log(`  🔒 ${manifest.caching.immutableAssets.length} immutable assets`);
    console.log(`  🔄 ${manifest.caching.mutableAssets.length} mutable assets`);
  }

  /**
   * Find all HTML files in output directory
   * @param {string} outputDir - Output directory
   * @returns {Promise<string[]>} Array of HTML file paths
   */
  async findHtmlFiles(outputDir) {
    const htmlFiles = [];
    const files = await this.getAllFiles(outputDir);

    for (const file of files) {
      if (path.extname(file).toLowerCase() === '.html') {
        htmlFiles.push(file);
      }
    }

    return htmlFiles;
  }

  /**
   * Get all files recursively from directory
   * @param {string} dir - Directory to scan
   * @returns {Promise<string[]>} Array of file paths
   */
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
      // Directory might not exist or be accessible
    }

    return files;
  }

  /**
   * Determine cache strategy for asset type
   * @param {string} ext - File extension
   * @returns {string} Cache strategy ('immutable' or 'mutable')
   */
  determineCacheStrategy(ext) {
    // Static assets with fingerprints can be cached immutably
    const immutableExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2'];
    return immutableExtensions.includes(ext.toLowerCase()) ? 'immutable' : 'mutable';
  }

  /**
   * Generate CDN URL for asset
   * @param {string} assetPath - Asset path
   * @param {string} environment - Target environment
   * @returns {string} CDN URL or empty string
   */
  generateCdnUrl(assetPath, environment) {
    const cdnBase = this.config.cdn[environment];
    return cdnBase ? `${cdnBase}/${assetPath}` : '';
  }

  /**
   * Check if asset should be compressed
   * @param {number} size - File size in bytes
   * @returns {boolean} True if should compress
   */
  shouldCompress(size) {
    const threshold = this.config.compression.gzip.threshold;
    return size >= threshold;
  }

  /**
   * Generate compression report
   */
  generateCompressionReport() {
    console.log('\n📊 Compression Report:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (this.compressionStats.gzip.files > 0) {
      const gzipRatio = ((this.compressionStats.gzip.originalSize - this.compressionStats.gzip.compressedSize) / 
                         this.compressionStats.gzip.originalSize * 100).toFixed(1);
      console.log(`📦 Gzip: ${this.compressionStats.gzip.files} files`);
      console.log(`   Original: ${(this.compressionStats.gzip.originalSize / 1024).toFixed(1)}KB`);
      console.log(`   Compressed: ${(this.compressionStats.gzip.compressedSize / 1024).toFixed(1)}KB`);
      console.log(`   Reduction: ${gzipRatio}%`);
    }

    if (this.compressionStats.brotli.files > 0) {
      const brotliRatio = ((this.compressionStats.brotli.originalSize - this.compressionStats.brotli.compressedSize) / 
                           this.compressionStats.brotli.originalSize * 100).toFixed(1);
      console.log(`📦 Brotli: ${this.compressionStats.brotli.files} files`);
      console.log(`   Original: ${(this.compressionStats.brotli.originalSize / 1024).toFixed(1)}KB`);
      console.log(`   Compressed: ${(this.compressionStats.brotli.compressedSize / 1024).toFixed(1)}KB`);
      console.log(`   Reduction: ${brotliRatio}%`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Get cache headers for asset
   * @param {string} assetPath - Asset path
   * @returns {Object} HTTP cache headers
   */
  getCacheHeaders(assetPath) {
    const assetInfo = Array.from(this.assetRegistry.values())
      .find(info => info.fingerprintedPath === assetPath);

    if (!assetInfo) {
      return this.config.caching.mutable;
    }

    return assetInfo.cacheStrategy === 'immutable' 
      ? this.config.caching.immutable 
      : this.config.caching.mutable;
  }
}

/* ===== CONVENIENCE FUNCTIONS ===== */

/**
 * Process assets in build output directory
 * @param {string} outputDir - Build output directory
 * @param {string} environment - Target environment
 * @param {Object} config - Custom configuration
 * @returns {Promise<Map<string, AssetInfo>>} Asset registry
 */
export async function fingerprintAssets(outputDir, environment = 'production', config = {}) {
  const manager = new AssetFingerprintManager(config);
  return await manager.processAssets(outputDir, environment);
}

/**
 * Generate cache invalidation map for assets
 * @param {string} manifestPath - Path to asset manifest
 * @returns {Promise<Object>} Cache invalidation information
 */
export async function generateCacheInvalidationMap(manifestPath) {
  try {
    const manifestData = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestData);

    const invalidationMap = {
      timestamp: manifest.timestamp,
      environment: manifest.environment,
      toInvalidate: [],
      toCache: []
    };

    // Assets that need cache invalidation (changed content)
    for (const [originalPath, assetInfo] of Object.entries(manifest.assets)) {
      if (assetInfo.cacheStrategy === 'immutable') {
        invalidationMap.toCache.push({
          path: assetInfo.fingerprintedPath,
          hash: assetInfo.hash,
          cdnUrl: assetInfo.cdnUrl
        });
      } else {
        invalidationMap.toInvalidate.push({
          path: assetInfo.fingerprintedPath,
          hash: assetInfo.hash
        });
      }
    }

    return invalidationMap;

  } catch (error) {
    console.error('Failed to generate cache invalidation map:', error);
    throw error;
  }
}

export default AssetFingerprintManager;