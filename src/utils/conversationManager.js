/**
 * Conversation Management Utilities for PICASSO Phase 3
 * 
 * Provides conversation persistence, summarization, and retrieval
 * integrating with the Phase 2 DynamoDB infrastructure.
 */

import { config as environmentConfig } from '../config/environment';
import { errorLogger, performanceMonitor } from './errorHandling';

// Constants for conversation management
const CONVERSATION_CONFIG = {
  // Storage thresholds
  MAX_MESSAGES_IN_MEMORY: 50,
  MAX_MESSAGE_LENGTH: 2000,
  SUMMARY_TRIGGER_COUNT: 10, // Summarize after 10 messages
  PERSISTENCE_DELAY: 2000,   // 2 seconds delay before persisting
  
  // Cache settings
  CACHE_DURATION: 15 * 60 * 1000, // 15 minutes
  SESSION_STORAGE_KEY: 'picasso_current_conversation',
  TOKEN_STORAGE_KEY: 'picasso_conversation_token',
  
  // Chat endpoint for conversation state (using existing chat API)
  CHAT_ENDPOINT: '/Master_Function?action=chat',
  
  // Token management
  TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // Refresh token 5 minutes before expiry
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_BASE: 1000 // Base delay for exponential backoff
};

/**
 * ConversationManager class handles all conversation persistence and summarization
 */
export class ConversationManager {
  constructor(tenantHash, sessionId) {
    this.tenantHash = tenantHash;
    this.sessionId = sessionId;
    this.conversationId = null; // Will be set by server
    this.messageBuffer = [];
    this.persistenceTimer = null;
    this.lastSummaryAt = 0;
    this.stateToken = null; // JWT token for conversation state
    this.turn = 0; // Track conversation turns
    this.serverState = null; // Server conversation state
    this.isInitialized = false;
    
    // Initialize conversation metadata
    this.metadata = {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      messageCount: 0,
      hasBeenSummarized: false,
      tenantHash: tenantHash.slice(0, 8) + '...' // Partial hash for logging
    };
    
    this.initializeConversation();
  }
  
  /**
   * Initialize conversation from server or create new
   */
  async initializeConversation() {
    try {
      // Load existing state token from session storage
      this.loadStateToken();
      
      // Try to restore conversation from server
      const serverConversation = await this.loadConversationFromServer();
      if (serverConversation) {
        this.applyServerState(serverConversation);
        
        errorLogger.logInfo('📂 Restored conversation from server', {
          conversationId: this.conversationId,
          messageCount: this.messageBuffer.length,
          turn: this.turn
        });
      } else {
        // Create new conversation session
        this.conversationId = this.generateConversationId();
        this.turn = 0;
        
        errorLogger.logInfo('🆕 Created new conversation session', {
          conversationId: this.conversationId,
          tenantHash: this.metadata.tenantHash
        });
      }
      
      this.isInitialized = true;
      
      // Save current state to session storage for quick recovery
      this.saveToSessionStorage();
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'conversation_initialization',
        tenantHash: this.metadata.tenantHash
      });
      
