// src/context/ConfigProvider.jsx - FIXED Pure Hash + Action System
import React, { createContext, useState, useEffect, useRef } from 'react';
import { config as environmentConfig } from '../config/environment';

const ConfigContext = createContext();

// Function to get the context for hooks
export const getConfigContext = () => ConfigContext;

// Export provider as named export
const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Track config metadata for change detection
  const configMetadata = useRef({
    etag: null,
    lastModified: null,
    lastCheck: null,
    tenantHash: null
  });
  
  const updateIntervalRef = useRef(null);

  // Get tenant hash from script data-tenant attribute
  const getTenantHash = () => {
    try {
      // Priority 1: Script tag data-tenant attribute
      const script = document.querySelector('script[src*="widget.js"]');
      const rawHash = script?.getAttribute('data-tenant') || '';
      const tenantHash = rawHash.replace(/\.js$/, '');
      
      if (tenantHash && tenantHash !== 'undefined' && tenantHash.length >= 8) {
        console.log('✅ Found tenant hash from script:', tenantHash.slice(0, 8) + '...');
        return tenantHash;
      }

      // Priority 2: From URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      const urlTenant = urlParams.get('t');
      
      if (urlTenant && urlTenant !== 'undefined' && urlTenant.length >= 8) {
        console.log('✅ Found tenant hash from URL:', urlTenant.slice(0, 8) + '...');
        return urlTenant;
      }

      // Priority 3: From global config
      if (window.PicassoConfig?.tenant && window.PicassoConfig.tenant !== 'undefined') {
        console.log('✅ Found tenant hash from PicassoConfig:', window.PicassoConfig.tenant.slice(0, 8) + '...');
        return window.PicassoConfig.tenant;
      }

      console.warn('⚠️ No valid tenant hash found, using development fallback');
      return 'fo85e6a06dcdf4'; // Development fallback
      
    } catch (error) {
      console.warn('Hash extraction failed:', error);
      return 'fo85e6a06dcdf4'; // Development fallback
    }
  };

  // FIXED: Pure hash + action config fetch
  const fetchConfigWithCacheCheck = async (tenantHash, force = false) => {
    try {
      // NEW: Pure hash + action system URL using environment config
      const configUrl = environmentConfig.getConfigUrl(tenantHash);
      
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      if (!force && configMetadata.current.etag) {
        headers['If-None-Match'] = configMetadata.current.etag;
      }
      if (!force && configMetadata.current.lastModified) {
        headers['If-Modified-Since'] = configMetadata.current.lastModified;
      }

      console.log(`🔄 Fetching config via NEW hash + action system`, {
        hash: tenantHash.slice(0, 8) + '...',
        force,
        hasETag: !!configMetadata.current.etag,
        url: configUrl
      });

      const response = await fetch(configUrl, {
        method: 'GET',
        headers,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-cache'
      });

      // Update last check time
      configMetadata.current.lastCheck = new Date().toISOString();

      console.log('📡 Response status:', response.status);

      if (response.status === 304) {
        console.log('✅ Config unchanged (304 Not Modified)');
        return { unchanged: true };
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      // Get new config data
      const newConfig = await response.json();
      
      // Update metadata
      configMetadata.current.etag = response.headers.get('etag');
      configMetadata.current.lastModified = response.headers.get('last-modified');
      configMetadata.current.tenantHash = tenantHash;

      console.log('✅ Config loaded successfully via NEW hash + action system', {
        hash: tenantHash.slice(0, 8) + '...',
        chatTitle: newConfig.chat_title,
        hasBranding: !!newConfig.branding,
        hasFeatures: !!newConfig.features,
        responseTime: 'immediate'
      });

      return { config: newConfig, changed: true };

    } catch (error) {
      console.error('❌ Config fetch error:', error);
      throw error;
    }
  };

  // Load tenant config using NEW hash + action system
  const loadTenantConfig = async (tenantHash) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`🔍 Loading config for hash: ${tenantHash.slice(0, 8)}... via NEW hash + action system`);
      
      // Load config using pure hash + action API
      const result = await fetchConfigWithCacheCheck(tenantHash, true);
      
      if (result.config) {
        setConfig(result.config);
        configMetadata.current.tenantHash = tenantHash;
        console.log('🎉 Config loaded successfully:', {
          chatTitle: result.config.chat_title,
          hash: tenantHash.slice(0, 8) + '...',
          apiType: 'hash-action-NEW'
        });
      }
    } catch (error) {
      console.error('❌ Failed to load config:', error);
      setError(error.message);
      
      // Use fallback config
      console.log('🔧 Using fallback config');
      setConfig(getFallbackConfig(tenantHash));
    } finally {
      setLoading(false);
    }
  };

  // Periodic config update checker
  const checkForConfigUpdates = async () => {
    const tenantHash = configMetadata.current.tenantHash;
    
    if (!tenantHash) {
      console.warn('⚠️ No tenant hash available for update check');
      return;
    }

    try {
      const result = await fetchConfigWithCacheCheck(tenantHash);
      
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
    }
  };

  // Set up automatic config checking
  const _startConfigWatcher = () => {
    // Clear any existing interval
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
    }

    // Check for updates every 5 minutes 
    // Note: Only check for updates if chat has no active messages to avoid disrupting conversations
    const checkInterval = 5 * 60 * 1000;
    
    const conditionalConfigCheck = () => {
      // Skip config update if there are active messages in the chat
      const chatHasMessages = window.picassoChatHasMessages;
      if (chatHasMessages) {
        console.log('⏸️ Skipping config update - chat has active messages');
        return;
      }
      checkForConfigUpdates();
    };
    
    updateIntervalRef.current = setInterval(conditionalConfigCheck, checkInterval);
    
    console.log(`🕐 Config update checker started (every ${checkInterval / 1000}s, respects active conversations)`);
  };

  // Manual refresh function
  const refreshConfig = async () => {
    console.log('🔄 Manual config refresh requested');
    const tenantHash = getTenantHash();
    await loadTenantConfig(tenantHash);
  };

  // Fallback config - generic, no hardcoded customer names
  const getFallbackConfig = (tenantHash) => {
    console.log('🔧 Generating fallback config');
    
    return {
      tenant_hash: tenantHash,
      chat_title: "Chat",
      welcome_message: "Hello! How can I help you today?",
      
      branding: {
        primary_color: "#3b82f6",
        font_family: "Inter, sans-serif",
        chat_title: "Chat",
        border_radius: "12px"
      },
      
      features: {
        uploads: false,
        photo_uploads: false,
        callout: false
      },
      
      quick_help: {
        enabled: false
      },
      
      action_chips: {
        enabled: false
      },
      
      metadata: {
        source: "fallback",
        generated_at: Date.now(),
        apiType: "hash-action-NEW"
      }
    };
  };

  // Initialize on mount
  useEffect(() => {
    const initializeConfig = async () => {
      const tenantHash = getTenantHash();
      console.log('🚀 Initializing config for tenant:', tenantHash);
      
      // Use the built-in loadTenantConfig function which properly manages state
      await loadTenantConfig(tenantHash);
    };

    initializeConfig();

    // Set up polling for config updates (every 5 minutes)
    const interval = setInterval(() => {
      checkForConfigUpdates();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Handle visibility change (check config when user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && config) {
        setTimeout(checkForConfigUpdates, 1000);
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
      tenantHash: configMetadata.current.tenantHash,
      lastModified: configMetadata.current.lastModified,
      apiType: 'hash-action-NEW'
    },
    features: {
      uploads: config?.features?.uploads || false,
      photoUploads: config?.features?.photo_uploads || false,
    }
  };

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
};

// Global functions for debugging - NEW hash + action system
if (typeof window !== 'undefined') {
  // Manual config refresh
  window.refreshPicassoConfig = () => {
    if (window.configProvider) {
      window.configProvider.refreshConfig();
    }
  };

  // Test health check action
  window.testHealthCheck = async (tenantHash) => {
    const hash = tenantHash || 'fo85e6a06dcdf4';
    console.log('🧪 Testing NEW health check action...');
    
    try {
      const healthCheckUrl = `${environmentConfig.API_BASE_URL}/Master_Function?action=health_check&t=${hash}`;
      const response = await fetch(healthCheckUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ NEW Health Check Action:', data);
        return data;
      } else {
        console.error('❌ Health Check Failed:', response.status);
        return null;
      }
    } catch (error) {
      console.error('❌ Health Check Error:', error);
      return null;
    }
  };

  // Test config loading action
  window.testConfigLoad = async (tenantHash) => {
    const hash = tenantHash || 'fo85e6a06dcdf4';
    console.log('🧪 Testing NEW get_config action...');
    
    try {
      const configLoadUrl = environmentConfig.getConfigUrl(hash);
      const response = await fetch(configLoadUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      });
      
      if (response.ok) {
        const config = await response.json();
        console.log('✅ NEW Config Load Action:', {
          chatTitle: config.chat_title,
          hasBranding: !!config.branding,
          hasFeatures: !!config.features,
          tenantHash: config.tenant_hash
        });
        return config;
      } else {
        const errorText = await response.text();
        console.error('❌ Config Load Failed:', response.status, errorText);
        return null;
      }
    } catch (error) {
      console.error('❌ Config Load Error:', error);
      return null;
    }
  };

  // Test chat action
  window.testChatAction = async (tenantHash, userInput = "Hello") => {
    const hash = tenantHash || 'fo85e6a06dcdf4';
    console.log('🧪 Testing NEW chat action...');
    
    try {
      const chatUrl = environmentConfig.getChatUrl(hash);
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors',
        body: JSON.stringify({
          tenant_hash: hash,
          user_input: userInput
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ NEW Chat Action:', data);
        return data;
      } else {
        const errorText = await response.text();
        console.error('❌ Chat Action Failed:', response.status, errorText);
        return null;
      }
    } catch (error) {
      console.error('❌ Chat Action Error:', error);
      return null;
    }
  };

  console.log(`
🛠️  PICASSO NEW PURE HASH + ACTION SYSTEM COMMANDS:
   testHealthCheck()             - Test action=health_check
   testConfigLoad()              - Test action=get_config  
   testChatAction()              - Test action=chat
   refreshPicassoConfig()        - Force refresh config
   
   NEW ENDPOINTS: /Master_Function?action=ACTION&t=HASH
   ✅ No parameters, no tenant IDs, no hardcoded customers
  `);

  console.log(`
🛠️  CONFIG API TEST COMMANDS:
   testConfigAPI("tenant_hash")    - Test config fetch
   testConfigAPI()                 - Test with current hash
  `);
}

// Hook for manual config refresh in components
export function useConfigRefresh() {
  const context = React.useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfigRefresh must be used within a ConfigProvider');
  }
  return context.refreshConfig;
}

// Export only the provider
export { ConfigProvider };