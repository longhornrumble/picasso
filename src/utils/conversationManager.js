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
  // DynamoDB table names (matches Phase 2 deployment)
  SUMMARIES_TABLE: `${environmentConfig.ENVIRONMENT}-conversation-summaries`,
  MESSAGES_TABLE: `${environmentConfig.ENVIRONMENT}-recent-messages`,
  
  // Storage thresholds
  MAX_MESSAGES_IN_MEMORY: 50,
  MAX_MESSAGE_LENGTH: 2000,
  SUMMARY_TRIGGER_COUNT: 10, // Summarize after 10 messages
  PERSISTENCE_DELAY: 2000,   // 2 seconds delay before persisting
  
  // Cache settings
  CACHE_DURATION: 15 * 60 * 1000, // 15 minutes
  LOCAL_STORAGE_KEY: 'picasso_conversations',
  SESSION_STORAGE_KEY: 'picasso_current_conversation',
  
  // API endpoints
  SUMMARY_ENDPOINT: '/Master_Function?action=summarize_conversation',
  CONVERSATION_ENDPOINT: '/Master_Function?action=get_conversations'
};

/**
 * ConversationManager class handles all conversation persistence and summarization
 */
export class ConversationManager {
  constructor(tenantHash, sessionId) {
    this.tenantHash = tenantHash;
    this.sessionId = sessionId;
    this.conversationId = `conv_${tenantHash}_${Date.now()}`;
    this.messageBuffer = [];
    this.persistenceTimer = null;
    this.lastSummaryAt = 0;
    
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
   * Initialize conversation from existing session or create new
   */
  async initializeConversation() {
    try {
      // Try to restore from session storage first
      const existingConversation = this.loadFromSessionStorage();
      if (existingConversation) {
        this.conversationId = existingConversation.conversationId;
        this.messageBuffer = existingConversation.messages || [];
        this.metadata = { ...this.metadata, ...existingConversation.metadata };
        
        errorLogger.logInfo('📂 Restored conversation from session', {
          conversationId: this.conversationId,
          messageCount: this.messageBuffer.length
        });
        return;
      }
      
      // Try to get the most recent conversation for this tenant
      const recentConversation = await this.getMostRecentConversation();
      if (recentConversation) {
        this.conversationId = recentConversation.conversationId;
        this.messageBuffer = recentConversation.messages || [];
        this.metadata = { ...this.metadata, ...recentConversation.metadata };
        
        errorLogger.logInfo('📂 Restored conversation from DynamoDB', {
          conversationId: this.conversationId,
          messageCount: this.messageBuffer.length
        });
      } else {
        errorLogger.logInfo('🆕 Created new conversation', {
          conversationId: this.conversationId,
          tenantHash: this.metadata.tenantHash
        });
      }
      
      // Save initial state to session storage
      this.saveToSessionStorage();
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'conversation_initialization',
        tenantHash: this.metadata.tenantHash
      });
      
      // Fallback to new conversation
      errorLogger.logInfo('🔧 Using fallback new conversation due to initialization error');
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
   * Clear current conversation
   */
  async clearConversation(preserveInHistory = true) {
    try {
      if (preserveInHistory && this.messageBuffer.length > 0) {
        // Save to DynamoDB before clearing
        await this.persistConversation(true);
      }
      
      // Clear local state
      this.messageBuffer = [];
      this.conversationId = `conv_${this.tenantHash}_${Date.now()}`;
      this.metadata = {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        messageCount: 0,
        hasBeenSummarized: false,
        tenantHash: this.metadata.tenantHash
      };
      
      // Clear session storage
      this.clearSessionStorage();
      
      errorLogger.logInfo('🧹 Conversation cleared', {
        newConversationId: this.conversationId,
        preservedInHistory: preserveInHistory
      });
      
      return true;
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'clear_conversation',
        conversationId: this.conversationId
      });
      return false;
    }
  }
  
  /**
   * Get conversation history for tenant
   */
  async getConversationHistory(limit = 10) {
    try {
      return performanceMonitor.measure('get_conversation_history', async () => {
        const endpoint = environmentConfig.isDevelopment() 
          ? '/Master_Function?action=get_conversations'
          : environmentConfig.getConfigUrl(this.tenantHash).replace('get_config', 'get_conversations');
          
        const response = await fetch(`${endpoint}&limit=${limit}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          mode: 'cors'
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch conversation history: ${response.status}`);
        }
        
        const data = await response.json();
        return data.conversations || [];
      });
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'get_conversation_history',
        tenantHash: this.metadata.tenantHash
      });
      return [];
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
    try {
      // Generate summary of recent messages
      const messagesToSummarize = this.messageBuffer.slice(this.lastSummaryAt);
      const summary = await this.generateConversationSummary(messagesToSummarize);
      
      if (summary) {
        this.metadata.lastSummary = summary;
        this.metadata.hasBeenSummarized = true;
        this.lastSummaryAt = this.messageBuffer.length;
        
        errorLogger.logInfo('📝 Conversation summary generated', {
          conversationId: this.conversationId,
          summaryLength: summary.length
        });
      }
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'conversation_summary',
        conversationId: this.conversationId
      });
    }
  }
  
  async generateConversationSummary(messages) {
    try {
      if (messages.length < 3) return null; // Need at least a few messages to summarize
      
      const summaryRequest = {
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        })),
        conversationId: this.conversationId,
        requestType: 'summarize'
      };
      
      const endpoint = environmentConfig.isDevelopment() 
        ? '/Master_Function?action=chat'
        : environmentConfig.getChatUrl(this.tenantHash);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...summaryRequest,
          tenant_hash: this.tenantHash,
          session_id: this.sessionId,
          special_request: 'conversation_summary'
        }),
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`Summary request failed: ${response.status}`);
      }
      
      const data = await response.json();
      return data.summary || data.content || null;
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'generate_conversation_summary',
        conversationId: this.conversationId
      });
      return null;
    }
  }
  
  async persistConversation(forceImmediatePersistence = false) {
    try {
      if (this.messageBuffer.length === 0) return;
      
      const conversationData = {
        conversationId: this.conversationId,
        tenantHash: this.tenantHash,
        sessionId: this.sessionId,
        messages: this.messageBuffer,
        metadata: this.metadata,
        lastUpdated: new Date().toISOString()
      };
      
      if (forceImmediatePersistence) {
        // Save directly to DynamoDB via Lambda
        await this.saveToDynamoDB(conversationData);
      } else {
        // Save to localStorage for now (DynamoDB integration in later phase)
        this.saveToLocalStorage(conversationData);
      }
      
      errorLogger.logInfo('💾 Conversation persisted', {
        conversationId: this.conversationId,
        messageCount: this.messageBuffer.length,
        immediate: forceImmediatePersistence
      });
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'persist_conversation',
        conversationId: this.conversationId
      });
    }
  }
  
  async saveToDynamoDB(conversationData) {
    try {
      const endpoint = environmentConfig.isDevelopment() 
        ? '/Master_Function?action=save_conversation'
        : environmentConfig.getConfigUrl(this.tenantHash).replace('get_config', 'save_conversation');
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(conversationData),
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`DynamoDB save failed: ${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'save_to_dynamodb',
        conversationId: this.conversationId
      });
      throw error;
    }
  }
  
  saveToSessionStorage() {
    try {
      const sessionData = {
        conversationId: this.conversationId,
        messages: this.messageBuffer,
        metadata: this.metadata,
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
      
      // Only restore if less than cache duration
      if (age < CONVERSATION_CONFIG.CACHE_DURATION) {
        return data;
      }
      
      // Clear expired session data
      this.clearSessionStorage();
      return null;
      
    } catch (error) {
      errorLogger.logError(error, { context: 'load_session_storage' });
      this.clearSessionStorage();
      return null;
    }
  }
  
  saveToLocalStorage(conversationData) {
    try {
      const existing = localStorage.getItem(CONVERSATION_CONFIG.LOCAL_STORAGE_KEY);
      const conversations = existing ? JSON.parse(existing) : [];
      
      // Remove any existing conversation with same ID
      const filtered = conversations.filter(c => c.conversationId !== this.conversationId);
      
      // Add current conversation
      filtered.unshift({
        ...conversationData,
        savedAt: Date.now()
      });
      
      // Keep only recent conversations (max 20)
      const trimmed = filtered.slice(0, 20);
      
      localStorage.setItem(
        CONVERSATION_CONFIG.LOCAL_STORAGE_KEY,
        JSON.stringify(trimmed)
      );
      
    } catch (error) {
      errorLogger.logError(error, { context: 'save_local_storage' });
    }
  }
  
  async getMostRecentConversation() {
    try {
      // Try localStorage first
      const stored = localStorage.getItem(CONVERSATION_CONFIG.LOCAL_STORAGE_KEY);
      if (stored) {
        const conversations = JSON.parse(stored);
        const recentConversation = conversations.find(c => 
          c.tenantHash === this.tenantHash &&
          c.sessionId === this.sessionId
        );
        
        if (recentConversation) {
          return recentConversation;
        }
      }
      
      // Fallback to DynamoDB (future implementation)
      // For now, return null to create new conversation
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