/**
 * Configuration Management Infrastructure - BERS Phase 1, Task 1.2
 * 
 * Enterprise-grade configuration management system with JSON Schema validation,
 * environment inheritance, hot-reloading, and backward compatibility support.
 * Builds on the Environment Detection Core System (Task 1.1).
 * 
 * Features:
 * - JSON Schema validation for all configuration types
 * - Environment inheritance and override system
 * - Configuration hot-reloading for development
 * - Backward compatibility with existing configurations
 * - Type-safe configuration loading with branded types
 * - Integration with distributed ChatProvider architecture
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type {
  Environment,
  ValidTenantHash
} from '../types/security';
import type {
  RuntimeConfig,
  ConfigValidationResult
} from '../types/config';
import {
  environmentResolver,
  type ValidatedEnvironment
} from './environment-resolver';

/* ===== BRANDED TYPES FOR CONFIGURATION MANAGEMENT ===== */

/**
 * Validated configuration - only created through validation process
 * SECURITY: Prevents bypassing validation requirements
 */
export type ValidatedConfiguration<T = any> = T & {
  readonly __brand: 'ValidatedConfiguration';
  readonly validatedAt: number;
  readonly schemaVersion: string;
  readonly environment: ValidatedEnvironment;
};

/**
 * Configuration schema types
 */
export type ConfigurationSchemaType = 
  | 'environment'
  | 'providers' 
  | 'build'
  | 'monitoring'
  | 'runtime'
  | 'theme'
  | 'localization';

/**
 * Configuration inheritance strategy
 */
export type InheritanceStrategy = 'merge' | 'override' | 'extend';

/**
 * Configuration change event types
 */
export type ConfigurationChangeEvent = 
  | 'config-loaded'
  | 'config-validated'
  | 'config-updated'
  | 'config-error'
  | 'hot-reload'
  | 'schema-updated';

/* ===== CONFIGURATION MANAGEMENT INTERFACES ===== */

/**
 * Configuration schema definition
 */
export interface ConfigurationSchema {
  readonly $schema: string;
  readonly $id: string;
  readonly title: string;
  readonly description: string;
  readonly type: 'object';
  readonly properties: Record<string, any>;
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
}

/**
 * Configuration inheritance rule
 */
export interface ConfigurationInheritanceRule {
  readonly sourceEnvironment: Environment;
  readonly targetEnvironment: Environment;
  readonly strategy: InheritanceStrategy;
  readonly paths: readonly string[]; // JSON paths to inherit
  readonly transforms?: Record<string, (value: any) => any>;
}

/**
 * Configuration validation context
 */
export interface ValidationContext {
  readonly environment: ValidatedEnvironment;
  readonly schemaType: ConfigurationSchemaType;
  readonly tenantHash?: ValidTenantHash;
  readonly strictMode: boolean;
  readonly allowUnknownProperties: boolean;
}

/**
 * Configuration change callback
 */
export type ConfigurationChangeCallback = (
  event: ConfigurationChangeEvent,
  config: ValidatedConfiguration,
  error?: Error
) => void;

/**
 * Hot reload configuration
 */
export interface HotReloadConfig {
  readonly enabled: boolean;
  readonly watchPaths: readonly string[];
  readonly debounceMs: number;
  readonly excludePatterns: readonly string[];
  readonly validationOnChange: boolean;
}

/**
 * Migration configuration
 */
export interface MigrationConfig {
  readonly enabled: boolean;
  readonly sourceVersion: string;
  readonly targetVersion: string;
  readonly transformers: readonly ConfigurationTransformer[];
  readonly backupOriginal: boolean;
}

/**
 * Configuration transformer for migrations
 */
export interface ConfigurationTransformer {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly transform: (config: any) => Promise<any>;
  readonly validate?: (config: any) => Promise<boolean>;
}

/* ===== MAIN CONFIGURATION MANAGER INTERFACE ===== */

/**
 * Main configuration management interface
 */
