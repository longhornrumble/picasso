/**
 * Environment Configuration for Picasso Chat Widget
 * 
 * Centralized configuration for all URLs and environment-specific settings.
 * Supports development, staging, and production environments with enhanced validation.
 */

// Validation utilities
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const validateEnvironmentConfig = (env, config) => {
  const required = ['API_BASE_URL', 'CHAT_API_URL', 'WIDGET_DOMAIN'];
  const missing = required.filter(key => !config[key] || !isValidUrl(config[key]));
  
  if (missing.length > 0) {
    console.error(`❌ Invalid ${env} environment config. Missing/invalid URLs:`, missing);
    return false;
  }
  return true;
};

// Environment detection with enhanced browser compatibility
const getEnvironment = () => {
  // Check for explicit environment override via URL params
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const envOverride = urlParams.get('picasso-env');
      if (envOverride && ['development', 'staging', 'production'].includes(envOverride)) {
        console.log(`🔧 Environment override via URL param: ${envOverride}`);
        return envOverride;
      }
      
      // Check for dev mode flag via multiple methods
      const devMode = urlParams.get('picasso-dev') === 'true' ||
                     document.currentScript?.getAttribute('data-dev') === 'true' ||
                     document.querySelector('script[src*="widget.js"][data-dev="true"]') ||
                     window.PICASSO_DEV_MODE === true;
      
      if (devMode) {
        console.log('🛠️ Development mode detected via flags');
        return 'development';
      }

      // Auto-detect based on hostname for convenience
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
        console.log('🏠 Local development detected via hostname');
        return 'development';
      }
      
      if (hostname.includes('staging') || hostname.includes('dev')) {
        console.log('🧪 Staging environment detected via hostname');
        return 'staging';
      }
    } catch (error) {
      console.warn('⚠️ Error detecting environment from browser context:', error);
    }
  }
  
  // Check NODE_ENV for build-time environment (safely handle browser vs Node)
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔨 Development environment detected via NODE_ENV');
      return 'development';
    }
    if (process.env.NODE_ENV === 'production') {
      console.log('🚀 Production environment detected via NODE_ENV');
      return 'production';
    }
  }
  
  // Check for Vite-specific environment variables
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.DEV) {
      console.log('⚡ Development environment detected via Vite');
      return 'development';
    }
    if (import.meta.env.PROD) {
      console.log('📦 Production environment detected via Vite');
      return 'production';
    }
  }
  
  // Default to production for safety
  console.log('🔒 Defaulting to production environment');
  return 'production';
};

