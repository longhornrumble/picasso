/**
 * BERS (Build-time Environment Resolution System)
 * Enterprise-grade environment detection and configuration management
 * 
 * Eliminates runtime environment detection by baking configuration into builds
 */

const environments = {
  development: {
    name: 'development',
    endpoints: {
      API_BASE_URL: 'https://chat.myrecruiter.ai',
      CHAT_API_URL: 'https://chat.myrecruiter.ai', 
      CONFIG_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=get_config',
      CHAT_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=chat',
      ERROR_REPORTING_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
    },
    features: {
      DEBUG: true,
      LOG_LEVEL: 'debug',
      STREAMING_ENABLED: false,
      CORS_ENABLED: true,
      CACHE_DISABLED: true,
      REQUEST_TIMEOUT: 10000,
      RETRY_ATTEMPTS: 1,
    },
    build: {
      minify: false,
      sourcemap: true,
      dropConsole: false,
    }
  },
  
  staging: {
    name: 'staging',
    endpoints: {
      // STAGING LAMBDA FUNCTION URLs: Master_Function_Staging deployment
      API_BASE_URL: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws',
      CHAT_API_URL: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws',
      CONFIG_ENDPOINT: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws/?action=get_config',
      CHAT_ENDPOINT: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws/?action=chat',
      ERROR_REPORTING_ENDPOINT: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws/?action=log_error',
    },
    features: {
      DEBUG: true,
      LOG_LEVEL: 'info', 
      STREAMING_ENABLED: false, // Disabled until staging streaming handler deployed
      CORS_ENABLED: true,
      CACHE_DISABLED: false,
      REQUEST_TIMEOUT: 8000,
      RETRY_ATTEMPTS: 2,
    },
    build: {
      minify: true,
      sourcemap: false,
      dropConsole: false, // Keep debug logs in staging
    }
  },
  
  production: {
    name: 'production',
    endpoints: {
      API_BASE_URL: 'https://chat.myrecruiter.ai',
      CHAT_API_URL: 'https://chat.myrecruiter.ai',
      CONFIG_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=get_config',
      CHAT_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=chat',
      ERROR_REPORTING_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
    },
    features: {
      DEBUG: false,
      LOG_LEVEL: 'error',
      STREAMING_ENABLED: false, // Disabled until production streaming configured
      CORS_ENABLED: false,
      CACHE_DISABLED: false,
      REQUEST_TIMEOUT: 6000,
      RETRY_ATTEMPTS: 2,
    },
    build: {
      minify: true,
      sourcemap: false,
      dropConsole: true, // Remove all console logs in production
    }
  }
};

/**
 * Get environment configuration
 */
function getBERSConfig(env = 'development') {
  if (!environments[env]) {
    throw new Error(`BERS: Unknown environment '${env}'. Available: ${Object.keys(environments).join(', ')}`);
  }
  
  const config = environments[env];
  
  return {
    ...config,
    // Add runtime helpers
    getConfigUrl: (tenantHash) => `${config.endpoints.CONFIG_ENDPOINT}&t=${encodeURIComponent(tenantHash)}`,
    getChatUrl: (tenantHash) => `${config.endpoints.CHAT_ENDPOINT}&t=${encodeURIComponent(tenantHash)}`,
    getErrorUrl: (tenantHash) => `${config.endpoints.ERROR_REPORTING_ENDPOINT}&t=${encodeURIComponent(tenantHash)}`,
  };
}

/**
 * Get build-time defines for Vite
 */
function getBERSDefines(env) {
  const config = getBERSConfig(env);
  
  return {
    // Inject entire config as build-time constants
    __BERS_ENVIRONMENT__: JSON.stringify(config.name),
    __BERS_CONFIG__: JSON.stringify(config),
    __BERS_ENDPOINTS__: JSON.stringify(config.endpoints),
    __BERS_FEATURES__: JSON.stringify(config.features),
  };
}

export {
  environments,
  getBERSConfig,
  getBERSDefines,
};