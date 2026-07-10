/**
 * Centralized Streaming Configuration
 *
 * SINGLE SOURCE OF TRUTH for streaming decisions throughout the platform.
 *
 * Streaming is the product; HTTP is the fallback (operator ruling 2026-07-10).
 * Tenant config does NOT select the transport — only runtime levers do, so
 * each mode can be tested independently and streaming can be killed in an
 * emergency:
 *   1. window.PICASSO_DISABLE_STREAMING = true  → HTTP (emergency kill switch)
 *   2. ?streaming=false / ?streaming=true       → explicit override (testing)
 *   3. default                                  → streaming
 */

/**
 * Determine the transport for this page load.
 * @param {object} [_tenantConfig] retained for call-site compatibility;
 *   deliberately unused — tenant config does not select the transport.
 */
export const isStreamingEnabled = (_tenantConfig = null) => {
  if (typeof window !== 'undefined') {
    // Emergency kill switch (also settable via window.toggleStreaming(false))
    if (window.PICASSO_DISABLE_STREAMING === true) {
      console.log('🔴 Streaming disabled by runtime override (window.PICASSO_DISABLE_STREAMING)');
      return false;
    }
    if (window.PICASSO_FORCE_STREAMING === true) {
      return true;
    }

    // Explicit URL override — lets each transport be exercised independently
    // (e.g. iframe.html?t=<hash>&streaming=false to test the HTTP path)
    try {
      const param = new URLSearchParams(window.location.search).get('streaming');
      if (param === 'false') {
        console.log('🔴 Streaming disabled by URL override (?streaming=false)');
        return false;
      }
      if (param === 'true') {
        return true;
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  // Default: streaming is the product
  return true;
};

/**
 * Get current streaming status for debugging
 */
export const getStreamingStatus = () => {
  return {
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

export default {
  isStreamingEnabled,
  getStreamingStatus
};
