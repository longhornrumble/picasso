// src/context/ConfigProvider.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const ConfigContext = createContext();

export function useConfig() {
  return useContext(ConfigContext);
}

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Track config metadata for change detection
  const configMetadata = useRef({
    etag: null,
    lastModified: null,
    lastCheck: null,
    tenantId: null
  });
  
  const updateIntervalRef = useRef(null);

  // Get tenant ID from script data-tenant hash and resolve it
  const getTenantId = async () => {
    try {
      // Read hash from script tag data-tenant attribute
      const script = document.querySelector('script[src*="widget.js"]');
      const tenantHash = script?.getAttribute('data-tenant');
      
      if (tenantHash) {
        // Resolve hash to tenant ID via Master Lambda
        const response = await fetch(`https://chat.myrecruiter.ai/Master_Function?t=${tenantHash}`);
        if (response.ok) {
          const { tenant_id } = await response.json();
          return tenant_id;
        }
      }
    } catch (error) {
      console.warn('Hash resolution failed:', error);
    }
    
    return 'FOS402334'; // Fallback for development
  };

  // Enhanced config fetcher with cache headers
  const fetchConfigWithCacheCheck = async (tenantId, force = false) => {
    try {
      // FIXED: Point to your actual S3 bucket structure
      const configUrl = `https://chat.myrecruiter.ai/Master_Function?tenant_id=${tenantId}`;
      
      // Prepare cache headers
      const headers = {};
      if (!force && configMetadata.current.etag) {
        headers['If-None-Match'] = configMetadata.current.etag;
      }
      if (!force && configMetadata.current.lastModified) {
        headers['If-Modified-Since'] = configMetadata.current.lastModified;
      }

      console.log(`🔄 Checking config for ${tenantId}...`, {
        force,
        hasETag: !!configMetadata.current.etag,
        lastCheck: configMetadata.current.lastCheck,
        url: configUrl
      });

      const response = await fetch(configUrl, {
        method: 'GET',
        headers,
        cache: 'no-cache' // Always check with server
      });

      // Update last check time
      configMetadata.current.lastCheck = new Date().toISOString();

      if (response.status === 304) {
        // Not modified - no changes
        console.log('✅ Config unchanged (304 Not Modified)');
        return { unchanged: true };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get new config data
      const newConfig = await response.json();
      
      // Update metadata
      configMetadata.current.etag = response.headers.get('etag');
      configMetadata.current.lastModified = response.headers.get('last-modified');
      configMetadata.current.tenantId = tenantId;

      console.log('✅ Config updated successfully', {
        tenantId: newConfig.tenant_id,
        etag: configMetadata.current.etag,
        lastModified: configMetadata.current.lastModified
      });

      return { config: newConfig, changed: true };

    } catch (error) {
      console.error('❌ Config fetch error:', error);
      throw error;
    }
  };

  // Initial config load
  const loadTenantConfig = async (tenantId) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchConfigWithCacheCheck(tenantId, true); // Force initial load
      
      if (result.config) {
        setConfig(result.config);
        console.log('🎉 Initial config loaded for tenant:', result.config.tenant_id);
      }
    } catch (error) {
      console.error('❌ Failed to load initial config:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Periodic config update checker
  const checkForConfigUpdates = async () => {
    const tenantId = await getTenantId();
    
    // Skip if different tenant (shouldn't happen, but safety check)
    if (configMetadata.current.tenantId && configMetadata.current.tenantId !== tenantId) {
      console.log('🔄 Tenant changed, reloading config...');
      await loadTenantConfig(tenantId);
      return;
    }

    try {
      const result = await fetchConfigWithCacheCheck(tenantId);
      
      if (result.changed && result.config) {
        setConfig(result.config);
        console.log('🎨 Config updated! New styling applied.');
        
        // Optional: Show user notification
        if (window.showConfigUpdateNotification) {
          window.showConfigUpdateNotification('Chat appearance updated');
        }
      }
    } catch (error) {
      console.warn('⚠️ Config update check failed:', error.message);
      // Don't show error to user for background updates
    }
  };

  // Set up automatic config checking
  const startConfigWatcher = () => {
    // Clear any existing interval
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
    }

    // Check for updates every 5 minutes
    const checkInterval = 5 * 60 * 1000; // 5 minutes
    updateIntervalRef.current = setInterval(checkForConfigUpdates, checkInterval);
    
    console.log(`🕐 Config update checker started (every ${checkInterval / 1000}s)`);
  };

  // Manual refresh function (can be called by components)
  const refreshConfig = async () => {
    console.log('🔄 Manual config refresh requested');
    const tenantId = await getTenantId();
    await loadTenantConfig(tenantId);
  };

  // Initialize on mount
  useEffect(() => {
    const initializeConfig = async () => {
      const tenantId = await getTenantId();
      console.log('🏁 ConfigProvider initializing for tenant:', tenantId);
      
      await loadTenantConfig(tenantId);
      startConfigWatcher();
    };
    
    initializeConfig();

    // Cleanup on unmount
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        console.log('🛑 Config update checker stopped');
      }
    };
  }, []); // Only run once on mount

  // Handle visibility change (check config when user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && config) {
        // User returned to tab, check for updates
        setTimeout(checkForConfigUpdates, 1000); // Small delay
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [config]);

  // Provide context value
  const contextValue = {
    config,
    loading,
    error,
    refreshConfig,
    lastCheck: configMetadata.current.lastCheck,
    metadata: {
      etag: configMetadata.current.etag,
      tenantId: configMetadata.current.tenantId,
      lastModified: configMetadata.current.lastModified
    }
  };

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
}

// Optional: Global function to force config refresh
window.refreshPicassoConfig = () => {
  if (window.configProvider) {
    window.configProvider.refreshConfig();
  }
};

// Optional: Hook for manual config refresh in components
export function useConfigRefresh() {
  const { refreshConfig } = useConfig();
  return refreshConfig;
}