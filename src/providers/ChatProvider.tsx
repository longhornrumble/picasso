/**
 * ChatProvider - Pure Orchestration Layer
 * 
 * Minimal orchestration layer that composes distributed providers and maintains
 * the unified useChat() interface. All implementation details are delegated to
 * specialized providers, making this a pure coordination layer.
 */

import * as React from 'react';
const { useContext, useMemo, useState, useEffect } = React;
import { useConfig } from '../hooks/useConfig';
import { UnifiedChatContext } from './ChatContextCompat';
import { config } from '../config/environment';

// Import distributed providers
import { ChatStateProvider, useChatState } from './ChatStateProvider';
import { ChatAPIProvider, useChatAPI, useChatAPISafe } from './ChatAPIProvider'; 
import { ChatStreamingProvider, useChatStreaming } from './ChatStreamingProvider';
import { ChatContentProvider, useChatContent } from './ChatContentProvider';
import { ChatMonitoringProvider, useChatMonitoring, useChatMonitoringSafe } from './ChatMonitoringProvider';
import { ChatDebugProvider, useChatDebug } from './ChatDebugProvider';

import type { ReactNode } from 'react';
import type { ValidTenantHash } from '../types/security';
import type { Duration } from '../types/branded';
import { createDuration } from '../types/branded';

/**
 * Unified Chat Interface - Maintains exact backward compatibility
 */
export interface UnifiedChatInterface {
  messages: any[]; isTyping: boolean; tenantConfig: any; isOnline: boolean; pendingRetries: Map<string, any>;
  hasInitializedMessages: boolean; welcomeMessage: string; addMessage: (message: any) => void;
  updateMessage: (id: string, updates: any) => void; clearMessages: () => void; retryMessage: (messageId: string) => Promise<void>;
  sendMessage: (message: string, sessionId: string, tenantHash: string, attachments?: File[], options?: any) => Promise<any>;
  isStreaming: boolean; streamingEnabled: boolean;
  _debug: { tenantHash: string | null; apiType: string; configLoaded: boolean; chatEndpoint: string;
    streamingSource: string; streamingReason: string; environment: string; networkStatus: string;
    pendingRetryCount: number; streamingEnabled: boolean;
    memoryStats: { activeControllers: number; activeTimeouts: number; sessionDurationMinutes: number;
      memoryGrowthAlerts: number; errorLogStats: any; }; };
}

export interface ChatProviderProps {
  children: ReactNode; tenantHash?: ValidTenantHash; enableDebug?: boolean;
  enableMonitoring?: boolean; monitoringInterval?: Duration;
}

// Removed useUnifiedChatOrchestrator - functionality moved to ChatOrchestratorImpl

/**
 * Loading interface fallback during initialization
 */
const createLoadingInterface = (): UnifiedChatInterface => ({
  messages: [], isTyping: false, tenantConfig: null, isOnline: navigator.onLine, pendingRetries: new Map(),
  hasInitializedMessages: false, welcomeMessage: "Loading...", addMessage: () => {}, updateMessage: () => {},
  clearMessages: () => {}, retryMessage: async () => {}, 
  sendMessage: async () => ({ error: 'Loading' }), isStreaming: false, streamingEnabled: false,
  _debug: { tenantHash: null, apiType: 'loading', configLoaded: false, chatEndpoint: 'loading', streamingSource: 'loading',
    streamingReason: 'loading', environment: 'loading', networkStatus: 'loading', pendingRetryCount: 0, streamingEnabled: false,
    memoryStats: { activeControllers: 0, activeTimeouts: 0, sessionDurationMinutes: 0, memoryGrowthAlerts: 0, errorLogStats: null } }
});

