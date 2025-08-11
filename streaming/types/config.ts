/**
 * Configuration Type Definitions for Picasso Chat Widget
 * 
 * Type definitions for environment configuration, feature flags,
 * and runtime configuration options with security validation
 */

import type { SecureURL, ValidTenantHash, Environment } from './security';

/* ===== ENVIRONMENT CONFIGURATION ===== */

/**
 * Build environment types
 */
export type BuildEnvironment = 'development' | 'staging' | 'production';

/**
 * API environment configuration
 */
export interface APIEnvironmentConfig {
  readonly baseUrl: SecureURL;
  readonly timeout: number;
  readonly retries: number;
  readonly rateLimit: {
    readonly requests: number;
    readonly window: number; // in milliseconds
  };
  readonly headers: Record<string, string>;
}

/**
 * CDN configuration
 */
export interface CDNConfig {
  readonly assetsUrl: SecureURL;
  readonly fontsUrl?: SecureURL;
  readonly imagesUrl?: SecureURL;
  readonly version: string;
  readonly cacheBusting: boolean;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  readonly enforceHTTPS: boolean;
  readonly allowInsecure: boolean;
  readonly corsOrigins: readonly string[];
  readonly cspNonce?: string;
  readonly frameAncestors: readonly string[];
  readonly cookieSettings: {
    readonly secure: boolean;
    readonly sameSite: 'strict' | 'lax' | 'none';
    readonly httpOnly: boolean;
  };
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  readonly level: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  readonly enableConsole: boolean;
  readonly enableRemote: boolean;
  readonly remoteEndpoint?: SecureURL;
  readonly sanitizeErrors: boolean;
  readonly maxLogSize: number;
}

/**
 * Performance configuration
 */
export interface PerformanceConfig {
  readonly enableMetrics: boolean;
  readonly enableTracing: boolean;
  readonly sampleRate: number; // 0-1
  readonly metricsEndpoint?: SecureURL;
  readonly maxBundleSize: number;
  readonly lazyLoading: boolean;
  readonly cacheStrategy: 'memory' | 'localStorage' | 'sessionStorage' | 'none';
}

/**
 * Complete environment configuration
 */
export interface EnvironmentConfig {
  readonly environment: BuildEnvironment;
  readonly version: string;
  readonly buildTimestamp: number;
  readonly api: APIEnvironmentConfig;
  readonly cdn: CDNConfig;
  readonly security: SecurityConfig;
  readonly logging: LoggingConfig;
  readonly performance: PerformanceConfig;
  readonly features: GlobalFeatureFlags;
}

/* ===== FEATURE FLAGS ===== */

/**
 * Global feature flags that apply across all tenants
 */
