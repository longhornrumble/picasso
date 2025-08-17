/**
 * Configuration Sanitization System - BERS Security Module
 * 
 * Comprehensive input validation and sanitization for all configuration
 * data to prevent injection attacks, path traversal, and configuration
 * manipulation vulnerabilities.
 * 
 * @version 1.0.0
 * @author BERS Security Team
 */

import type { 
  Environment,
  ValidTenantHash,
  SecurityError,
  ConfigValidationResult 
} from '../types/security';
import type { 
  RuntimeConfig,
  EnvironmentConfig 
} from '../types/config';

/* ===== SANITIZATION INTERFACES ===== */

export interface ConfigSanitizationOptions {
  readonly strictMode: boolean;
  readonly allowedDomains: readonly string[];
  readonly maxConfigSize: number;
  readonly enableLogging: boolean;
  readonly rejectUnknownProperties: boolean;
}

export interface SanitizationResult<T = any> {
  readonly sanitized: T;
  readonly warnings: readonly string[];
  readonly errors: readonly SecurityError[];
  readonly isValid: boolean;
  readonly originalSize: number;
  readonly sanitizedSize: number;
}

export interface ConfigurationSchema {
  readonly type: string;
  readonly properties: Record<string, PropertySchema>;
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
}

export interface PropertySchema {
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly format?: 'url' | 'email' | 'uuid' | 'tenant-hash' | 'path';
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly enum?: readonly (string | number)[];
  readonly sanitize?: boolean;
  readonly allowHTML?: boolean;
}

/* ===== CONFIGURATION SCHEMAS ===== */

const ENVIRONMENT_CONFIG_SCHEMA: ConfigurationSchema = {
  type: 'object',
  properties: {
    environment: {
      type: 'string',
      enum: ['development', 'staging', 'production'],
      sanitize: false
    },
    api: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', format: 'url', sanitize: true },
        timeout: { type: 'number', minimum: 1000, maximum: 60000 },
        retries: { type: 'number', minimum: 0, maximum: 5 }
      },
      required: ['baseUrl'],
      additionalProperties: false
    },
    security: {
      type: 'object',
      properties: {
        enforceHTTPS: { type: 'boolean' },
        allowInsecure: { type: 'boolean' },
        corsOrigins: { 
          type: 'array',
          items: { type: 'string', format: 'url', sanitize: true }
        }
      },
      required: ['enforceHTTPS'],
      additionalProperties: false
    }
  },
  required: ['environment', 'api', 'security'],
  additionalProperties: false
};

const RUNTIME_CONFIG_SCHEMA: ConfigurationSchema = {
  type: 'object',
  properties: {
    tenantHash: {
      type: 'string',
      format: 'tenant-hash',
      pattern: '^[a-zA-Z0-9]{8,32}$',
      sanitize: false
    },
    widget: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 100, sanitize: true, allowHTML: false },
        description: { type: 'string', maxLength: 500, sanitize: true, allowHTML: false },
        apiUrl: { type: 'string', format: 'url', sanitize: true }
      },
      required: ['apiUrl'],
      additionalProperties: true
    },
    theme: {
      type: 'object',
      properties: {
        primaryColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        fontFamily: { type: 'string', maxLength: 50, sanitize: true }
      },
      additionalProperties: true
    }
  },
  required: ['tenantHash', 'widget'],
  additionalProperties: true
};

/* ===== MAIN SANITIZER CLASS ===== */

export class ConfigurationSanitizer {
  private readonly options: ConfigSanitizationOptions;
  private readonly schemas: Map<string, ConfigurationSchema>;

  constructor(options: Partial<ConfigSanitizationOptions> = {}) {
    this.options = {
      strictMode: true,
      allowedDomains: [
        'myrecruiter.ai',
        'chat.myrecruiter.ai',
        'api.myrecruiter.ai',
        'cdn.myrecruiter.ai'
      ],
      maxConfigSize: 1024 * 1024, // 1MB
      enableLogging: true,
      rejectUnknownProperties: true,
      ...options
    };

    this.schemas = new Map([
      ['environment', ENVIRONMENT_CONFIG_SCHEMA],
      ['runtime', RUNTIME_CONFIG_SCHEMA]
    ]);
  }

  /**
   * Sanitize environment configuration
   */
  async sanitizeEnvironmentConfig(
    config: any,
    environment: Environment
  ): Promise<SanitizationResult<EnvironmentConfig>> {
    return this.sanitizeConfig(config, 'environment', environment);
  }