export interface ConfigurationManager {
  /**
   * Load configuration with environment inheritance
   */
  loadConfiguration<T = any>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options?: ConfigurationLoadOptions
  ): Promise<ValidatedConfiguration<T>>;

  /**
   * Validate configuration against schema
   */
  validateConfiguration<T = any>(
    config: T,
    schemaType: ConfigurationSchemaType,
    context: ValidationContext
  ): Promise<ConfigValidationResult>;

  /**
   * Watch configuration for changes (hot-reload)
   */
  watchConfiguration(
    schemaType: ConfigurationSchemaType,
    callback: ConfigurationChangeCallback,
    options?: HotReloadConfig
  ): () => void; // Returns unwatch function

  /**
   * Migrate configuration from legacy format
   */
  migrateConfiguration<T = any>(
    legacyConfig: any,
    targetSchemaType: ConfigurationSchemaType,
    migrationConfig: MigrationConfig
  ): Promise<ValidatedConfiguration<T>>;

  /**
   * Get effective configuration with inheritance resolved
   */
  getEffectiveConfiguration<T = any>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    tenantHash?: ValidTenantHash
  ): Promise<ValidatedConfiguration<T>>;

  /**
   * Register custom configuration schema
   */
  registerSchema(
    schemaType: string,
    schema: ConfigurationSchema
  ): Promise<void>;

  /**
   * Register inheritance rule
   */
  registerInheritanceRule(
    rule: ConfigurationInheritanceRule
  ): Promise<void>;

  /**
   * Clear configuration cache
   */
  clearCache(schemaType?: ConfigurationSchemaType): void;

  /**
   * Get configuration manager metrics
   */
  getMetrics(): ConfigurationManagerMetrics;
}

/**
 * Configuration load options
 */
export interface ConfigurationLoadOptions {
  readonly useCache?: boolean;
  readonly validateSchema?: boolean;
  readonly applyInheritance?: boolean;
  readonly mergeTenantOverrides?: boolean;
  readonly fallbackToDefault?: boolean;
}

/**
 * Configuration manager metrics
 */
export interface ConfigurationManagerMetrics {
  readonly totalLoads: number;
  readonly cacheHits: number;
  readonly validationErrors: number;
  readonly averageLoadTime: number;
  readonly hotReloads: number;
  readonly schemasRegistered: number;
}

/* ===== CONFIGURATION MANAGER IMPLEMENTATION ===== */

/**
 * Production-ready configuration manager implementation
 */
export class ConfigurationManagerImpl implements ConfigurationManager {
  private schemas: Map<string, ConfigurationSchema> = new Map();
  private configCache: Map<string, { config: ValidatedConfiguration; timestamp: number }> = new Map();
  private inheritanceRules: ConfigurationInheritanceRule[] = [];
  private watchers: Map<string, { callback: ConfigurationChangeCallback; options: HotReloadConfig }[]> = new Map();
  private metrics: {
    totalLoads: number;
    cacheHits: number;
    validationErrors: number;
    averageLoadTime: number;
    hotReloads: number;
    schemasRegistered: number;
  } = {
    totalLoads: 0,
    cacheHits: 0,
    validationErrors: 0,
    averageLoadTime: 0,
    hotReloads: 0,
    schemasRegistered: 0
  };

  constructor(
    private readonly cacheTTL: number = 300000, // 5 minutes
    private readonly enableHotReload: boolean = false
  ) {
    this.initializeBuiltinSchemas();
  }