const ChatOrchestratorImpl: React.FC<{ children: ReactNode; tenantHash?: ValidTenantHash }> = ({ children, tenantHash }) => {
  // CRITICAL FIX: Get providers directly to ensure fresh references
  const stateProvider = useChatState();
  const apiProvider = useChatAPISafe();
  const streamingProvider = useChatStreaming();
  const contentProvider = useChatContent();
  const monitoringProvider = useChatMonitoringSafe();
  const debugProvider = useChatDebug();
  
  // Monitor message changes for logging only
  useEffect(() => {
    if (stateProvider && stateProvider.messages) {
      console.log('🔄 Message array changed:', stateProvider.messages.length);
    }
  }, [stateProvider?.messages]);

  // CRITICAL FIX: Build context value with proper message sync - no memoization
  const contextValue = (() => {
    if (!stateProvider) {
      console.log('⚠️ StateProvider not ready, returning loading interface');
      return createLoadingInterface();
    }

    // CRITICAL FIX: Get fresh message reference directly
    const currentMessages = stateProvider.messages;
    console.log('🎯 ChatOrchestratorImpl context value rebuilt:', {
      messagesLength: currentMessages.length,
      hasState: !!stateProvider,
      hasApi: !!apiProvider,
      tenantHashFromProp: tenantHash,
      firstMessageId: currentMessages[0]?.id,
      lastMessageId: currentMessages[currentMessages.length - 1]?.id
    });
    console.log('🔍 CRITICAL DEBUG - stateProvider messages direct access:', {
      stateProviderExists: !!stateProvider,
      messagesProperty: !!stateProvider.messages,
      messagesArray: stateProvider.messages,
      messagesLength: stateProvider.messages?.length,
      isArrayCheck: Array.isArray(stateProvider.messages)
    });

    return {
      messages: currentMessages, 
      isTyping: stateProvider.isTyping || false, 
      tenantConfig: null, // Will be set by useConfig
      isOnline: navigator.onLine,
      pendingRetries: apiProvider?.pendingRetries || new Map(), 
      hasInitializedMessages: currentMessages.length > 0,
      welcomeMessage: "Hello! How can I help you today!",
      
      addMessage: (message: any) => {
        console.log('🔍 ChatProvider addMessage called:', { message, hasMessageOps: !!stateProvider.messageOps });
        const result = stateProvider.messageOps?.addMessage({
          ...message, 
          id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: message.timestamp || new Date().toISOString()
        });
        return result;
      },
      
      updateMessage: (id: string, updates: any) => {
        const result = stateProvider.messageOps?.updateMessage(id, updates);
        return result;
      },
      
      clearMessages: () => {
        const result = stateProvider.messageOps?.clearMessages();
        return result;
      },
      
      retryMessage: async (messageId: string) => {
        if (!apiProvider?.retryMessage) {
          console.warn('⚠️ Cannot retry message: API provider not available');
          return Promise.resolve();
        }
        return apiProvider.retryMessage(messageId);
      },
      
      sendMessage: async (message: string, sessionId: string, tenantHash: string, attachments?: File[], options?: any) => {
        console.log('🚀 sendMessage called:', { message: message.substring(0, 50) + '...', sessionId, tenantHash });
        
        if (!apiProvider?.sendMessage) {
          console.warn('⚠️ API provider not available, sendMessage will fail');
          return { error: 'API provider not available' };
        }
        
        try {
          console.log('📨 Making API call via ChatAPIProvider');
          const result = await apiProvider.sendMessage(message, sessionId, tenantHash, attachments, options);
          console.log('✅ API call successful:', result);
          
          // Process API response to create bot message
          if (result.success && result.data && apiProvider.handleStandardResponse) {
            // Create user message object for handleStandardResponse
            const userMessage = {
              id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              sender: 'user',
              content: message,
              type: 'text',
              timestamp: new Date().toISOString()
            };
            
            // Create provider context for handleStandardResponse
            const providerContext = {
              tenantHash,
              sessionId,
              setLocalMessages: (messages) => {
                // Add messages to state through stateProvider
                if (stateProvider?.messageOps) {
                  // Handle both single message and array of messages
                  const messageArray = Array.isArray(messages) ? messages : [messages];
                  messageArray.forEach(msg => {
                    if (msg.sender === 'assistant') {
                      stateProvider.messageOps.addMessage(msg);
                      console.log('✅ Bot message added via handleStandardResponse:', msg.content?.substring(0, 50) + '...');
                    }
                  });
                }
              },
              errorLogger: {
                logInfo: (msg, data) => console.log(msg, data),
                logError: (msg, error) => console.error(msg, error),
                logWarning: (msg, data) => console.warn(msg, data)
              }
            };
            
            try {
              await apiProvider.handleStandardResponse(
                userMessage,
                message,
                tenantHash,
                sessionId,
                providerContext
              );
              console.log('✅ Response processed and bot message added');
            } catch (responseError) {
              console.error('❌ Error processing API response:', responseError);
            }
          }
          
          return result;
        } catch (error) {
          console.error('❌ sendMessage API call failed:', error);
          return { error: error.message || 'Unknown error' };
        }
      },
      
      isStreaming: streamingProvider?.isStreaming || false, 
      streamingEnabled: true,
      
      _debug: {
        // CRITICAL FIX: Ensure tenantHash is properly set
        tenantHash: tenantHash || 'undefined', 
        apiType: 'actions-only',
        configLoaded: false, 
        chatEndpoint: config.getChatUrl(tenantHash || config.getDefaultTenantHash()),
        streamingSource: 'orchestrator', 
        streamingReason: 'user_interaction', 
        environment: config.ENVIRONMENT,
        networkStatus: navigator.onLine ? 'online' : 'offline', 
        pendingRetryCount: 0, 
        streamingEnabled: true,
        memoryStats: { 
          activeControllers: 0, 
          activeTimeouts: 0, 
          sessionDurationMinutes: 0,
          memoryGrowthAlerts: 0, 
          errorLogStats: debugProvider?.logs?.length || null 
        }
      }
    };
  }, [
    stateProvider?.messages?.length, // Track messages array LENGTH, not reference
    stateProvider?.isTyping,
    apiProvider,
    streamingProvider,
    contentProvider,
    monitoringProvider,
    debugProvider,
    tenantHash // Critical: Include tenantHash in dependencies
  ]);
  
  return (
    <UnifiedChatContext.Provider value={contextValue}>
      {children}
    </UnifiedChatContext.Provider>
  );
};

