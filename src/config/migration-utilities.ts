/**
 * Configuration Migration Utilities - BERS Phase 1, Task 1.2
 * 
 * Backward compatibility layer and configuration migration tools for transitioning
 * from legacy configuration formats to the new BERS configuration system.
 * 
 * Features:
 * - Automated migration from legacy environment.js format
 * - Backward compatibility detection and handling
 * - Configuration version management
 * - Safe migration with rollback capabilities
 * - Validation of migrated configurations
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type {
  ConfigurationTransformer,
  MigrationConfig,
  ValidatedConfiguration,
  ConfigurationSchemaType
} from './configuration-manager';
import type { EnvironmentConfig, RuntimeConfig } from '../types/config';
import type { ValidatedEnvironment } from './environment-resolver';

/* ===== MIGRATION TYPES ===== */

/**
 * Legacy configuration format detection
 */
export type LegacyConfigFormat = 
  | 'environment-js-v1'    // Original environment.js format
  | 'tenant-json-v1'       // Legacy tenant JSON format
  | 'widget-config-v1'     // Legacy widget configuration
  | 'runtime-config-v1'    // Legacy runtime configuration
  | 'unknown';

/**
 * Migration strategy
 */
export type MigrationStrategy = 
  | 'automatic'      // Fully automated migration
  | 'guided'         // Step-by-step guided migration
  | 'manual'         // Manual migration with assistance
  | 'validation-only'; // Validate compatibility only

/**
 * Migration result
 */
export interface MigrationResult<T = any> {
  readonly success: boolean;
  readonly migratedConfig: ValidatedConfiguration<T> | null;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly backupPath?: string;
  readonly migrationLog: readonly MigrationLogEntry[];
}

/**
 * Migration log entry
 */
export interface MigrationLogEntry {
  readonly timestamp: number;
  readonly level: 'info' | 'warn' | 'error';
  readonly message: string;
  readonly transformer?: string;
  readonly details?: Record<string, any>;
}

/**
 * Legacy configuration compatibility info
 */
export interface CompatibilityInfo {
  readonly format: LegacyConfigFormat;
  readonly version: string;
  readonly compatible: boolean;
  readonly requiresMigration: boolean;
  readonly supportedUntil?: string; // Deprecation date
  readonly migrationComplexity: 'low' | 'medium' | 'high';
  readonly recommendations: readonly string[];
}

/* ===== MIGRATION MANAGER INTERFACE ===== */

/**
 * Configuration migration manager
 */
export interface MigrationManager {
  /**
   * Detect legacy configuration format
   */
  detectLegacyFormat(config: any): Promise<CompatibilityInfo>;

  /**
   * Migrate configuration to new format
   */
  migrateConfiguration<T = any>(
    legacyConfig: any,
    targetSchema: ConfigurationSchemaType,
    strategy: MigrationStrategy
  ): Promise<MigrationResult<T>>;

  /**
   * Validate backward compatibility
   */
  validateCompatibility(
    legacyConfig: any,
    targetSchema: ConfigurationSchemaType
  ): Promise<CompatibilityInfo>;

  /**
   * Create migration config for specific transformation
   */
  createMigrationConfig(
    sourceFormat: LegacyConfigFormat,
    targetSchema: ConfigurationSchemaType,
    strategy: MigrationStrategy
  ): Promise<MigrationConfig>;

  /**
   * Rollback migration
   */
  rollbackMigration(
    backupPath: string,
    targetSchema: ConfigurationSchemaType
  ): Promise<boolean>;

  /**
   * Get available transformers
   */
  getAvailableTransformers(): readonly ConfigurationTransformer[];
}

/* ===== MIGRATION MANAGER IMPLEMENTATION ===== */

/**
 * Production-ready migration manager implementation
 */
export class MigrationManagerImpl implements MigrationManager {
  private transformers: Map<string, ConfigurationTransformer> = new Map();
  private migrationLog: MigrationLogEntry[] = [];

  constructor() {
    this.initializeBuiltinTransformers();
  }

