/**
 * Simple Build-Time Configuration
 * Uses constants injected by Vite at build time - no runtime detection needed
 */

// These constants are injected by Vite at build time based on PICASSO_ENV
export const CONFIG = {
  // Environment info (baked in at build time)
  ENVIRONMENT: __ENVIRONMENT__,
  IS_PRODUCTION: __IS_PRODUCTION__,
  IS_STAGING: __IS_STAGING__,
  IS_DEVELOPMENT: __IS_DEVELOPMENT__,
  
  // API endpoints (baked in at build time)
  API_BASE_URL: __API_BASE_URL__,
  CHAT_ENDPOINT: __CHAT_ENDPOINT__,
  CONFIG_ENDPOINT: __CONFIG_ENDPOINT__,
  STREAMING_ENDPOINT: __STREAMING_ENDPOINT__,
  
  // Default tenant
  DEFAULT_TENANT_HASH: __DEFAULT_TENANT__,
  
  // Version
  VERSION: __PICASSO_VERSION__,
  
  // Simple helper methods
  getConfigUrl: (tenantHash) => {
    if (!tenantHash) tenantHash = CONFIG.DEFAULT_TENANT_HASH;
    return `${CONFIG.CONFIG_ENDPOINT}&t=${encodeURIComponent(tenantHash)}`;
  },
  
  getChatUrl: (tenantHash) => {
    if (!tenantHash) tenantHash = CONFIG.DEFAULT_TENANT_HASH;
    return `${CONFIG.CHAT_ENDPOINT}&t=${encodeURIComponent(tenantHash)}`;
  },
  
  // Debug info
  getBuildInfo: () => ({
    environment: CONFIG.ENVIRONMENT,
    version: CONFIG.VERSION,
    apiBaseUrl: CONFIG.API_BASE_URL,
    buildTime: new Date().toISOString()
  })
};

// Log configuration on load (only in development)
if (CONFIG.IS_DEVELOPMENT) {
  console.log('🔧 Picasso Simple Configuration:', CONFIG.getBuildInfo());
}

export default CONFIG;