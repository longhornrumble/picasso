/**
 * Migration Utilities Test Suite - BERS Phase 1, Task 1.2
 * 
 * Comprehensive test coverage for configuration migration and backward
 * compatibility systems with focus on data integrity and transformation accuracy.
 * 
 * @version 2.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MigrationManagerImpl,
  createMigrationManager,
  migrationManager,
  migrateEnvironmentJs,
  migrateTenantConfig,
  needsMigration,
  type MigrationManager,
  type LegacyConfigFormat,
  type MigrationStrategy,
  type MigrationResult,
  type CompatibilityInfo
} from '../migration-utilities';
import type { EnvironmentConfig, RuntimeConfig } from '../../types/config';
import type { ValidTenantHash } from '../../types/security';

/* ===== TEST SETUP AND MOCKS ===== */

// Mock console methods
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {})
};

// Test data - Legacy environment.js format
const LEGACY_ENVIRONMENT_JS_CONFIG = {
  ENVIRONMENT: 'development',
  API_BASE_URL: 'https://chat.myrecruiter.ai',
  CHAT_API_URL: 'https://chat.myrecruiter.ai',
  ASSET_BASE_URL: 'https://picassocode.s3.amazonaws.com',
  DEBUG: true,
  LOG_LEVEL: 'debug',
  REQUEST_TIMEOUT: 30000,
  RETRY_ATTEMPTS: 1,
  CACHE_DISABLED: true,
  ERROR_REPORTING: true,
  PERFORMANCE_MONITORING: false,
  
  // Methods from environment.js
  getConfigUrl: (tenantHash: string) => `https://api.example.com/config?t=${tenantHash}`,
  getChatUrl: (tenantHash: string) => `https://api.example.com/chat?t=${tenantHash}`,
  isDevelopment: () => true,
  isProduction: () => false
};

// Test data - Legacy tenant configuration format
const LEGACY_TENANT_CONFIG = {
  tenantHash: 'abc123def456' as ValidTenantHash,
  widget: {
    position: 'bottom-right',
    size: 'medium',
    autoOpen: false,
    theme: 'light', // Legacy theme as string
    features: {
      chatHistory: true,
      typingIndicator: true
    }
  },
  theme: 'default', // Legacy theme reference
  customizations: {
    primaryColor: '#007bff',
    fontFamily: 'Arial, sans-serif'
  }
  // Note: missing version field indicates legacy format
};

// Test data - Legacy widget configuration
const LEGACY_WIDGET_CONFIG = {
  position: 'bottom-right',
  theme: 'blue', // Legacy theme as string
  size: 'large',
  animation: true,
  showCloseButton: true,
  colors: {
    primary: '#0066cc',
    secondary: '#f0f0f0'
  }
};

