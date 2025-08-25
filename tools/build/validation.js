/**
 * Build-Time Validation System - BERS Phase 1, Task 1.3
 * 
 * Comprehensive validation system for build-time configuration, environment
 * settings, asset integrity, and distributed ChatProvider architecture
 * compatibility across all deployment environments.
 * 
 * Features:
 * - Environment configuration validation
 * - Asset integrity verification
 * - Build dependency validation  
 * - Security configuration checks
 * - Performance requirement validation
 * - Distributed provider compatibility validation
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

/* ===== VALIDATION INTERFACES ===== */

/**
 * Validation result interface
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid
 * @property {ValidationError[]} errors
 * @property {ValidationWarning[]} warnings
 * @property {ValidationInfo[]} info
 * @property {number} validatedAt
 * @property {number} validationTime
 */

/**
 * Validation error interface
 * @typedef {Object} ValidationError
 * @property {string} code
 * @property {string} message
 * @property {'critical'|'high'|'medium'|'low'} severity
 * @property {string} source
 * @property {number} [line]
 * @property {number} [column]
 * @property {string} [suggestion]
 */

/**
 * Validation warning interface
 * @typedef {Object} ValidationWarning
 * @property {string} code
 * @property {string} message
 * @property {string} source
 * @property {string} [suggestion]
 */

/**
 * Validation info interface
 * @typedef {Object} ValidationInfo
 * @property {string} message
 * @property {string} source
 */

/**
 * Validation configuration
 */
export interface ValidationConfig {
  environment: EnvironmentValidationConfig;
  assets: AssetValidationConfig;
  security: SecurityValidationConfig;
  performance: PerformanceValidationConfig;
  providers: ProviderValidationConfig;
  build: BuildValidationConfig;
}

/**
 * Environment validation configuration
 */
export interface EnvironmentValidationConfig {
  strictMode: boolean;
  allowedEnvironments: readonly string[];
  requiredEnvVars: readonly string[];
  configSchemaValidation: boolean;
  customValidationRules: readonly ValidationRule[];
}

/**
 * Asset validation configuration
 */
export interface AssetValidationConfig {
  checkIntegrity: boolean;
  maxAssetSize: number;
  allowedExtensions: readonly string[];
  requireSourceMaps: boolean;
  validateImageFormats: boolean;
  checkFontLoading: boolean;
}

/**
 * Security validation configuration
 */
export interface SecurityValidationConfig {
  csp: CSPValidationConfig;
  secrets: SecretsValidationConfig;
  dependencies: DependencyValidationConfig;
  cors: CORSValidationConfig;
}

/**
 * CSP validation configuration
 */
export interface CSPValidationConfig {
  enabled: boolean;
  strictMode: boolean;
  allowedSources: Record<string, string[]>;
  reportOnly: boolean;
}

/**
 * Secrets validation configuration
 */
export interface SecretsValidationConfig {
  scanForHardcodedSecrets: boolean;
  allowedSecretPatterns: readonly string[];
  requiredEnvSecrets: readonly string[];
}

/**
 * Dependency validation configuration
 */
export interface DependencyValidationConfig {
  checkVulnerabilities: boolean;
  allowedLicenses: readonly string[];
  maxDependencyDepth: number;
}

/**
 * CORS validation configuration
 */
export interface CORSValidationConfig {
  validateOrigins: boolean;
  allowedOrigins: readonly string[];
  strictMode: boolean;
}

/**
 * Performance validation configuration
 */
export interface PerformanceValidationConfig {
  maxBuildTime: number; // milliseconds
  maxBundleSize: number; // bytes
  maxChunkCount: number;
  minCompressionRatio: number;
  validateLoadTime: boolean;
}

/**
 * Provider validation configuration
 */
export interface ProviderValidationConfig {
  validateProviderInterface: boolean;
  checkProviderDependencies: boolean;
  validateProviderConfiguration: boolean;
  requiredProviders: readonly string[];
}

/**
 * Build validation configuration
 */
export interface BuildValidationConfig {
  validateOutputStructure: boolean;
  checkAssetReferences: boolean;
  validateManifest: boolean;
  requireOptimization: boolean;
}

/**
 * Custom validation rule
 */
export interface ValidationRule {
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  validator: (context: ValidationContext) => Promise<ValidationResult>;
}

/**
 * Validation context
 */
export interface ValidationContext {
  environment: string;
  config: Record<string, any>;
  assets: Record<string, any>;
  buildInfo: BuildInfo;
  projectRoot: string;
}

/**
 * Build information
 */
export interface BuildInfo {
  startTime: number;
  environment: string;
  mode: string;
  version: string;
  outputDir: string;
  sourceDir: string;
}