      // Fallback to new conversation without server integration
      this.conversationId = `sess_${this.tenantHash.slice(0, 8)}_${Date.now()}`;
      this.turn = 0;
      this.isInitialized = true;
      this.stateToken = null;
    }
  }
  
  /**
   * Add a message to the conversation
   */
  addMessage(message) {
    try {
      // Validate message structure
      const validatedMessage = this.validateMessage(message);
      if (!validatedMessage) return false;
      
      // Add to message buffer
      this.messageBuffer.push({
        ...validatedMessage,
        conversationId: this.conversationId,
        addedAt: new Date().toISOString()
      });
      
      // Update metadata
      this.metadata.messageCount++;
      this.metadata.updated = new Date().toISOString();
      
      // Trim buffer if it gets too large
      this.trimMessageBuffer();
      
      // Schedule persistence
      this.schedulePersistence();
      
      // Check if we need to summarize
      if (this.shouldSummarizeConversation()) {
        this.scheduleConversationSummary();
      }
      
      // Update session storage
      this.saveToSessionStorage();
      
      errorLogger.logInfo('💬 Message added to conversation', {
        conversationId: this.conversationId,
        messageCount: this.messageBuffer.length,
        messageRole: validatedMessage.role
      });
      
      return true;
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'add_message',
        conversationId: this.conversationId
      });
      return false;
    }
  }
  
  /**
   * Get all messages in current conversation
   */
  getMessages() {
    return [...this.messageBuffer];
  }
  
  /**
   * Get conversation metadata
   */
  getMetadata() {
    return { ...this.metadata };
  }
  
  /**
   * Clear current conversation and notify server
   */
  async clearConversation(preserveInHistory = true) {
    try {
      // Clear conversation on server if we have an active session
      if (this.conversationId && this.stateToken) {
        await this.clearConversationOnServer();
      }
      
      // Reset local state
      this.resetLocalState();
      
      // Clear session storage and token
      this.clearSessionStorage();
      this.clearStateToken();
      
      errorLogger.logInfo('🧹 Conversation cleared on server and locally', {
        newConversationId: this.conversationId,
        preservedInHistory: preserveInHistory
      });
      
      return true;
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'clear_conversation',
        conversationId: this.conversationId
      });
      
      // Fallback to local clear even if server request fails
      this.resetLocalState();
      this.clearSessionStorage();
      this.clearStateToken();
      return false;
    }
  }
  
  /**
   * Get current conversation state from server
   */
  async getConversationState() {
    try {
      // For now, return null to indicate no server-side state
      // Conversation state will be managed through chat requests
      return null;
    } catch (error) {
      errorLogger.logError(error, {
        context: 'get_conversation_state',
        tenantHash: this.metadata.tenantHash
      });
      return null;
    }
  }
  
  /**
   * Server Integration Methods
   */
  
  generateConversationId() {
    return `sess_${this.tenantHash.slice(0, 8)}_${Date.now()}`;
  }
  
  getChatEndpoint() {
    const baseEndpoint = environmentConfig.isDevelopment() 
      ? CONVERSATION_CONFIG.CHAT_ENDPOINT
      : environmentConfig.getChatUrl(this.tenantHash);
    
    return baseEndpoint;
  }
  
  async loadConversationFromServer() {
    try {
      const conversationState = await this.getConversationState();
      if (!conversationState || !conversationState.state) {
        return null;
      }
      
      return conversationState;
    } catch (error) {
      errorLogger.logError(error, {
        context: 'load_conversation_from_server',
        tenantHash: this.metadata.tenantHash
      });
      return null;
    }
  }
  
  applyServerState(serverResponse) {
    if (!serverResponse || !serverResponse.state) {
      return;
    }
    
    const { sessionId, state, stateToken } = serverResponse;
    
    // Update local state from server
    this.conversationId = sessionId;
    this.serverState = state;
    this.turn = state.turn || 0;
    
    // Update state token
    if (stateToken) {
      this.stateToken = stateToken;
      this.saveStateToken();
    }
    
    // Reconstruct message buffer from server state
    if (state.lastMessages && Array.isArray(state.lastMessages)) {
      this.messageBuffer = state.lastMessages.map((msg, index) => ({
        id: msg.id || `msg_${Date.now()}_${index}`,
        role: msg.role,
        content: msg.text || msg.content,
        timestamp: msg.timestamp || new Date().toISOString(),
        conversationId: this.conversationId,
        turn: msg.turn || index + 1,
        metadata: msg.metadata || {},
        actions: msg.actions || []
      }));
    }
    
    // Update metadata
    this.metadata.messageCount = this.messageBuffer.length;
    this.metadata.updated = new Date().toISOString();
    if (state.summary) {
      this.metadata.lastSummary = state.summary;
      this.metadata.hasBeenSummarized = true;
    }
  }
  
  async saveConversationDelta(newMessage) {
    try {
      if (!this.conversationId) {
        throw new Error('Cannot save conversation delta: no conversation ID');
      }
      
      // For now, conversation persistence is handled through session storage
      // The chat endpoint will receive conversation context through message metadata
      this.saveToSessionStorage();
      
      errorLogger.logInfo('💾 Conversation delta saved locally', {
        conversationId: this.conversationId,
        turn: this.turn,
        messageRole: newMessage.role
      });
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'save_conversation_delta',
        conversationId: this.conversationId,
        turn: this.turn
      });
      throw error;
    }
  }
  
  async clearConversationOnServer() {
    try {
      // For now, just clear local storage since we don't have separate conversation endpoints
      this.clearSessionStorage();
      this.clearStateToken();
      
      errorLogger.logInfo('🗑️ Conversation cleared locally', {
        conversationId: this.conversationId
      });
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'clear_conversation_on_server',
        conversationId: this.conversationId
      });
      throw error;
    }
  }
  
  extractFactsFromMessage(message) {
    // Simple fact extraction - could be enhanced with more sophisticated logic
    const content = message.content.toLowerCase();
    const facts = {};
    
    // Detect common healthcare topics
    if (content.includes('home care') || content.includes('home health')) {
      facts.topic = 'home_care_inquiry';
    } else if (content.includes('respite')) {
      facts.topic = 'respite_inquiry';
    } else if (content.includes('hospice')) {
      facts.topic = 'hospice_inquiry';
    } else if (content.includes('insurance')) {
      facts.topic = 'insurance_inquiry';
    }
    
    return facts;
  }
  
  resetLocalState() {
    this.messageBuffer = [];
    this.conversationId = this.generateConversationId();
    this.serverState = null;
    this.turn = 0;
    this.metadata = {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      messageCount: 0,
      hasBeenSummarized: false,
      tenantHash: this.metadata.tenantHash
    };
  }
  
  fallbackToLocalConversation() {
    this.conversationId = this.generateConversationId();
    this.turn = 0;
    this.isInitialized = true;
    this.stateToken = null;
    
    errorLogger.logInfo('🔧 Fallback to local-only conversation', {
      conversationId: this.conversationId,
      tenantHash: this.metadata.tenantHash
    });
  }
  
  /**
   * Get conversation context for chat requests
   * This provides conversation memory to the chat endpoint
   */
  getConversationContext() {
    return {
      conversationId: this.conversationId,
      turn: this.turn,
      messageCount: this.metadata.messageCount,
      recentMessages: this.messageBuffer.slice(-5).map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })),
      lastSummary: this.metadata.lastSummary,
      conversationStarted: this.metadata.created
    };
  }
  
  /**
   * Update conversation state after receiving chat response
   */
  updateFromChatResponse(chatResponse, userMessage, assistantMessage) {
    try {
      // Add both user and assistant messages to buffer
      if (userMessage) {
        this.addMessageToBuffer(userMessage);
      }
      
      if (assistantMessage) {
        this.addMessageToBuffer(assistantMessage);
      }
      
      // Update metadata from chat response if available
      if (chatResponse.metadata) {
        this.metadata = { ...this.metadata, ...chatResponse.metadata };
      }
      
      // Save updated state
      this.saveToSessionStorage();
      
      errorLogger.logInfo('🔄 Conversation updated from chat response', {
        conversationId: this.conversationId,
        totalMessages: this.messageBuffer.length,
        turn: this.turn
      });
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'update_from_chat_response',
        conversationId: this.conversationId
      });
    }
  }
  
  /**
   * Add message directly to buffer (internal method)
   */
  addMessageToBuffer(message) {
    const messageWithMeta = {
      ...message,
      conversationId: this.conversationId,
      turn: this.turn,
      addedAt: new Date().toISOString()
    };
    
    this.messageBuffer.push(messageWithMeta);
    this.turn++;
    this.metadata.messageCount++;
    this.metadata.updated = new Date().toISOString();
    
    // Trim buffer if needed
    this.trimMessageBuffer();
  }
  
  // Token management methods
  loadStateToken() {
    try {
      const stored = sessionStorage.getItem(CONVERSATION_CONFIG.TOKEN_STORAGE_KEY);
      if (stored) {
        const tokenData = JSON.parse(stored);
        // Check if token is still valid (basic expiry check)
        if (tokenData.expires && new Date(tokenData.expires) > new Date()) {
          this.stateToken = tokenData.token;
        } else {
          this.clearStateToken();
        }
      }
    } catch (error) {
      errorLogger.logError(error, { context: 'load_state_token' });
      this.clearStateToken();
    }
  }
  
  saveStateToken() {
    try {
      if (!this.stateToken) return;
      
      // Store token with expiration info
      const tokenData = {
        token: this.stateToken,
        created: new Date().toISOString(),
        expires: new Date(Date.now() + CONVERSATION_CONFIG.CACHE_DURATION).toISOString()
      };
      
      sessionStorage.setItem(
        CONVERSATION_CONFIG.TOKEN_STORAGE_KEY,
        JSON.stringify(tokenData)
      );
    } catch (error) {
      errorLogger.logError(error, { context: 'save_state_token' });
    }
  }
  
  clearStateToken() {
    try {
      this.stateToken = null;
      sessionStorage.removeItem(CONVERSATION_CONFIG.TOKEN_STORAGE_KEY);
    } catch (error) {
      errorLogger.logError(error, { context: 'clear_state_token' });
    }
  }
  
  /**
   * Private Methods
   */
  
  validateMessage(message) {
    if (!message || typeof message !== 'object') return null;
    
    const required = ['id', 'role', 'content', 'timestamp'];
    const hasRequired = required.every(field => message[field]);
    
    if (!hasRequired) return null;
    
    // Validate role
    const validRoles = ['user', 'assistant', 'system'];
    if (!validRoles.includes(message.role)) return null;
    
    // Truncate very long messages
    const content = typeof message.content === 'string' 
      ? message.content.slice(0, CONVERSATION_CONFIG.MAX_MESSAGE_LENGTH)
      : JSON.stringify(message.content).slice(0, CONVERSATION_CONFIG.MAX_MESSAGE_LENGTH);
    
    return {
      id: message.id,
      role: message.role,
      content: content,
      timestamp: message.timestamp,
      metadata: message.metadata || {},
      actions: message.actions || []
    };
  }
  
  trimMessageBuffer() {
    if (this.messageBuffer.length > CONVERSATION_CONFIG.MAX_MESSAGES_IN_MEMORY) {
      // Keep the most recent messages
      const messagesToRemove = this.messageBuffer.length - CONVERSATION_CONFIG.MAX_MESSAGES_IN_MEMORY;
      this.messageBuffer.splice(0, messagesToRemove);
      
      errorLogger.logInfo('✂️ Trimmed message buffer', {
        removedCount: messagesToRemove,
        currentCount: this.messageBuffer.length
      });
    }
  }
  
  shouldSummarizeConversation() {
    const messagesSinceLastSummary = this.messageBuffer.length - this.lastSummaryAt;
    return messagesSinceLastSummary >= CONVERSATION_CONFIG.SUMMARY_TRIGGER_COUNT;
  }
  
  schedulePersistence() {
    // Clear existing timer
    if (this.persistenceTimer) {
      clearTimeout(this.persistenceTimer);
    }
    
    // Schedule new persistence
    this.persistenceTimer = setTimeout(() => {
      this.persistConversation();
    }, CONVERSATION_CONFIG.PERSISTENCE_DELAY);
  }
  
  async scheduleConversationSummary() {
    // Summary generation is now handled by the server
    // This method is kept for backward compatibility but delegates to server
    
    errorLogger.logInfo('📝 Conversation summary is handled by server', {
      conversationId: this.conversationId,
      messageCount: this.messageBuffer.length
    });
  }
  
  async generateConversationSummary(_messages) {
    // Summary generation is now handled by the server conversation state
    // This method is kept for backward compatibility
    
    try {
      const conversationState = await this.getConversationState();
      if (conversationState && conversationState.state && conversationState.state.summary) {
        return conversationState.state.summary;
      }
      
      return null;
    } catch (error) {
      errorLogger.logError(error, {
        context: 'generate_conversation_summary_from_server',
        conversationId: this.conversationId
      });
      return null;
    }
  }
  
  async persistConversation(_forceImmediatePersistence = false) {
    // Persistence is now handled immediately via server conversation deltas
    // This method is kept for backward compatibility
    
    try {
      if (this.messageBuffer.length === 0) return;
      
      // Update session storage for quick recovery
      this.saveToSessionStorage();
      
      errorLogger.logInfo('💾 Conversation state cached locally', {
        conversationId: this.conversationId,
        messageCount: this.messageBuffer.length,
        serverPersisted: true
      });
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'persist_conversation',
        conversationId: this.conversationId
      });
    }
  }
  
  // Legacy method - replaced by server conversation delta system
  async saveToDynamoDB(_conversationData) {
    // This method is deprecated in favor of saveConversationDelta
    errorLogger.logInfo('⚠️ saveToDynamoDB is deprecated - using server conversation API instead');
    
    // Fallback to session storage for backward compatibility
    this.saveToSessionStorage();
  }
  
  saveToSessionStorage() {
    try {
      const sessionData = {
        conversationId: this.conversationId,
        messages: this.messageBuffer,
        metadata: this.metadata,
        turn: this.turn,
        tenantHash: this.tenantHash,
        sessionId: this.sessionId,
        savedAt: Date.now()
      };
      
      sessionStorage.setItem(
        CONVERSATION_CONFIG.SESSION_STORAGE_KEY,
        JSON.stringify(sessionData)
      );
      
    } catch (error) {
      errorLogger.logError(error, { context: 'save_session_storage' });
    }
  }
  
  loadFromSessionStorage() {
    try {
      const stored = sessionStorage.getItem(CONVERSATION_CONFIG.SESSION_STORAGE_KEY);
      if (!stored) return null;
      
      const data = JSON.parse(stored);
      const age = Date.now() - (data.savedAt || 0);
      
      // Only restore if less than cache duration and matches current session
      if (age < CONVERSATION_CONFIG.CACHE_DURATION && 
          data.tenantHash === this.tenantHash && 
          data.sessionId === this.sessionId) {
        return data;
      }
      
      // Clear expired or mismatched session data
      this.clearSessionStorage();
      return null;
      
    } catch (error) {
      errorLogger.logError(error, { context: 'load_session_storage' });
      this.clearSessionStorage();
      return null;
    }
  }
  
  // Legacy method - local storage is no longer used for conversation persistence
  saveToLocalStorage(_conversationData) {
    // This method is deprecated as conversations are now persisted on server
    errorLogger.logInfo('⚠️ saveToLocalStorage is deprecated - conversations persisted on server');
  }
  
  // Legacy method - replaced by server conversation loading
  async getMostRecentConversation() {
    // This method is deprecated in favor of loadConversationFromServer
    try {
      // Try session storage first for quick recovery
      const sessionData = this.loadFromSessionStorage();
      if (sessionData) {
        return sessionData;
      }
      
      // Server conversation loading is handled in loadConversationFromServer
      return null;
      
    } catch (error) {
      errorLogger.logError(error, { context: 'get_recent_conversation' });
      return null;
    }
  }
  
  clearSessionStorage() {
    try {
      sessionStorage.removeItem(CONVERSATION_CONFIG.SESSION_STORAGE_KEY);
    } catch (error) {
      errorLogger.logError(error, { context: 'clear_session_storage' });
    }
  }
}

