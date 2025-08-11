/**
 * Security Type Definitions for Picasso Chat Widget
 * 
 * Comprehensive type safety for all security-critical operations
 * Enforces compile-time validation of security constraints
 */

/* ===== BRANDED TYPES FOR SECURITY ===== */

/**
 * Validated tenant hash - only created through validation function
 * SECURITY: Prevents using unvalidated strings as tenant hashes
 */
export type ValidTenantHash = string & { readonly __brand: 'ValidTenantHash' };

/**
 * Sanitized HTML content - safe for display
 * SECURITY: Only created through sanitization functions
 */
export type SafeHTML = string & { readonly __brand: 'SafeHTML' };

/**
 * Safe content - general purpose sanitized content
 * SECURITY: Used for all sanitized content types
 */
export type SafeContent = string & { readonly __brand: 'SafeContent' };

/**
 * Sanitized text content - XSS-safe
 * SECURITY: Stripped of dangerous characters and HTML
 */
export type SafeText = string & { readonly __brand: 'SafeText' };

/**
 * Validated secure URL - HTTPS only in production
 * SECURITY: Validated against allowlist and protocol requirements
 */
export type SecureURL = string & { readonly __brand: 'SecureURL' };

/**
 * Sanitized file path - directory traversal safe
 * SECURITY: Cleaned of path traversal attempts
 */
export type SafeFilePath = string & { readonly __brand: 'SafeFilePath' };

/**
 * Secure nonce - cryptographically generated
 * SECURITY: For CSP and other security headers
 */
export type SecureNonce = string & { readonly __brand: 'SecureNonce' };

/* ===== INPUT VALIDATION TYPES ===== */

/**
 * Supported input types for validation
 */
export type InputType = 'text' | 'email' | 'url' | 'number' | 'filename' | 'json';

/**
 * Content types for widget validation
 */
export type ContentType = 'message' | 'callout' | 'config' | 'system';

/**
 * Validation result for input processing
 */
export interface ValidationResult<T = string> {
  readonly isValid: boolean;
  readonly sanitizedValue: T;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Security validation options
 */
export interface SecurityValidationOptions {
  readonly allowHTML?: boolean;
  readonly allowedTags?: readonly string[];
  readonly allowedAttributes?: readonly string[];
  readonly maxLength?: number;
  readonly requireHTTPS?: boolean;
  readonly allowedDomains?: readonly string[];
}

/* ===== SANITIZATION OPTIONS ===== */

/**
 * HTML sanitization configuration
 */
export interface HTMLSanitizationConfig {
  readonly ALLOWED_TAGS: readonly string[];
  readonly ALLOWED_ATTR: readonly string[];
  readonly ALLOWED_URI_REGEXP: RegExp;
  readonly FORBID_TAGS: readonly string[];
  readonly FORBID_ATTR: readonly string[];
  readonly KEEP_CONTENT: boolean;
  readonly RETURN_DOM: boolean;
  readonly RETURN_DOM_FRAGMENT: boolean;
  readonly RETURN_DOM_IMPORT: boolean;
  readonly RETURN_TRUSTED_TYPE: boolean;
  readonly SANITIZE_DOM: boolean;
  readonly WHOLE_DOCUMENT: boolean;
}

/**
 * Predefined sanitization levels
 */
export type SanitizationLevel = 'strict' | 'moderate' | 'permissive';

/**
 * Sanitization level configurations
 */
export type SanitizationLevelConfig = {
  readonly [K in SanitizationLevel]: Partial<HTMLSanitizationConfig>;
};

/* ===== FILE VALIDATION TYPES ===== */

/**
 * Allowed file MIME types
 */
export type AllowedMimeType = 
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/jpg'
  | 'image/png'
  | 'image/gif'
  | 'text/plain'
  | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * File extension validation
 */
export type AllowedFileExtension = 
  | '.pdf'
  | '.jpg'
  | '.jpeg'
  | '.png'
  | '.gif'
  | '.txt'
  | '.doc'
  | '.docx';

/**
 * Dangerous file extensions to block
 */
export type DangerousFileExtension = 
  | '.exe'
  | '.sh'
  | '.bat'
  | '.php'
  | '.js'
  | '.html'
  | '.htm'
  | '.jsp'
  | '.asp'
  | '.aspx'
  | '.py'
  | '.rb'
  | '.pl'
  | '.jar'
  | '.zip'
  | '.rar';

/**
 * File validation constraints
 */
export interface FileValidationConstraints {
  readonly maxSize: number;
  readonly allowedTypes: readonly AllowedMimeType[];
  readonly allowedExtensions: readonly AllowedFileExtension[];
  readonly blockedExtensions: readonly DangerousFileExtension[];
  readonly requireValidName: boolean;
}

/**
 * File validation result
 */
export interface FileValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly sanitizedName?: string | undefined;
  readonly detectedType?: string | undefined;
}

/* ===== ENVIRONMENT SECURITY ===== */

/**
 * Environment types
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * Security configuration for environments
 */
export type EnvironmentSecurityConfig = {
  readonly environment: Environment;
  readonly requireHTTPS: boolean;
  readonly allowInsecureRequests: boolean;
  readonly enableDebugLogging: boolean;
  readonly enableCSP: boolean;
  readonly strictCSP: boolean;
  readonly allowedOrigins: readonly string[];
  readonly cookieSecurity: {
    readonly secure: boolean;
    readonly sameSite: 'strict' | 'lax' | 'none';
    readonly httpOnly: boolean;
  };
};

/**
 * Security validation errors
 */
export interface SecurityError {
  readonly code: string;
  readonly message: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;
}

/* ===== CONTENT SECURITY POLICY ===== */

/**
 * CSP directive types
 */