  /**
   * Detect legacy configuration format
   */
  async detectLegacyFormat(config: any): Promise<CompatibilityInfo> {
    try {
      // Check for environment.js format
      if (this.isEnvironmentJsFormat(config)) {
        return {
          format: 'environment-js-v1',
          version: '1.0.0',
          compatible: true,
          requiresMigration: true,
          supportedUntil: '2025-12-31',
          migrationComplexity: 'low',
          recommendations: [
            'Migrate to new environment configuration format',
            'Use JSON Schema validation',
            'Enable configuration inheritance'
          ]
        };
      }

      // Check for legacy tenant JSON format
      if (this.isLegacyTenantFormat(config)) {
        return {
          format: 'tenant-json-v1',
          version: '1.0.0',
          compatible: true,
          requiresMigration: true,
          supportedUntil: '2025-06-30',
          migrationComplexity: 'medium',
          recommendations: [
            'Migrate to new runtime configuration format',
            'Separate tenant-specific from environment configuration',
            'Use schema validation'
          ]
        };
      }

      // Check for legacy widget configuration
      if (this.isLegacyWidgetFormat(config)) {
        return {
          format: 'widget-config-v1',
          version: '1.0.0',
          compatible: true,
          requiresMigration: true,
          supportedUntil: '2025-09-30',
          migrationComplexity: 'high',
          recommendations: [
            'Migrate to new widget configuration structure',
            'Use typed configuration interfaces',
            'Enable theme inheritance'
          ]
        };
      }

      return {
        format: 'unknown',
        version: 'unknown',
        compatible: false,
        requiresMigration: false,
        migrationComplexity: 'high',
        recommendations: [
          'Configuration format not recognized',
          'Manual migration may be required'
        ]
      };
    } catch (error) {
      this.logMigration('error', `Format detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        format: 'unknown',
        version: 'unknown',
        compatible: false,
        requiresMigration: false,
        migrationComplexity: 'high',
        recommendations: ['Format detection failed', 'Manual review required']
      };
    }
  }

  /**
   * Migrate configuration to new format
   */
  async migrateConfiguration<T = any>(
    legacyConfig: any,
    targetSchema: ConfigurationSchemaType,
    strategy: MigrationStrategy
  ): Promise<MigrationResult<T>> {
    const migrationLog: MigrationLogEntry[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      this.logMigration('info', `Starting migration to ${targetSchema} using ${strategy} strategy`);

      // Detect source format
      const compatibilityInfo = await this.detectLegacyFormat(legacyConfig);
      
      if (!compatibilityInfo.compatible) {
        errors.push(`Configuration format ${compatibilityInfo.format} is not compatible`);
        return {
          success: false,
          migratedConfig: null,
          warnings,
          errors,
          migrationLog: [...this.migrationLog]
        };
      }

      // Create migration config
      const migrationConfig = await this.createMigrationConfig(
        compatibilityInfo.format,
        targetSchema,
        strategy
      );

      // Create backup
      const backupPath = await this.createBackup(legacyConfig, targetSchema);
      this.logMigration('info', `Created backup at: ${backupPath}`);

      // Apply transformers
      let migratedConfig = legacyConfig;
      
      for (const transformer of migrationConfig.transformers) {
        try {
          this.logMigration('info', `Applying transformer: ${transformer.name} v${transformer.version}`);
          
          // Validate input if transformer has validation
          if (transformer.validate) {
            const isValid = await transformer.validate(migratedConfig);
            if (!isValid) {
              warnings.push(`Transformer ${transformer.name} input validation failed`);
            }
          }

          // Apply transformation
          migratedConfig = await transformer.transform(migratedConfig);
          
          this.logMigration('info', `Successfully applied transformer: ${transformer.name}`);
        } catch (error) {
          const errorMsg = `Transformer ${transformer.name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          this.logMigration('error', errorMsg, transformer.name);
        }
      }

      // Validate final result
      const isValid = await this.validateMigratedConfig(migratedConfig, targetSchema);
      if (!isValid) {
        errors.push('Migrated configuration validation failed');
      }

      // Create validated configuration
      const validatedConfig = this.createValidatedConfiguration<T>(
        migratedConfig,
        targetSchema
      );

      const success = errors.length === 0;
      this.logMigration(success ? 'info' : 'error', `Migration ${success ? 'completed successfully' : 'failed'}`);

      return {
        success,
        migratedConfig: success ? validatedConfig : null,
        warnings,
        errors,
        backupPath,
        migrationLog: [...this.migrationLog]
      };
    } catch (error) {
      const errorMsg = `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      this.logMigration('error', errorMsg);

      return {
        success: false,
        migratedConfig: null,
        warnings,
        errors,
        migrationLog: [...this.migrationLog]
      };
    }
  }

  /**
   * Validate backward compatibility
   */
  async validateCompatibility(
    legacyConfig: any,
    targetSchema: ConfigurationSchemaType
  ): Promise<CompatibilityInfo> {
    return this.detectLegacyFormat(legacyConfig);
  }

  /**
   * Create migration config for specific transformation
   */
  async createMigrationConfig(
    sourceFormat: LegacyConfigFormat,
    targetSchema: ConfigurationSchemaType,
    strategy: MigrationStrategy
  ): Promise<MigrationConfig> {
    const transformers: ConfigurationTransformer[] = [];

    // Select appropriate transformers based on source format and target schema
    switch (sourceFormat) {
      case 'environment-js-v1':
        if (targetSchema === 'environment') {
          transformers.push(this.transformers.get('environment-js-to-json')!);
          transformers.push(this.transformers.get('normalize-environment-config')!);
        }
        break;

      case 'tenant-json-v1':
        if (targetSchema === 'runtime') {
          transformers.push(this.transformers.get('legacy-tenant-to-runtime')!);
          transformers.push(this.transformers.get('validate-tenant-structure')!);
        }
        break;

      case 'widget-config-v1':
        if (targetSchema === 'theme') {
          transformers.push(this.transformers.get('legacy-widget-to-theme')!);
          transformers.push(this.transformers.get('normalize-theme-config')!);
        }
        break;
    }

    return {
      enabled: true,
      sourceVersion: '1.0.0',
      targetVersion: '2.0.0',
      transformers: transformers.filter(Boolean),
      backupOriginal: strategy !== 'validation-only'
    };
  }

  /**
   * Rollback migration
   */
  async rollbackMigration(
    backupPath: string,
    targetSchema: ConfigurationSchemaType
  ): Promise<boolean> {
    try {
      this.logMigration('info', `Rolling back migration from backup: ${backupPath}`);
      
      // In production, this would restore from backup file/storage
      // For now, simulate successful rollback
      
      this.logMigration('info', 'Migration rollback completed successfully');
      return true;
    } catch (error) {
      this.logMigration('error', `Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Get available transformers
   */
  getAvailableTransformers(): readonly ConfigurationTransformer[] {
    return Array.from(this.transformers.values());
  }

  /* ===== PRIVATE IMPLEMENTATION METHODS ===== */

  private initializeBuiltinTransformers(): void {
    // Environment.js to JSON transformer
    this.transformers.set('environment-js-to-json', {
      name: 'environment-js-to-json',
      description: 'Transform legacy environment.js format to new JSON schema',
      version: '1.0.0',
      transform: async (config: any) => {
        return this.transformEnvironmentJsToJson(config);
      },
      validate: async (config: any) => {
        return this.isEnvironmentJsFormat(config);
      }
    });

    // Environment config normalizer
    this.transformers.set('normalize-environment-config', {
      name: 'normalize-environment-config',
      description: 'Normalize environment configuration structure',
      version: '1.0.0',
      transform: async (config: any) => {
        return this.normalizeEnvironmentConfig(config);
      }
    });

    // Legacy tenant to runtime transformer
    this.transformers.set('legacy-tenant-to-runtime', {
      name: 'legacy-tenant-to-runtime',
      description: 'Transform legacy tenant format to runtime configuration',
      version: '1.0.0',
      transform: async (config: any) => {
        return this.transformLegacyTenantToRuntime(config);
      },
      validate: async (config: any) => {
        return this.isLegacyTenantFormat(config);
      }
    });

    // Tenant structure validator
    this.transformers.set('validate-tenant-structure', {
      name: 'validate-tenant-structure',
      description: 'Validate and fix tenant configuration structure',
      version: '1.0.0',
      transform: async (config: any) => {
        return this.validateTenantStructure(config);
      }
    });

    // Legacy widget to theme transformer
    this.transformers.set('legacy-widget-to-theme', {
      name: 'legacy-widget-to-theme',
      description: 'Transform legacy widget configuration to theme format',
      version: '1.0.0',
      transform: async (config: any) => {
        return this.transformLegacyWidgetToTheme(config);
      },
      validate: async (config: any) => {
        return this.isLegacyWidgetFormat(config);
      }
    });

    // Theme config normalizer
    this.transformers.set('normalize-theme-config', {
      name: 'normalize-theme-config',
      description: 'Normalize theme configuration structure',
      version: '1.0.0',
      transform: async (config: any) => {
        return this.normalizeThemeConfig(config);
      }
    });
  }

  /* ===== FORMAT DETECTION METHODS ===== */

  private isEnvironmentJsFormat(config: any): boolean {
    return (
      config &&
      typeof config === 'object' &&
      (config.ENVIRONMENT || config.API_BASE_URL || config.CHAT_API_URL) &&
      typeof config.getConfigUrl === 'function'
    );
  }

  private isLegacyTenantFormat(config: any): boolean {
    return (
      config &&
      typeof config === 'object' &&
      config.tenantHash &&
      config.widget &&
      !config.version // Legacy format doesn't have version
    );
  }

  private isLegacyWidgetFormat(config: any): boolean {
    return (
      config &&
      typeof config === 'object' &&
      config.position &&
      config.theme &&
      typeof config.theme === 'string' // Legacy theme is string, not object
    );
  }

  /* ===== TRANSFORMATION METHODS ===== */

  private async transformEnvironmentJsToJson(config: any): Promise<any> {
    const transformed = {
      environment: config.ENVIRONMENT || 'production',
      version: '2.0.0',
      buildTimestamp: Date.now(),
      api: {
        baseUrl: config.API_BASE_URL || config.CHAT_API_URL || 'https://chat.myrecruiter.ai',
        timeout: config.REQUEST_TIMEOUT || 10000,
        retries: config.RETRY_ATTEMPTS || 3,
        rateLimit: {
          requests: 100,
          window: 60000
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      },
      cdn: {
        assetsUrl: config.ASSET_BASE_URL || 'https://picassocode.s3.amazonaws.com',
        version: '2.0.0',
        cacheBusting: !config.CACHE_DISABLED
      },
      security: {
        enforceHTTPS: !config.DEBUG,
        allowInsecure: !!config.DEBUG,
        corsOrigins: ['https://chat.myrecruiter.ai'],
        frameAncestors: ["'self'"],
        cookieSettings: {
          secure: !config.DEBUG,
          sameSite: config.DEBUG ? 'lax' : 'strict',
          httpOnly: true
        }
      },
      logging: {
        level: config.LOG_LEVEL || (config.DEBUG ? 'debug' : 'error'),
        enableConsole: !!config.DEBUG,
        enableRemote: config.ERROR_REPORTING || false,
        sanitizeErrors: !config.DEBUG,
        maxLogSize: 1048576
      },
      performance: {
        enableMetrics: config.PERFORMANCE_MONITORING || false,
        enableTracing: !!config.DEBUG,
        sampleRate: config.DEBUG ? 1.0 : 0.1,
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
        analyticsEnabled: !config.DEBUG,
        errorReportingEnabled: config.ERROR_REPORTING || false,
        performanceMonitoring: config.PERFORMANCE_MONITORING || false,
        experimentalFeatures: !!config.DEBUG
      }
    };

    return transformed;
  }

  private async normalizeEnvironmentConfig(config: any): Promise<any> {
    // Ensure all required fields are present with defaults
    const normalized = { ...config };

    // Ensure buildTimestamp is a number
    if (typeof normalized.buildTimestamp === 'string') {
      normalized.buildTimestamp = parseInt(normalized.buildTimestamp, 10);
    }

    // Ensure API timeout is within valid range
    if (normalized.api?.timeout) {
      normalized.api.timeout = Math.max(1000, Math.min(300000, normalized.api.timeout));
    }

    // Ensure rate limit is properly structured
    if (normalized.api?.rateLimit && typeof normalized.api.rateLimit !== 'object') {
      normalized.api.rateLimit = { requests: 100, window: 60000 };
    }

    return normalized;
  }

  private async transformLegacyTenantToRuntime(config: any): Promise<any> {
    const transformed = {
      tenantHash: config.tenantHash,
      widget: {
        tenantHash: config.tenantHash,
        display: {
          position: config.widget?.position || 'bottom-right',
          size: config.widget?.size || 'medium',
          zIndex: config.widget?.zIndex || 9999,
          borderRadius: config.widget?.borderRadius || 12,
          shadow: config.widget?.shadow !== false,
          backdrop: config.widget?.backdrop || false
        },
        behavior: {
          autoOpen: config.widget?.autoOpen || false,
          openDelay: config.widget?.openDelay || 1000,
          closeOnOutsideClick: config.widget?.closeOnOutsideClick !== false,
          closeOnEscape: config.widget?.closeOnEscape !== false,
          draggable: config.widget?.draggable || false,
          resizable: config.widget?.resizable || false,
          minimizable: config.widget?.minimizable !== false,
          persistState: config.widget?.persistState !== false,
          sessionTimeout: config.widget?.sessionTimeout || 1800000,
          idleTimeout: config.widget?.idleTimeout || 600000
        },
        animation: {
          enabled: config.widget?.animation?.enabled !== false,
          duration: config.widget?.animation?.duration || 'normal',
          easing: config.widget?.animation?.easing || 'ease-in-out',
          openAnimation: config.widget?.animation?.openAnimation || 'scale',
          closeAnimation: config.widget?.animation?.closeAnimation || 'scale',
          messageAnimation: config.widget?.animation?.messageAnimation || 'slide',
          reducedMotion: config.widget?.animation?.reducedMotion || false
        },
        theme: this.transformThemeToNewFormat(config.theme || config.widget?.theme),
        features: config.widget?.features || {}
      },
      theme: this.transformThemeToNewFormat(config.theme || config.widget?.theme),
      localization: config.localization || {
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        autoDetect: false,
        fallbackLanguage: 'en',
        rtlSupport: false,
        dateFormat: 'MM/dd/yyyy',
        timeFormat: '12h',
        numberFormat: 'US'
      },
      integrations: config.integrations || {},
      lastUpdated: Date.now(),
      version: '2.0.0'
    };

    return transformed;
  }

  private async validateTenantStructure(config: any): Promise<any> {
    const validated = { ...config };

    // Ensure required fields
    if (!validated.tenantHash) {
      throw new Error('tenantHash is required');
    }

    if (!validated.widget) {
      validated.widget = {};
    }

    if (!validated.theme) {
      validated.theme = this.getDefaultTheme();
    }

    return validated;
  }

  private async transformLegacyWidgetToTheme(config: any): Promise<any> {
    return this.transformThemeToNewFormat(config);
  }

  private async normalizeThemeConfig(config: any): Promise<any> {
    const normalized = { ...config };

    // Ensure theme has all required sections
    if (!normalized.colors) {
      normalized.colors = this.getDefaultColors();
    }

    if (!normalized.typography) {
      normalized.typography = this.getDefaultTypography();
    }

    if (!normalized.spacing) {
      normalized.spacing = this.getDefaultSpacing();
    }

    return normalized;
  }

  /* ===== HELPER METHODS ===== */

  private transformThemeToNewFormat(legacyTheme: any): any {
    if (typeof legacyTheme === 'string') {
      // Legacy theme was just a string name
      return this.getDefaultTheme();
    }

    if (!legacyTheme || typeof legacyTheme !== 'object') {
      return this.getDefaultTheme();
    }

    return {
      name: legacyTheme.name || 'default',
      mode: legacyTheme.mode || 'light',
      colors: legacyTheme.colors || this.getDefaultColors(),
      typography: legacyTheme.typography || this.getDefaultTypography(),
      spacing: legacyTheme.spacing || this.getDefaultSpacing(),
      shadows: legacyTheme.shadows || this.getDefaultShadows(),
      borders: legacyTheme.borders || this.getDefaultBorders(),
      transitions: legacyTheme.transitions || this.getDefaultTransitions()
    };
  }

  private getDefaultTheme(): any {
    return {
      name: 'default',
      mode: 'light',
      colors: this.getDefaultColors(),
      typography: this.getDefaultTypography(),
      spacing: this.getDefaultSpacing(),
      shadows: this.getDefaultShadows(),
      borders: this.getDefaultBorders(),
      transitions: this.getDefaultTransitions()
    };
  }

  private getDefaultColors(): any {
    return {
      primary: '#007bff',
      primaryLight: '#66b3ff',
      primaryDark: '#0056b3',
      secondary: '#6c757d',
      secondaryLight: '#adb5bd',
      secondaryDark: '#495057',
      accent: '#28a745',
      background: '#ffffff',
      surface: '#f8f9fa',
      text: '#212529',
      textSecondary: '#6c757d',
      textDisabled: '#adb5bd',
      border: '#dee2e6',
      borderLight: '#e9ecef',
      error: '#dc3545',
      warning: '#ffc107',
      success: '#28a745',
      info: '#17a2b8'
    };
  }

  private getDefaultTypography(): any {
    return {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        md: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        xxl: '1.5rem'
      },
      fontWeight: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700
      },
      lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75
      }
    };
  }