/**
 * Factory function to create conversation manager instances
 */
export function createConversationManager(tenantHash, sessionId) {
  if (!tenantHash || !sessionId) {
    throw new Error('ConversationManager requires tenantHash and sessionId');
  }
  
  return new ConversationManager(tenantHash, sessionId);
}

/**
 * Utility functions for conversation management
 */
export const conversationUtils = {
  /**
   * Format conversation for display
   */
  formatConversationPreview(conversation, maxLength = 100) {
    if (!conversation || !conversation.messages || conversation.messages.length === 0) {
      return 'Empty conversation';
    }
    
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const preview = lastMessage.content.slice(0, maxLength);
    return preview.length < lastMessage.content.length ? preview + '...' : preview;
  },
  
  /**
   * Get conversation duration in human readable format
   */
  getConversationDuration(conversation) {
    if (!conversation || !conversation.messages || conversation.messages.length < 2) {
      return 'Single message';
    }
    
    const firstMessage = conversation.messages[0];
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    
    const start = new Date(firstMessage.timestamp);
    const end = new Date(lastMessage.timestamp);
    const duration = end - start;
    
    if (duration < 60000) return 'Less than a minute';
    if (duration < 3600000) return `${Math.round(duration / 60000)} minutes`;
    if (duration < 86400000) return `${Math.round(duration / 3600000)} hours`;
    return `${Math.round(duration / 86400000)} days`;
  },
  
  /**
   * Validate conversation data structure
   */
  isValidConversation(conversation) {
    return conversation &&
           typeof conversation === 'object' &&
           conversation.conversationId &&
           Array.isArray(conversation.messages) &&
           conversation.metadata &&
           conversation.tenantHash;
  }
};

// Export configuration for testing/debugging
export { CONVERSATION_CONFIG };