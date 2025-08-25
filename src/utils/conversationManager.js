/**
 * Conversation Management Utilities for PICASSO Phase 3
 * 
 * Provides conversation persistence, summarization, and retrieval
 * integrating with the Phase 2 DynamoDB infrastructure.
 */

import { config as environmentConfig } from '../config/environment';
import { errorLogger, performanceMonitor } from './errorHandling';
import { createLogger } from './logger';

const logger = createLogger('ConversationManager');

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
    
    // Check for existing conversation ID in sessionStorage for conversation recall
    const existingConversationId = sessionStorage.getItem('picasso_conversation_id');
    if (existingConversationId && existingConversationId.startsWith('session_')) {
      this.conversationId = existingConversationId;
      logger.debug('♻️ Using existing conversation ID from storage:', this.conversationId);
    } else {
      // Initialize conversationId with sessionId (may be updated by server)
      this.conversationId = sessionId; // Start with sessionId, server may override
    }
    this.messageBuffer = [];
    this.persistenceTimer = null;
    this.lastSummaryAt = 0;
    this.stateToken = null; // JWT token for conversation state
    this.turn = 0; // Track conversation turns
    this.serverState = null; // Server conversation state
    this.isInitialized = false;
    
    // Configuration for context window size
    this.CONTEXT_WINDOW_SIZE = 20; // Extended to 20 messages for longer conversation memory
    
    // Prevent rapid initialization calls
    this.initializationInProgress = false;
    this.lastInitializationAttempt = 0;
    this.initializationDebounceTime = 5000; // 5 seconds between attempts
    
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
      // Debounce rapid initialization attempts
      const now = Date.now();
      const timeSinceLastAttempt = now - this.lastInitializationAttempt;
      
      if (this.initializationInProgress) {
        logger.debug('⏳ Initialization already in progress, skipping duplicate call');
        return { success: false, error: 'Initialization already in progress' };
      }
      
      if (timeSinceLastAttempt < this.initializationDebounceTime && this.lastInitializationAttempt > 0) {
        const waitTime = Math.ceil((this.initializationDebounceTime - timeSinceLastAttempt) / 1000);
        logger.debug(`⏱️ Too soon after last initialization attempt, wait ${waitTime}s`);
        return { success: false, error: `Rate limited - wait ${waitTime} seconds` };
      }
      
      // Mark initialization as in progress
      this.initializationInProgress = true;
      this.lastInitializationAttempt = now;
      
      // Load existing state token from session storage (for checking only)
      this.loadStateToken();
      const hadExistingToken = !!this.stateToken;
      
      // ALWAYS call init_session to get a fresh state token for this session
      // This ensures we have proper authorization for the Lambda
      if (!this.conversationId) {
        this.conversationId = this.generateConversationId();
      }
      
      logger.debug('🔄 Initializing session with server to get state token');
      const initResult = await this.initializeWithServer();
      
      if (!initResult.success) {
        logger.debug('⚠️ Failed to get state token from server, conversation memory will be limited');
        // Continue anyway with local storage
      }
      
      // After getting state token, ALWAYS try to load conversation from server
      // The init_session response should include the conversation if it exists
      if (this.stateToken && initResult.success) {
        // Check if init_session already returned the conversation
        if (initResult.conversation) {
          logger.debug('📂 init_session returned existing conversation');
          this.applyServerState(initResult);
        } else {
          // Otherwise try to load it separately
          const serverConversation = await this.loadConversationFromServer();
          logger.debug('🔍 Server conversation response:', serverConversation);
          if (serverConversation && serverConversation.conversation) {
            logger.debug('🔍 Before applyServerState - conversationId:', this.conversationId);
            this.applyServerState(serverConversation);
            logger.debug('🔍 After applyServerState - conversationId:', this.conversationId);
          
            errorLogger.logInfo('📂 Restored conversation from server', {
              conversationId: this.conversationId,
              messageCount: this.messageBuffer.length,
              turn: this.turn
            });
          
            this.isInitialized = true;
            this.initializationInProgress = false; // Clear initialization flag
            this.saveToSessionStorage();
          }
        }
      }
      
      // Mark as initialized regardless of whether we loaded existing conversation
      this.isInitialized = true;
      this.initializationInProgress = false;
      this.saveToSessionStorage();
        this.saveStateToken();
        
        errorLogger.logInfo('🆕 Initialized new conversation with server', {
          conversationId: this.conversationId,
          tenantHash: this.metadata.tenantHash,
          turn: this.turn
        });
        
        this.isInitialized = true;
        this.initializationInProgress = false; // Clear initialization flag
        this.saveToSessionStorage();
        
        return {
          success: true,
          conversationId: this.conversationId,
          restored: false,
          messageCount: 0,
          turn: this.turn
        };
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'conversation_initialization',
        tenantHash: this.metadata.tenantHash
      });
      
      // Fallback to new conversation without server integration
      this.conversationId = `sess_${this.tenantHash.slice(0, 8)}_${Date.now()}`;
      this.turn = 0;
      this.isInitialized = true;
      this.initializationInProgress = false; // Clear initialization flag even on error
      this.stateToken = null;
      this.saveToSessionStorage();
      
      return {
        success: false,
        error: error.message,
        conversationId: this.conversationId,
        restored: false,
        fallback: true
      };
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
    return { 
      ...this.metadata,
      conversationId: this.conversationId,
      turn: this.turn,
      hasStateToken: !!this.stateToken,
      isInitialized: this.isInitialized
    };
  }
  
  /**
   * Wait for initialization to complete (with state token)
   */
  async waitForReady(timeout = 5000) {
    const startTime = Date.now();
    let iterationCount = 0;
    
    logger.debug('⏳ waitForReady started:', {
      currentIsInitialized: this.isInitialized,
      currentStateToken: !!this.stateToken,
      initializationInProgress: this.initializationInProgress
    });
    
    while (!this.isInitialized || !this.stateToken || this.stateToken === 'undefined' || this.stateToken === 'null') {
      iterationCount++;
      
      if (Date.now() - startTime > timeout) {
        logger.warn('⚠️ ConversationManager initialization timeout - proceeding without state token', {
          iterations: iterationCount,
          finalState: {
            isInitialized: this.isInitialized,
            hasStateToken: !!this.stateToken,
            stateTokenValue: this.stateToken
          }
        });
        break;
      }
      
      // Check if initialization is in progress
      if (!this.initializationInProgress && !this.isInitialized) {
        logger.debug('🔄 Triggering initialization from waitForReady');
        await this.initializeConversation();
      }
      
      // Log progress every 10 iterations
      if (iterationCount % 10 === 0) {
        logger.debug('⏳ Still waiting...', {
          iteration: iterationCount,
          elapsed: Date.now() - startTime,
          isInitialized: this.isInitialized,
          hasStateToken: !!this.stateToken
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    logger.debug('✅ ConversationManager ready after waitForReady:', {
      iterations: iterationCount,
      elapsed: Date.now() - startTime,
      hasStateToken: !!this.stateToken,
      stateTokenValue: this.stateToken ? this.stateToken.substring(0, 20) + '...' : 'none',
      isInitialized: this.isInitialized,
      conversationId: this.conversationId
    });
    
    return this.isInitialized && !!this.stateToken && this.stateToken !== 'undefined' && this.stateToken !== 'null';
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
      // Return current conversation state structure expected by tests
      if (!this.isInitialized) {
        return {
          success: false,
          error: 'Conversation not initialized',
          state: null
        };
      }
      
      return {
        success: true,
        sessionId: this.conversationId,
        state: {
          turn: this.turn,
          messageCount: this.messageBuffer.length,
          lastMessages: this.messageBuffer.slice(-10), // Last 10 messages
          summary: this.metadata.lastSummary || null,
          metadata: {
            created: this.metadata.created,
            updated: this.metadata.updated,
            hasBeenSummarized: this.metadata.hasBeenSummarized,
            tenantHash: this.metadata.tenantHash
          }
        },
        stateToken: this.stateToken,
        cached: true // Indicates this is from local state, not server
      };
    } catch (error) {
      errorLogger.logError(error, {
        context: 'get_conversation_state',
        tenantHash: this.metadata.tenantHash
      });
      
      return {
        success: false,
        error: error.message,
        state: null
      };
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

  getConversationEndpoint(operation) {
    return environmentConfig.getConversationUrl(this.tenantHash, operation);
  }
  
  /**
   * Get init session endpoint URL
   */
  getInitSessionEndpoint() {
    // Use the conversation endpoint for init_session action
    if (environmentConfig.CONVERSATION_ENDPOINT) {
      const conversationEndpoint = environmentConfig.CONVERSATION_ENDPOINT;
      const baseUrl = conversationEndpoint.split('?')[0]; // Remove everything after the first ?
      return `${baseUrl}?action=init_session&t=${this.tenantHash}`;
    }
    
    // Fallback to chat endpoint if conversation endpoint not available
    const chatEndpoint = environmentConfig.CHAT_ENDPOINT;
    const baseUrl = chatEndpoint.split('?')[0]; // Remove everything after the first ?
    return `${baseUrl}?action=init_session&t=${this.tenantHash}`;
  }

  async initializeWithServer() {
    try {
      // CRITICAL FIX: Check if conversation endpoint is available before attempting
      if (!environmentConfig.CONVERSATION_ENDPOINT_AVAILABLE) {
        logger.debug('⚠️ Conversation endpoint not deployed - using local storage only');
        return {
          success: false,
          error: 'Conversation endpoint not available - using local fallback',
          fallbackToLocal: true
        };
      }
      
      logger.debug('🔍 Initializing conversation with server:', {
        tenantHash: this.tenantHash.slice(0, 8) + '...',
        sessionId: this.sessionId,
        conversationEndpointAvailable: environmentConfig.CONVERSATION_ENDPOINT_AVAILABLE,
        conversationEndpoint: environmentConfig.CONVERSATION_ENDPOINT
      });
      
      // Step 1: Initialize session to get state token
      const initSessionEndpoint = this.getInitSessionEndpoint();
      logger.debug('🔑 Calling init_session endpoint:', initSessionEndpoint);
      
      // Include existing conversation_id if available for conversation recall
      const initRequestBody = {
        tenant_hash: this.tenantHash,
        session_id: this.sessionId
      };
      
      // Add conversation_id if it's different from session_id (indicates existing conversation)
      if (this.conversationId && this.conversationId !== this.sessionId) {
        initRequestBody.conversation_id = this.conversationId;
        logger.debug('📤 Including existing conversation_id in init_session:', this.conversationId);
      }
      
      const initResponse = await fetch(initSessionEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(initRequestBody)
      });
      
      logger.debug('📡 init_session response status:', initResponse.status);
      
      if (!initResponse.ok) {
        const errorData = await initResponse.json().catch(() => ({}));
        logger.error('❌ init_session failed:', {
          status: initResponse.status,
          statusText: initResponse.statusText,
          errorData,
          endpoint: initSessionEndpoint
        });
        throw new Error(`Session initialization failed: ${errorData.message || initResponse.statusText}`);
      }
      
      let sessionData = await initResponse.json();
      
      // Check if Lambda returned wrapped response (statusCode + body structure)
      if (sessionData.statusCode && sessionData.body) {
        logger.debug('📦 Unwrapping Lambda response structure');
        // Parse the body if it's a string
        if (typeof sessionData.body === 'string') {
          try {
            sessionData = JSON.parse(sessionData.body);
            logger.debug('✅ Parsed session data from body string:', sessionData);
          } catch (e) {
            logger.error('❌ Failed to parse Lambda response body:', e);
            throw new Error(`Failed to parse Lambda response: ${e.message}`);
          }
        } else {
          sessionData = sessionData.body;
        }
      }
      
      logger.debug('✅ init_session successful:', {
        hasStateToken: !!sessionData.state_token,
        turn: sessionData.turn,
        sessionId: sessionData.session_id
      });
      
      // CRITICAL: Properly initialize state from server response
      logger.debug('🔑 Setting state token from init_session response:', {
        receivedToken: sessionData.state_token ? sessionData.state_token.substring(0, 20) + '...' : 'none',
        hasToken: !!sessionData.state_token,
        tokenType: typeof sessionData.state_token
      });
      this.stateToken = sessionData.state_token;
      // Initialize turn from server response using 0-based indexing to match backend
      this.turn = typeof sessionData.turn === 'number' ? sessionData.turn : 0;
      
      // CRITICAL FIX: Set conversationId from init_session response
      if (sessionData.session_id) {
        this.conversationId = sessionData.session_id;
        logger.debug('🔧 Set conversationId from init_session:', this.conversationId);
        
        // Persist conversation ID to sessionStorage for conversation recall
        try {
          sessionStorage.setItem('picasso_conversation_id', this.conversationId);
          logger.debug('💾 Persisted conversation ID to sessionStorage');
        } catch (e) {
          logger.warn('Failed to persist conversation ID:', e);
        }
      }
      
      logger.debug('🔧 State properly initialized:', {
        stateToken: !!this.stateToken,
        turn: this.turn,
        conversationId: this.conversationId
      });
      
      errorLogger.logInfo('🔑 Session initialized with state token', {
        sessionId: sessionData.session_id,
        turn: this.turn
      });
      
      return {
        success: true,
        stateToken: this.stateToken,
        turn: this.turn,
        sessionId: sessionData.session_id
      };
      
    } catch (error) {
      logger.error('💥 init_session completely failed:', {
        error: error.message,
        tenantHash: this.tenantHash.slice(0, 8) + '...',
        endpoint: this.getInitSessionEndpoint(),
        willFallbackToLocal: true
      });
      
      errorLogger.logError(error, {
        context: 'initialize_conversation_server',
        tenantHash: this.metadata.tenantHash
      });
      
      logger.debug(`⚠️ Session initialization failed - ${error.message}, generating local session token`);
      
      // Generate a local session token so conversation saving can continue
      const localToken = `local_${this.tenantHash.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.stateToken = localToken;
      this.turn = 0;
      this.saveStateToken();
      
      logger.debug('🔧 Generated local session token for conversation continuity:', {
        hasLocalToken: !!this.stateToken,
        localTokenPreview: this.stateToken.substring(0, 30) + '...',
        tokenValue: this.stateToken,
        conversationId: this.conversationId
      });
      
      return {
        success: true, // Changed to true so conversation manager stays active
        stateToken: this.stateToken,
        turn: this.turn,
        sessionId: this.conversationId,
        isLocal: true // Flag to indicate this is a local token
      };
    }
  }
  
  async loadConversationFromServer() {
    try {
      if (!this.stateToken || this.stateToken === 'undefined' || this.stateToken === 'null') {
        // No valid state token, can't load from server
        logger.debug('🔍 No valid state token available, skipping server conversation load');
        return null;
      }

      const endpoint = this.getConversationEndpoint('get');
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.stateToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid, clear it
          this.clearStateToken();
          return null;
        }
        if (response.status === 409) {
          // Version conflict - clear token and let initialization handle it
          logger.debug('⚠️ Conversation state conflict - clearing stale token');
          this.clearStateToken();
          return null;
        }
        throw new Error(`Server response: ${response.status}`);
      }

      let data = await response.json();
      
      // Handle Lambda response wrapper structure
      if (data && data.statusCode && data.body) {
        logger.debug('📦 Unwrapping Lambda response structure for conversation load');
        if (typeof data.body === 'string') {
          try {
            data = JSON.parse(data.body);
            logger.debug('✅ Parsed conversation from body string');
          } catch (e) {
            logger.error('❌ Failed to parse conversation body:', e);
            return null;
          }
        } else {
          data = data.body;
        }
      }
      
      // Update our state token with the rotated token
      if (data.stateToken) {
        this.stateToken = data.stateToken;
        this.saveStateToken();
      }

      return data;
    } catch (error) {
      errorLogger.logError(error, {
        context: 'load_conversation_from_server',
        tenantHash: this.metadata.tenantHash
      });
      return null;
    }
  }
  
  applyServerState(serverResponse) {
    logger.debug('🔍 applyServerState received:', {
      serverResponse,
      hasState: !!(serverResponse && serverResponse.state),
      hasConversation: !!(serverResponse && serverResponse.conversation),
      sessionId: serverResponse?.sessionId || serverResponse?.conversation?.session_id,
      stateToken: serverResponse?.stateToken
    });
    
    if (!serverResponse) {
      logger.debug('🔍 applyServerState early return - no serverResponse');
      return;
    }
    
    // Handle both formats: direct fields or nested in conversation object
    const sessionId = serverResponse.sessionId || serverResponse.conversation?.session_id;
    const { state, stateToken } = serverResponse;
    
    logger.debug('🔍 applyServerState extracted values:', { sessionId, hasState: !!state, hasStateToken: !!stateToken });
    
    // 🔧 FIX: Always apply sessionId and stateToken, even if state is null (new conversations)
    if (sessionId) {
      this.conversationId = sessionId;
      logger.debug('🔧 Applied sessionId as conversationId:', sessionId);
    }
    
    if (stateToken) {
      this.stateToken = stateToken;
      logger.debug('🔧 Applied stateToken from server');
    }
    
    // Only process state if it exists (established conversations)
    if (!state) {
      logger.debug('🔍 No state to apply - this is a new conversation');
      return;
    }
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
  
  async saveConversationDelta(userMessage, assistantMessage, factsUpdate = null, summaryUpdate = null) {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount <= maxRetries) {
      try {
        if (!this.conversationId) {
          // Fallback to local storage if no conversation ID
          this.saveToSessionStorage();
          return { success: true, local: true };
        }

        // Always attempt server persistence with graceful fallback
        if (!this.stateToken) {
          // First check if we have a saved state token in session storage
          this.loadStateToken();
          
          if (!this.stateToken) {
            // Only initialize if we truly don't have a state token anywhere
            logger.debug('🔄 No state token found, attempting ONE-TIME initialization...');
            
            // Check if we recently initialized (within 5 seconds)
            const now = Date.now();
            if (this.lastInitializationAttempt && (now - this.lastInitializationAttempt) < 5000) {
              logger.debug('⏱️ Recently initialized, using local storage instead');
              this.saveToSessionStorage();
              return { success: true, local: true };
            }
            
            const initResult = await this.initializeWithServer();
            if (!initResult.success || !this.stateToken) {
              logger.debug('⚠️ Could not get state token, falling back to local storage');
              this.saveToSessionStorage();
              return { success: true, local: true };
            }
          } else {
            logger.debug('✅ Found existing state token in storage, reusing it');
          }
        }
        
        const endpoint = this.getConversationEndpoint('save');
        
        logger.debug(`💾 Preparing to save conversation delta (attempt ${retryCount + 1}):`, {
          endpoint,
          hasStateToken: !!this.stateToken,
          stateTokenType: (this.stateToken && typeof this.stateToken === 'string' && this.stateToken.startsWith('local_')) ? 'local' : 'server',
          conversationId: this.conversationId,
          turn: this.turn,
          retryCount
        });
        
        // If we have a local token, just save to sessionStorage and return
        if (this.stateToken && typeof this.stateToken === 'string' && this.stateToken.startsWith('local_')) {
          logger.debug('📱 Using local token - saving to sessionStorage only');
          this.saveToSessionStorage();
          // CRITICAL FIX: Increment turn locally only for local-only conversations
          // This maintains consistent turn counting even without server
          this.turn++;
          return { success: true, local: true };
        }
        
        // Build delta payload according to API specification
        const delta = {};
        
        if (userMessage) {
          delta.appendUser = {
            text: userMessage.content || userMessage.text
          };
        }
        
        if (assistantMessage) {
          delta.appendAssistant = {
            text: assistantMessage.content || assistantMessage.text,
            pending_action: assistantMessage.pending_action || null
          };
        }
        
        if (factsUpdate) {
          delta.facts_update = factsUpdate;
        }
        
        if (summaryUpdate) {
          delta.summary_update = summaryUpdate;
        }
        
        // Use current turn state directly from conversation manager
        const payload = {
          sessionId: this.conversationId,
          turn: this.turn,
          delta: delta
        };
        
        logger.debug('🔍 Attempting to save conversation delta:', {
          endpoint,
          method: 'POST',
          payload,
          hasStateToken: !!this.stateToken,
          messageCount: this.messageBuffer.length,
          currentTurn: this.turn
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.stateToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }).catch(fetchError => {
          logger.error('🚨 Fetch error for conversation save:', {
            error: fetchError.message,
            endpoint,
            operation: 'save'
          });
          throw fetchError;
        });

        if (!response.ok) {
          if (response.status === 409) {
            // Version conflict - sync with server's current state and retry
            const conflictData = await response.json().catch(() => ({}));
            
            logger.debug('🔄 409 conflict detected, syncing with server state:', {
              currentTurn: this.turn,
              serverTurn: conflictData.currentTurn,
              retryCount,
              conflictData
            });
            
            // Update our state with server's current state
            if (conflictData.stateToken) {
              this.stateToken = conflictData.stateToken;
              this.saveStateToken();
            }
            
            if (typeof conflictData.currentTurn === 'number') {
              this.turn = conflictData.currentTurn;
              logger.debug(`🔧 Updated turn from ${payload.turn} to ${this.turn}`);
            }
            
            // If we haven't exceeded retry limit, try again
            if (retryCount < maxRetries) {
              retryCount++;
              logger.debug(`🔄 Retrying save with updated turn (${retryCount}/${maxRetries})`);
              continue; // Retry the loop
            } else {
              throw new Error(`Version conflict: exceeded retry limit after ${maxRetries} attempts`);
            }
          }
          
          if (response.status === 401) {
            // Token expired - clear it and try to reinitialize
            logger.debug('🔑 Token expired, clearing and will reinitialize on next attempt');
            this.clearStateToken();
            if (retryCount < maxRetries) {
              retryCount++;
              continue;
            }
          }
          
          throw new Error(`Server response: ${response.status}`);
        }

        let data = await response.json();
        
        // Handle Lambda response wrapper structure
        if (data && data.statusCode && data.body) {
          logger.debug('📦 Unwrapping Lambda response structure for save');
          if (typeof data.body === 'string') {
            try {
              data = JSON.parse(data.body);
              logger.debug('✅ Parsed save response from body string');
            } catch (e) {
              logger.error('❌ Failed to parse save response body:', e);
              data = {}; // Use empty object as fallback
            }
          } else {
            data = data.body;
          }
        }
        
        // SUCCESS: Update our state with server response
        if (data.stateToken) {
          this.stateToken = data.stateToken;
          this.saveStateToken();
        }
        
        // CRITICAL FIX: Increment turn after successful save
        // Use server's returned turn if available, otherwise increment locally
        if (typeof data.turn === 'number') {
          this.turn = data.turn;
        } else {
          // Increment turn after successful save
          this.turn++;
        }
        
        // Also save to session storage as backup
        this.saveToSessionStorage();
        
        errorLogger.logInfo('💾 Conversation delta saved to server', {
          conversationId: this.conversationId,
          turn: this.turn,
          serverResponse: true,
          retriesUsed: retryCount
        });
        
        return { success: true, turn: this.turn, retriesUsed: retryCount };
        
      } catch (error) {
        logger.error(`💥 Save attempt ${retryCount + 1} failed:`, {
          error: error.message,
          turn: this.turn,
          retryCount
        });
        
        // If this was the last retry or a non-retryable error, handle it
        if (retryCount >= maxRetries || 
            error.message.includes('Failed to fetch') || 
            error.message.includes('TypeError')) {
          
          errorLogger.logError(error, {
            context: 'save_conversation_delta',
            conversationId: this.conversationId,
            turn: this.turn,
            errorType: error.name,
            errorMessage: error.message,
            retriesUsed: retryCount
          });
          
          // Check if this is a network/fetch error indicating the endpoint doesn't exist
          if (error.message.includes('Failed to fetch') || error.message.includes('TypeError')) {
            logger.warn('⚠️ Conversation save endpoint not available, using sessionStorage fallback');
          }
          
          // Always fallback to local storage
          this.saveToSessionStorage();
          
          // CRITICAL FIX: Do NOT increment turn on server failure
          // Only increment when we have a confirmed successful save
          logger.debug('💾 Server save failed, using local storage without turn increment');
          
          // Don't throw error for fetch failures - just continue with local storage
          if (error.message.includes('Failed to fetch')) {
            logger.debug('💾 Continuing with local storage only');
            return { success: true, local: true, turn: this.turn };
          }
          
          throw error;
        }
        
        // Retry for other errors
        retryCount++;
        logger.debug(`🔄 Retrying save due to error (${retryCount}/${maxRetries}): ${error.message}`);
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }
  }
  
  async clearConversationOnServer() {
    try {
      if (this.stateToken) {
        const endpoint = this.getConversationEndpoint('clear');
        
        const response = await fetch(endpoint, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.stateToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          errorLogger.logInfo('🗑️ Conversation cleared on server', {
            conversationId: this.conversationId,
            serverReport: data.report
          });
        } else {
          errorLogger.logError('Failed to clear conversation on server', {
            status: response.status,
            conversationId: this.conversationId
          });
        }
      }
      
      // Always clear local storage regardless of server response
      this.clearSessionStorage();
      this.clearStateToken();
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'clear_conversation_on_server',
        conversationId: this.conversationId
      });
      
      // Always clear local storage even if server request fails
      this.clearSessionStorage();
      this.clearStateToken();
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
      recentMessages: this.messageBuffer.slice(-this.CONTEXT_WINDOW_SIZE).map(msg => ({
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
  async updateFromChatResponse(chatResponse, userMessage, assistantMessage) {
    try {
      // Add both user and assistant messages to buffer
      // Note: Turn counter will be incremented in saveConversationDelta after successful save
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
      
      // Save conversation delta to server
      try {
        const saveResult = await this.saveConversationDelta(userMessage, assistantMessage);
        
        if (saveResult.success) {
          errorLogger.logInfo('💾 Conversation delta saved successfully', {
            conversationId: this.conversationId,
            turn: this.turn,
            local: saveResult.local || false,
            retriesUsed: saveResult.retriesUsed || 0
          });
        }
      } catch (deltaError) {
        errorLogger.logError(deltaError, {
          context: 'save_conversation_delta',
          conversationId: this.conversationId,
          fallback: 'local_storage_only'
        });
        
        // CRITICAL FIX: Do NOT increment turn when save fails
        // Only increment turn when server confirms successful save
        logger.debug('⚠️ Server save failed, keeping turn at', this.turn, 'for retry consistency');
      }
      
      // Always save locally as backup
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
   * IMPORTANT: Turn counter is incremented AFTER successful server save, not here
   */
  addMessageToBuffer(message) {
    const messageWithMeta = {
      ...message,
      conversationId: this.conversationId,
      turn: this.turn, // Use current turn, don't increment yet
      addedAt: new Date().toISOString()
    };
    
    this.messageBuffer.push(messageWithMeta);
    // Turn counter will be incremented after successful server save
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