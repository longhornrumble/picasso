import { createContext, useState, useEffect, useRef, useContext } from 'react';
import { config as environmentConfig } from '../config/environment';

const ConfigContext = createContext();

// Export provider as named export
const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // RACE CONDITION FIX: Add initialization lock
  const initializationLockRef = useRef({
    isInitializing: false,
    initializationPromise: null
  });
  
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
      // Priority 1: From URL parameter (THIS IS HOW IFRAME GETS IT!)
      const urlParams = new URLSearchParams(window.location.search);
      const urlTenant = urlParams.get('t');
      
      if (urlTenant && urlTenant !== 'undefined' && urlTenant.length >= 8) {
        console.log('✅ Found tenant hash from URL:', urlTenant.slice(0, 8) + '...');
        return urlTenant;
      }

      // Priority 2: Script tag data-tenant attribute (parent page only)
      const script = document.querySelector('script[src*="widget.js"]');
      const rawHash = script?.getAttribute('data-tenant') || '';
      const tenantHash = rawHash.replace(/\.js$/, '');
      
      if (tenantHash && tenantHash !== 'undefined' && tenantHash.length >= 8) {
        console.log('✅ Found tenant hash from script:', tenantHash.slice(0, 8) + '...');
        return tenantHash;
      }

      // Priority 3: From global config
      if (window.PicassoConfig?.tenant && window.PicassoConfig.tenant !== 'undefined') {
        console.log('✅ Found tenant hash from PicassoConfig:', window.PicassoConfig.tenant.slice(0, 8) + '...');
        return window.PicassoConfig.tenant;
      }

      console.warn('⚠️ No valid tenant hash found, using environment default');
      return environmentConfig.getDefaultTenantHash();
      
    } catch (error) {
      console.warn('Hash extraction failed:', error);
      return environmentConfig.getDefaultTenantHash();
    }
  };

  // FIXED: Pure hash + action config fetch
  const fetchConfigWithCacheCheck = async (tenantHash, force = false) => {
    try {
      // Use the Master_Function endpoint for config
      const configUrl = environmentConfig.getConfigUrl(tenantHash);
      
      // Check cache first with version validation
      const cacheKey = `picasso-config-${tenantHash}`;
      const cachedData = sessionStorage.getItem(cacheKey);
      
      if (!force && cachedData) {
        const cached = JSON.parse(cachedData);
        const cacheAge = Date.now() - cached.timestamp;
        const cacheTimeout = 2 * 60 * 1000; // 2 minutes instead of 5
        
        if (cacheAge < cacheTimeout) {
          // Skip version check for now - Lambda doesn't support HEAD
          console.log('✅ Using cached config', {
            cacheAge: Math.round(cacheAge / 1000) + 's',
            cacheTimeout: Math.round(cacheTimeout / 1000) + 's'
          });
          return { config: cached.config, unchanged: true };
        }
      }

      console.log(`🔄 Fetching config from Lambda Master_Function`, {
        hash: tenantHash.slice(0, 8) + '...',
        force,
        url: configUrl
      });

      let response = await fetch(configUrl, environmentConfig.getRequestConfig({
        method: 'GET',
        cache: 'no-cache'
      }));

      // Update last check time
      configMetadata.current.lastCheck = new Date().toISOString();

      console.log('📡 Response status:', response.status);

      // If primary endpoint fails with 404, it means the tenant hash is invalid
      if (response.status === 404) {
        console.warn('⚠️ Tenant configuration not found - invalid or unauthorized tenant hash');
        // Don't try fallback endpoints for security - fail closed
      }

      if (response.status === 404) {
        // Handle missing tenant gracefully with fallback
        console.warn('⚠️ Tenant config not found (404), using fallback');
        return { config: getFallbackConfig(tenantHash), changed: true };
      }

      if (!response.ok) {
        // Handle different error responses from Lambda
        if (response.status === 403) {
          console.error('❌ Access denied - invalid tenant hash');
        } else if (response.status === 500) {
          console.error('❌ Lambda function error');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get new config data
      const newConfig = await response.json();
      
      // Get version info from Lambda response headers
      const version = response.headers.get('etag') || 
                     response.headers.get('x-version-id') || 
                     Date.now().toString();
      
      // Update metadata
      configMetadata.current.etag = response.headers.get('etag');
      configMetadata.current.lastModified = response.headers.get('last-modified');
      configMetadata.current.tenantHash = tenantHash;

      // Cache the config with version
      const cacheData = {
        config: newConfig,
        version: version,
        timestamp: Date.now()
      };
      sessionStorage.setItem(`picasso-config-${tenantHash}`, JSON.stringify(cacheData));

      console.log('✅ Config loaded successfully from Lambda Master_Function', {
        hash: tenantHash.slice(0, 8) + '...',
        chatTitle: newConfig.chat_title,
        hasBranding: !!newConfig.branding,
        hasFeatures: !!newConfig.features,
        version: version
      });

      return { config: newConfig, changed: true };

    } catch (error) {
      console.error('❌ Config fetch error:', error);
      throw error;
    }
  };

  // Load tenant config using NEW hash + action system
  const loadTenantConfig = async (tenantHash) => {
    // RACE CONDITION FIX: Check if already initializing
    if (initializationLockRef.current.isInitializing) {
      console.log('🔒 Config initialization already in progress, waiting...');
      return await initializationLockRef.current.initializationPromise;
    }
    
    // Set initialization lock
    initializationLockRef.current.isInitializing = true;
    const initPromise = (async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log(`🔍 Loading config for hash: ${tenantHash.slice(0, 8)}... via Lambda Master_Function`);
        
        // Load config using pure hash + action API
        const result = await fetchConfigWithCacheCheck(tenantHash, true);
        
        if (result.config) {
          setConfig(result.config);
          configMetadata.current.tenantHash = tenantHash;
          console.log('🎉 Config loaded successfully:', {
            chatTitle: result.config.chat_title,
            hash: tenantHash.slice(0, 8) + '...',
            apiType: 'lambda-master-function'
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
        // Release initialization lock
        initializationLockRef.current.isInitializing = false;
        initializationLockRef.current.initializationPromise = null;
      }
    })();
    
    // Store the promise for concurrent calls
    initializationLockRef.current.initializationPromise = initPromise;
    return await initPromise;
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

    // Check for updates every 2 minutes (reduced from 5)
    // Note: Only check for updates if chat has no active messages to avoid disrupting conversations
    const checkInterval = 2 * 60 * 1000;
    
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
        apiType: "lambda-master-function"
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

    // Set up polling for config updates (every 2 minutes)
    const interval = setInterval(() => {
      checkForConfigUpdates();
    }, 2 * 60 * 1000);
    
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
      apiType: 'lambda-master-function'
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

// Global functions for debugging - S3/CloudFront system
if (typeof window !== 'undefined') {
  // Manual config refresh
  window.refreshPicassoConfig = () => {
    if (window.configProvider) {
      window.configProvider.refreshConfig();
    }
  };

  // Test health check action
  window.testHealthCheck = async (tenantHash) => {
    const hash = tenantHash || environmentConfig.getDefaultTenantHash();
    console.log('🧪 Testing health check action...');
    
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
        console.log('✅ Health Check Action:', data);
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

  // Test config loading from Lambda Master_Function
  window.testConfigLoad = async (tenantHash) => {
    const hash = tenantHash || environmentConfig.getDefaultTenantHash();
    console.log('🧪 Testing Lambda Master_Function config load...');
    
    try {
      const configLoadUrl = environmentConfig.getConfigUrl(hash);
      const response = await fetch(configLoadUrl, environmentConfig.getRequestConfig({
        method: 'GET',
        cache: 'no-cache'
      }));
      
      if (response.ok) {
        const config = await response.json();
        console.log('✅ Lambda Config Load:', {
          chatTitle: config.chat_title,
          hasBranding: !!config.branding,
          hasFeatures: !!config.features,
          tenantHash: config.tenant_hash,
          version: response.headers.get('etag') || response.headers.get('x-version-id')
        });
        return config;
      } else {
        console.error('❌ Config Load Failed:', response.status);
        return null;
      }
    } catch (error) {
      console.error('❌ Config Load Error:', error);
      return null;
    }
  };

  // Test chat action
  window.testChatAction = async (tenantHash, userInput = "Hello") => {
    const hash = tenantHash || environmentConfig.getDefaultTenantHash();
    console.log('🧪 Testing chat action...');
    
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
        console.log('✅ Chat Action:', data);
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
🛠️  PICASSO LAMBDA MASTER_FUNCTION COMMANDS:
   testHealthCheck()             - Test action=health_check
   testConfigLoad()              - Test Lambda config load  
   testChatAction()              - Test action=chat
   refreshPicassoConfig()        - Force refresh config
   
   CONFIG SOURCE: Lambda Master_Function
   ✅ Hash-based auth, tenant inference, 2-minute cache
  `);

  console.log(`
🛠️  CONFIG API TEST COMMANDS:
   testConfigAPI("tenant_hash")    - Test config fetch
   testConfigAPI()                 - Test with current hash
  `);
}

// Hook for manual config refresh in components
export function useConfigRefresh() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfigRefresh must be used within a ConfigProvider');
  }
  return context.refreshConfig;
}

// Hook to use the config context
export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}

// Export only the provider
export { ConfigProvider };