describe('Migration Utilities', () => {
  let manager: MigrationManagerImpl;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Setup fresh manager instance
    manager = new MigrationManagerImpl();
  });

  /* ===== FORMAT DETECTION TESTS ===== */

  describe('Legacy Format Detection', () => {
    it('should detect environment.js format correctly', async () => {
      const compatibilityInfo = await manager.detectLegacyFormat(LEGACY_ENVIRONMENT_JS_CONFIG);

      expect(compatibilityInfo.format).toBe('environment-js-v1');
      expect(compatibilityInfo.compatible).toBe(true);
      expect(compatibilityInfo.requiresMigration).toBe(true);
      expect(compatibilityInfo.migrationComplexity).toBe('low');
      expect(compatibilityInfo.recommendations).toContain('Migrate to new environment configuration format');
    });

    it('should detect legacy tenant format correctly', async () => {
      const compatibilityInfo = await manager.detectLegacyFormat(LEGACY_TENANT_CONFIG);

      expect(compatibilityInfo.format).toBe('tenant-json-v1');
      expect(compatibilityInfo.compatible).toBe(true);
      expect(compatibilityInfo.requiresMigration).toBe(true);
      expect(compatibilityInfo.migrationComplexity).toBe('medium');
    });

    it('should detect legacy widget format correctly', async () => {
      const compatibilityInfo = await manager.detectLegacyFormat(LEGACY_WIDGET_CONFIG);

      expect(compatibilityInfo.format).toBe('widget-config-v1');
      expect(compatibilityInfo.compatible).toBe(true);
      expect(compatibilityInfo.requiresMigration).toBe(true);
      expect(compatibilityInfo.migrationComplexity).toBe('high');
    });

    it('should handle unknown format gracefully', async () => {
      const unknownConfig = {
        someField: 'value',
        anotherField: 123
      };

      const compatibilityInfo = await manager.detectLegacyFormat(unknownConfig);

      expect(compatibilityInfo.format).toBe('unknown');
      expect(compatibilityInfo.compatible).toBe(false);
      expect(compatibilityInfo.requiresMigration).toBe(false);
      expect(compatibilityInfo.recommendations).toContain('Configuration format not recognized');
    });

    it('should handle detection errors gracefully', async () => {
      // Pass null to trigger error handling
      const compatibilityInfo = await manager.detectLegacyFormat(null);

      expect(compatibilityInfo.format).toBe('unknown');
      expect(compatibilityInfo.compatible).toBe(false);
    });

    it('should detect format with incomplete data', async () => {
      const incompleteEnvConfig = {
        API_BASE_URL: 'https://api.example.com',
        // Missing other required fields
      };

      const compatibilityInfo = await manager.detectLegacyFormat(incompleteEnvConfig);

      // Should still detect as environment.js if it has key indicators
      expect(compatibilityInfo.format).toBe('unknown'); // Because getConfigUrl is missing
    });
  });

  /* ===== MIGRATION TESTS ===== */

  describe('Configuration Migration', () => {
    it('should migrate environment.js configuration successfully', async () => {
      const result = await manager.migrateConfiguration<EnvironmentConfig>(
        LEGACY_ENVIRONMENT_JS_CONFIG,
        'environment',
        'automatic'
      );

      expect(result.success).toBe(true);
      expect(result.migratedConfig).toBeDefined();
      expect(result.errors).toHaveLength(0);
      
      const config = result.migratedConfig!;
      expect(config.environment).toBe('development');
      expect(config.api.baseUrl).toBe('https://chat.myrecruiter.ai');
      expect(config.api.timeout).toBe(30000);
      expect(config.logging.level).toBe('debug');
      expect(config.security.allowInsecure).toBe(true);
      expect(config.features.experimentalFeatures).toBe(true);
    });

    it('should migrate tenant configuration successfully', async () => {
      const result = await manager.migrateConfiguration<RuntimeConfig>(
        LEGACY_TENANT_CONFIG,
        'runtime',
        'automatic'
      );

      expect(result.success).toBe(true);
      expect(result.migratedConfig).toBeDefined();
      expect(result.errors).toHaveLength(0);

      const config = result.migratedConfig!;
      expect(config.tenantHash).toBe('abc123def456');
      expect(config.widget.display.position).toBe('bottom-right');
      expect(config.widget.display.size).toBe('medium');
      expect(config.theme.name).toBeDefined();
      expect(config.version).toBe('2.0.0');
    });

    it('should migrate widget configuration to theme format', async () => {
      const result = await manager.migrateConfiguration(
        LEGACY_WIDGET_CONFIG,
        'theme',
        'automatic'
      );

      expect(result.success).toBe(true);
      expect(result.migratedConfig).toBeDefined();
      
      const themeConfig = result.migratedConfig!;
      expect(themeConfig.name).toBeDefined();
      expect(themeConfig.colors).toBeDefined();
      expect(themeConfig.typography).toBeDefined();
    });

    it('should handle migration errors gracefully', async () => {
      const invalidConfig = {
        format: 'unknown',
        invalidData: true
      };

      const result = await manager.migrateConfiguration(
        invalidConfig,
        'environment',
        'automatic'
      );

      expect(result.success).toBe(false);
      expect(result.migratedConfig).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should create backup when requested', async () => {
      const result = await manager.migrateConfiguration<EnvironmentConfig>(
        LEGACY_ENVIRONMENT_JS_CONFIG,
        'environment',
        'automatic'
      );

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(result.backupPath).toContain('environment');
    });

    it('should include migration log', async () => {
      const result = await manager.migrateConfiguration<EnvironmentConfig>(
        LEGACY_ENVIRONMENT_JS_CONFIG,
        'environment',
        'automatic'
      );

      expect(result.migrationLog).toBeDefined();
      expect(result.migrationLog.length).toBeGreaterThan(0);
      
      const hasInfoLog = result.migrationLog.some(entry => 
        entry.level === 'info' && entry.message.includes('Starting migration')
      );
      expect(hasInfoLog).toBe(true);
    });

    it('should handle different migration strategies', async () => {
      const strategies: MigrationStrategy[] = ['automatic', 'guided', 'manual', 'validation-only'];

      for (const strategy of strategies) {
        const result = await manager.migrateConfiguration<EnvironmentConfig>(
          LEGACY_ENVIRONMENT_JS_CONFIG,
          'environment',
          strategy
        );

        if (strategy === 'validation-only') {
          // Validation-only should not create backup
          expect(result.backupPath).toBeUndefined();
        } else {
          expect(result.backupPath).toBeDefined();
        }
      }
    });
  });

  /* ===== MIGRATION CONFIG CREATION TESTS ===== */

  describe('Migration Config Creation', () => {
    it('should create migration config for environment.js to environment', async () => {
      const migrationConfig = await manager.createMigrationConfig(
        'environment-js-v1',
        'environment',
        'automatic'
      );

      expect(migrationConfig.enabled).toBe(true);
      expect(migrationConfig.sourceVersion).toBe('1.0.0');
      expect(migrationConfig.targetVersion).toBe('2.0.0');
      expect(migrationConfig.transformers.length).toBeGreaterThan(0);
      expect(migrationConfig.backupOriginal).toBe(true);

      // Should include environment-specific transformers
      const transformerNames = migrationConfig.transformers.map(t => t.name);
      expect(transformerNames).toContain('environment-js-to-json');
      expect(transformerNames).toContain('normalize-environment-config');
    });

    it('should create migration config for tenant to runtime', async () => {
      const migrationConfig = await manager.createMigrationConfig(
        'tenant-json-v1',
        'runtime',
        'automatic'
      );

      expect(migrationConfig.transformers.length).toBeGreaterThan(0);
      
      const transformerNames = migrationConfig.transformers.map(t => t.name);
      expect(transformerNames).toContain('legacy-tenant-to-runtime');
      expect(transformerNames).toContain('validate-tenant-structure');
    });

    it('should create migration config for widget to theme', async () => {
      const migrationConfig = await manager.createMigrationConfig(
        'widget-config-v1',
        'theme',
        'automatic'
      );

      expect(migrationConfig.transformers.length).toBeGreaterThan(0);
      
      const transformerNames = migrationConfig.transformers.map(t => t.name);
      expect(transformerNames).toContain('legacy-widget-to-theme');
      expect(transformerNames).toContain('normalize-theme-config');
    });

    it('should handle validation-only strategy', async () => {
      const migrationConfig = await manager.createMigrationConfig(
        'environment-js-v1',
        'environment',
        'validation-only'
      );

      expect(migrationConfig.backupOriginal).toBe(false);
    });
  });

  /* ===== TRANSFORMATION TESTS ===== */

  describe('Configuration Transformations', () => {
    it('should transform environment.js API configuration correctly', async () => {
      const result = await manager.migrateConfiguration<EnvironmentConfig>(
        LEGACY_ENVIRONMENT_JS_CONFIG,
        'environment',
        'automatic'
      );

      const config = result.migratedConfig!;
      
      // API configuration transformation
      expect(config.api.baseUrl).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.API_BASE_URL);
      expect(config.api.timeout).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.REQUEST_TIMEOUT);
      expect(config.api.retries).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.RETRY_ATTEMPTS);
      expect(config.api.headers['Content-Type']).toBe('application/json');
    });

    it('should transform environment.js security configuration correctly', async () => {
      const result = await manager.migrateConfiguration<EnvironmentConfig>(
        LEGACY_ENVIRONMENT_JS_CONFIG,
        'environment',
        'automatic'
      );

      const config = result.migratedConfig!;
      
      // Security configuration based on DEBUG flag
      expect(config.security.enforceHTTPS).toBe(!LEGACY_ENVIRONMENT_JS_CONFIG.DEBUG);
      expect(config.security.allowInsecure).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.DEBUG);
      expect(config.security.cookieSettings.secure).toBe(!LEGACY_ENVIRONMENT_JS_CONFIG.DEBUG);
      expect(config.security.cookieSettings.sameSite).toBe(
        LEGACY_ENVIRONMENT_JS_CONFIG.DEBUG ? 'lax' : 'strict'
      );
    });

    it('should transform environment.js logging configuration correctly', async () => {
      const result = await manager.migrateConfiguration<EnvironmentConfig>(
        LEGACY_ENVIRONMENT_JS_CONFIG,
        'environment',
        'automatic'
      );

      const config = result.migratedConfig!;
      
      expect(config.logging.level).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.LOG_LEVEL);
      expect(config.logging.enableConsole).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.DEBUG);
      expect(config.logging.enableRemote).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.ERROR_REPORTING);
      expect(config.logging.sanitizeErrors).toBe(!LEGACY_ENVIRONMENT_JS_CONFIG.DEBUG);
    });

    it('should transform environment.js feature flags correctly', async () => {
      const result = await manager.migrateConfiguration<EnvironmentConfig>(
        LEGACY_ENVIRONMENT_JS_CONFIG,
        'environment',
        'automatic'
      );

      const config = result.migratedConfig!;
      
      expect(config.features.experimentalFeatures).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.DEBUG);
      expect(config.features.analyticsEnabled).toBe(!LEGACY_ENVIRONMENT_JS_CONFIG.DEBUG);
      expect(config.features.errorReportingEnabled).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.ERROR_REPORTING);
      expect(config.features.performanceMonitoring).toBe(LEGACY_ENVIRONMENT_JS_CONFIG.PERFORMANCE_MONITORING);
    });

    it('should transform tenant widget configuration correctly', async () => {
      const result = await manager.migrateConfiguration<RuntimeConfig>(
        LEGACY_TENANT_CONFIG,
        'runtime',
        'automatic'
      );

      const config = result.migratedConfig!;
      
      expect(config.widget.display.position).toBe(LEGACY_TENANT_CONFIG.widget.position);
      expect(config.widget.display.size).toBe(LEGACY_TENANT_CONFIG.widget.size);
      expect(config.widget.behavior.autoOpen).toBe(LEGACY_TENANT_CONFIG.widget.autoOpen);
    });

    it('should transform legacy theme references to theme objects', async () => {
      const result = await manager.migrateConfiguration<RuntimeConfig>(
        LEGACY_TENANT_CONFIG,
        'runtime',
        'automatic'
      );

      const config = result.migratedConfig!;
      
      // Legacy string theme should be transformed to theme object
      expect(typeof config.theme).toBe('object');
      expect(config.theme.name).toBeDefined();
      expect(config.theme.colors).toBeDefined();
      expect(config.theme.typography).toBeDefined();
    });

    it('should preserve tenant hash and add version', async () => {
      const result = await manager.migrateConfiguration<RuntimeConfig>(
        LEGACY_TENANT_CONFIG,
        'runtime',
        'automatic'
      );

      const config = result.migratedConfig!;
      
      expect(config.tenantHash).toBe(LEGACY_TENANT_CONFIG.tenantHash);
      expect(config.version).toBe('2.0.0');
      expect(config.lastUpdated).toBeDefined();
    });
  });

  /* ===== VALIDATION TESTS ===== */

  describe('Migration Validation', () => {
    it('should validate migrated environment configuration', async () => {
      const result = await manager.migrateConfiguration<EnvironmentConfig>(
        LEGACY_ENVIRONMENT_JS_CONFIG,
        'environment',
        'automatic'
      );

      expect(result.success).toBe(true);
      expect(result.migratedConfig).toBeDefined();

      const config = result.migratedConfig!;
      
      // Required fields should be present
      expect(config.environment).toBeDefined();
      expect(config.version).toBeDefined();
      expect(config.api).toBeDefined();
      expect(config.security).toBeDefined();
      expect(config.logging).toBeDefined();
      expect(config.performance).toBeDefined();
      expect(config.features).toBeDefined();
    });

    it('should validate migrated tenant configuration', async () => {
      const result = await manager.migrateConfiguration<RuntimeConfig>(
        LEGACY_TENANT_CONFIG,
        'runtime',
        'automatic'
      );

      expect(result.success).toBe(true);
      expect(result.migratedConfig).toBeDefined();

      const config = result.migratedConfig!;
      
      // Required fields should be present
      expect(config.tenantHash).toBeDefined();
      expect(config.widget).toBeDefined();
      expect(config.theme).toBeDefined();
      expect(config.version).toBeDefined();
    });

    it('should handle validation failures', async () => {
      // Create config that will fail validation
      const invalidConfig = {
        // Missing tenantHash - required field
        widget: {}
      };

      const result = await manager.migrateConfiguration<RuntimeConfig>(
        invalidConfig,
        'runtime',
        'automatic'
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  /* ===== ROLLBACK TESTS ===== */

  describe('Migration Rollback', () => {
    it('should rollback migration successfully', async () => {
      const backupPath = './test-backup.json';
      
      const success = await manager.rollbackMigration(backupPath, 'environment');
      
      expect(success).toBe(true);
    });

    it('should handle rollback errors', async () => {
      const invalidBackupPath = '';
      
      const success = await manager.rollbackMigration(invalidBackupPath, 'environment');
      
      expect(success).toBe(false);
    });
  });

  /* ===== TRANSFORMER TESTS ===== */

  describe('Built-in Transformers', () => {
    it('should list available transformers', () => {
      const transformers = manager.getAvailableTransformers();
      
      expect(transformers.length).toBeGreaterThan(0);
      
      const transformerNames = transformers.map(t => t.name);
      expect(transformerNames).toContain('environment-js-to-json');
      expect(transformerNames).toContain('legacy-tenant-to-runtime');
      expect(transformerNames).toContain('legacy-widget-to-theme');
    });

    it('should have transformer metadata', () => {
      const transformers = manager.getAvailableTransformers();
      
      for (const transformer of transformers) {
        expect(transformer.name).toBeDefined();
        expect(transformer.description).toBeDefined();
        expect(transformer.version).toBeDefined();
        expect(typeof transformer.transform).toBe('function');
      }
    });

    it('should execute transformer validation when available', async () => {
      const transformers = manager.getAvailableTransformers();
      const envTransformer = transformers.find(t => t.name === 'environment-js-to-json');
      
      expect(envTransformer).toBeDefined();
      expect(typeof envTransformer!.validate).toBe('function');
      
      const isValid = await envTransformer!.validate!(LEGACY_ENVIRONMENT_JS_CONFIG);
      expect(isValid).toBe(true);
      
      const isInvalid = await envTransformer!.validate!({ random: 'object' });
      expect(isInvalid).toBe(false);
    });
  });
});

/* ===== FACTORY FUNCTION TESTS ===== */

describe('Migration Factory Functions', () => {
  it('should create migration manager instance', () => {
    const manager = createMigrationManager();
    
    expect(manager).toBeInstanceOf(MigrationManagerImpl);
  });

  it('should provide singleton instance', () => {
    expect(migrationManager).toBeDefined();
    expect(migrationManager).toBeInstanceOf(MigrationManagerImpl);
  });
});

/* ===== CONVENIENCE FUNCTION TESTS ===== */

describe('Convenience Functions', () => {
  it('should migrate environment.js configuration', async () => {
    const result = await migrateEnvironmentJs(LEGACY_ENVIRONMENT_JS_CONFIG);
    
    expect(result.success).toBe(true);
    expect(result.migratedConfig).toBeDefined();
    expect(result.migratedConfig!.environment).toBe('development');
  });

  it('should migrate tenant configuration', async () => {
    const result = await migrateTenantConfig(LEGACY_TENANT_CONFIG);
    
    expect(result.success).toBe(true);
    expect(result.migratedConfig).toBeDefined();
    expect(result.migratedConfig!.tenantHash).toBe('abc123def456');
  });

  it('should check if configuration needs migration', async () => {
    const needsEnvMigration = await needsMigration(LEGACY_ENVIRONMENT_JS_CONFIG);
    expect(needsEnvMigration).toBe(true);

    const needsTenantMigration = await needsMigration(LEGACY_TENANT_CONFIG);
    expect(needsTenantMigration).toBe(true);

    const modernConfig = { version: '2.0.0', modern: true };
    const needsModernMigration = await needsMigration(modernConfig);
    expect(needsModernMigration).toBe(false);
  });
});

/* ===== EDGE CASES AND ERROR HANDLING ===== */

describe('Edge Cases and Error Handling', () => {
  it('should handle null/undefined configurations', async () => {
    const nullResult = await manager.detectLegacyFormat(null);
    expect(nullResult.format).toBe('unknown');
    expect(nullResult.compatible).toBe(false);

    const undefinedResult = await manager.detectLegacyFormat(undefined);
    expect(undefinedResult.format).toBe('unknown');
    expect(undefinedResult.compatible).toBe(false);
  });

  it('should handle empty configurations', async () => {
    const emptyResult = await manager.detectLegacyFormat({});
    expect(emptyResult.format).toBe('unknown');
    expect(emptyResult.compatible).toBe(false);
  });

  it('should handle configurations with missing required fields', async () => {
    const incompleteEnvConfig = {
      API_BASE_URL: 'https://api.example.com'
      // Missing getConfigUrl function and other fields
    };

    const result = await manager.migrateConfiguration(
      incompleteEnvConfig,
      'environment',
      'automatic'
    );

    // Should handle gracefully but may not be successful
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('should handle transformation errors', async () => {
    // Create a config that will cause transformation errors
    const problematicConfig = {
      API_BASE_URL: 123, // Wrong type
      getConfigUrl: 'not a function'
    };

    const result = await manager.migrateConfiguration(
      problematicConfig,
      'environment',
      'automatic'
    );

    // Should not crash but may not be successful
    expect(result).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('should handle very large configurations', async () => {
    const largeConfig = {
      ...LEGACY_ENVIRONMENT_JS_CONFIG,
      largeData: new Array(10000).fill('test').join('')
    };

    const result = await manager.migrateConfiguration<EnvironmentConfig>(
      largeConfig,
      'environment',
      'automatic'
    );

    expect(result).toBeDefined();
  });
});

/* ===== PERFORMANCE TESTS ===== */

describe('Migration Performance', () => {
  it('should complete migration within reasonable time', async () => {
    const startTime = Date.now();
    
    await manager.migrateConfiguration<EnvironmentConfig>(
      LEGACY_ENVIRONMENT_JS_CONFIG,
      'environment',
      'automatic'
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });

  it('should handle multiple concurrent migrations', async () => {
    const migrations = Array.from({ length: 5 }, () =>
      manager.migrateConfiguration<EnvironmentConfig>(
        LEGACY_ENVIRONMENT_JS_CONFIG,
        'environment',
        'automatic'
      )
    );

    const results = await Promise.all(migrations);
    
    expect(results).toHaveLength(5);
    expect(results.every(r => r.success)).toBe(true);
  });
});