/**
 * Shared Chat Context
 * 
 * This context definition is shared between HTTP and Streaming providers.
 * It defines the contract that both providers must fulfill.
 */

import { createContext } from 'react';

export const ChatContext = createContext({
  // Core state
  messages: [],
  isTyping: false,
  sessionId: null,
  
  // Core actions
  sendMessage: async (userInput) => {},
  clearMessages: () => {},
  retryMessage: async (messageId) => {},
  updateMessage: (messageId, updates) => {},
  
  // Metadata
  conversationMetadata: {
    canLoadHistory: false,
    hasMoreHistory: false,
    isLoadingHistory: false
  },
  
  // Loading states
  isInitializing: false,
  isChatProviderReady: false,
  
  // Error state
  error: null,
  
  // Tenant info
  tenantHash: null,
  
  // Render mode for MessageBubble components
  renderMode: 'static', // default fallback
  
  // Feature flags (from config)
  features: {
    fileUpload: false,
    voiceInput: false,
    actionChips: true
  }
});

export default ChatContext;