  /**
   * Sanitize runtime configuration
   */
  async sanitizeRuntimeConfig(
    config: any,
    tenantHash: ValidTenantHash
  ): Promise<SanitizationResult<RuntimeConfig>> {
    const result = await this.sanitizeConfig(config, 'runtime');
    
    // Additional tenant-specific validation
    if (result.isValid && result.sanitized.tenantHash !== tenantHash) {
      result.errors.push({
        code: 'TENANT_HASH_MISMATCH',
        message: 'Configuration tenant hash does not match expected value',
        severity: 'critical',
        timestamp: Date.now()
      });
      (result as any).isValid = false;
    }

    return result;
  }

  /**
   * Generic configuration sanitization
   */
  private async sanitizeConfig<T = any>(
    config: any,
    schemaType: string,
    context?: Environment
  ): Promise<SanitizationResult<T>> {
    const warnings: string[] = [];
    const errors: SecurityError[] = [];
    const originalSize = this.calculateSize(config);

    // Check size limits
    if (originalSize > this.options.maxConfigSize) {
      errors.push({
        code: 'CONFIG_SIZE_EXCEEDED',
        message: `Configuration size ${originalSize} exceeds limit ${this.options.maxConfigSize}`,
        severity: 'high',
        timestamp: Date.now()
      });
      return {
        sanitized: {} as T,
        warnings,
        errors,
        isValid: false,
        originalSize,
        sanitizedSize: 0
      };
    }

    // Get schema
    const schema = this.schemas.get(schemaType);
    if (!schema) {
      errors.push({
        code: 'UNKNOWN_SCHEMA',
        message: `Unknown configuration schema: ${schemaType}`,
        severity: 'high',
        timestamp: Date.now()
      });
      return {
        sanitized: {} as T,
        warnings,
        errors,
        isValid: false,
        originalSize,
        sanitizedSize: 0
      };
    }

    // Perform sanitization
    let sanitized: any;
    try {
      sanitized = await this.sanitizeObject(config, schema, warnings, errors, context);
    } catch (error) {
      errors.push({
        code: 'SANITIZATION_ERROR',
        message: `Sanitization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical',
        timestamp: Date.now()
      });
      return {
        sanitized: {} as T,
        warnings,
        errors,
        isValid: false,
        originalSize,
        sanitizedSize: 0
      };
    }

    const sanitizedSize = this.calculateSize(sanitized);
    const isValid = errors.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0;

    if (this.options.enableLogging) {
      console.log(`Configuration sanitization completed for ${schemaType}:`, {
        isValid,
        warnings: warnings.length,
        errors: errors.length,
        sizeReduction: originalSize - sanitizedSize
      });
    }

    return {
      sanitized: sanitized as T,
      warnings,
      errors,
      isValid,
      originalSize,
      sanitizedSize
    };
  }

  /**
   * Sanitize object according to schema
   */
  private async sanitizeObject(
    obj: any,
    schema: ConfigurationSchema,
    warnings: string[],
    errors: SecurityError[],
    context?: Environment
  ): Promise<any> {
    if (typeof obj !== 'object' || obj === null) {
      throw new Error('Configuration must be an object');
    }

    const result: any = {};

    // Validate required properties
    for (const required of schema.required) {
      if (!(required in obj)) {
        errors.push({
          code: 'MISSING_REQUIRED_PROPERTY',
          message: `Missing required property: ${required}`,
          severity: 'high',
          timestamp: Date.now()
        });
      }
    }

    // Process properties
    for (const [key, value] of Object.entries(obj)) {
      const propertySchema = schema.properties[key];
      
      if (!propertySchema) {
        if (schema.additionalProperties) {
          warnings.push(`Unknown property allowed: ${key}`);
          result[key] = await this.sanitizeValue(value, { type: 'string', sanitize: true }, warnings, errors, context);
        } else if (this.options.rejectUnknownProperties) {
          if (this.options.strictMode) {
            errors.push({
              code: 'UNKNOWN_PROPERTY',
              message: `Unknown property not allowed: ${key}`,
              severity: 'medium',
              timestamp: Date.now()
            });
          } else {
            warnings.push(`Unknown property ignored: ${key}`);
          }
        }
        continue;
      }

      try {
        result[key] = await this.sanitizeValue(value, propertySchema, warnings, errors, context);
      } catch (error) {
        errors.push({
          code: 'PROPERTY_SANITIZATION_ERROR',
          message: `Failed to sanitize property ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'medium',
          timestamp: Date.now()
        });
      }
    }