// Environment-specific configurations with enhanced options
const ENVIRONMENTS = {
  development: {
    API_BASE_URL: 'https://chat.myrecruiter.ai',
    CHAT_API_URL: 'https://chat.myrecruiter.ai',
    ASSET_BASE_URL: 'https://picassocode.s3.amazonaws.com',
    S3_BUCKET: 'picassocode',
    WIDGET_DOMAIN: 'http://localhost:4174',
    DEBUG: true,
    CONFIG_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=get_config',
    CHAT_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=chat',
    ERROR_REPORTING_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
    STREAMING_ENDPOINT: null, // Disabled in development to avoid CORS issues
    DEFAULT_TENANT_HASH: 'my87674d777bf9', // MyRecruiter default tenant for development
    
    // Development-specific settings
    ENABLE_HOT_RELOAD: true,
    LOG_LEVEL: 'debug',
    CACHE_DISABLED: true,
    MOCK_RESPONSES: false,
    REQUEST_TIMEOUT: 30000, // 30 seconds for debugging
    RETRY_ATTEMPTS: 1,
    CORS_ENABLED: true,
    STREAMING_DISABLED_REASON: 'CORS issues with staging endpoint'
  },
  staging: {
    API_BASE_URL: 'https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary',
    CHAT_API_URL: 'https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary',
    ASSET_BASE_URL: 'https://picassostaging.s3.amazonaws.com',
    S3_BUCKET: 'picassostaging',
    WIDGET_DOMAIN: 'https://chat.myrecruiter.ai',
    DEBUG: true,
    CONFIG_ENDPOINT: 'https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary/staging/Master_Function?action=get_config',
    CHAT_ENDPOINT: 'https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary/staging/Master_Function?action=chat',
    ERROR_REPORTING_ENDPOINT: 'https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary/staging/Master_Function?action=log_error',
    STREAMING_ENDPOINT: 'https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary/staging/Bedrock_Streaming_Handler',
    DEFAULT_TENANT_HASH: 'my87674d777bf9', // MyRecruiter default tenant for staging
    
    // Staging-specific settings
    ENABLE_HOT_RELOAD: false,
    LOG_LEVEL: 'info',
    CACHE_DISABLED: false,
    MOCK_RESPONSES: false,
    REQUEST_TIMEOUT: 15000, // 15 seconds
    RETRY_ATTEMPTS: 2,
    CORS_ENABLED: true,
    HEALTH_CHECK_INTERVAL: 60000 // 1 minute
  },
  production: {
    API_BASE_URL: 'https://chat.myrecruiter.ai',
    CHAT_API_URL: 'https://chat.myrecruiter.ai',
    ASSET_BASE_URL: 'https://picassocode.s3.amazonaws.com',
    S3_BUCKET: 'picassocode',
    WIDGET_DOMAIN: 'https://chat.myrecruiter.ai',
    DEBUG: false,
    CONFIG_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=get_config',
    CHAT_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=chat',
    ERROR_REPORTING_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
    STREAMING_ENDPOINT: null, // Production streaming not configured - requires explicit setup
    DEFAULT_TENANT_HASH: 'my87674d777bf9', // MyRecruiter default tenant for production
    
    // Production-specific settings
    ENABLE_HOT_RELOAD: false,
    LOG_LEVEL: 'error',
    CACHE_DISABLED: false,
    MOCK_RESPONSES: false,
    REQUEST_TIMEOUT: 10000, // 10 seconds
    RETRY_ATTEMPTS: 3,
    CORS_ENABLED: false,
    HEALTH_CHECK_INTERVAL: 300000, // 5 minutes
    PERFORMANCE_MONITORING: true,
    ERROR_REPORTING: true
  }
};

// Get current environment
const currentEnv = getEnvironment();

// Validate the selected environment configuration
if (!validateEnvironmentConfig(currentEnv, ENVIRONMENTS[currentEnv])) {
  console.error(`❌ Critical: Invalid ${currentEnv} environment configuration!`);
  throw new Error(`Invalid environment configuration for: ${currentEnv}`);
}

// Dynamic widget domain detection for development
const getWidgetDomain = () => {
  if (currentEnv === 'development' && typeof window !== 'undefined') {
    // Auto-detect current port for development
    const currentPort = window.location.port;
    if (currentPort && window.location.hostname === 'localhost') {
      return `http://localhost:${currentPort}`;
    }
  }
  return ENVIRONMENTS[currentEnv].WIDGET_DOMAIN;
};