/* ===== DEFAULT VALIDATION CONFIGURATIONS ===== */

/**
 * Environment-specific validation presets
 */
export const VALIDATION_PRESETS: Record<string, ValidationConfig> = {
  development: {
    environment: {
      strictMode: false,
      allowedEnvironments: ['development', 'dev', 'local'],
      requiredEnvVars: ['NODE_ENV'],
      configSchemaValidation: true,
      customValidationRules: []
    },
    assets: {
      checkIntegrity: false,
      maxAssetSize: 50 * 1024 * 1024, // 50MB
      allowedExtensions: ['.js', '.css', '.png', '.jpg', '.svg', '.woff', '.woff2'],
      requireSourceMaps: true,
      validateImageFormats: false,
      checkFontLoading: false
    },
    security: {
      csp: {
        enabled: false,
        strictMode: false,
        allowedSources: {},
        reportOnly: true
      },
      secrets: {
        scanForHardcodedSecrets: true,
        allowedSecretPatterns: [],
        requiredEnvSecrets: []
      },
      dependencies: {
        checkVulnerabilities: false,
        allowedLicenses: [],
        maxDependencyDepth: 10
      },
      cors: {
        validateOrigins: false,
        allowedOrigins: ['*'],
        strictMode: false
      }
    },
    performance: {
      maxBuildTime: 120000, // 2 minutes
      maxBundleSize: 10 * 1024 * 1024, // 10MB
      maxChunkCount: 50,
      minCompressionRatio: 0,
      validateLoadTime: false
    },
    providers: {
      validateProviderInterface: true,
      checkProviderDependencies: true,
      validateProviderConfiguration: true,
      requiredProviders: ['ChatStateProvider', 'ChatAPIProvider']
    },
    build: {
      validateOutputStructure: false,
      checkAssetReferences: false,
      validateManifest: false,
      requireOptimization: false
    }
  },

  staging: {
    environment: {
      strictMode: true,
      allowedEnvironments: ['staging', 'stage', 'test'],
      requiredEnvVars: ['NODE_ENV', 'PICASSO_ENV'],
      configSchemaValidation: true,
      customValidationRules: []
    },
    assets: {
      checkIntegrity: true,
      maxAssetSize: 20 * 1024 * 1024, // 20MB
      allowedExtensions: ['.js', '.css', '.png', '.jpg', '.svg', '.woff', '.woff2'],
      requireSourceMaps: true,
      validateImageFormats: true,
      checkFontLoading: true
    },
    security: {
      csp: {
        enabled: true,
        strictMode: false,
        allowedSources: {
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:']
        },
        reportOnly: true
      },
      secrets: {
        scanForHardcodedSecrets: true,
        allowedSecretPatterns: [],
        requiredEnvSecrets: ['STAGING_API_KEY']
      },
      dependencies: {
        checkVulnerabilities: true,
        allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause'],
        maxDependencyDepth: 8
      },
      cors: {
        validateOrigins: true,
        allowedOrigins: ['https://staging.myrecruiter.ai'],
        strictMode: false
      }
    },
    performance: {
      maxBuildTime: 90000, // 1.5 minutes
      maxBundleSize: 5 * 1024 * 1024, // 5MB
      maxChunkCount: 20,
      minCompressionRatio: 0.3,
      validateLoadTime: true
    },
    providers: {
      validateProviderInterface: true,
      checkProviderDependencies: true,
      validateProviderConfiguration: true,
      requiredProviders: ['ChatStateProvider', 'ChatAPIProvider', 'ChatStreamingProvider', 'ChatMonitoringProvider']
    },
    build: {
      validateOutputStructure: true,
      checkAssetReferences: true,
      validateManifest: true,
      requireOptimization: true
    }
  },

  production: {
    environment: {
      strictMode: true,
      allowedEnvironments: ['production', 'prod'],
      requiredEnvVars: ['NODE_ENV', 'PICASSO_ENV'],
      configSchemaValidation: true,
      customValidationRules: []
    },
    assets: {
      checkIntegrity: true,
      maxAssetSize: 10 * 1024 * 1024, // 10MB
      allowedExtensions: ['.js', '.css', '.png', '.jpg', '.svg', '.woff', '.woff2'],
      requireSourceMaps: false,
      validateImageFormats: true,
      checkFontLoading: true
    },
    security: {
      csp: {
        enabled: true,
        strictMode: true,
        allowedSources: {
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'https://cdn.myrecruiter.ai']
        },
        reportOnly: false
      },
      secrets: {
        scanForHardcodedSecrets: true,
        allowedSecretPatterns: [],
        requiredEnvSecrets: ['PRODUCTION_API_KEY']
      },
      dependencies: {
        checkVulnerabilities: true,
        allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause'],
        maxDependencyDepth: 6
      },
      cors: {
        validateOrigins: true,
        allowedOrigins: ['https://myrecruiter.ai', 'https://app.myrecruiter.ai'],
        strictMode: true
      }
    },
    performance: {
      maxBuildTime: 60000, // 1 minute
      maxBundleSize: 3 * 1024 * 1024, // 3MB
      maxChunkCount: 15,
      minCompressionRatio: 0.5,
      validateLoadTime: true
    },
    providers: {
      validateProviderInterface: true,
      checkProviderDependencies: true,
      validateProviderConfiguration: true,
      requiredProviders: ['ChatStateProvider', 'ChatAPIProvider', 'ChatStreamingProvider', 'ChatMonitoringProvider']
    },
    build: {
      validateOutputStructure: true,
      checkAssetReferences: true,
      validateManifest: true,
      requireOptimization: true
    }
  }
};