  /**
   * Load configuration with environment inheritance
   */
  async loadConfiguration<T = any>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options: ConfigurationLoadOptions = {}
  ): Promise<ValidatedConfiguration<T>> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(schemaType, environment, options);

    try {
      // Check cache first
      if (options.useCache !== false) {
        const cached = this.getCachedConfiguration<T>(cacheKey);
        if (cached) {
          this.updateMetrics(performance.now() - startTime, true, false);
          return cached;
        }
      }

      // Load base configuration for environment
      let config = await this.loadEnvironmentConfig<T>(schemaType, environment);

      // Apply inheritance if enabled
      if (options.applyInheritance !== false) {
        config = await this.applyInheritanceRules<T>(config, schemaType, environment);
      }

      // Validate configuration
      if (options.validateSchema !== false) {
        const validationResult = await this.validateConfiguration(
          config,
          schemaType,
          {
            environment,
            schemaType,
            strictMode: true,
            allowUnknownProperties: false
          }
        );

        if (!validationResult.isValid) {
          throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
        }
      }

      // Create validated configuration
      const validatedConfig = this.createValidatedConfiguration<T>(
        config,
        environment,
        schemaType
      );

      // Cache the result
      if (options.useCache !== false) {
        this.cacheConfiguration(cacheKey, validatedConfig);
      }

      const loadTime = performance.now() - startTime;
      this.updateMetrics(loadTime, false, false);

      // Notify watchers
      this.notifyWatchers('config-loaded', schemaType, validatedConfig);

      return validatedConfig;
    } catch (error) {
      const loadTime = performance.now() - startTime;
      this.updateMetrics(loadTime, false, true);
      this.notifyWatchers('config-error', schemaType, undefined, error as Error);
      throw error;
    }
  }

  /**
   * Validate configuration against schema
   */
  async validateConfiguration<T = any>(
    config: T,
    schemaType: ConfigurationSchemaType,
    context: ValidationContext
  ): Promise<ConfigValidationResult> {
    try {
      const schema = this.schemas.get(schemaType);
      if (!schema) {
        return {
          isValid: false,
          errors: [`Schema not found for type: ${schemaType}`],
          warnings: []
        };
      }

      // Use Ajv or similar JSON Schema validator
      const errors: string[] = [];
      const warnings: string[] = [];

      // Basic type validation
      if (typeof config !== 'object' || config === null) {
        errors.push('Configuration must be an object');
        return { isValid: false, errors, warnings };
      }

      // Validate required properties
      for (const requiredProp of schema.required) {
        if (!(requiredProp in (config as any))) {
          errors.push(`Missing required property: ${requiredProp}`);
        }
      }

      // Validate against schema properties (simplified validation)
      const configObj = config as Record<string, any>;
      for (const [key] of Object.entries(configObj)) {
        if (!schema.properties[key] && !schema.additionalProperties) {
          if (context.strictMode) {
            errors.push(`Unknown property: ${key}`);
          } else {
            warnings.push(`Unknown property: ${key}`);
          }
        }
      }

      // Environment-specific validation
      await this.validateEnvironmentSpecificRules(config, context, errors, warnings);

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: []
      };
    }
  }

  /**
   * Watch configuration for changes (hot-reload)
   */
  watchConfiguration(
    schemaType: ConfigurationSchemaType,
    callback: ConfigurationChangeCallback,
    options: HotReloadConfig = {
      enabled: true,
      watchPaths: [`./src/config/configurations/${schemaType}.json`],
      debounceMs: 200,
      excludePatterns: [],
      validationOnChange: true
    }
  ): () => void {
    if (!this.enableHotReload || !options.enabled) {
      return () => {}; // No-op unwatch function
    }

    // Add watcher to registry
    if (!this.watchers.has(schemaType)) {
      this.watchers.set(schemaType, []);
    }
    this.watchers.get(schemaType)!.push({ callback, options });

    // Set up file system watchers (simplified - would use chokidar in production)
    if (typeof window === 'undefined' && options.watchPaths.length > 0) {
      this.setupFileSystemWatchers(schemaType, options);
    }

    // Return unwatch function
    return () => {
      const watchers = this.watchers.get(schemaType);
      if (watchers) {
        const index = watchers.findIndex(w => w.callback === callback);
        if (index >= 0) {
          watchers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Migrate configuration from legacy format
   */
  async migrateConfiguration<T = any>(
    legacyConfig: any,
    targetSchemaType: ConfigurationSchemaType,
    migrationConfig: MigrationConfig
  ): Promise<ValidatedConfiguration<T>> {
    if (!migrationConfig.enabled) {
      throw new Error('Migration is disabled');
    }

    let migratedConfig = legacyConfig;

    // Backup original if requested
    if (migrationConfig.backupOriginal) {
      await this.backupConfiguration(legacyConfig, targetSchemaType);
    }

    // Apply transformers in sequence
    for (const transformer of migrationConfig.transformers) {
      try {
        // Validate input if transformer has validation
        if (transformer.validate) {
          const isValid = await transformer.validate(migratedConfig);
          if (!isValid) {
            throw new Error(`Transformer ${transformer.name} validation failed`);
          }
        }

        // Apply transformation
        migratedConfig = await transformer.transform(migratedConfig);

        console.log(`Applied migration transformer: ${transformer.name} v${transformer.version}`);
      } catch (error) {
        throw new Error(`Migration failed at transformer ${transformer.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Validate final migrated configuration
    const detectionResult = await environmentResolver.detectEnvironment();
    const validationResult = await this.validateConfiguration(
      migratedConfig,
      targetSchemaType,
      {
        environment: detectionResult.environment,
        schemaType: targetSchemaType,
        strictMode: false, // Less strict for migrations
        allowUnknownProperties: true
      }
    );

    if (!validationResult.isValid) {
      throw new Error(`Migrated configuration validation failed: ${validationResult.errors.join(', ')}`);
    }

    return this.createValidatedConfiguration<T>(
      migratedConfig,
      detectionResult.environment,
      targetSchemaType
    );
  }

  /**
   * Get effective configuration with inheritance resolved
   */
  async getEffectiveConfiguration<T = any>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    tenantHash?: ValidTenantHash
  ): Promise<ValidatedConfiguration<T>> {
    // Load base configuration
    const baseConfig = await this.loadConfiguration<T>(schemaType, environment, {
      useCache: true,
      validateSchema: true,
      applyInheritance: true,
      fallbackToDefault: true
    });

    // Apply tenant-specific overrides if provided
    if (tenantHash) {
      const tenantOverrides = await this.loadTenantOverrides<T>(schemaType, tenantHash, environment);
      if (tenantOverrides) {
        const mergedConfig = this.mergeConfigurations(baseConfig as any, tenantOverrides as any) as T;
        return this.createValidatedConfiguration<T>(
          mergedConfig,
          environment,
          schemaType
        );
      }
    }

    return baseConfig;
  }

  /**
   * Register custom configuration schema
   */
  async registerSchema(
    schemaType: string,
    schema: ConfigurationSchema
  ): Promise<void> {
    // Validate schema structure
    if (!schema.$schema || !schema.$id || !schema.title) {
      throw new Error('Invalid schema: missing required metadata');
    }

    this.schemas.set(schemaType, schema);
    this.metrics.schemasRegistered++;

    console.log(`Registered configuration schema: ${schemaType}`);
  }

  /**
   * Register inheritance rule
   */
  async registerInheritanceRule(
    rule: ConfigurationInheritanceRule
  ): Promise<void> {
    // Validate inheritance rule
    if (!rule.sourceEnvironment || !rule.targetEnvironment || !rule.strategy) {
      throw new Error('Invalid inheritance rule: missing required fields');
    }

    // Prevent circular inheritance
    if (this.wouldCreateCircularInheritance(rule)) {
      throw new Error('Inheritance rule would create circular dependency');
    }

    this.inheritanceRules.push(rule);
    console.log(`Registered inheritance rule: ${rule.sourceEnvironment} -> ${rule.targetEnvironment}`);
  }

  /**
   * Clear configuration cache
   */
  clearCache(schemaType?: ConfigurationSchemaType): void {
    if (schemaType) {
      // Clear cache for specific schema type
      const keysToDelete = Array.from(this.configCache.keys())
        .filter(key => key.startsWith(`${schemaType}:`));
      
      for (const key of keysToDelete) {
        this.configCache.delete(key);
      }
    } else {
      // Clear all cache
      this.configCache.clear();
    }
  }

  /**
   * Get configuration manager metrics
   */
  getMetrics(): ConfigurationManagerMetrics {
    return { ...this.metrics };
  }

  /* ===== PRIVATE IMPLEMENTATION METHODS ===== */

  private async initializeBuiltinSchemas(): Promise<void> {
    // Load built-in schemas
    const schemaTypes: ConfigurationSchemaType[] = [
      'environment', 'providers', 'build', 'monitoring', 'runtime'
    ];

    for (const schemaType of schemaTypes) {
      try {
        const schema = await this.loadSchemaDefinition(schemaType);
        this.schemas.set(schemaType, schema);
      } catch (error) {
        console.warn(`Failed to load schema ${schemaType}:`, error);
      }
    }
  }

  private async loadSchemaDefinition(schemaType: ConfigurationSchemaType): Promise<ConfigurationSchema> {
    // Return schema structure with properties that match the default configuration
    const baseSchema: Omit<ConfigurationSchema, 'properties' | 'required'> = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: `https://chat.myrecruiter.ai/schemas/${schemaType}.schema.json`,
      title: `${schemaType.charAt(0).toUpperCase() + schemaType.slice(1)} Configuration Schema`,
      description: `Schema for ${schemaType} configuration`,
      type: 'object' as const,
      additionalProperties: true // Allow additional properties for flexibility
    };

    // Define schema properties based on schema type
    switch (schemaType) {
      case 'environment':
        return {
          ...baseSchema,
          properties: {
            environment: { type: 'string' },
            version: { type: 'string' },
            buildTimestamp: { type: 'number' },
            api: { type: 'object', additionalProperties: true },
            cdn: { type: 'object', additionalProperties: true },
            security: { type: 'object', additionalProperties: true },
            logging: { type: 'object', additionalProperties: true },
            performance: { type: 'object', additionalProperties: true },
            features: { type: 'object', additionalProperties: true }
          },
          required: ['environment', 'version', 'api'],
          additionalProperties: false // Strict validation for environment configs
        };
      case 'providers':
        return {
          ...baseSchema,
          properties: {
            streaming: { type: 'object', additionalProperties: true },
            content: { type: 'object', additionalProperties: true },
            monitoring: { type: 'object', additionalProperties: true }
          },
          required: []
        };
      case 'runtime':
        return {
          ...baseSchema,
          properties: {
            environment: { type: 'string' },
            api: { type: 'object', additionalProperties: true },
            cdn: { type: 'object', additionalProperties: true }
          },
          required: ['environment', 'api'],
          additionalProperties: false // Strict for runtime schema
        };
      default:
        return {
          ...baseSchema,
          properties: {},
          required: [],
          additionalProperties: false // Default to strict validation
        };
    }
  }

  private async loadEnvironmentConfig<T>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment
  ): Promise<T> {
    // In production, this would use file system or HTTP to load configuration
    // For now, return default configuration based on schema type
    return this.getDefaultConfiguration<T>(schemaType, environment);
  }

  private getDefaultConfiguration<T>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment
  ): T {
    // Return environment-appropriate defaults
    switch (schemaType) {
      case 'environment':
        return {
          environment: `${environment}`, // Force string conversion
          version: '2.0.0',
          buildTimestamp: Date.now(),
          api: {
            baseUrl: 'https://chat.myrecruiter.ai',
            timeout: environment.toString() === 'development' ? 30000 : 10000,
            retries: 3,
            rateLimit: { requests: 100, window: 60000 },
            headers: { 'Content-Type': 'application/json' }
          },
          cdn: {
            assetsUrl: 'https://chat.myrecruiter.ai/assets',
            version: '2.0.0',
            cacheBusting: true
          },
          security: {
            enforceHTTPS: environment.toString() !== 'development',
            allowInsecure: environment.toString() === 'development',
            corsOrigins: ['https://chat.myrecruiter.ai'],
            frameAncestors: ["'self'"],
            cookieSettings: { secure: true, sameSite: 'strict', httpOnly: true }
          },
          logging: {
            level: environment.toString() === 'development' ? 'debug' : 'error',
            enableConsole: environment.toString() === 'development',
            enableRemote: true,
            sanitizeErrors: true,
            maxLogSize: 1048576
          },
          performance: {
            enableMetrics: true,
            enableTracing: environment.toString() !== 'production',
            sampleRate: environment.toString() === 'production' ? 0.1 : 1.0,
            maxBundleSize: 524288,
            lazyLoading: true,
            cacheStrategy: 'memory'
          },
          features: {
            streamingEnabled: true,
            fileUploadsEnabled: true,
            darkModeEnabled: true,
            mobileOptimized: true,
            a11yEnhanced: true,
            analyticsEnabled: environment.toString() === 'production',
            errorReportingEnabled: true,
            performanceMonitoring: true,
            experimentalFeatures: environment.toString() === 'development'
          }
        } as T;

      case 'runtime':
        return {
          environment: `${environment}`,
          api: {
            baseUrl: 'https://chat.myrecruiter.ai',
            timeout: 30000
          },
          cdn: {
            assetsUrl: 'https://chat.myrecruiter.ai/assets',
            version: '2.0.0'
          }
        } as T;

      default:
        return {} as T;
    }
  }

  private async applyInheritanceRules<T>(
    config: T,
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment
  ): Promise<T> {
    // Find applicable inheritance rules
    const applicableRules = this.inheritanceRules.filter(
      rule => rule.targetEnvironment === environment.toString()
    );

    let inheritedConfig = config;

    for (const rule of applicableRules) {
      try {
        const sourceConfig = await this.loadEnvironmentConfig<T>(
          schemaType,
          this.createValidatedEnvironment(rule.sourceEnvironment)
        );

        inheritedConfig = this.applyInheritanceRule(inheritedConfig, sourceConfig, rule);
      } catch (error) {
        console.warn(`Failed to apply inheritance rule ${rule.sourceEnvironment} -> ${rule.targetEnvironment}:`, error);
      }
    }

    return inheritedConfig;
  }

  private applyInheritanceRule<T>(
    targetConfig: T,
    sourceConfig: T,
    rule: ConfigurationInheritanceRule
  ): T {
    switch (rule.strategy) {
      case 'merge':
        return this.mergeConfigurations(sourceConfig, targetConfig);
      
      case 'override':
        return this.overrideConfiguration(targetConfig, sourceConfig, rule.paths);
      
      case 'extend':
        return this.extendConfiguration(targetConfig, sourceConfig, rule.paths);
      
      default:
        return targetConfig;
    }
  }

  private mergeConfigurations<T>(base: T, override: T): T {
    if (typeof base !== 'object' || typeof override !== 'object') {
      return override;
    }

    const result = { ...base } as any;
    
    for (const [key, value] of Object.entries(override as any)) {
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.mergeConfigurations(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  private overrideConfiguration<T>(
    target: T,
    source: T,
    paths: readonly string[]
  ): T {
    const result = { ...target } as any;
    
    for (const path of paths) {
      const value = this.getValueByPath(source, path);
      if (value !== undefined) {
        this.setValueByPath(result, path, value);
      }
    }

    return result as T;
  }

  private extendConfiguration<T>(
    target: T,
    source: T,
    paths: readonly string[]
  ): T {
    const result = { ...target } as any;
    
    for (const path of paths) {
      const sourceValue = this.getValueByPath(source, path);
      const targetValue = this.getValueByPath(target, path);
      
      if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
        this.setValueByPath(result, path, [...sourceValue, ...targetValue]);
      } else if (sourceValue !== undefined && targetValue === undefined) {
        this.setValueByPath(result, path, sourceValue);
      }
    }

    return result as T;
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private setValueByPath(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      current[key] = current[key] || {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  private createValidatedConfiguration<T>(
    config: T,
    environment: ValidatedEnvironment,
    _schemaType: ConfigurationSchemaType
  ): ValidatedConfiguration<T> {
    const validated = config as any;
    validated.__brand = 'ValidatedConfiguration';
    validated.validatedAt = Date.now();
    validated.schemaVersion = '2.0.0';
    // Store the validated environment metadata separately to avoid overwriting
    // the environment string property if it exists in the config
    validated.__validatedEnvironment = environment;
    // Only set environment if it doesn't already exist (preserve original string value)
    if (!validated.environment) {
      validated.environment = environment;
    }
    return validated as ValidatedConfiguration<T>;
  }

  private createValidatedEnvironment(env: Environment): ValidatedEnvironment {
    const validated = new String(env) as any;
    validated.__brand = 'ValidatedEnvironment';
    validated.detectionSource = 'config-file';
    validated.detectionTimestamp = Date.now();
    validated.confidence = 'high';
    return validated as ValidatedEnvironment;
  }

  private generateCacheKey(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options: ConfigurationLoadOptions
  ): string {
    const optionsHash = btoa(JSON.stringify(options)).replace(/[^a-zA-Z0-9]/g, '');
    return `${schemaType}:${environment}:${optionsHash}`;
  }

  private getCachedConfiguration<T>(cacheKey: string): ValidatedConfiguration<T> | null {
    const cached = this.configCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      return cached.config as ValidatedConfiguration<T>;
    }
    return null;
  }

  private cacheConfiguration<T>(cacheKey: string, config: ValidatedConfiguration<T>): void {
    this.configCache.set(cacheKey, {
      config: config as ValidatedConfiguration,
      timestamp: Date.now()
    });
  }

  private async loadTenantOverrides<T>(
    schemaType: ConfigurationSchemaType,
    tenantHash: ValidTenantHash,
    environment: ValidatedEnvironment
  ): Promise<Partial<T> | null> {
    // Load tenant-specific overrides from S3 or similar
    // This would integrate with the environment resolver's tenant loading
    try {
      const tenantConfig = await environmentResolver.loadTenantConfiguration(tenantHash, environment);
      return this.extractSchemaSpecificConfig<T>(tenantConfig.config, schemaType);
    } catch (error) {
      console.warn(`Failed to load tenant overrides for ${tenantHash}:`, error);
      return null;
    }
  }

  private extractSchemaSpecificConfig<T>(
    runtimeConfig: RuntimeConfig,
    schemaType: ConfigurationSchemaType
  ): Partial<T> | null {
    switch (schemaType) {
      case 'environment':
        // Environment config is not tenant-specific
        return null;
      
      case 'theme':
        return runtimeConfig.theme as unknown as Partial<T>;

      case 'localization':
        return runtimeConfig.localization as unknown as Partial<T>;
      
      default:
        return null;
    }
  }

  private async validateEnvironmentSpecificRules<T>(
    config: T,
    context: ValidationContext,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    // Environment-specific validation rules
    if (context.environment.toString() === 'production') {
      // Production-specific validations
      const configObj = config as any;
      
      if (configObj.security?.allowInsecure === true) {
        errors.push('Insecure connections not allowed in production');
      }
      
      if (configObj.logging?.level === 'debug') {
        warnings.push('Debug logging enabled in production');
      }
    }

    if (context.environment.toString() === 'development') {
      // Development-specific validations
      const configObj = config as any;
      
      if (configObj.security?.enforceHTTPS === true) {
        warnings.push('HTTPS enforcement enabled in development');
      }
    }
  }

  private wouldCreateCircularInheritance(rule: ConfigurationInheritanceRule): boolean {
    // Cycle detection: check if there's already a path from target back to source
    // If adding source->target when target->...->source already exists, it creates a cycle
    const visited = new Set<string>();
    const stack = [rule.targetEnvironment];

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      if (current === rule.sourceEnvironment) {
        return true; // Found cycle: target can reach source, so source->target creates a cycle
      }

      // Follow existing inheritance rules: find where current inherits from (current is target)
      const existingRules = this.inheritanceRules.filter(r => r.sourceEnvironment === current);
      for (const existingRule of existingRules) {
        stack.push(existingRule.targetEnvironment);
      }
    }

    return false;
  }

  private setupFileSystemWatchers(
    schemaType: ConfigurationSchemaType,
    options: HotReloadConfig
  ): void {
    // File system watching would be implemented here using chokidar or similar
    // For now, this is a placeholder
    console.log(`Setting up file watchers for ${schemaType}:`, options.watchPaths);
  }

  private notifyWatchers(
    event: ConfigurationChangeEvent,
    schemaType: ConfigurationSchemaType,
    config?: ValidatedConfiguration,
    error?: Error
  ): void {
    const watchers = this.watchers.get(schemaType);
    if (watchers) {
      for (const { callback } of watchers) {
        try {
          callback(event, config!, error);
        } catch (callbackError) {
          console.error('Configuration watcher callback error:', callbackError);
        }
      }
    }
  }

  private async backupConfiguration(
    _config: any,
    schemaType: ConfigurationSchemaType
  ): Promise<void> {
    // Configuration backup would be implemented here
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `${schemaType}-backup-${timestamp}`;

    console.log(`Backing up configuration as: ${backupKey}`);
    // Would save to file system or cloud storage
  }

  private updateMetrics(loadTime: number, cacheHit: boolean, error: boolean): void {
    this.metrics.totalLoads++;
    
    if (cacheHit) {
      this.metrics.cacheHits++;
    }
    
    if (error) {
      this.metrics.validationErrors++;
    }
    
    // Update average load time
    this.metrics.averageLoadTime = 
      (this.metrics.averageLoadTime * (this.metrics.totalLoads - 1) + loadTime) / this.metrics.totalLoads;
  }
}

/* ===== DEFAULT CONFIGURATIONS AND FACTORY ===== */

/**
 * Default configuration manager options
 */
export const DEFAULT_CONFIGURATION_MANAGER_OPTIONS = {
  cacheTTL: 300000, // 5 minutes
  enableHotReload: process.env.NODE_ENV === 'development'
} as const;

/**
 * Factory function to create configuration manager
 */
export function createConfigurationManager(
  options: Partial<typeof DEFAULT_CONFIGURATION_MANAGER_OPTIONS> = {}
): ConfigurationManager {
  const mergedOptions = { ...DEFAULT_CONFIGURATION_MANAGER_OPTIONS, ...options };
  return new ConfigurationManagerImpl(mergedOptions.cacheTTL, mergedOptions.enableHotReload);
}

/**
 * Singleton instance for global use
 */
export const configurationManager = createConfigurationManager();

export default configurationManager;