// Enhanced configuration object with additional methods
export const config = {
  ...ENVIRONMENTS[currentEnv],
  WIDGET_DOMAIN: getWidgetDomain(), // Override with dynamic detection
  ENVIRONMENT: currentEnv,
  
  // Core helper methods
  getConfigUrl: (tenantHash) => {
    if (!tenantHash) {
      throw new Error('getConfigUrl: tenantHash is required');
    }
    return `${ENVIRONMENTS[currentEnv].CONFIG_ENDPOINT}&t=${encodeURIComponent(tenantHash)}`;
  },
  
  getChatUrl: (tenantHash) => {
    if (!tenantHash) {
      throw new Error('getChatUrl: tenantHash is required');
    }
    return `${ENVIRONMENTS[currentEnv].CHAT_ENDPOINT}&t=${encodeURIComponent(tenantHash)}`;
  },
  
  getAssetUrl: (path) => {
    if (!path) {
      throw new Error('getAssetUrl: path is required');
    }
    return `${ENVIRONMENTS[currentEnv].ASSET_BASE_URL}/${path}`.replace(/\/+/g, '/');
  },
  
  getTenantAssetUrl: (tenantHash, assetPath) => {
    if (!tenantHash || !assetPath) {
      throw new Error('getTenantAssetUrl: tenantHash and assetPath are required');
    }
    return `${ENVIRONMENTS[currentEnv].ASSET_BASE_URL}/tenants/${tenantHash}/${assetPath}`;
  },
  
  // Legacy S3 bucket URLs for backward compatibility
  getLegacyS3Url: (tenantHash, assetPath) => {
    if (!tenantHash || !assetPath) {
      throw new Error('getLegacyS3Url: tenantHash and assetPath are required');
    }
    
    if (currentEnv === 'development') {
      return `https://picassostaging.s3.amazonaws.com/tenants/${tenantHash}/${assetPath}`;
    }
    return `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenantHash}/${assetPath}`;
  },
  
  // Enhanced utility methods
  isDevelopment: () => currentEnv === 'development',
  isStaging: () => currentEnv === 'staging',
  isProduction: () => currentEnv === 'production',
  
  // Get default tenant hash for current environment
  getDefaultTenantHash: () => ENVIRONMENTS[currentEnv].DEFAULT_TENANT_HASH,
  
  // Get tenant hash from URL parameters
  getTenantHashFromURL: () => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('tenant');
      } catch (error) {
        console.warn('⚠️ Error getting tenant hash from URL:', error);
        return null;
      }
    }
    return null;
  },
  
  // Get tenant hash with fallback to default
  getTenantHash: () => {
    const urlTenant = config.getTenantHashFromURL();
    return urlTenant || config.getDefaultTenantHash();
  },
  
  // Logging helper that respects environment log level
  log: (level, message, ...args) => {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[ENVIRONMENTS[currentEnv].LOG_LEVEL] || 3;
    const messageLevel = levels[level] || 3;
    
    if (messageLevel >= currentLevel) {
      console[level](`[Picasso ${currentEnv.toUpperCase()}]`, message, ...args);
    }
  },
  
  // Request configuration helper
  getRequestConfig: (options = {}) => {
    const baseConfig = {
      timeout: ENVIRONMENTS[currentEnv].REQUEST_TIMEOUT,
      retries: ENVIRONMENTS[currentEnv].RETRY_ATTEMPTS,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      }
    };
    
    // Always use CORS mode for API calls
    baseConfig.mode = 'cors';
    baseConfig.credentials = 'omit';
    
    // Merge configs properly, keeping merged headers
    const mergedConfig = { ...baseConfig, ...options };
    if (options.headers) {
      mergedConfig.headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      };
    }
    
    return mergedConfig;
  },
  
  // Health check URL
  getHealthCheckUrl: () => `${ENVIRONMENTS[currentEnv].API_BASE_URL}/health`,
  
  // Dynamic widget domain (auto-detects port in development)
  getWidgetDomain: () => getWidgetDomain(),
  
  // Streaming endpoint configuration
  getStreamingUrl: (tenantHash) => {
    if (!tenantHash) {
      throw new Error('getStreamingUrl: tenantHash is required');
    }
    
    // Use configured streaming endpoint from environment
    return ENVIRONMENTS[currentEnv].STREAMING_ENDPOINT || 
           `https://chat.myrecruiter.ai/Bedrock_Streaming_Handler`;
  },
  
  // Streaming feature flag evaluation
  isStreamingEnabled: (tenantConfig) => {
    // Global kill switch (for emergency disable)
    if (typeof window !== 'undefined' && window.PICASSO_DISABLE_STREAMING === true) {
      return false;
    }
    
    // Environment-based enablement (staging-only by default, disabled in development due to CORS)
    const environmentAllowsStreaming = currentEnv === 'staging';
    
    if (!environmentAllowsStreaming) {
      return false;
    }
    
    // Tenant-specific feature flags
    if (tenantConfig?.features?.streaming_enabled === true ||
        tenantConfig?.features?.streaming === true ||
        tenantConfig?.features?.eventSource === true) {
      return true;
    }
    
    // Development override
    if (currentEnv === 'development' && (
        typeof window !== 'undefined' && window.PICASSO_FORCE_STREAMING === true
      )) {
      return true;
    }
    
    // URL parameter override (for testing)
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('streaming') === 'true') {
          return true;
        }
        if (urlParams.get('streaming') === 'false') {
          return false;
        }
      } catch {
        // Ignore URL parsing errors
      }
    }
    
    return false;
  },
  
  // Version and build info
  getBuildInfo: () => ({
    environment: currentEnv,
    timestamp: new Date().toISOString(),
    debug: ENVIRONMENTS[currentEnv].DEBUG,
    version: typeof process !== 'undefined' ? process.env.npm_package_version : 'unknown'
  })
};

