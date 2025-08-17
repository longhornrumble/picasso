/**
 * Environment Configuration for Picasso Chat Widget - PERFORMANCE OPTIMIZED
 * 
 * Centralized configuration for all URLs and environment-specific settings.
 * Supports development, staging, and production environments with enhanced validation.
 * PERFORMANCE IMPROVEMENTS:
 * - Cached configuration values
 * - Optimized URL generation
 * - Reduced repeated calculations
 * - Enhanced request timeout settings for performance targets
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
  // PRIORITY 1: Check esbuild build-time environment constant first
  if (typeof process !== 'undefined' && process.env && process.env.PICASSO_ENV) {
    console.log(`🚀 Using esbuild build-time environment: ${process.env.PICASSO_ENV}`);
    return process.env.PICASSO_ENV;
  }
  
  // PRIORITY 2: Check Vite build-time environment constant (legacy)
  if (typeof __ENVIRONMENT__ !== 'undefined') {
    console.log(`🚀 Using Vite build-time environment: ${__ENVIRONMENT__}`);
    return __ENVIRONMENT__;
  }

  // PRIORITY 2: Check for explicit environment override via URL params OR script data-env attribute
  if (typeof window !== 'undefined') {
    try {
      // Check data-env attribute on the widget script tag first - with multiple approaches
      let widgetScript = null;
      
      // Approach 1: Look for script with both data-tenant and data-env
      widgetScript = document.querySelector('script[data-tenant][data-env]');
      
      // Approach 2: Look for any script with data-env that contains widget.js
      if (!widgetScript) {
        widgetScript = document.querySelector('script[src*="widget.js"][data-env]');
      }
      
      // Approach 3: Look for any script with data-env (broadest search)
      if (!widgetScript) {
        widgetScript = document.querySelector('script[data-env]');
      }
      
      // Approach 4: Check all scripts for the one that loaded this code
      if (!widgetScript && document.currentScript) {
        widgetScript = document.currentScript;
      }
      
      // Approach 5: Search through all scripts manually
      if (!widgetScript) {
        const allScripts = Array.from(document.querySelectorAll('script'));
        widgetScript = allScripts.find(script => {
          const hasDataEnv = script.getAttribute('data-env');
          const hasWidgetSrc = script.src && script.src.includes('widget.js');
          const hasDataTenant = script.getAttribute('data-tenant');
          return hasDataEnv && (hasWidgetSrc || hasDataTenant);
        });
      }
      
      console.log('🔍 Debugging environment detection:', {
        widgetScript,
        hasDataEnv: widgetScript?.getAttribute('data-env'),
        currentScript: document.currentScript,
        allScripts: Array.from(document.querySelectorAll('script')).map(s => ({
          src: s.src,
          dataEnv: s.getAttribute('data-env'),
          dataTenant: s.getAttribute('data-tenant'),
          isCurrentScript: s === document.currentScript
        }))
      });
      
      if (widgetScript) {
        const envOverride = widgetScript.getAttribute('data-env');
        if (envOverride && ['development', 'staging', 'production'].includes(envOverride)) {
          console.log(`🎯 Environment override via data-env attribute: ${envOverride}`);
          return envOverride;
        }
      }
      
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

// Environment-specific configurations using build-time constants injected by Vite
const ENVIRONMENTS = {
  development: {
    API_BASE_URL: typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : 'http://localhost:3000/api',
    CHAT_API_URL: typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : 'http://localhost:3000/api',
    ASSET_BASE_URL: typeof __CONFIG_DOMAIN__ !== 'undefined' ? __CONFIG_DOMAIN__ : 'https://picasso-staging.s3.amazonaws.com',
    S3_BUCKET: 'picasso-staging',
    WIDGET_DOMAIN: typeof __WIDGET_DOMAIN__ !== 'undefined' ? __WIDGET_DOMAIN__ : 'http://localhost:5173',
    DEBUG: true,
    CONFIG_ENDPOINT: typeof __CONFIG_ENDPOINT__ !== 'undefined' ? __CONFIG_ENDPOINT__ : 'https://chat.myrecruiter.ai/Master_Function?action=get_config',
    CHAT_ENDPOINT: typeof __CHAT_ENDPOINT__ !== 'undefined' ? __CHAT_ENDPOINT__ : 'https://chat.myrecruiter.ai/Master_Function?action=chat',
    CONVERSATION_ENDPOINT: typeof __CONVERSATION_ENDPOINT__ !== 'undefined' ? __CONVERSATION_ENDPOINT__ : 'https://chat.myrecruiter.ai/Master_Function?action=conversation', // Added for testing conversation persistence
    ERROR_REPORTING_ENDPOINT: typeof __ERROR_REPORTING_ENDPOINT__ !== 'undefined' ? __ERROR_REPORTING_ENDPOINT__ : 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
    STREAMING_ENDPOINT: typeof __STREAMING_ENDPOINT__ !== 'undefined' ? __STREAMING_ENDPOINT__ : null, // Disabled in development to avoid CORS issues
    DEFAULT_TENANT_HASH: typeof __DEFAULT_TENANT_HASH__ !== 'undefined' ? __DEFAULT_TENANT_HASH__ : 'my87674d777bf9', // MyRecruiter default tenant for development
    
    // CONVERSATION API: Always enabled
    CONVERSATION_ENDPOINT_AVAILABLE: true, // Default behavior - conversation memory always enabled
    
    // Development-specific settings
    ENABLE_HOT_RELOAD: true,
    LOG_LEVEL: 'debug',
    CACHE_DISABLED: true,
    MOCK_RESPONSES: false,
    REQUEST_TIMEOUT: 10000, // PERFORMANCE: 10 seconds (reduced from 30s)
    RETRY_ATTEMPTS: 1,
    CORS_ENABLED: true,
    STREAMING_DISABLED_REASON: 'CORS issues with staging endpoint'
  },
  staging: {
    // STAGING ENDPOINTS: Use esbuild-defined staging Lambda endpoints or fallbacks
    API_BASE_URL: (typeof process !== 'undefined' && process.env && process.env.PICASSO_API_BASE_URL) || 
                  (typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : 'https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws'),
    CHAT_API_URL: (typeof process !== 'undefined' && process.env && process.env.PICASSO_API_BASE_URL) || 
                  (typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : 'https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws'),
    ASSET_BASE_URL: typeof __CONFIG_DOMAIN__ !== 'undefined' ? __CONFIG_DOMAIN__ : 'https://picasso-staging.s3.amazonaws.com',
    S3_BUCKET: 'picasso-staging',
    WIDGET_DOMAIN: typeof __WIDGET_DOMAIN__ !== 'undefined' ? __WIDGET_DOMAIN__ : 'https://chat-staging.myrecruiter.ai',
    DEBUG: true,
    
    // DIRECT FUNCTION URL: Use esbuild-defined endpoints for staging Lambda (UPDATED to correct URL)
    CONFIG_ENDPOINT: (typeof process !== 'undefined' && process.env && process.env.PICASSO_CONFIG_ENDPOINT) || 
                     (typeof __CONFIG_ENDPOINT__ !== 'undefined' ? __CONFIG_ENDPOINT__ : 'https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws/?action=get_config'),
    CHAT_ENDPOINT: (typeof process !== 'undefined' && process.env && process.env.PICASSO_CHAT_ENDPOINT) || 
                   (typeof __CHAT_ENDPOINT__ !== 'undefined' ? __CHAT_ENDPOINT__ : 'https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws/?action=chat'),
    CONVERSATION_ENDPOINT: (typeof process !== 'undefined' && process.env && process.env.PICASSO_CONVERSATION_ENDPOINT) || 
                           (typeof __CONVERSATION_ENDPOINT__ !== 'undefined' ? __CONVERSATION_ENDPOINT__ : 'https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws/?action=conversation'), // Track A+ conversation persistence
    ERROR_REPORTING_ENDPOINT: typeof __ERROR_REPORTING_ENDPOINT__ !== 'undefined' ? __ERROR_REPORTING_ENDPOINT__ : 'https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws/?action=log_error',
    STREAMING_ENDPOINT: typeof __STREAMING_ENDPOINT__ !== 'undefined' ? __STREAMING_ENDPOINT__ : 'https://7pluzq3axftklmb4gbgchfdahu0lcnqd.lambda-url.us-east-1.on.aws', // Staging streaming handler with CORS
    DEFAULT_TENANT_HASH: typeof __DEFAULT_TENANT_HASH__ !== 'undefined' ? __DEFAULT_TENANT_HASH__ : 'my87674d777bf9', // Use working tenant hash
    
    // CONVERSATION API: Always enabled (Track A+ ready)
    CONVERSATION_ENDPOINT_AVAILABLE: true, // Default behavior - conversation memory always enabled
    
    // Staging-specific settings
    ENABLE_HOT_RELOAD: false,
    LOG_LEVEL: 'info',
    CACHE_DISABLED: false,
    MOCK_RESPONSES: false,
    REQUEST_TIMEOUT: 8000, // PERFORMANCE: 8 seconds (reduced from 15s)
    RETRY_ATTEMPTS: 2,
    CORS_ENABLED: true,
    HEALTH_CHECK_INTERVAL: 60000 // 1 minute
  },
  production: {
    API_BASE_URL: typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : 'https://api.myrecruiter.ai',
    CHAT_API_URL: typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : 'https://api.myrecruiter.ai',
    ASSET_BASE_URL: typeof __CONFIG_DOMAIN__ !== 'undefined' ? __CONFIG_DOMAIN__ : 'https://picasso-production.s3.amazonaws.com',
    S3_BUCKET: 'picasso-production',
    WIDGET_DOMAIN: typeof __WIDGET_DOMAIN__ !== 'undefined' ? __WIDGET_DOMAIN__ : 'https://chat.myrecruiter.ai',
    DEBUG: false,
    CONFIG_ENDPOINT: typeof __CONFIG_ENDPOINT__ !== 'undefined' ? __CONFIG_ENDPOINT__ : 'https://chat.myrecruiter.ai/Master_Function?action=get_config',
    CHAT_ENDPOINT: typeof __CHAT_ENDPOINT__ !== 'undefined' ? __CHAT_ENDPOINT__ : 'https://chat.myrecruiter.ai/Master_Function?action=chat',
    ERROR_REPORTING_ENDPOINT: typeof __ERROR_REPORTING_ENDPOINT__ !== 'undefined' ? __ERROR_REPORTING_ENDPOINT__ : 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
    STREAMING_ENDPOINT: typeof __STREAMING_ENDPOINT__ !== 'undefined' ? __STREAMING_ENDPOINT__ : null, // Production streaming not configured - requires explicit setup
    DEFAULT_TENANT_HASH: typeof __DEFAULT_TENANT_HASH__ !== 'undefined' ? __DEFAULT_TENANT_HASH__ : 'my87674d777bf9', // MyRecruiter default tenant for production
    
    // CONVERSATION API: Always enabled when deployed
    CONVERSATION_ENDPOINT_AVAILABLE: true, // Default behavior - conversation memory always enabled
    
    // Production-specific settings
    ENABLE_HOT_RELOAD: false,
    LOG_LEVEL: 'error',
    CACHE_DISABLED: false,
    MOCK_RESPONSES: false,
    REQUEST_TIMEOUT: 6000, // PERFORMANCE: 6 seconds (reduced from 10s)
    RETRY_ATTEMPTS: 2, // PERFORMANCE: Reduced from 3 for faster failure
    CORS_ENABLED: false,
    HEALTH_CHECK_INTERVAL: 300000, // 5 minutes
    PERFORMANCE_MONITORING: true,
    ERROR_REPORTING: true
  }
};

// PRIORITIZE URL PARAMETERS: Check for runtime environment override first, before build-time constants
let runtimeOverrideEnv = null;
if (typeof window !== 'undefined') {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const envOverride = urlParams.get('picasso-env');
    if (envOverride && ['development', 'staging', 'production'].includes(envOverride)) {
      runtimeOverrideEnv = envOverride;
      console.log(`🎯 RUNTIME OVERRIDE: Environment forced to ${envOverride} via URL parameter`);
    }
  } catch (error) {
    console.warn('⚠️ Error checking URL parameters:', error);
  }
}

// Use runtime override if available, otherwise build-time environment constant, otherwise auto-detection
const currentEnv = runtimeOverrideEnv || 
                   (typeof __ENVIRONMENT__ !== 'undefined' ? __ENVIRONMENT__ : getEnvironment());

// Clean environment configuration - no overrides, single source of truth
console.log(`🔧 Using clean environment configuration for ${currentEnv}`);
console.log(`📍 Environment ${currentEnv} endpoints:`, {
  API_BASE_URL: ENVIRONMENTS[currentEnv].API_BASE_URL,
  CHAT_ENDPOINT: ENVIRONMENTS[currentEnv].CHAT_ENDPOINT,
  CONFIG_ENDPOINT: ENVIRONMENTS[currentEnv].CONFIG_ENDPOINT,
  STREAMING_ENDPOINT: ENVIRONMENTS[currentEnv].STREAMING_ENDPOINT
});

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
  
  getConversationUrl: (tenantHash, operation) => {
    if (!tenantHash) {
      throw new Error('getConversationUrl: tenantHash is required');
    }
    if (!operation) {
      throw new Error('getConversationUrl: operation is required');
    }
    return `${ENVIRONMENTS[currentEnv].CONVERSATION_ENDPOINT}&operation=${encodeURIComponent(operation)}&t=${encodeURIComponent(tenantHash)}`;
  },
  
  // New JWT/Function URL methods
  getStreamTokenUrl: (tenantHash) => {
    if (!tenantHash) {
      throw new Error('getStreamTokenUrl: tenantHash is required');
    }
    return `${ENVIRONMENTS[currentEnv].CHAT_ENDPOINT}&action=generate_stream_token&t=${encodeURIComponent(tenantHash)}`;
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
    if (currentEnv === 'staging') {
      return `https://chat.myrecruiter.ai/staging/tenants/${tenantHash}/${assetPath}`;
    }
    return `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenantHash}/${assetPath}`;
  },
  
  // Enhanced utility methods
  isDevelopment: () => currentEnv === 'development',
  isStaging: () => currentEnv === 'staging',
  isProduction: () => currentEnv === 'production',
  
  // Get default tenant hash for current environment
  getDefaultTenantHash: () => ENVIRONMENTS[currentEnv].DEFAULT_TENANT_HASH,
  
  // Get tenant hash from URL parameters with STRICT environment validation
  getTenantHashFromURL: () => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const tenantHash = urlParams.get('tenant');
        
        // SECURITY: Validate tenant hash against current environment
        if (tenantHash && currentEnv === 'staging') {
          // In staging, only allow staging test hashes
          const stagingHashes = ['staging_test_hash', 'my87674d777bf9'];
          if (!stagingHashes.includes(tenantHash)) {
            console.error('🚨 SECURITY: Cross-environment tenant hash blocked in staging');
            return null;
          }
        }
        
        return tenantHash;
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
  
  // PERFORMANCE: Request configuration helper with optimized defaults
  getRequestConfig: (options = {}) => {
    const baseConfig = {
      timeout: Math.min(ENVIRONMENTS[currentEnv].REQUEST_TIMEOUT, 10000), // Cap at 10s for performance
      retries: Math.min(ENVIRONMENTS[currentEnv].RETRY_ATTEMPTS, 2), // Limit retries for faster failure
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
  
  // Streaming feature flag evaluation with JWT support
  isStreamingEnabled: (tenantConfig) => {
    // Global kill switch (for emergency disable)
    if (typeof window !== 'undefined' && window.PICASSO_DISABLE_STREAMING === true) {
      return false;
    }
    
    // Environment-based enablement (disabled in staging due to endpoint issues, disabled in development due to CORS)
    const environmentAllowsStreaming = false; // currentEnv === 'staging'; // Temporarily disabled for staging
    
    if (!environmentAllowsStreaming) {
      return false;
    }
    
    // Tenant-specific feature flags (including JWT/Function URL flags)
    if (tenantConfig?.features?.streaming_enabled === true ||
        tenantConfig?.features?.streaming === true ||
        tenantConfig?.features?.eventSource === true ||
        tenantConfig?.features?.jwt_streaming === true ||
        tenantConfig?.features?.function_url_streaming === true) {
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
  
  // Check if JWT/Function URL streaming is enabled
  isJWTStreamingEnabled: (tenantConfig) => {
    // Global kill switch
    if (typeof window !== 'undefined' && window.PICASSO_DISABLE_STREAMING === true) {
      return false;
    }
    
    // Only available in staging/production (not development due to CORS)
    if (currentEnv === 'development') {
      return false;
    }
    
    // Check for JWT-specific streaming features
    if (tenantConfig?.features?.jwt_streaming === true ||
        tenantConfig?.features?.function_url_streaming === true ||
        tenantConfig?.features?.unified_coordination === true) {
      return true;
    }
    
    // URL parameter override
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('jwt-streaming') === 'true') {
          return true;
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
  }),
  
  // Staging infrastructure validation - ensures proper Track A+ routing
  validateStagingInfrastructure: () => {
    if (currentEnv !== 'staging') {
      return { valid: true, message: 'Not staging environment' };
    }
    
    const stagingConfig = ENVIRONMENTS.staging;
    const issues = [];
    
    // Validate API Gateway staging routing
    if (!stagingConfig.CHAT_ENDPOINT.includes('/primary/staging/Master_Function')) {
      issues.push('Chat endpoint not routing to staging Master_Function with Track A+');
    }
    
    // Validate widget domain uses staging path
    if (!stagingConfig.WIDGET_DOMAIN.includes('/staging')) {
      issues.push('Widget domain not using staging infrastructure path');
    }
    
    // Validate asset routing
    if (!stagingConfig.ASSET_BASE_URL.includes('/staging')) {
      issues.push('Asset base URL not using staging CloudFront path');
    }
    
    // Validate streaming endpoint
    if (!stagingConfig.STREAMING_ENDPOINT.includes('/primary/staging/')) {
      issues.push('Streaming endpoint not routing to staging infrastructure');
    }
    
    const isValid = issues.length === 0;
    return {
      valid: isValid,
      message: isValid ? 'Staging infrastructure properly configured for Track A+' : issues.join('; '),
      issues: issues,
      endpoints: {
        chat: stagingConfig.CHAT_ENDPOINT,
        widget: stagingConfig.WIDGET_DOMAIN,
        assets: stagingConfig.ASSET_BASE_URL,
        streaming: stagingConfig.STREAMING_ENDPOINT
      }
    };
  }
};

// Development utilities and debugging
if (config.isDevelopment() || config.isStaging()) {
  // Global debugging helpers (available in development and staging)
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
      const isJWTEnabled = config.isJWTStreamingEnabled(tenantConfig);
      console.log('🧪 Streaming Feature Flag Test:', {
        enabled: isEnabled,
        jwtEnabled: isJWTEnabled,
        environment: currentEnv,
        tenantFeatures: tenantConfig?.features || {},
        globalOverrides: {
          forced: window.PICASSO_FORCE_STREAMING,
          disabled: window.PICASSO_DISABLE_STREAMING
        }
      });
      return { legacy: isEnabled, jwt: isJWTEnabled };
    };
    
    window.validateStagingInfrastructure = () => {
      const result = config.validateStagingInfrastructure();
      console.log('🏗️ Staging Infrastructure Validation:', result);
      return result;
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

🏗️ Infrastructure Validation:
  window.validateStagingInfrastructure() - Validate staging Track A+ routing
`);
  }
}

// Production monitoring setup
if (config.isProduction() && config.PERFORMANCE_MONITORING) {
  console.log('📊 Picasso production monitoring initialized');
}

export default config; 