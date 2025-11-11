/**
 * Security Type Definitions
 *
 * Branded types and interfaces for security-related functionality
 * in the Picasso chat widget system.
 */

/* ===== ENVIRONMENT TYPES ===== */

/**
 * Supported deployment environments
 */
export type Environment = 'development' | 'staging' | 'production';

/* ===== BRANDED TYPES FOR SECURITY ===== */

/**
 * Validated tenant hash - only created through validation process
 * SECURITY: Prevents bypassing tenant validation
 */
export type ValidTenantHash = string & { readonly __brand: 'ValidTenantHash' };

/**
 * Secure URL - only created through URL validation
 * SECURITY: Prevents URL injection attacks
 */
export type SecureURL = string & { readonly __brand: 'SecureURL' };

/* ===== SECURITY ERROR TYPES ===== */

/**
 * Security error severity levels
 */
export type SecurityErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Security error definition
 */
export interface SecurityError {
  readonly code: string;
  readonly message: string;
  readonly severity: SecurityErrorSeverity;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;
}

/* ===== ENVIRONMENT SECURITY CONFIGURATION ===== */

/**
 * Security configuration per environment
 */
export interface EnvironmentSecurityConfig {
  readonly enforceHTTPS: boolean;
  readonly allowInsecure: boolean;
  readonly corsOrigins: readonly string[];
  readonly frameAncestors: readonly string[];
  readonly cookieSettings: {
    readonly secure: boolean;
    readonly sameSite: 'strict' | 'lax' | 'none';
    readonly httpOnly: boolean;
  };
  readonly contentSecurityPolicy?: {
    readonly directives: Record<string, string[]>;
  };
}

/* ===== UTILITY FUNCTIONS ===== */

/**
 * Create a validated tenant hash
 * @internal Use only after proper validation
 */
export function createValidTenantHash(hash: string): ValidTenantHash {
  return hash as ValidTenantHash;
}

/**
 * Create a secure URL
 * @internal Use only after proper validation
 */
export function createSecureURL(url: string): SecureURL {
  return url as SecureURL;
}

/**
 * Check if a string is a valid tenant hash format
 */
export function isValidTenantHashFormat(hash: string): boolean {
  // Tenant hash format: 14 character alphanumeric
  return /^[a-z0-9]{14}$/.test(hash);
}

/**
 * Create a security error
 */
export function createSecurityError(
  code: string,
  message: string,
  severity: SecurityErrorSeverity,
  details?: Record<string, unknown>
): SecurityError {
  return {
    code,
    message,
    severity,
    timestamp: Date.now(),
    details
  };
}
