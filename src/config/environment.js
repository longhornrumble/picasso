/**
 * Environment Configuration for Picasso Chat Widget
 * 
 * Centralized configuration for all URLs and environment-specific settings.
 * Supports development, staging, and production environments.
 */

// Environment detection
const getEnvironment = () => {
  // Check for explicit environment override
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const envOverride = urlParams.get('picasso-env');
    if (envOverride && ['development', 'staging', 'production'].includes(envOverride)) {
      return envOverride;
    }
    
    // Check for dev mode flag
    const devMode = urlParams.get('picasso-dev') === 'true' ||
                   document.currentScript?.getAttribute('data-dev') === 'true' ||
                   document.querySelector('script[src*="widget.js"][data-dev="true"]');
    if (devMode) {
      return 'development';
    }
  }
  
  // Check NODE_ENV for build-time environment (safely handle browser vs Node)
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) {
    if (process.env.NODE_ENV === 'development') return 'development';
    if (process.env.NODE_ENV === 'production') return 'production';
  }
  
  // Default to production for safety
  return 'production';
};

// Environment-specific configurations
const ENVIRONMENTS = {
  development: {
    API_BASE_URL: 'http://localhost:3000',
    CHAT_API_URL: 'http://localhost:3000',
    ASSET_BASE_URL: 'http://localhost:3000',
    S3_BUCKET: 'localhost',
    WIDGET_DOMAIN: 'http://localhost:4173',
    DEBUG: true,
    CONFIG_ENDPOINT: 'http://localhost:3000/Master_Function?action=get_config',
    CHAT_ENDPOINT: 'http://localhost:3000/Master_Function?action=chat'
  },
  staging: {
    API_BASE_URL: 'https://staging-chat.myrecruiter.ai',
    CHAT_API_URL: 'https://staging-chat.myrecruiter.ai',
    ASSET_BASE_URL: 'https://picassostaging.s3.amazonaws.com',
    S3_BUCKET: 'picassostaging',
    WIDGET_DOMAIN: 'https://staging-chat.myrecruiter.ai',
    DEBUG: true,
    CONFIG_ENDPOINT: 'https://staging-chat.myrecruiter.ai/Master_Function?action=get_config',
    CHAT_ENDPOINT: 'https://staging-chat.myrecruiter.ai/Master_Function?action=chat'
  },
  production: {
    API_BASE_URL: 'https://chat.myrecruiter.ai',
    CHAT_API_URL: 'https://chat.myrecruiter.ai',
    ASSET_BASE_URL: 'https://picassocode.s3.amazonaws.com',
    S3_BUCKET: 'picassocode',
    WIDGET_DOMAIN: 'https://chat.myrecruiter.ai',
    DEBUG: false,
    CONFIG_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=get_config',
    CHAT_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=chat'
  }
};

// Get current environment
const currentEnv = getEnvironment();

// Export the configuration
export const config = {
  ...ENVIRONMENTS[currentEnv],
  ENVIRONMENT: currentEnv,
  
  // Helper methods
  getConfigUrl: (tenantHash) => `${ENVIRONMENTS[currentEnv].CONFIG_ENDPOINT}&t=${encodeURIComponent(tenantHash)}`,
  getChatUrl: (tenantHash) => `${ENVIRONMENTS[currentEnv].CHAT_ENDPOINT}&t=${encodeURIComponent(tenantHash)}`,
  getAssetUrl: (path) => `${ENVIRONMENTS[currentEnv].ASSET_BASE_URL}/${path}`.replace(/\/+/g, '/'),
  getTenantAssetUrl: (tenantHash, assetPath) => `${ENVIRONMENTS[currentEnv].ASSET_BASE_URL}/tenants/${tenantHash}/${assetPath}`,
  
  // Legacy S3 bucket URLs for backward compatibility
  getLegacyS3Url: (tenantHash, assetPath) => {
    const env = ENVIRONMENTS[currentEnv];
    if (currentEnv === 'development') {
    return `http://localhost:3000/tenants/${tenantHash}/${assetPath}`;
    }
    return `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenantHash}/${assetPath}`;
  }
};

export default config; 