    return result;
  }

  /**
   * Sanitize individual value according to property schema
   */
  private async sanitizeValue(
    value: any,
    schema: PropertySchema,
    warnings: string[],
    errors: SecurityError[],
    context?: Environment
  ): Promise<any> {
    // Type validation
    if (!this.validateType(value, schema.type)) {
      throw new Error(`Value type mismatch. Expected ${schema.type}, got ${typeof value}`);
    }

    // Apply format-specific sanitization
    if (schema.format) {
      return this.sanitizeByFormat(value, schema.format, schema, warnings, errors, context);
    }

    // Apply type-specific sanitization
    switch (schema.type) {
      case 'string':
        return this.sanitizeString(value, schema, warnings, errors);
      
      case 'number':
        return this.sanitizeNumber(value, schema, warnings, errors);
      
      case 'boolean':
        return Boolean(value);
      
      case 'array':
        return Array.isArray(value) ? 
          Promise.all(value.map(item => this.sanitizeValue(item, { type: 'string', sanitize: true }, warnings, errors, context))) :
          [];
      
      case 'object':
        return typeof value === 'object' && value !== null ? value : {};
      
      default:
        return value;
    }
  }

  /**
   * Sanitize value by format
   */
  private sanitizeByFormat(
    value: string,
    format: string,
    schema: PropertySchema,
    warnings: string[],
    errors: SecurityError[],
    context?: Environment
  ): string {
    switch (format) {
      case 'url':
        return this.sanitizeURL(value, warnings, errors, context);
      
      case 'email':
        return this.sanitizeEmail(value, warnings, errors);
      
      case 'tenant-hash':
        return this.sanitizeTenantHash(value, warnings, errors);
      
      case 'path':
        return this.sanitizePath(value, warnings, errors);
      
      case 'uuid':
        return this.sanitizeUUID(value, warnings, errors);
      
      default:
        return this.sanitizeString(value, schema, warnings, errors);
    }
  }

  /**
   * Sanitize URL with domain validation
   */
  private sanitizeURL(
    value: string,
    warnings: string[],
    errors: SecurityError[],
    context?: Environment
  ): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    try {
      const url = new URL(value);
      
      // Protocol validation
      if (!['https:', 'http:'].includes(url.protocol)) {
        errors.push({
          code: 'INVALID_URL_PROTOCOL',
          message: `Invalid URL protocol: ${url.protocol}`,
          severity: 'high',
          timestamp: Date.now()
        });
        return '';
      }

      // HTTPS enforcement in production
      if (context === 'production' && url.protocol !== 'https:') {
        errors.push({
          code: 'INSECURE_URL_PRODUCTION',
          message: 'HTTP URLs not allowed in production',
          severity: 'critical',
          timestamp: Date.now()
        });
        return '';
      }

      // Domain validation
      const isAllowedDomain = this.options.allowedDomains.some(domain =>
        url.hostname === domain || url.hostname.endsWith('.' + domain)
      );

      if (!isAllowedDomain) {
        if (this.options.strictMode) {
          errors.push({
            code: 'UNAUTHORIZED_DOMAIN',
            message: `Domain not in allowed list: ${url.hostname}`,
            severity: 'high',
            timestamp: Date.now()
          });
          return '';
        } else {
          warnings.push(`URL domain not in allowed list: ${url.hostname}`);
        }
      }

      return url.toString();
    } catch (error) {
      errors.push({
        code: 'INVALID_URL_FORMAT',
        message: `Invalid URL format: ${value}`,
        severity: 'medium',
        timestamp: Date.now()
      });
      return '';
    }
  }

  /**
   * Sanitize email address
   */
  private sanitizeEmail(value: string, warnings: string[], errors: SecurityError[]): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push({
        code: 'INVALID_EMAIL_FORMAT',
        message: `Invalid email format: ${value}`,
        severity: 'medium',
        timestamp: Date.now()
      });
      return '';
    }

    return value.toLowerCase().trim();
  }

  /**
   * Sanitize tenant hash
   */
  private sanitizeTenantHash(value: string, warnings: string[], errors: SecurityError[]): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    // Apply the same validation as the security utils
    if (!/^[a-zA-Z0-9]{8,32}$/.test(value)) {
      errors.push({
        code: 'INVALID_TENANT_HASH',
        message: `Invalid tenant hash format: ${value}`,
        severity: 'critical',
        timestamp: Date.now()
      });
      return '';
    }

    // Check for common attack patterns
    if (value.includes('..') || value.includes('/') || value.includes('\\')) {
      errors.push({
        code: 'TENANT_HASH_ATTACK_PATTERN',
        message: 'Tenant hash contains path traversal characters',
        severity: 'critical',
        timestamp: Date.now()
      });
      return '';
    }

    return value;
  }

  /**
   * Sanitize file path
   */
  private sanitizePath(value: string, warnings: string[], errors: SecurityError[]): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    // Remove path traversal attempts
    let sanitized = value.replace(/\.\./g, '');
    
    // Remove multiple slashes
    sanitized = sanitized.replace(/\/+/g, '/');
    
    // Remove leading/trailing slashes
    sanitized = sanitized.replace(/^\/+|\/+$/g, '');
    
    // Only allow safe characters
    sanitized = sanitized.replace(/[^a-zA-Z0-9/._-]/g, '');

    if (sanitized !== value) {
      warnings.push(`Path was sanitized: ${value} -> ${sanitized}`);
    }

    return sanitized;
  }

  /**
   * Sanitize UUID
   */
  private sanitizeUUID(value: string, warnings: string[], errors: SecurityError[]): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      errors.push({
        code: 'INVALID_UUID_FORMAT',
        message: `Invalid UUID format: ${value}`,
        severity: 'medium',
        timestamp: Date.now()
      });
      return '';
    }

    return value.toLowerCase();
  }

  /**
   * Sanitize string value
   */
  private sanitizeString(
    value: string,
    schema: PropertySchema,
    warnings: string[],
    errors: SecurityError[]
  ): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    let sanitized = value;

    // Length validation
    if (schema.minLength && sanitized.length < schema.minLength) {
      errors.push({
        code: 'STRING_TOO_SHORT',
        message: `String length ${sanitized.length} below minimum ${schema.minLength}`,
        severity: 'medium',
        timestamp: Date.now()
      });
    }

    if (schema.maxLength && sanitized.length > schema.maxLength) {
      sanitized = sanitized.substring(0, schema.maxLength);
      warnings.push(`String truncated to ${schema.maxLength} characters`);
    }

    // Pattern validation
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(sanitized)) {
        errors.push({
          code: 'STRING_PATTERN_MISMATCH',
          message: `String does not match required pattern: ${schema.pattern}`,
          severity: 'medium',
          timestamp: Date.now()
        });
        return '';
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(sanitized)) {
      errors.push({
        code: 'STRING_NOT_IN_ENUM',
        message: `String not in allowed values: ${schema.enum.join(', ')}`,
        severity: 'medium',
        timestamp: Date.now()
      });
      return '';
    }

    // HTML sanitization
    if (schema.sanitize) {
      const originalLength = sanitized.length;
      
      if (schema.allowHTML) {
        // Use DOMPurify for HTML content
        sanitized = this.sanitizeHTML(sanitized);
      } else {
        // Remove all HTML for plain text
        sanitized = sanitized.replace(/<[^>]*>/g, '');
        // Remove control characters
        sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
      }

      if (sanitized.length !== originalLength) {
        warnings.push('String content was sanitized');
      }
    }

    return sanitized.trim();
  }

  /**
   * Sanitize number value
   */
  private sanitizeNumber(
    value: number,
    schema: PropertySchema,
    warnings: string[],
    errors: SecurityError[]
  ): number {
    const num = Number(value);

    if (isNaN(num)) {
      errors.push({
        code: 'INVALID_NUMBER',
        message: `Invalid number value: ${value}`,
        severity: 'medium',
        timestamp: Date.now()
      });
      return 0;
    }

    if (schema.minimum !== undefined && num < schema.minimum) {
      errors.push({
        code: 'NUMBER_BELOW_MINIMUM',
        message: `Number ${num} below minimum ${schema.minimum}`,
        severity: 'medium',
        timestamp: Date.now()
      });
      return schema.minimum;
    }

    if (schema.maximum !== undefined && num > schema.maximum) {
      warnings.push(`Number ${num} clamped to maximum ${schema.maximum}`);
      return schema.maximum;
    }

    return num;
  }

  /**
   * Validate type compatibility
   */
  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' || !isNaN(Number(value));
      case 'boolean':
        return typeof value === 'boolean' || value === 'true' || value === 'false';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Calculate object size for validation
   */
  private calculateSize(obj: any): number {
    return JSON.stringify(obj).length;
  }

  /**
   * Sanitize HTML content using DOMPurify
   */
  private sanitizeHTML(html: string): string {
    // This would use DOMPurify in browser environment
    // For now, simple HTML removal
    return html.replace(/<script[^>]*>.*?<\/script>/gi, '')
               .replace(/<[^>]*>/g, '');
  }

  /**
   * Register custom schema
   */
  registerSchema(name: string, schema: ConfigurationSchema): void {
    this.schemas.set(name, schema);
  }

  /**
   * Get available schemas
   */
  getAvailableSchemas(): string[] {
    return Array.from(this.schemas.keys());
  }
}

/* ===== FACTORY AND EXPORTS ===== */

export const createConfigurationSanitizer = (
  options?: Partial<ConfigSanitizationOptions>
): ConfigurationSanitizer => {
  return new ConfigurationSanitizer(options);
};

export const defaultConfigSanitizer = createConfigurationSanitizer();

export default ConfigurationSanitizer;