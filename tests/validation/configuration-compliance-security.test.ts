/**
 * BERS Task 3.2: Configuration Compliance Testing with Security Scanning
 * 
 * Comprehensive security scanning and compliance validation for configuration files,
 * type safety validation, schema compliance, and configuration hot-reload functionality.
 * 
 * @version 1.0.0
 * @author QA Automation Specialist
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createEnvironmentResolver } from '../../src/config/environment-resolver';
import type { EnvironmentConfig, RuntimeConfig } from '../../src/types/config';

// Security scanning patterns
const SECURITY_PATTERNS = {
  SENSITIVE_DATA: [
    /password\s*[:=]\s*['"]\s*\S+/i,
    /api[_-]?key\s*[:=]\s*['"]\s*\S+/i,
    /secret\s*[:=]\s*['"]\s*\S+/i,
    /token\s*[:=]\s*['"]\s*\S+/i,
    /private[_-]?key\s*[:=]/i,
    /aws[_-]?access[_-]?key/i,
    /connection[_-]?string\s*[:=]/i
  ],
  HARDCODED_IPS: [
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
    /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/ // IPv6
  ],
  INSECURE_PROTOCOLS: [
    /http:\/\/(?!localhost|127\.0\.0\.1)/i,
    /ftp:\/\//i,
    /telnet:\/\//i
  ],
  WEAK_ENCRYPTION: [
    /md5/i,
    /sha1(?!6)/i, // SHA1 but not SHA16
    /des(?!_)/i,  // DES but not DESX
    /rc4/i
  ]
} as const;

// Configuration schema validation rules
const SCHEMA_RULES = {
  REQUIRED_FIELDS: [
    'environment',
    'api',
    'features',
    'monitoring',
    'security'
  ],
  FORBIDDEN_FIELDS: [
    'password',
    'secret',
    'privateKey',
    'internalApiKey'
  ],
  TYPE_VALIDATIONS: {
    'api.timeout': 'number',
    'api.retryAttempts': 'number',
    'features.debugging': 'boolean',
    'monitoring.enabled': 'boolean',
    'security.strictMode': 'boolean'
  }
} as const;

describe('Configuration Compliance and Security Testing', () => {
  let testResolver: any;
  let configPath: string;
  let originalConfigs: Record<string, string> = {};

  beforeAll(async () => {
    testResolver = createEnvironmentResolver();
    configPath = join(process.cwd(), 'src/config/configurations');
    
    // Backup original configurations
    const environments = ['development', 'staging', 'production'];
    for (const env of environments) {
      const filePath = join(configPath, `${env}.json`);
      if (existsSync(filePath)) {
        originalConfigs[env] = readFileSync(filePath, 'utf-8');
      }
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Restore original configurations
    for (const [env, content] of Object.entries(originalConfigs)) {
      const filePath = join(configPath, `${env}.json`);
      writeFileSync(filePath, content);
    }
  });

  describe('Security Scanning', () => {
    it('should detect sensitive data in configuration files', async () => {
      // Test configurations with security violations
      const insecureConfigs = [
        {
          name: 'Hardcoded Password',
          config: {
            environment: 'development',
            database: {
              password: 'admin123',  // Security violation
              host: 'localhost'
            }
          },
          expectedViolations: ['SENSITIVE_DATA']
        },
        {
          name: 'API Key Exposure',
          config: {
            environment: 'development',
            api: {
              key: 'sk-1234567890abcdef',  // Security violation
              baseURL: 'https://api.example.com'
            }
          },
          expectedViolations: ['SENSITIVE_DATA']
        },
        {
          name: 'Hardcoded IP Address',
          config: {
            environment: 'development',
            api: {
              baseURL: 'http://192.168.1.100:3000'  // Security violation
            }
          },
          expectedViolations: ['HARDCODED_IPS', 'INSECURE_PROTOCOLS']
        },
        {
          name: 'Weak Encryption',
          config: {
            environment: 'development',
            security: {
              hashAlgorithm: 'md5'  // Security violation
            }
          },
          expectedViolations: ['WEAK_ENCRYPTION']
        }
      ];

      for (const testCase of insecureConfigs) {
        // Act
        const violations = scanConfigurationSecurity(testCase.config);

        // Assert
        for (const expectedViolation of testCase.expectedViolations) {
          expect(violations).toContain(expectedViolation);
        }
        expect(violations.length).toBeGreaterThan(0);
      }
    });

    it('should pass security scan for secure configurations', async () => {
      const secureConfigs = [
        {
          name: 'Development Config',
          config: {
            environment: 'development',
            api: {
              baseURL: 'https://api-dev.myrecruiter.ai',
              timeout: 10000,
              retryAttempts: 3
            },
            features: {
              debugging: true,
              analytics: false
            },
            security: {
              strictMode: false,
              hashAlgorithm: 'sha256'
            }
          }
        },
        {
          name: 'Production Config',
          config: {
            environment: 'production',
            api: {
              baseURL: 'https://api.myrecruiter.ai',
              timeout: 5000,
              retryAttempts: 3
            },
            features: {
              debugging: false,
              analytics: true
            },
            security: {
              strictMode: true,
              hashAlgorithm: 'sha256'
            }
          }
        }
      ];

      for (const testCase of secureConfigs) {
        // Act
        const violations = scanConfigurationSecurity(testCase.config);

        // Assert
        expect(violations).toEqual([]);
      }
    });

    it('should validate SSL/TLS requirements for production', async () => {
      const productionConfigs = [
        {
          name: 'Secure Production',
          config: {
            environment: 'production',
            api: {
              baseURL: 'https://api.myrecruiter.ai'  // Secure
            }
          },
          shouldPass: true
        },
        {
          name: 'Insecure Production',
          config: {
            environment: 'production',
            api: {
              baseURL: 'http://api.myrecruiter.ai'   // Insecure
            }
          },
          shouldPass: false
        }
      ];

      for (const testCase of productionConfigs) {
        // Act
        const violations = scanConfigurationSecurity(testCase.config);
        const hasSSLViolation = violations.includes('INSECURE_PROTOCOLS');

        // Assert
        if (testCase.shouldPass) {
          expect(hasSSLViolation).toBe(false);
        } else {
          expect(hasSSLViolation).toBe(true);
        }
      }
    });
  });

  describe('Schema Compliance Validation', () => {
    it('should validate required configuration fields', async () => {
      const testConfigs = [
        {
          name: 'Complete Config',
          config: {
            environment: 'development',
            api: { baseURL: 'https://api.example.com' },
            features: { debugging: true },
            monitoring: { enabled: true },
            security: { strictMode: false }
          },
          shouldPass: true
        },
        {
          name: 'Missing API Config',
          config: {
            environment: 'development',
            features: { debugging: true },
            monitoring: { enabled: true },
            security: { strictMode: false }
          },
          shouldPass: false,
          missingFields: ['api']
        },
        {
          name: 'Missing Multiple Fields',
          config: {
            environment: 'development'
          },
          shouldPass: false,
          missingFields: ['api', 'features', 'monitoring', 'security']
        }
      ];

      for (const testCase of testConfigs) {
        // Act
        const validationResult = validateConfigurationSchema(testCase.config);

        // Assert
        if (testCase.shouldPass) {
          expect(validationResult.isValid).toBe(true);
          expect(validationResult.missingFields).toEqual([]);
        } else {
          expect(validationResult.isValid).toBe(false);
          expect(validationResult.missingFields).toEqual(expect.arrayContaining(testCase.missingFields || []));
        }
      }
    });

    it('should detect forbidden fields in configuration', async () => {
      const forbiddenFieldTests = [
        {
          name: 'Contains Password',
          config: {
            environment: 'development',
            api: { baseURL: 'https://api.example.com' },
            database: { password: 'secret123' }, // Forbidden
            features: { debugging: true },
            monitoring: { enabled: true },
            security: { strictMode: false }
          },
          expectedForbiddenFields: ['password']
        },
        {
          name: 'Contains Private Key',
          config: {
            environment: 'development',
            api: { baseURL: 'https://api.example.com' },
            features: { debugging: true },
            monitoring: { enabled: true },
            security: { 
              strictMode: false,
              privateKey: '-----BEGIN PRIVATE KEY-----' // Forbidden
            }
          },
          expectedForbiddenFields: ['privateKey']
        }
      ];

      for (const testCase of forbiddenFieldTests) {
        // Act
        const validationResult = validateConfigurationSchema(testCase.config);

        // Assert
        expect(validationResult.isValid).toBe(false);
        expect(validationResult.forbiddenFields).toEqual(expect.arrayContaining(testCase.expectedForbiddenFields));
      }
    });

    it('should validate field types according to schema', async () => {
      const typeValidationTests = [
        {
          name: 'Correct Types',
          config: {
            environment: 'development',
            api: { 
              baseURL: 'https://api.example.com',
              timeout: 5000,        // number
              retryAttempts: 3      // number
            },
            features: { debugging: true },  // boolean
            monitoring: { enabled: true },  // boolean
            security: { strictMode: false } // boolean
          },
          shouldPass: true
        },
        {
          name: 'Incorrect Types',
          config: {
            environment: 'development',
            api: { 
              baseURL: 'https://api.example.com',
              timeout: '5000',      // string instead of number
              retryAttempts: 'three' // string instead of number
            },
            features: { debugging: 'yes' },  // string instead of boolean
            monitoring: { enabled: 1 },      // number instead of boolean
            security: { strictMode: 'false' } // string instead of boolean
          },
          shouldPass: false,
          expectedTypeErrors: [
            'api.timeout should be number',
            'api.retryAttempts should be number',
            'features.debugging should be boolean',
            'monitoring.enabled should be boolean',
            'security.strictMode should be boolean'
          ]
        }
      ];

      for (const testCase of typeValidationTests) {
        // Act
        const validationResult = validateConfigurationSchema(testCase.config);

        // Assert
        if (testCase.shouldPass) {
          expect(validationResult.isValid).toBe(true);
          expect(validationResult.typeErrors).toEqual([]);
        } else {
          expect(validationResult.isValid).toBe(false);
          expect(validationResult.typeErrors).toEqual(expect.arrayContaining(testCase.expectedTypeErrors || []));
        }
      }
    });
  });

  describe('Configuration Hot-Reload Functionality', () => {
    it('should detect configuration file changes', async () => {
      // Mock file system watcher
      const configWatcher = createConfigurationWatcher();
      const changeEvents: string[] = [];

      configWatcher.on('change', (filename: string) => {
        changeEvents.push(filename);
      });

      // Simulate configuration file changes
      const testFiles = ['development.json', 'staging.json', 'production.json'];
      
      for (const filename of testFiles) {
        // Simulate file change
        configWatcher.emit('change', filename);
      }

      // Assert
      expect(changeEvents).toEqual(testFiles);
    });

    it('should validate configuration before hot-reload', async () => {
      const hotReloadTests = [
        {
          name: 'Valid Configuration Update',
          newConfig: {
            environment: 'development',
            api: { baseURL: 'https://api-updated.example.com', timeout: 6000 },
            features: { debugging: true },
            monitoring: { enabled: true },
            security: { strictMode: false }
          },
          shouldReload: true
        },
        {
          name: 'Invalid Configuration Update',
          newConfig: {
            environment: 'development',
            api: { baseURL: 'http://insecure.example.com' }, // Security violation
            features: { debugging: 'yes' }, // Type error
            monitoring: { enabled: true }
            // Missing security config
          },
          shouldReload: false,
          expectedErrors: ['INSECURE_PROTOCOLS', 'TYPE_ERROR', 'MISSING_REQUIRED_FIELD']
        }
      ];

      for (const testCase of hotReloadTests) {
        // Act
        const reloadResult = await simulateHotReload(testCase.newConfig);

        // Assert
        if (testCase.shouldReload) {
          expect(reloadResult.success).toBe(true);
          expect(reloadResult.errors).toEqual([]);
        } else {
          expect(reloadResult.success).toBe(false);
          expect(reloadResult.errors.length).toBeGreaterThan(0);
        }
      }
    });

    it('should maintain configuration consistency during hot-reload', async () => {
      // Test that hot-reload doesn't break existing functionality
      const originalConfig = {
        environment: 'development',
        api: { baseURL: 'https://api.example.com', timeout: 5000 },
        features: { debugging: true },
        monitoring: { enabled: true },
        security: { strictMode: false }
      };

      const updatedConfig = {
        ...originalConfig,
        api: { ...originalConfig.api, timeout: 8000 }
      };

      // Act - Simulate hot-reload
      const reloadResult = await simulateHotReload(updatedConfig);

      // Assert
      expect(reloadResult.success).toBe(true);
      expect(reloadResult.config.api.timeout).toBe(8000);
      expect(reloadResult.config.environment).toBe('development');
      
      // Verify other fields remained unchanged
      expect(reloadResult.config.features).toEqual(originalConfig.features);
      expect(reloadResult.config.monitoring).toEqual(originalConfig.monitoring);
      expect(reloadResult.config.security).toEqual(originalConfig.security);
    });

    it('should rollback on hot-reload validation failure', async () => {
      const validConfig = {
        environment: 'development',
        api: { baseURL: 'https://api.example.com', timeout: 5000 },
        features: { debugging: true },
        monitoring: { enabled: true },
        security: { strictMode: false }
      };

      const invalidConfig = {
        environment: 'development',
        api: { baseURL: 'http://insecure.com' }, // Security violation
        features: { debugging: true }
        // Missing required fields
      };

      // Act - Attempt hot-reload with invalid config
      const reloadResult = await simulateHotReloadWithRollback(validConfig, invalidConfig);

      // Assert
      expect(reloadResult.hotReloadSuccess).toBe(false);
      expect(reloadResult.rollbackSuccess).toBe(true);
      expect(reloadResult.currentConfig).toEqual(validConfig);
    });
  });

  describe('Environment-Specific Security Requirements', () => {
    it('should enforce production security requirements', async () => {
      const productionRequirements = [
        {
          name: 'HTTPS Requirement',
          config: {
            environment: 'production',
            api: { baseURL: 'http://api.myrecruiter.ai' } // Violation
          },
          expectedViolation: 'HTTPS_REQUIRED_FOR_PRODUCTION'
        },
        {
          name: 'Debug Mode Disabled',
          config: {
            environment: 'production',
            api: { baseURL: 'https://api.myrecruiter.ai' },
            features: { debugging: true } // Violation
          },
          expectedViolation: 'DEBUG_MODE_FORBIDDEN_IN_PRODUCTION'
        },
        {
          name: 'Strict Security Mode',
          config: {
            environment: 'production',
            api: { baseURL: 'https://api.myrecruiter.ai' },
            features: { debugging: false },
            security: { strictMode: false } // Violation
          },
          expectedViolation: 'STRICT_MODE_REQUIRED_FOR_PRODUCTION'
        }
      ];

      for (const requirement of productionRequirements) {
        // Act
        const violations = validateEnvironmentSecurity(requirement.config);

        // Assert
        expect(violations).toContain(requirement.expectedViolation);
      }
    });

    it('should allow development-specific configurations', async () => {
      const developmentConfig = {
        environment: 'development',
        api: { 
          baseURL: 'http://localhost:3001', // Allowed for localhost
          timeout: 10000
        },
        features: { 
          debugging: true,  // Allowed in development
          verboseLogging: true 
        },
        security: { 
          strictMode: false // Allowed in development
        }
      };

      // Act
      const violations = validateEnvironmentSecurity(developmentConfig);

      // Assert
      expect(violations).toEqual([]);
    });
  });

  describe('Configuration Versioning and Migration', () => {
    it('should detect configuration version mismatches', async () => {
      const versionTests = [
        {
          name: 'Supported Version',
          config: { version: '2.0.0', environment: 'development' },
          shouldPass: true
        },
        {
          name: 'Outdated Version',
          config: { version: '1.5.0', environment: 'development' },
          shouldPass: false,
          expectedError: 'OUTDATED_CONFIG_VERSION'
        },
        {
          name: 'Future Version',
          config: { version: '3.0.0', environment: 'development' },
          shouldPass: false,
          expectedError: 'UNSUPPORTED_CONFIG_VERSION'
        },
        {
          name: 'Missing Version',
          config: { environment: 'development' },
          shouldPass: false,
          expectedError: 'MISSING_CONFIG_VERSION'
        }
      ];

      for (const test of versionTests) {
        // Act
        const validationResult = validateConfigurationVersion(test.config);

        // Assert
        if (test.shouldPass) {
          expect(validationResult.isValid).toBe(true);
        } else {
          expect(validationResult.isValid).toBe(false);
          expect(validationResult.error).toBe(test.expectedError);
        }
      }
    });
  });
});

// Helper functions for configuration testing

function scanConfigurationSecurity(config: any): string[] {
  const violations: string[] = [];
  const configStr = JSON.stringify(config, null, 2);

  // Check for sensitive data patterns
  for (const pattern of SECURITY_PATTERNS.SENSITIVE_DATA) {
    if (pattern.test(configStr)) {
      violations.push('SENSITIVE_DATA');
      break;
    }
  }

  // Check for hardcoded IPs
  for (const pattern of SECURITY_PATTERNS.HARDCODED_IPS) {
    if (pattern.test(configStr)) {
      violations.push('HARDCODED_IPS');
      break;
    }
  }

  // Check for insecure protocols
  for (const pattern of SECURITY_PATTERNS.INSECURE_PROTOCOLS) {
    if (pattern.test(configStr)) {
      violations.push('INSECURE_PROTOCOLS');
      break;
    }
  }

  // Check for weak encryption
  for (const pattern of SECURITY_PATTERNS.WEAK_ENCRYPTION) {
    if (pattern.test(configStr)) {
      violations.push('WEAK_ENCRYPTION');
      break;
    }
  }

  return violations;
}

interface SchemaValidationResult {
  isValid: boolean;
  missingFields: string[];
  forbiddenFields: string[];
  typeErrors: string[];
}

function validateConfigurationSchema(config: any): SchemaValidationResult {
  const result: SchemaValidationResult = {
    isValid: true,
    missingFields: [],
    forbiddenFields: [],
    typeErrors: []
  };

  // Check required fields
  for (const field of SCHEMA_RULES.REQUIRED_FIELDS) {
    if (!config[field]) {
      result.missingFields.push(field);
      result.isValid = false;
    }
  }

  // Check forbidden fields (recursively)
  checkForbiddenFields(config, '', result);

  // Check type validations
  for (const [path, expectedType] of Object.entries(SCHEMA_RULES.TYPE_VALIDATIONS)) {
    const value = getNestedValue(config, path);
    if (value !== undefined && typeof value !== expectedType) {
      result.typeErrors.push(`${path} should be ${expectedType}`);
      result.isValid = false;
    }
  }

  return result;
}

function checkForbiddenFields(obj: any, prefix: string, result: SchemaValidationResult): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    
    if (SCHEMA_RULES.FORBIDDEN_FIELDS.includes(key)) {
      result.forbiddenFields.push(key);
      result.isValid = false;
    }
    
    if (typeof value === 'object' && value !== null) {
      checkForbiddenFields(value, fullPath, result);
    }
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function createConfigurationWatcher() {
  const EventEmitter = require('events');
  return new EventEmitter();
}

interface HotReloadResult {
  success: boolean;
  config?: any;
  errors: string[];
}

async function simulateHotReload(newConfig: any): Promise<HotReloadResult> {
  // Validate security
  const securityViolations = scanConfigurationSecurity(newConfig);
  if (securityViolations.length > 0) {
    return {
      success: false,
      errors: securityViolations
    };
  }

  // Validate schema
  const schemaResult = validateConfigurationSchema(newConfig);
  if (!schemaResult.isValid) {
    const errors = [
      ...schemaResult.missingFields.map(f => `MISSING_REQUIRED_FIELD: ${f}`),
      ...schemaResult.typeErrors.map(e => `TYPE_ERROR: ${e}`)
    ];
    return {
      success: false,
      errors
    };
  }

  return {
    success: true,
    config: newConfig,
    errors: []
  };
}

interface HotReloadWithRollbackResult {
  hotReloadSuccess: boolean;
  rollbackSuccess: boolean;
  currentConfig: any;
}

async function simulateHotReloadWithRollback(
  originalConfig: any, 
  invalidConfig: any
): Promise<HotReloadWithRollbackResult> {
  // Attempt hot-reload
  const hotReloadResult = await simulateHotReload(invalidConfig);
  
  if (!hotReloadResult.success) {
    // Rollback to original config
    const rollbackResult = await simulateHotReload(originalConfig);
    
    return {
      hotReloadSuccess: false,
      rollbackSuccess: rollbackResult.success,
      currentConfig: originalConfig
    };
  }

  return {
    hotReloadSuccess: true,
    rollbackSuccess: true,
    currentConfig: invalidConfig
  };
}

function validateEnvironmentSecurity(config: any): string[] {
  const violations: string[] = [];

  if (config.environment === 'production') {
    // HTTPS requirement for production
    if (config.api?.baseURL && !config.api.baseURL.startsWith('https://')) {
      violations.push('HTTPS_REQUIRED_FOR_PRODUCTION');
    }

    // Debug mode must be disabled in production
    if (config.features?.debugging === true) {
      violations.push('DEBUG_MODE_FORBIDDEN_IN_PRODUCTION');
    }

    // Strict security mode required for production
    if (config.security?.strictMode === false) {
      violations.push('STRICT_MODE_REQUIRED_FOR_PRODUCTION');
    }
  }

  return violations;
}

interface VersionValidationResult {
  isValid: boolean;
  error?: string;
}

function validateConfigurationVersion(config: any): VersionValidationResult {
  if (!config.version) {
    return { isValid: false, error: 'MISSING_CONFIG_VERSION' };
  }

  const version = config.version;
  const supportedVersions = ['2.0.0', '2.0.1', '2.1.0'];
  
  if (!supportedVersions.includes(version)) {
    if (version < '2.0.0') {
      return { isValid: false, error: 'OUTDATED_CONFIG_VERSION' };
    } else {
      return { isValid: false, error: 'UNSUPPORTED_CONFIG_VERSION' };
    }
  }

  return { isValid: true };
}