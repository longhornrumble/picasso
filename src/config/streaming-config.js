/**
 * Centralized Streaming Configuration
 * 
 * SINGLE SOURCE OF TRUTH for streaming decisions throughout the platform.
 * All components and modules should import and use this configuration.
 * 
 * To control streaming:
 * 1. Set STREAMING_ENABLED to true/false here
 * 2. Set FORCE_OVERRIDE to true to ignore tenant config
 * 3. All parts of the platform will automatically respect this setting
 */

// ============================================
// MAIN CONTROL - CHANGE THIS TO ENABLE/DISABLE STREAMING
// ============================================
const STREAMING_ENABLED = true; // Set to true to enable streaming, false to disable
const FORCE_OVERRIDE = true; // Set to true to ignore tenant config and use STREAMING_ENABLED value

// ============================================
// Configuration Export
// ============================================

/**
 * Determines if streaming should be used based on:
 * 1. Main control flag above
 * 2. Tenant config (if explicitly set)
 * 3. Runtime overrides (for testing)
 */
export const isStreamingEnabled = (tenantConfig = null) => {
  // If FORCE_OVERRIDE is true, ignore everything else and use STREAMING_ENABLED
  if (FORCE_OVERRIDE) {
    console.log(`🚨 FORCE OVERRIDE ACTIVE: Streaming ${STREAMING_ENABLED ? 'ENABLED' : 'DISABLED'} (ignoring tenant config)`);
    return STREAMING_ENABLED;
  }
  
  // Check for runtime override first (highest priority when not forced)
  if (typeof window !== 'undefined') {
    // Check for forced disable
    if (window.PICASSO_DISABLE_STREAMING === true) {
      console.log('🔴 Streaming disabled by runtime override (window.PICASSO_DISABLE_STREAMING)');
      return false;
    }
    
    // Check for forced enable
    if (window.PICASSO_FORCE_STREAMING === true) {
      console.log('✅ Streaming enabled by runtime override (window.PICASSO_FORCE_STREAMING)');
      return true;
    }
  }
  
  // Check tenant config if provided (second priority)
  if (tenantConfig?.features?.streaming_enabled !== undefined) {
    const configValue = tenantConfig.features.streaming_enabled;
    console.log(`📋 Streaming ${configValue ? 'enabled' : 'disabled'} by tenant config`);
    return configValue;
  }
  
  // Use main control flag (default)
  console.log(`🎯 Streaming ${STREAMING_ENABLED ? 'enabled' : 'disabled'} by default config (streaming-config.js: STREAMING_ENABLED = ${STREAMING_ENABLED})`);
  return STREAMING_ENABLED;
};

/**
 * Get current streaming status for debugging
 */
export const getStreamingStatus = () => {
  return {
    mainControl: STREAMING_ENABLED,
    runtimeOverride: typeof window !== 'undefined' ? 
      (window.PICASSO_DISABLE_STREAMING ? 'disabled' : 
       window.PICASSO_FORCE_STREAMING ? 'enabled' : 'none') : 'n/a',
    currentValue: isStreamingEnabled()
  };
};

/**
 * Development helpers
 */
if (typeof window !== 'undefined') {
  // Expose configuration status
  window.getStreamingConfig = () => {
    const status = getStreamingStatus();
    console.log('🔧 Streaming Configuration:', status);
    return status;
  };
  
  // Helper to toggle streaming at runtime
  window.toggleStreaming = (enabled) => {
    if (enabled) {
      delete window.PICASSO_DISABLE_STREAMING;
      window.PICASSO_FORCE_STREAMING = true;
      console.log('✅ Streaming enabled via runtime override');
    } else {
      delete window.PICASSO_FORCE_STREAMING;
      window.PICASSO_DISABLE_STREAMING = true;
      console.log('🔴 Streaming disabled via runtime override');
    }
    console.log('🔄 Refresh the page to apply changes');
  };
}

// Log initial configuration
console.log(`📌 Streaming Config Loaded: STREAMING_ENABLED = ${STREAMING_ENABLED}`);

export default {
  isStreamingEnabled,
  getStreamingStatus,
  STREAMING_ENABLED
};