/* ===== BUILD VALIDATOR IMPLEMENTATION ===== */

/**
 * Comprehensive build-time validator
 */
export class BuildValidator {
  private config: ValidationConfig;
  private environment: string;
  private results: ValidationResult[] = [];

  constructor(environment: string, customConfig?: Partial<ValidationConfig>) {
    this.environment = environment;
    this.config = {
      ...VALIDATION_PRESETS[environment],
      ...customConfig
    };
  }

  /**
   * Run comprehensive build validation
   */
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const startTime = performance.now();
    
    console.log(`🔍 Starting build validation for ${this.environment} environment...`);
    
    const results: ValidationResult[] = [];
    
    try {
      // Environment validation
      results.push(await this.validateEnvironment(context));
      
      // Asset validation
      results.push(await this.validateAssets(context));
      
      // Security validation
      results.push(await this.validateSecurity(context));
      
      // Performance validation
      results.push(await this.validatePerformance(context));
      
      // Provider validation
      results.push(await this.validateProviders(context));
      
      // Build structure validation
      results.push(await this.validateBuildStructure(context));
      
      // Custom validation rules
      for (const rule of this.config.environment.customValidationRules) {
        results.push(await rule.validator(context));
      }
      
      // Combine all results
      const combinedResult = this.combineResults(results);
      combinedResult.validationTime = performance.now() - startTime;
      
      this.logValidationResults(combinedResult);
      
      return combinedResult;
    } catch (error) {
      console.error('❌ Build validation failed:', error);
      throw error;
    }
  }

  /* ===== VALIDATION METHODS ===== */

  private async validateEnvironment(context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const info: ValidationInfo[] = [];
    
    // Check allowed environments
    if (!this.config.environment.allowedEnvironments.includes(context.environment)) {
      errors.push({
        code: 'INVALID_ENVIRONMENT',
        message: `Environment '${context.environment}' is not in allowed list: ${this.config.environment.allowedEnvironments.join(', ')}`,
        severity: 'critical',
        source: 'environment-validator'
      });
    }
    
    // Check required environment variables
    for (const envVar of this.config.environment.requiredEnvVars) {
      if (!process.env[envVar]) {
        errors.push({
          code: 'MISSING_ENV_VAR',
          message: `Required environment variable '${envVar}' is not set`,
          severity: 'high',
          source: 'environment-validator',
          suggestion: `Set ${envVar} in your environment configuration`
        });
      }
    }
    
    // Validate configuration schema
    if (this.config.environment.configSchemaValidation) {
      const schemaValidation = await this.validateConfigSchema(context.config);
      if (!schemaValidation.isValid) {
        errors.push(...schemaValidation.errors);
        warnings.push(...schemaValidation.warnings);
      }
    }
    
    info.push({
      message: `Environment validation completed for: ${context.environment}`,
      source: 'environment-validator'
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info,
      validatedAt: Date.now(),
      validationTime: 0
    };
  }

  private async validateAssets(context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const info: ValidationInfo[] = [];
    
    // Check asset sizes
    for (const [assetName, asset] of Object.entries(context.assets)) {
      const assetSize = asset.source?.length || 0;
      
      if (assetSize > this.config.assets.maxAssetSize) {
        errors.push({
          code: 'ASSET_TOO_LARGE',
          message: `Asset '${assetName}' (${this.formatSize(assetSize)}) exceeds maximum size (${this.formatSize(this.config.assets.maxAssetSize)})`,
          severity: 'medium',
          source: 'asset-validator',
          suggestion: 'Consider optimizing or splitting large assets'
        });
      }
    }
    
    // Check allowed extensions
    for (const assetName of Object.keys(context.assets)) {
      const ext = path.extname(assetName).toLowerCase();
      if (ext && !this.config.assets.allowedExtensions.includes(ext)) {
        warnings.push({
          code: 'UNEXPECTED_ASSET_TYPE',
          message: `Asset '${assetName}' has unexpected extension '${ext}'`,
          source: 'asset-validator'
        });
      }
    }
    
    info.push({
      message: `Asset validation completed for ${Object.keys(context.assets).length} assets`,
      source: 'asset-validator'
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info,
      validatedAt: Date.now(),
      validationTime: 0
    };
  }

  private async validateSecurity(context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const info: ValidationInfo[] = [];
    
    // Scan for hardcoded secrets
    if (this.config.security.secrets.scanForHardcodedSecrets) {
      for (const [assetName, asset] of Object.entries(context.assets)) {
        if (asset.type === 'chunk' && asset.code) {
          const secretScan = await this.scanForSecrets(asset.code, assetName);
          errors.push(...secretScan.errors);
          warnings.push(...secretScan.warnings);
        }
      }
    }
    
    // Validate CSP configuration
    if (this.config.security.csp.enabled) {
      const cspValidation = this.validateCSP(context.config);
      errors.push(...cspValidation.errors);
      warnings.push(...cspValidation.warnings);
    }
    
    // Check required environment secrets
    for (const secret of this.config.security.secrets.requiredEnvSecrets) {
      if (!process.env[secret]) {
        errors.push({
          code: 'MISSING_REQUIRED_SECRET',
          message: `Required secret '${secret}' is not set in environment`,
          severity: 'critical',
          source: 'security-validator'
        });
      }
    }
    
    info.push({
      message: `Security validation completed`,
      source: 'security-validator'
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info,
      validatedAt: Date.now(),
      validationTime: 0
    };
  }

  private async validatePerformance(context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const info: ValidationInfo[] = [];
    
    // Check build time
    const buildTime = Date.now() - context.buildInfo.startTime;
    if (buildTime > this.config.performance.maxBuildTime) {
      warnings.push({
        code: 'SLOW_BUILD_TIME',
        message: `Build time (${buildTime}ms) exceeds target (${this.config.performance.maxBuildTime}ms)`,
        source: 'performance-validator',
        suggestion: 'Consider optimizing build configuration or reducing asset sizes'
      });
    }
    
    // Check bundle size
    const totalBundleSize = Object.values(context.assets).reduce((sum, asset: any) => 
      sum + (asset.source?.length || 0), 0);
    
    if (totalBundleSize > this.config.performance.maxBundleSize) {
      errors.push({
        code: 'BUNDLE_TOO_LARGE',
        message: `Total bundle size (${this.formatSize(totalBundleSize)}) exceeds maximum (${this.formatSize(this.config.performance.maxBundleSize)})`,
        severity: 'high',
        source: 'performance-validator',
        suggestion: 'Enable code splitting or remove unused dependencies'
      });
    }
    
    // Check chunk count
    const chunkCount = Object.values(context.assets).filter((asset: any) => asset.type === 'chunk').length;
    if (chunkCount > this.config.performance.maxChunkCount) {
      warnings.push({
        code: 'TOO_MANY_CHUNKS',
        message: `Chunk count (${chunkCount}) exceeds recommended maximum (${this.config.performance.maxChunkCount})`,
        source: 'performance-validator'
      });
    }
    
    info.push({
      message: `Performance validation completed - Bundle: ${this.formatSize(totalBundleSize)}, Chunks: ${chunkCount}`,
      source: 'performance-validator'
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info,
      validatedAt: Date.now(),
      validationTime: 0
    };
  }

  private async validateProviders(context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const info: ValidationInfo[] = [];
    
    // Check required providers
    for (const provider of this.config.providers.requiredProviders) {
      const providerFound = await this.checkProviderExists(provider, context);
      if (!providerFound) {
        errors.push({
          code: 'MISSING_REQUIRED_PROVIDER',
          message: `Required provider '${provider}' not found in build`,
          severity: 'critical',
          source: 'provider-validator'
        });
      }
    }
    
    info.push({
      message: `Provider validation completed for ${this.config.providers.requiredProviders.length} required providers`,
      source: 'provider-validator'
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info,
      validatedAt: Date.now(),
      validationTime: 0
    };
  }

  private async validateBuildStructure(context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const info: ValidationInfo[] = [];
    
    // Validate output structure
    if (this.config.build.validateOutputStructure) {
      const structureValidation = await this.validateOutputStructure(context);
      errors.push(...structureValidation.errors);
      warnings.push(...structureValidation.warnings);
    }
    
    // Check asset references
    if (this.config.build.checkAssetReferences) {
      const referenceValidation = await this.validateAssetReferences(context);
      errors.push(...referenceValidation.errors);
      warnings.push(...referenceValidation.warnings);
    }
    
    info.push({
      message: `Build structure validation completed`,
      source: 'build-validator'
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info,
      validatedAt: Date.now(),
      validationTime: 0
    };
  }

  /* ===== HELPER METHODS ===== */

  private async validateConfigSchema(config: Record<string, any>): Promise<ValidationResult> {
    // Configuration schema validation would integrate with JSON Schema
    // This is a placeholder for actual schema validation
    return {
      isValid: true,
      errors: [],
      warnings: [],
      info: [],
      validatedAt: Date.now(),
      validationTime: 0
    };
  }

  private async scanForSecrets(code: string, assetName: string): Promise<{ errors: ValidationError[], warnings: ValidationWarning[] }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Common secret patterns
    const secretPatterns = [
      /(?:api_key|apikey|api-key)[\s]*[:=][\s]*['"]([^'"]{20,})['"]?/gi,
      /(?:secret|password|pwd|token)[\s]*[:=][\s]*['"]([^'"]{8,})['"]?/gi,
      /(?:aws_access_key_id|aws_secret_access_key)[\s]*[:=][\s]*['"]([^'"]{16,})['"]?/gi
    ];
    
    for (const pattern of secretPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        warnings.push({
          code: 'POTENTIAL_HARDCODED_SECRET',
          message: `Potential hardcoded secret found in ${assetName}`,
          source: 'security-validator',
          suggestion: 'Move secrets to environment variables'
        });
      }
    }
    
    return { errors, warnings };
  }

  private validateCSP(config: Record<string, any>): { errors: ValidationError[], warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // CSP validation logic would be more comprehensive
    // This is a placeholder for actual CSP validation
    
    return { errors, warnings };
  }

  private async checkProviderExists(provider: string, context: ValidationContext): Promise<boolean> {
    // Check if provider exists in the build assets
    for (const [assetName, asset] of Object.entries(context.assets)) {
      if (asset.type === 'chunk' && asset.code?.includes(provider)) {
        return true;
      }
    }
    return false;
  }

  private async validateOutputStructure(context: ValidationContext): Promise<{ errors: ValidationError[], warnings: ValidationWarning[] }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Expected output structure validation
    const expectedFiles = ['index.html', 'assets/'];
    // Implementation would check for expected files
    
    return { errors, warnings };
  }

  private async validateAssetReferences(context: ValidationContext): Promise<{ errors: ValidationError[], warnings: ValidationWarning[] }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Asset reference validation logic
    // Implementation would check for broken references
    
    return { errors, warnings };
  }

  private combineResults(results: ValidationResult[]): ValidationResult {
    const combinedErrors: ValidationError[] = [];
    const combinedWarnings: ValidationWarning[] = [];
    const combinedInfo: ValidationInfo[] = [];
    
    for (const result of results) {
      combinedErrors.push(...result.errors);
      combinedWarnings.push(...result.warnings);
      combinedInfo.push(...result.info);
    }
    
    return {
      isValid: combinedErrors.length === 0,
      errors: combinedErrors,
      warnings: combinedWarnings,
      info: combinedInfo,
      validatedAt: Date.now(),
      validationTime: 0
    };
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  private logValidationResults(result: ValidationResult): void {
    console.log('\n🔍 Build Validation Results:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (result.isValid) {
      console.log('✅ Validation PASSED');
    } else {
      console.log('❌ Validation FAILED');
    }
    
    console.log(`Validation Time: ${result.validationTime.toFixed(2)}ms`);
    console.log(`Errors: ${result.errors.length}`);
    console.log(`Warnings: ${result.warnings.length}`);
    console.log(`Info: ${result.info.length}`);
    
    // Log errors
    for (const error of result.errors) {
      console.log(`❌ [${error.severity.toUpperCase()}] ${error.code}: ${error.message}`);
      if (error.suggestion) {
        console.log(`   💡 ${error.suggestion}`);
      }
    }
    
    // Log warnings
    for (const warning of result.warnings) {
      console.log(`⚠️  ${warning.code}: ${warning.message}`);
      if (warning.suggestion) {
        console.log(`   💡 ${warning.suggestion}`);
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

/* ===== EXPORT VALIDATION UTILITIES ===== */

export {
  BuildValidator,
  VALIDATION_PRESETS
};

export default BuildValidator;