export type CSPDirective = 
  | 'default-src'
  | 'script-src'
  | 'style-src'
  | 'img-src'
  | 'font-src'
  | 'connect-src'
  | 'media-src'
  | 'object-src'
  | 'child-src'
  | 'frame-src'
  | 'worker-src'
  | 'frame-ancestors'
  | 'form-action'
  | 'base-uri'
  | 'upgrade-insecure-requests';

/**
 * CSP source values
 */
export type CSPSource = 
  | "'self'"
  | "'none'"
  | "'unsafe-inline'"
  | "'unsafe-eval'"
  | "'strict-dynamic'"
  | string; // For nonces, hashes, and URLs

/**
 * Content Security Policy configuration
 */
export type CSPConfig = {
  readonly [K in CSPDirective]?: readonly CSPSource[];
};

/* ===== XSS PROTECTION ===== */

/**
 * XSS attack patterns to detect
 */
export interface XSSPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
}

/**
 * XSS detection result
 */
export interface XSSDetectionResult {
  readonly hasXSS: boolean;
  readonly detectedPatterns: readonly XSSPattern[];
  readonly cleanedContent: string;
  readonly confidence: number; // 0-1 scale
}

/* ===== INJECTION PROTECTION ===== */

/**
 * Injection attack types
 */
export type InjectionType = 
  | 'sql'
  | 'javascript'
  | 'html'
  | 'css'
  | 'ldap'
  | 'xpath'
  | 'command'
  | 'template';

/**
 * Injection pattern definition
 */
export interface InjectionPattern {
  readonly type: InjectionType;
  readonly pattern: RegExp;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
}

/**
 * Injection detection result
 */
export interface InjectionDetectionResult {
  readonly hasInjection: boolean;
  readonly detectedTypes: readonly InjectionType[];
  readonly patterns: readonly InjectionPattern[];
  readonly sanitizedInput: string;
}

/* ===== SECURITY VALIDATION INTERFACE ===== */

/**
 * Main security validation interface
 */
export interface SecurityValidator {
  /**
   * Validate tenant hash format and security
   */
  validateTenantHash(hash: string): hash is ValidTenantHash;
  
  /**
   * Sanitize HTML content with security options
   */
  sanitizeHTML(html: string, options?: SecurityValidationOptions): SafeHTML;
  
  /**
   * Sanitize text content
   */
  sanitizeText(text: string, options?: SecurityValidationOptions): SafeText;
  
  /**
   * Validate and secure URLs
   */
  validateURL(url: string, options?: SecurityValidationOptions): SecureURL | null;
  
  /**
   * Sanitize file paths
   */
  sanitizeFilePath(path: string): SafeFilePath;
  
  /**
   * Generate secure nonce
   */
  generateNonce(): SecureNonce;
  
  /**
   * Validate file attachments
   */
  validateFile(file: File, constraints?: FileValidationConstraints): FileValidationResult;
  
  /**
   * Detect XSS patterns
   */
  detectXSS(content: string): XSSDetectionResult;
  
  /**
   * Detect injection attempts
   */
  detectInjection(input: string): InjectionDetectionResult;
  
  /**
   * Validate configuration security
   */
  validateConfigSecurity(config: Record<string, unknown>, environment: Environment): readonly SecurityError[];
}

/* ===== SECURITY CONTEXT ===== */

/**
 * Security context for the application
 */
export interface SecurityContext {
  readonly environment: Environment;
  readonly isSecureContext: boolean;
  readonly tenantHash: ValidTenantHash | null;
  readonly nonce: SecureNonce | null;
  readonly cspConfig: CSPConfig;
  readonly validationLevel: SanitizationLevel;
}

/* ===== ERROR SANITIZATION ===== */

/**
 * Sanitized error for logging
 */
export interface SanitizedError {
  readonly message: string;
  readonly stack?: string | undefined;
  readonly timestamp: number;
  readonly sanitized: true;
  readonly originalType?: string | undefined;
}

/* ===== TYPE GUARDS ===== */

/**
 * Type guard for valid tenant hash
 */
export function isValidTenantHash(value: string): value is ValidTenantHash {
  return /^[a-zA-Z0-9]{8,32}$/.test(value) && 
         !value.includes('..') && 
         !value.includes('/') && 
         !value.includes('\\');
}

/**
 * Type guard for safe HTML
 */
export function isSafeHTML(value: string): value is SafeHTML {
  // This would be set by the sanitization function
  return (value as SafeHTML).__brand === 'SafeHTML';
}

/**
 * Type guard for secure URLs
 */
export function isSecureURL(value: string): value is SecureURL {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || 
           (url.protocol === 'http:' && url.hostname === 'localhost');
  } catch {
    return false;
  }
}

/**
 * Type guard for allowed file types
 */
export function isAllowedMimeType(type: string): type is AllowedMimeType {
  const allowedTypes: readonly string[] = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  return allowedTypes.includes(type);
}

/* ===== CONSTANTS ===== */

/**
 * Default file validation constraints
 */
export const DEFAULT_FILE_CONSTRAINTS: FileValidationConstraints = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.doc', '.docx'],
  blockedExtensions: ['.exe', '.sh', '.bat', '.php', '.js', '.html', '.htm', '.jsp', '.asp', '.aspx'],
  requireValidName: true
} as const;

/**
 * Default sanitization levels
 */
export const SANITIZATION_LEVELS = {
  strict: {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em'],
    ALLOWED_ATTR: ['class'],
    KEEP_CONTENT: true
  },
  moderate: {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['class', 'href', 'target'],
    KEEP_CONTENT: true
  },
  permissive: {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code'
    ],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel', 'alt', 'title'],
    KEEP_CONTENT: true
  }
} as const satisfies SanitizationLevelConfig;