/**
 * Conversation Management Utilities for PICASSO Phase 3
 * 
 * Provides conversation persistence, summarization, and retrieval
 * integrating with the Phase 2 DynamoDB infrastructure.
 */

import { config as environmentConfig } from '../config/environment';
import { errorLogger, performanceMonitor } from './errorHandling';
import { createLogger } from './logger';
import { _storeGet, _storeSet, _storeRemove } from '../context/shared/messageHelpers';

const logger = createLogger('ConversationManager');

// Constants for conversation management
const CONVERSATION_CONFIG = {
  // Storage thresholds
  MAX_MESSAGES_IN_MEMORY: 50,
  MAX_MESSAGE_LENGTH: 2000,
  SUMMARY_TRIGGER_COUNT: 10, // Summarize after 10 messages
  PERSISTENCE_DELAY: 2000,   // 2 seconds delay before persisting
  
  // Cache settings
  CACHE_DURATION: 15 * 60 * 1000, // 15 minutes — freshness window for the local session-storage message buffer only
  // State-token cache lifetime. Decoupled from CACHE_DURATION: the token must survive
  // as long as the server will accept it so an idle-returning visitor can present it and
  // resume (authenticated) instead of falling back to a fresh session. Matches the server's
  // STATE_TOKEN_EXPIRY_HOURS (24h) and the recent-messages TTL (24h) in conversation_handler.py —
  // past 24h both the token and the resumable transcript expire server-side, so a new session is correct.
  // (C1 P3 prerequisite: without this, >15-min-idle resumes drop to the raw-session_id path, keeping
  // C1_COMPAT_RAW_SESSION_RESUME above zero and preventing the raw path from being retired.)
  STATE_TOKEN_TTL: 24 * 60 * 60 * 1000, // 24 hours
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
    const existingConversationId = _storeGet('picasso_conversation_id');
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
   * Server Integration Methods
   */
  
  generateConversationId() {
    return `sess_${this.tenantHash.slice(0, 8)}_${Date.now()}`;
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
      
      // C1 P2 (SECURITY_REVIEW_2026-07-02 §C1): on resume, PROVE ownership of the
      // session by presenting the previously-issued signed state token — the server
      // (C1 P1) authenticates the resume off it instead of trusting a raw session_id.
      // loadStateToken() already dropped any client-expired token, so a token here is
      // the live one for this session. Sent in BOTH the Authorization header and the
      // body (CloudFront may not forward Authorization to init_session; the server
      // accepts either). Genuinely-new sessions have no token → mint as before.
      const resumeToken = (this.stateToken && this.stateToken !== 'undefined' && this.stateToken !== 'null')
        ? this.stateToken
        : null;

      // Include existing conversation_id if available for conversation recall
      const initRequestBody = {
        tenant_hash: this.tenantHash,
        session_id: this.sessionId
      };
      if (resumeToken) {
        initRequestBody.state_token = resumeToken;
      }

      // Add conversation_id if it's different from session_id (indicates existing conversation)
      if (this.conversationId && this.conversationId !== this.sessionId) {
        initRequestBody.conversation_id = this.conversationId;
        logger.debug('📤 Including existing conversation_id in init_session:', this.conversationId);
      }

      const postInitSession = (body, token) => fetch(initSessionEndpoint, {
        method: 'POST',
        headers: token
          ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
          : { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      let initResponse = await postInitSession(initRequestBody, resumeToken);

      // C1 P2 fallback: if the server rejects the presented token (401 — e.g. the
      // token outlived the server's exp, or a tenant mismatch), drop it and re-mint
      // a fresh session rather than failing init. New/valid-token paths never hit this.
      if (initResponse.status === 401 && resumeToken) {
        logger.debug('🔁 init_session rejected the stored token (401) — re-minting a new session');
        this.clearStateToken();
        delete initRequestBody.state_token;
        initResponse = await postInitSession(initRequestBody, null);
      }

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
          _storeSet('picasso_conversation_id', this.conversationId);
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
      const stored = _storeGet(CONVERSATION_CONFIG.TOKEN_STORAGE_KEY);
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
        expires: new Date(Date.now() + CONVERSATION_CONFIG.STATE_TOKEN_TTL).toISOString()
      };
      
      _storeSet(
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
      _storeRemove(CONVERSATION_CONFIG.TOKEN_STORAGE_KEY);
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
      actions: message.actions || [],
      ctaButtons: message.ctaButtons || [],
      cards: message.cards || []
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
      
      _storeSet(
        CONVERSATION_CONFIG.SESSION_STORAGE_KEY,
        JSON.stringify(sessionData)
      );
      
    } catch (error) {
      errorLogger.logError(error, { context: 'save_session_storage' });
    }
  }
  
  loadFromSessionStorage() {
    try {
      const stored = _storeGet(CONVERSATION_CONFIG.SESSION_STORAGE_KEY);
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
  
  
  
  clearSessionStorage() {
    try {
      _storeRemove(CONVERSATION_CONFIG.SESSION_STORAGE_KEY);
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

// Export configuration for testing/debugging
export { CONVERSATION_CONFIG };