/**
 * Main ChatProvider - Pure Provider Composition and Orchestration
 */
export const ChatProvider: React.FC<ChatProviderProps> = ({
  children, tenantHash, enableDebug = process.env.NODE_ENV === 'development',
  enableMonitoring = true, monitoringInterval = createDuration(30000)
}) => {
  const { config: tenantConfig, loading: configLoading } = useConfig();
  
  // CRITICAL FIX: Wait for config loading to complete before building provider config
  const stateProviderConfig = useMemo(() => {
    // If config is still loading, don't build the provider config yet
    if (configLoading) {
      console.log('⏳ ChatProvider waiting for config to load...');
      return null;
    }
    
    console.log('🔍 ChatProvider building stateProviderConfig with loaded config:', {
      hasTenantConfig: !!tenantConfig,
      welcome_message: tenantConfig?.welcome_message,
      action_chips: tenantConfig?.action_chips,
      configKeys: tenantConfig ? Object.keys(tenantConfig) : 'no config loaded'
    });
    
    // Now we know config loading is complete - build proper configuration
    const effectiveConfig = tenantConfig || {
      welcome_message: "Hello! How can I help you today?",
      action_chips: { enabled: false }
    };
    
    const providerConfig = {
      welcomeMessage: {
        enabled: true, 
        message: effectiveConfig.welcome_message || "Hello! How can I help you today?",
        actionChips: effectiveConfig.action_chips?.enabled && effectiveConfig.action_chips?.show_on_welcome 
          ? (effectiveConfig.action_chips?.default_chips || []).slice(0, effectiveConfig.action_chips?.max_display || 3) : [],
        showOnNewSession: true, 
        showOnRestore: false
      }
    };
    
    console.log('✅ ChatProvider stateProviderConfig built:', {
      welcomeMessageEnabled: providerConfig.welcomeMessage.enabled,
      welcomeMessageText: providerConfig.welcomeMessage.message,
      hasActionChips: providerConfig.welcomeMessage.actionChips.length > 0
    });
    
    return providerConfig;
  }, [tenantConfig, configLoading]);
  
  // CRITICAL FIX: Don't render providers until config is ready
  if (configLoading || !stateProviderConfig) {
    console.log('⏳ ChatProvider waiting for configuration, showing loading state...');
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: 'transparent',
        color: '#6b7280',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px'
      }}>
        Initializing chat...
      </div>
    );
  }

  console.log('🔍 ChatProvider rendering with tenantHash:', tenantHash);

  return (
    <ChatMonitoringProvider enableMonitoring={enableMonitoring} monitoringInterval={monitoringInterval}>
      <ChatContentProvider>
        <ChatStreamingProvider>
          <ChatAPIProvider>
            <ChatStateProvider tenantHash={tenantHash} configuration={stateProviderConfig}>
              <ChatDebugProvider enableDebug={enableDebug}>
                <ChatOrchestratorImpl tenantHash={tenantHash}>{children}</ChatOrchestratorImpl>
              </ChatDebugProvider>
            </ChatStateProvider>
          </ChatAPIProvider>
        </ChatStreamingProvider>
      </ChatContentProvider>
    </ChatMonitoringProvider>
  );
};

/**
 * Unified useChat hook - maintains exact backward compatibility
 */
export const useChat = (): UnifiedChatInterface => {
  const context = useContext(UnifiedChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  
  // CRITICAL DEBUG: Log what consumers are getting
  console.log('🎯 useChat hook accessed - context data:', {
    messagesLength: context.messages?.length || 0,
    hasMessages: !!context.messages,
    firstMessage: context.messages?.[0]?.id || 'none',
    tenantHash: context._debug?.tenantHash,
    hasDebug: !!context._debug
  });
  
  return context;
};

export default ChatProvider;
export { getChatContext } from './ChatContextCompat';
export { useChatState, useChatAPI, useChatAPISafe, useChatStreaming, useChatContent, useChatMonitoring, useChatMonitoringSafe, useChatDebug };