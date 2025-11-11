/**
 * Configuration Type Definitions
 *
 * Complete type definitions for all configuration types used in the
 * Picasso chat widget system.
 */

import type { Environment, ValidTenantHash, EnvironmentSecurityConfig } from './security';

/* ===== CONFIGURATION VALIDATION ===== */

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/* ===== ENVIRONMENT CONFIGURATION ===== */

/**
 * API configuration
 */
export interface APIConfig {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly retries: number;
  readonly rateLimit: {
    readonly requests: number;
    readonly window: number; // milliseconds
  };
  readonly headers: Record<string, string>;
}

/**
 * CDN configuration
 */
export interface CDNConfig {
  readonly assetsUrl: string;
  readonly version: string;
  readonly cacheBusting: boolean;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly enableConsole: boolean;
  readonly enableRemote: boolean;
  readonly sanitizeErrors: boolean;
  readonly maxLogSize: number;
}

/**
 * Performance configuration
 */
export interface PerformanceConfig {
  readonly enableMetrics: boolean;
  readonly enableTracing: boolean;
  readonly sampleRate: number;
  readonly maxBundleSize: number;
  readonly lazyLoading: boolean;
  readonly cacheStrategy: 'memory' | 'localStorage' | 'sessionStorage';
}

/**
 * Feature flags configuration
 */
export interface FeaturesConfig {
  readonly streamingEnabled: boolean;
  readonly fileUploadsEnabled: boolean;
  readonly darkModeEnabled: boolean;
  readonly mobileOptimized: boolean;
  readonly a11yEnhanced: boolean;
  readonly analyticsEnabled: boolean;
  readonly errorReportingEnabled: boolean;
  readonly performanceMonitoring: boolean;
  readonly experimentalFeatures: boolean;
}

/**
 * Complete environment configuration
 */
export interface EnvironmentConfig {
  readonly environment: Environment;
  readonly version: string;
  readonly buildTimestamp: number;
  readonly api: APIConfig;
  readonly cdn: CDNConfig;
  readonly security: EnvironmentSecurityConfig;
  readonly logging: LoggingConfig;
  readonly performance: PerformanceConfig;
  readonly features: FeaturesConfig;
}

/* ===== WIDGET CONFIGURATION ===== */

/**
 * Theme configuration
 */
export interface ThemeConfig {
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly borderRadius: string;
  readonly fontFamily: string;
  readonly fontSize: string;
}

/**
 * Localization configuration
 */
export interface LocalizationConfig {
  readonly defaultLanguage: string;
  readonly supportedLanguages: readonly string[];
  readonly autoDetect: boolean;
  readonly fallbackLanguage: string;
  readonly rtlSupport: boolean;
  readonly dateFormat: string;
  readonly timeFormat: '12h' | '24h';
  readonly numberFormat: string;
}

/**
 * Integration configuration
 */
export interface IntegrationConfig {
  readonly analytics?: {
    readonly provider: string;
    readonly trackingId: string;
    readonly enabledEvents: readonly string[];
  };
  readonly errorReporting?: {
    readonly provider: string;
    readonly apiKey: string;
    readonly environment: Environment;
  };
  readonly customIntegrations?: Record<string, unknown>;
}

/**
 * Widget-specific configuration
 */
export interface WidgetConfig {
  readonly tenantHash: ValidTenantHash;
  readonly welcomeMessage?: string;
  readonly placeholder?: string;
  readonly position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  readonly zIndex?: number;
  readonly theme: ThemeConfig;
}

/* ===== RUNTIME CONFIGURATION ===== */

/**
 * Complete runtime configuration combining environment and widget settings
 */
export interface RuntimeConfig {
  readonly tenantHash: ValidTenantHash;
  readonly widget: WidgetConfig;
  readonly theme: ThemeConfig;
  readonly localization: LocalizationConfig;
  readonly integrations: IntegrationConfig;
  readonly lastUpdated: number;
  readonly version: string;
}

/* ===== DEFAULT CONFIGURATIONS ===== */

/**
 * Default environment configuration
 */
export const DEFAULT_ENVIRONMENT_CONFIG: EnvironmentConfig = {
  environment: 'production',
  version: '2.0.0',
  buildTimestamp: Date.now(),
  api: {
    baseUrl: 'https://chat.myrecruiter.ai',
    timeout: 10000,
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
    enforceHTTPS: true,
    allowInsecure: false,
    corsOrigins: ['https://chat.myrecruiter.ai'],
    frameAncestors: ["'self'"],
    cookieSettings: {
      secure: true,
      sameSite: 'strict',
      httpOnly: true
    }
  },
  logging: {
    level: 'error',
    enableConsole: false,
    enableRemote: true,
    sanitizeErrors: true,
    maxLogSize: 1048576
  },
  performance: {
    enableMetrics: true,
    enableTracing: false,
    sampleRate: 0.1,
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
    analyticsEnabled: true,
    errorReportingEnabled: true,
    performanceMonitoring: true,
    experimentalFeatures: false
  }
};

/**
 * Default widget configuration
 */
export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  tenantHash: 'my87674d777bf9' as ValidTenantHash, // Default fallback
  welcomeMessage: 'Welcome! How can I help you today?',
  placeholder: 'Type your message...',
  position: 'bottom-right',
  zIndex: 9999,
  theme: {
    primaryColor: '#007bff',
    secondaryColor: '#6c757d',
    backgroundColor: '#ffffff',
    textColor: '#333333',
    borderRadius: '8px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px'
  }
};

/**
 * Default theme configuration
 */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  primaryColor: '#007bff',
  secondaryColor: '#6c757d',
  backgroundColor: '#ffffff',
  textColor: '#333333',
  borderRadius: '8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px'
};