// Development utilities and debugging
if (config.isDevelopment()) {
  // Global debugging helpers
  if (typeof window !== 'undefined') {
    window.picassoConfig = config;
    window.picassoEnv = currentEnv;
    
    // Debug function to test environment switching
    window.switchPicassoEnv = (env) => {
      if (['development', 'staging', 'production'].includes(env)) {
        const url = new URL(window.location);
        url.searchParams.set('picasso-env', env);
        window.location.href = url.toString();
      } else {
        console.error('Invalid environment. Use: development, staging, production');
      }
    };
    
    // Streaming control functions
    window.enablePicassoStreaming = () => {
      window.PICASSO_FORCE_STREAMING = true;
      console.log('✅ Streaming enabled - refresh to apply');
    };
    
    window.disablePicassoStreaming = () => {
      window.PICASSO_DISABLE_STREAMING = true;
      console.log('❌ Streaming disabled - refresh to apply');
    };
    
    window.resetPicassoStreaming = () => {
      delete window.PICASSO_FORCE_STREAMING;
      delete window.PICASSO_DISABLE_STREAMING;
      console.log('🔄 Streaming reset to default behavior - refresh to apply');
    };
    
    window.testStreamingFeatureFlag = (tenantConfig) => {
      const isEnabled = config.isStreamingEnabled(tenantConfig);
      console.log('🧪 Streaming Feature Flag Test:', {
        enabled: isEnabled,
        environment: currentEnv,
        tenantFeatures: tenantConfig?.features || {},
        globalOverrides: {
          forced: window.PICASSO_FORCE_STREAMING,
          disabled: window.PICASSO_DISABLE_STREAMING
        }
      });
      return isEnabled;
    };
    
    console.log(`
🛠️  PICASSO DEVELOPMENT MODE ACTIVE
Environment: ${currentEnv}
Streaming: DISABLED (${ENVIRONMENTS[currentEnv].STREAMING_DISABLED_REASON || 'Environment default'})
Debug Commands:
  window.picassoConfig              - View current config
  window.switchPicassoEnv('staging') - Switch environments
  config.log('info', 'message')     - Environment-aware logging
  
🌊 Streaming Control:
  window.enablePicassoStreaming()   - Force enable streaming
  window.disablePicassoStreaming()  - Force disable streaming  
  window.resetPicassoStreaming()    - Reset to default behavior
  window.testStreamingFeatureFlag() - Test feature flag logic
`);
  }
}

// Production monitoring setup
if (config.isProduction() && config.PERFORMANCE_MONITORING) {
  console.log('📊 Picasso production monitoring initialized');
}

export default config; 