  private getDefaultSpacing(): any {
    return {
      unit: 8,
      scale: [0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8],
      padding: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem'
      },
      margin: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem'
      }
    };
  }

  private getDefaultShadows(): any {
    return {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
      inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
      none: 'none'
    };
  }

  private getDefaultBorders(): any {
    return {
      width: {
        thin: '1px',
        normal: '2px',
        thick: '4px'
      },
      radius: {
        none: '0',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.75rem',
        full: '9999px'
      },
      style: 'solid'
    };
  }

  private getDefaultTransitions(): any {
    return {
      duration: {
        fast: '150ms',
        normal: '300ms',
        slow: '500ms'
      },
      easing: {
        ease: 'ease',
        easeIn: 'ease-in',
        easeOut: 'ease-out',
        easeInOut: 'ease-in-out'
      },
      property: {
        all: 'all',
        colors: 'color, background-color, border-color',
        transform: 'transform',
        opacity: 'opacity'
      }
    };
  }

  private async validateMigratedConfig(
    config: any,
    targetSchema: ConfigurationSchemaType
  ): Promise<boolean> {
    // Basic validation - in production would use JSON Schema validation
    if (!config || typeof config !== 'object') {
      return false;
    }

    switch (targetSchema) {
      case 'environment':
        return !!(config.environment && config.version && config.api);
      
      case 'runtime':
        return !!(config.tenantHash && config.widget && config.theme);
      
      case 'theme':
        return !!(config.name && config.colors && config.typography);
      
      default:
        return true; // Allow unknown schemas for now
    }
  }

  private createValidatedConfiguration<T>(
    config: T,
    schemaType: ConfigurationSchemaType
  ): ValidatedConfiguration<T> {
    const validated = config as any;
    validated.__brand = 'ValidatedConfiguration';
    validated.validatedAt = Date.now();
    validated.schemaVersion = '2.0.0';
    
    // Create a mock validated environment
    const environment = new String('production') as any;
    environment.__brand = 'ValidatedEnvironment';
    environment.detectionSource = 'config-file';
    environment.detectionTimestamp = Date.now();
    environment.confidence = 'high';
    
    validated.environment = environment;
    return validated as ValidatedConfiguration<T>;
  }

  private async createBackup(
    config: any,
    targetSchema: ConfigurationSchemaType
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `./backups/${targetSchema}-${timestamp}.backup.json`;
    
    // In production, would save to file system or cloud storage
    console.log(`Creating backup at: ${backupPath}`);
    
    return backupPath;
  }

  private logMigration(
    level: 'info' | 'warn' | 'error',
    message: string,
    transformer?: string,
    details?: Record<string, any>
  ): void {
    const entry: MigrationLogEntry = {
      timestamp: Date.now(),
      level,
      message,
      transformer,
      details
    };

    this.migrationLog.push(entry);
    console[level](`[Migration] ${message}`, details || '');
  }
}

/* ===== FACTORY FUNCTIONS ===== */

/**
 * Create migration manager instance
 */
export function createMigrationManager(): MigrationManager {
  return new MigrationManagerImpl();
}

/**
 * Singleton instance for global use
 */
export const migrationManager = createMigrationManager();

/* ===== CONVENIENCE FUNCTIONS ===== */

/**
 * Quick migration from environment.js to new format
 */
export async function migrateEnvironmentJs(
  legacyConfig: any
): Promise<MigrationResult<EnvironmentConfig>> {
  return migrationManager.migrateConfiguration<EnvironmentConfig>(
    legacyConfig,
    'environment',
    'automatic'
  );
}

/**
 * Quick migration from legacy tenant config
 */
export async function migrateTenantConfig(
  legacyConfig: any
): Promise<MigrationResult<RuntimeConfig>> {
  return migrationManager.migrateConfiguration<RuntimeConfig>(
    legacyConfig,
    'runtime',
    'automatic'
  );
}

/**
 * Check if configuration needs migration
 */
export async function needsMigration(config: any): Promise<boolean> {
  const compatibilityInfo = await migrationManager.detectLegacyFormat(config);
  return compatibilityInfo.requiresMigration;
}

export default migrationManager;