export interface GlobalFeatureFlags {
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
 * Tenant-specific feature flags
 */
export interface TenantFeatureFlags {
  readonly chatHistoryEnabled: boolean;
  readonly typingIndicatorEnabled: boolean;
  readonly readReceiptsEnabled: boolean;
  readonly messageReactions: boolean;
  readonly customBranding: boolean;
  readonly whiteLabeling: boolean;
  readonly apiIntegrations: boolean;
  readonly webhooks: boolean;
  readonly customCSS: boolean;
  readonly advancedSecurity: boolean;
}

/**
 * Experimental features (beta/alpha)
 */
export interface ExperimentalFeatures {
  readonly voiceMessages: boolean;
  readonly videoChat: boolean;
  readonly screenSharing: boolean;
  readonly botPersonality: boolean;
  readonly multiLanguage: boolean;
  readonly aiSummary: boolean;
  readonly sentimentAnalysis: boolean;
  readonly autoTranslation: boolean;
}

/* ===== WIDGET CONFIGURATION ===== */

/**
 * Widget display configuration
 */
export interface WidgetDisplayConfig {
  readonly position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'custom';
  readonly customPosition?: {
    readonly top?: string;
    readonly bottom?: string;
    readonly left?: string;
    readonly right?: string;
  };
  readonly size: 'small' | 'medium' | 'large' | 'custom';
  readonly customSize?: {
    readonly width: number;
    readonly height: number;
    readonly minWidth?: number;
    readonly minHeight?: number;
    readonly maxWidth?: number;
    readonly maxHeight?: number;
  };
  readonly zIndex: number;
  readonly borderRadius: number;
  readonly shadow: boolean;
  readonly backdrop: boolean;
}

/**
 * Widget behavior configuration
 */
export interface WidgetBehaviorConfig {
  readonly autoOpen: boolean;
  readonly openDelay: number;
  readonly closeOnOutsideClick: boolean;
  readonly closeOnEscape: boolean;
  readonly draggable: boolean;
  readonly resizable: boolean;
  readonly minimizable: boolean;
  readonly persistState: boolean;
  readonly sessionTimeout: number; // in milliseconds
  readonly idleTimeout: number; // in milliseconds
}

/**
 * Animation configuration
 */
export interface AnimationConfig {
  readonly enabled: boolean;
  readonly duration: 'fast' | 'normal' | 'slow' | number;
  readonly easing: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear';
  readonly openAnimation: 'fade' | 'slide' | 'scale' | 'bounce' | 'none';
  readonly closeAnimation: 'fade' | 'slide' | 'scale' | 'bounce' | 'none';
  readonly messageAnimation: 'fade' | 'slide' | 'typewriter' | 'none';
  readonly reducedMotion: boolean;
}

/**
 * Complete widget configuration
 */
export interface WidgetConfig {
  readonly tenantHash: ValidTenantHash;
  readonly display: WidgetDisplayConfig;
  readonly behavior: WidgetBehaviorConfig;
  readonly animation: AnimationConfig;
  readonly theme: ThemeConfig;
  readonly features: TenantFeatureFlags;
  readonly experimental?: ExperimentalFeatures;
}

/* ===== THEME CONFIGURATION ===== */

/**
 * Color scheme configuration
 */
export interface ColorScheme {
  readonly primary: string;
  readonly primaryLight: string;
  readonly primaryDark: string;
  readonly secondary: string;
  readonly secondaryLight: string;
  readonly secondaryDark: string;
  readonly accent: string;
  readonly background: string;
  readonly surface: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textDisabled: string;
  readonly border: string;
  readonly borderLight: string;
  readonly error: string;
  readonly warning: string;
  readonly success: string;
  readonly info: string;
}

/**
 * Typography configuration
 */
export interface TypographyConfig {
  readonly fontFamily: string;
  readonly fontFamilyMonospace?: string;
  readonly fontSize: {
    readonly xs: string;
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
    readonly xxl: string;
  };
  readonly fontWeight: {
    readonly light: number;
    readonly normal: number;
    readonly medium: number;
    readonly semibold: number;
    readonly bold: number;
  };
  readonly lineHeight: {
    readonly tight: number;
    readonly normal: number;
    readonly relaxed: number;
  };
  readonly letterSpacing?: {
    readonly tight: string;
    readonly normal: string;
    readonly wide: string;
  };
}

/**
 * Spacing configuration
 */
export interface SpacingConfig {
  readonly unit: number; // base unit in pixels
  readonly scale: readonly number[]; // multipliers for different sizes
  readonly padding: {
    readonly xs: string;
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
  };
  readonly margin: {
    readonly xs: string;
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
  };
}

/**
 * Shadow configuration
 */
export interface ShadowConfig {
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly xl: string;
  readonly inner: string;
  readonly none: string;
}

/**
 * Border configuration
 */
export interface BorderConfig {
  readonly width: {
    readonly thin: string;
    readonly normal: string;
    readonly thick: string;
  };
  readonly radius: {
    readonly none: string;
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly full: string;
  };
  readonly style: 'solid' | 'dashed' | 'dotted';
}

/**
 * Transition configuration
 */
export interface TransitionConfig {
  readonly duration: {
    readonly fast: string;
    readonly normal: string;
    readonly slow: string;
  };
  readonly easing: {
    readonly ease: string;
    readonly easeIn: string;
    readonly easeOut: string;
    readonly easeInOut: string;
  };
  readonly property: {
    readonly all: string;
    readonly colors: string;
    readonly transform: string;
    readonly opacity: string;
  };
}

/**
 * Complete theme configuration
 */
export interface ThemeConfig {
  readonly name: string;
  readonly mode: 'light' | 'dark' | 'auto';
  readonly colors: ColorScheme;
  readonly typography: TypographyConfig;
  readonly spacing: SpacingConfig;
  readonly shadows: ShadowConfig;
  readonly borders: BorderConfig;
  readonly transitions: TransitionConfig;
  readonly customCSS?: string;
  readonly cssVariables?: Record<string, string>;
}

/* ===== LOCALIZATION CONFIGURATION ===== */

/**
 * Supported languages
 */
export type SupportedLanguage = 
  | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'zh' | 'ja' | 'ko';

/**
 * Localization configuration
 */
export interface LocalizationConfig {
  readonly defaultLanguage: SupportedLanguage;
  readonly supportedLanguages: readonly SupportedLanguage[];
  readonly autoDetect: boolean;
  readonly fallbackLanguage: SupportedLanguage;
  readonly rtlSupport: boolean;
  readonly dateFormat: string;
  readonly timeFormat: '12h' | '24h';
  readonly numberFormat: 'US' | 'EU' | 'custom';
  readonly currency?: string;
}

/* ===== ANALYTICS CONFIGURATION ===== */

/**
 * Analytics providers
 */
export type AnalyticsProvider = 'google' | 'mixpanel' | 'amplitude' | 'custom';

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  readonly enabled: boolean;
  readonly provider: AnalyticsProvider;
  readonly trackingId?: string;
  readonly apiKey?: string;
  readonly endpoint?: SecureURL;
  readonly events: {
    readonly pageViews: boolean;
    readonly interactions: boolean;
    readonly errors: boolean;
    readonly performance: boolean;
    readonly customEvents: boolean;
  };
  readonly privacy: {
    readonly anonymizeIP: boolean;
    readonly respectDNT: boolean;
    readonly cookieConsent: boolean;
  };
}

/* ===== INTEGRATION CONFIGURATION ===== */

/**
 * Third-party integrations
 */
export interface IntegrationConfig {
  readonly analytics?: AnalyticsConfig;
  readonly errorReporting?: {
    readonly enabled: boolean;
    readonly service: 'sentry' | 'bugsnag' | 'custom';
    readonly dsn?: string;
    readonly environment: Environment;
    readonly release?: string;
  };
  readonly monitoring?: {
    readonly enabled: boolean;
    readonly service: 'datadog' | 'newrelic' | 'custom';
    readonly apiKey?: string;
    readonly endpoint?: SecureURL;
  };
  readonly webhooks?: {
    readonly enabled: boolean;
    readonly endpoints: readonly SecureURL[];
    readonly events: readonly string[];
    readonly retryAttempts: number;
  };
}

/* ===== RUNTIME CONFIGURATION ===== */

/**
 * Runtime configuration that can be updated dynamically
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

/* ===== CONFIGURATION VALIDATION ===== */

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly sanitizedConfig?: RuntimeConfig;
}

/**
 * Configuration validator interface
 */
export interface ConfigValidator {
  validateEnvironmentConfig(config: EnvironmentConfig): ConfigValidationResult;
  validateWidgetConfig(config: WidgetConfig): ConfigValidationResult;
  validateThemeConfig(config: ThemeConfig): ConfigValidationResult;
  validateRuntimeConfig(config: RuntimeConfig): ConfigValidationResult;
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
    baseUrl: 'https://chat.myrecruiter.ai' as SecureURL,
    timeout: 30000,
    retries: 3,
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
    assetsUrl: 'https://chat.myrecruiter.ai/assets' as SecureURL,
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
    maxLogSize: 1024 * 1024 // 1MB
  },
  performance: {
    enableMetrics: true,
    enableTracing: false,
    sampleRate: 0.1,
    maxBundleSize: 512 * 1024, // 512KB
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
} as const;

/**
 * Default widget configuration
 */
export const DEFAULT_WIDGET_CONFIG: Omit<WidgetConfig, 'tenantHash'> = {
  display: {
    position: 'bottom-right',
    size: 'medium',
    zIndex: 9999,
    borderRadius: 12,
    shadow: true,
    backdrop: false
  },
  behavior: {
    autoOpen: false,
    openDelay: 1000,
    closeOnOutsideClick: true,
    closeOnEscape: true,
    draggable: false,
    resizable: false,
    minimizable: true,
    persistState: true,
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    idleTimeout: 10 * 60 * 1000 // 10 minutes
  },
  animation: {
    enabled: true,
    duration: 'normal',
    easing: 'ease-in-out',
    openAnimation: 'scale',
    closeAnimation: 'scale',
    messageAnimation: 'slide',
    reducedMotion: false
  },
  theme: {
    name: 'default',
    mode: 'light',
    colors: {
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
    },
    typography: {
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
    },
    spacing: {
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
    },
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
      inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
      none: 'none'
    },
    borders: {
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
    },
    transitions: {
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
    }
  },
  features: {
    chatHistoryEnabled: true,
    typingIndicatorEnabled: true,
    readReceiptsEnabled: false,
    messageReactions: false,
    customBranding: true,
    whiteLabeling: false,
    apiIntegrations: true,
    webhooks: false,
    customCSS: false,
    advancedSecurity: true
  }
} as const;