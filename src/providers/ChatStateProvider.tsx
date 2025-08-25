/**
 * ChatStateProvider - Message State and Session Management
 * 
 * Handles all message state operations and session management for the
 * distributed ChatProvider architecture. Provides type-safe operations
 * for managing chat messages, session persistence, and state validation.
 */

import React, { createContext, useContext, useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { BaseProvider } from '../context/providers/BaseProvider';
import type {
  ChatStateProvider as IChatStateProvider,
  ChatStateProviderProps,
  MessageStateOperations,
  SessionStateOperations,
  AdvancedStateOperations,
  StateProviderConfiguration,
  SessionMemoryMonitor,
  SessionMemoryInfo,
  MemoryCleanupResult,
  MemoryHealthReport,
  MessageOptimizationResult,
  WelcomeMessageConfig,
  ActionChip,
  ContentSanitizationOptions,
  MessageProcessingResult,
  MessageAddedCallback,
  MessageUpdatedCallback,
  MessageRemovedCallback,
  MessagesClearedCallback,
  TypingStateChangedCallback,
  SessionChangedCallback,
  SessionExpiredCallback,
  MessageValidationResult,
  SessionInfo,
  MessageStatistics,
  StateProviderMemoryUsage,
} from '../types/providers/state';
import type {
  ChatContextMessage,
  MessageInput
} from '../types/chat-context';
import type { MessageType, MessageSender } from '../types/api';
import type { ValidTenantHash, SafeContent } from '../types/security';
import type {
  SessionId,
  MessageId,
  OperationId,
  Timestamp,
  MessageCount
} from '../types/branded';
import { createSessionId, createMessageId, createTimestamp } from '../types/branded';
import { createSafeContent } from '../types/security';
import { PROVIDER_IDS } from '../types/providers';
import { MemoryOptimizationHooks } from '../utils/memoryOptimization';

/* ===== CONTENT SANITIZATION UTILITY ===== */

/**
 * Enhanced content sanitization utility extracted from ChatProvider.jsx
 * Provides markdown parsing and content security
 */
const createContentSanitizer = () => {
  let markdownParser: any = null;
  let markdownParserLastUsed = 0;
  const MARKDOWN_PARSER_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  const cleanupMarkdownParser = () => {
    if (markdownParser && Date.now() - markdownParserLastUsed > MARKDOWN_PARSER_TIMEOUT) {
      markdownParser = null;
      return true;
    }
    return false;
  };

  // Periodic cleanup of markdown parser
  if (typeof window !== 'undefined') {
    setInterval(cleanupMarkdownParser, 5 * 60 * 1000); // Check every 5 minutes
  }

  const getMarkdownParser = async () => {
    if (markdownParser) {
      markdownParserLastUsed = Date.now();
      return markdownParser;
    }

    const [{ marked }, { default: DOMPurify }] = await Promise.all([
      import('marked'),
      import('dompurify')
    ]);

    marked.setOptions({
      breaks: true,
      gfm: true,
      sanitize: false,
      smartLists: true,
      smartypants: false,
      xhtml: false,
      mangle: false
    });

    // Custom extension to auto-link URLs and emails
    marked.use({
      extensions: [{
        name: 'autolink',
        level: 'inline',
        start(src: string) {
          const match = src.match(/https?:\/\/|www\.|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          return match ? match.index! : -1;
        },
        tokenizer(src: string) {
          const urlRegex = /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/;
          const wwwRegex = /^(www\.[^\s<]+[^<.,:;"')\]\s])/;
          const emailRegex = /^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
          
          let match;
          if (match = urlRegex.exec(src)) {
            return {
              type: 'autolink',
              raw: match[0],
              href: match[1],
              text: match[1]
            };
          } else if (match = wwwRegex.exec(src)) {
            return {
              type: 'autolink', 
              raw: match[0],
              href: 'http://' + match[1],
              text: match[1]
            };
          } else if (match = emailRegex.exec(src)) {
            return {
              type: 'autolink',
              raw: match[0], 
              href: 'mailto:' + match[1],
              text: match[1]
            };
          }
          return false;
        },
        renderer(token: any) {
          // Check if URL is external
          const isExternal = (() => {
            if (!token.href) return false;
            if (token.href.startsWith('mailto:')) return true;
            
            try {
              if (typeof window === 'undefined') return true;
              const linkUrl = new URL(token.href, window.location.href);
              const currentUrl = new URL(window.location.href);
              return linkUrl.origin !== currentUrl.origin;
            } catch (e) {
              return true; // Treat as external if parsing fails
            }
          })();
          
          const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
          return `<a href="${token.href}"${targetAttr}>${token.text}</a>`;
        }
      }]
    });

    markdownParser = { marked, DOMPurify };
    markdownParserLastUsed = Date.now();
    return markdownParser;
  };

  const sanitizeMessage = async (content: string, options?: ContentSanitizationOptions): Promise<SafeContent> => {
    if (!content || typeof content !== 'string') {
      return createSafeContent('');
    }

    const sanitizeOptions = options || {
      enableMarkdownParsing: true,
      allowedTags: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 's',
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      allowedAttributes: [
        'href', 'title', 'target', 'rel', 'alt', 'src', 
        'width', 'height', 'style', 'class'
      ],
      forbiddenTags: ['script', 'object', 'embed', 'form', 'input', 'button'],
      externalLinksInNewTab: true,
      sanitizeLevel: 'moderate'
    };

    try {
      const { marked, DOMPurify } = await getMarkdownParser();
      markdownParserLastUsed = Date.now();
      
      let processedContent = content;
      
      if (sanitizeOptions.enableMarkdownParsing) {
        processedContent = marked.parse(content);
      }
      
      const cleanHtml = DOMPurify.sanitize(processedContent, {
        ALLOWED_TAGS: sanitizeOptions.allowedTags,
        ALLOWED_ATTR: sanitizeOptions.allowedAttributes,
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
        FORBID_TAGS: sanitizeOptions.forbiddenTags,
        KEEP_CONTENT: true,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        RETURN_TRUSTED_TYPE: false
      });

      // Process links to add target="_blank" only for external URLs
      let finalHtml = cleanHtml;
      if (sanitizeOptions.externalLinksInNewTab) {
        finalHtml = cleanHtml.replace(
          /<a\s+href="([^"]+)"/gi,
          (match, url) => {
            // Check if URL is external
            const isExternal = (() => {
              if (!url) return false;
              if (url.startsWith('mailto:')) return true;
              
              try {
                if (typeof window === 'undefined') return true;
                const linkUrl = new URL(url, window.location.href);
                const currentUrl = new URL(window.location.href);
                return linkUrl.origin !== currentUrl.origin;
              } catch (e) {
                return true; // Treat as external if parsing fails
              }
            })();
            
            if (isExternal) {
              return `<a target="_blank" rel="noopener noreferrer" href="${url}"`;
            }
            return `<a href="${url}"`;
          }
        );
      }

      return createSafeContent(finalHtml);
    } catch (error) {
      // Fallback to basic sanitization
      const { DOMPurify } = await getMarkdownParser();
      const sanitized = DOMPurify.sanitize(content, { ALLOWED_TAGS: [], KEEP_CONTENT: true });
      return createSafeContent(sanitized);
    }
  };

  return { sanitizeMessage, cleanupMarkdownParser };
};

const contentSanitizer = createContentSanitizer();

/* ===== MEMORY MONITORING UTILITY ===== */

/**
 * Creates a sophisticated memory monitor for long-running sessions
 * Extracted and enhanced from original ChatProvider.jsx (lines 18-58)
 */
const createMemoryMonitor = (): SessionMemoryMonitor => {
  const startTime = Date.now();
  let lastMemoryCheck = Date.now();
  let memoryGrowthAlerts = 0;
  
  const getMemoryInfo = (): SessionMemoryInfo => {
    // Try to get performance memory info if available
    const memory = (performance as any).memory || {};
    const sessionDuration = Date.now() - startTime;
    
    return {
      timestamp: new Date().toISOString(),
      sessionDurationMinutes: Math.round(sessionDuration / (1000 * 60)),
      usedJSHeapSize: memory.usedJSHeapSize || 0,
      totalJSHeapSize: memory.totalJSHeapSize || 0,
      jsHeapSizeLimit: memory.jsHeapSizeLimit || 0,
      memoryUtilization: memory.totalJSHeapSize ? 
        Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100) : 0
    };
  };
  
  const checkMemoryGrowth = (previousMemory: SessionMemoryInfo, currentMemory: SessionMemoryInfo): boolean => {
    if (!previousMemory || !currentMemory.usedJSHeapSize) return false;
    
    const growthMB = (currentMemory.usedJSHeapSize - previousMemory.usedJSHeapSize) / (1024 * 1024);
    const growthPercent = ((currentMemory.usedJSHeapSize - previousMemory.usedJSHeapSize) / previousMemory.usedJSHeapSize) * 100;
    
    // Alert if memory grew by more than 5MB or 20% in a short period
    return growthMB > 5 || growthPercent > 20;
  };
  
  return {
    getMemoryInfo,
    checkMemoryGrowth,
    getGrowthAlerts: () => memoryGrowthAlerts,
    incrementGrowthAlerts: () => memoryGrowthAlerts++,
    getSessionDuration: () => Date.now() - startTime,
    getLastMemoryCheck: () => lastMemoryCheck,
    updateLastMemoryCheck: () => lastMemoryCheck = Date.now()
  };
};

/* ===== STORAGE CONSTANTS ===== */

const STORAGE_KEYS = {
  MESSAGES: 'picasso_messages',
  SESSION_ID: 'picasso_session_id',
  LAST_ACTIVITY: 'picasso_last_activity',
  SESSION_METADATA: 'picasso_session_metadata'
} as const;

/* ===== SESSION MANAGEMENT UTILITIES ===== */

/**
 * Enhanced session management utilities extracted from ChatProvider.jsx
 * Provides sophisticated session persistence and timeout handling
 */
const createSessionManager = () => {
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  const getOrCreateSessionId = (): SessionId => {
    const stored = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
    const lastActivity = sessionStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
    
    // Check if session is still valid (within timeout)
    if (stored && lastActivity) {
      const timeSinceActivity = Date.now() - parseInt(lastActivity);
      if (timeSinceActivity < SESSION_TIMEOUT) {
        return stored as SessionId;
      }
    }
    
    // Create new session
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
    sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
    return newSessionId as SessionId;
  };
  
  const loadPersistedMessages = (): ChatContextMessage[] => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEYS.MESSAGES);
      const lastActivity = sessionStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
      
      if (stored && lastActivity) {
        const timeSinceActivity = Date.now() - parseInt(lastActivity);
        if (timeSinceActivity < SESSION_TIMEOUT) {
          const messages = JSON.parse(stored);
          return messages || [];
        }
      }
    } catch (error) {
      console.error('Failed to load persisted messages:', error);
    }
    return [];
  };
  
  const persistMessages = (messages: ChatContextMessage[], sessionId: SessionId): boolean => {
    try {
      sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
      sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
      return true;
    } catch (error) {
      console.error('Failed to persist messages:', error);
      return false;
    }
  };
  
  const clearPersistedData = (): void => {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.MESSAGES);
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_ID);
      sessionStorage.removeItem(STORAGE_KEYS.LAST_ACTIVITY);
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_METADATA);
    } catch (error) {
      console.error('Failed to clear persisted data:', error);
    }
  };
  
  const isSessionExpired = (lastActivityTime: number): boolean => {
    const timeSinceActivity = Date.now() - lastActivityTime;
    return timeSinceActivity >= SESSION_TIMEOUT;
  };
  
  const updateActivityTime = (): void => {
    try {
      sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
    } catch (error) {
      console.error('Failed to update activity time:', error);
    }
  };
  
  return {
    getOrCreateSessionId,
    loadPersistedMessages,
    persistMessages,
    clearPersistedData,
    isSessionExpired,
    updateActivityTime,
    SESSION_TIMEOUT
  };
};

const sessionManager = createSessionManager();

/* ===== CHAT STATE PROVIDER IMPLEMENTATION ===== */

class ChatStateProviderImpl extends BaseProvider implements IChatStateProvider {
  // State
  private _messages: ChatContextMessage[] = [];
  private _sessionId: SessionId;
  private _isTyping: boolean = false;
  private _lastActivity: Timestamp;
  private _configuration: StateProviderConfiguration;
  
  // Event listeners
  private messageAddedListeners = new Set<MessageAddedCallback>();
  private messageUpdatedListeners = new Set<MessageUpdatedCallback>();
  private messageRemovedListeners = new Set<MessageRemovedCallback>();
  private messagesClearedListeners = new Set<MessagesClearedCallback>();
  private typingStateChangedListeners = new Set<TypingStateChangedCallback>();
  private sessionChangedListeners = new Set<SessionChangedCallback>();
  private sessionExpiredListeners = new Set<SessionExpiredCallback>();
  
  // Session management
  private sessionTimer: NodeJS.Timeout | null = null;
  private persistenceTimer: NodeJS.Timeout | null = null;
  
  // Memory monitoring
  private memoryMonitor: SessionMemoryMonitor;
  private lastMemorySnapshot: SessionMemoryInfo | null = null;
  private memoryCheckTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    super(PROVIDER_IDS.STATE, 'ChatStateProvider');
    
    // Initialize session using enhanced session manager
    this._sessionId = sessionManager.getOrCreateSessionId();
    this._lastActivity = createTimestamp(Date.now());
    this._configuration = {
      maxStoredMessages: 1000,
      sessionTimeout: 30 * 60 * 1000,
      enablePersistence: true,
      persistenceKey: 'picasso_chat_state',
      compressionEnabled: true,
      autoTrimEnabled: true,
      autoTrimThreshold: 800,
      validationLevel: 'moderate',
      enableActivityTracking: true,
      enableMemoryOptimization: true,
      memoryMonitoring: {
        enabled: true,
        checkInterval: 2 * 60 * 1000,
        alertThreshold: 50,
        growthThreshold: 5,
        maxGrowthAlerts: 3,
        enableAggressiveCleanup: true
      },
      welcomeMessage: {
        enabled: true,
        message: 'Hello! How can I help you today?',
        actionChips: [],
        showOnNewSession: true,
        showOnRestore: false
      },
      contentSanitization: {
        enableMarkdownParsing: true,
        allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        allowedAttributes: ['href', 'title', 'target', 'rel', 'alt', 'src', 'width', 'height', 'style', 'class'],
        forbiddenTags: ['script', 'object', 'embed', 'form', 'input', 'button'],
        externalLinksInNewTab: true,
        sanitizeLevel: 'moderate'
      }
    };
    this.memoryMonitor = createMemoryMonitor();
    
    // Load persisted messages if available
    const persistedMessages = sessionManager.loadPersistedMessages();
    if (persistedMessages.length > 0) {
      this._messages = persistedMessages;
      this.debugLog('Loaded persisted messages from session', {
        messageCount: persistedMessages.length,
        sessionId: this._sessionId
      });
    }
  }

  /* ===== PROVIDER INTERFACE IMPLEMENTATION ===== */

  protected async onInitialize(options: import('../types/providers/base').ProviderInitOptions): Promise<void> {
    this.debugLog('Initializing ChatStateProvider', { sessionId: this._sessionId });
    
    let hasExistingMessages = false;
    
    // Load persisted state if enabled
    if (this._configuration.enablePersistence) {
      try {
        const loadResult = await this.sessionOps.loadPersistedState();
        if (loadResult.success && loadResult.messages.length > 0) {
          this._messages = [...loadResult.messages];
          this._sessionId = loadResult.sessionInfo.sessionId;
          hasExistingMessages = true;
          this.debugLog('Loaded persisted state', { 
            messageCount: this._messages.length,
            sessionId: this._sessionId 
          });
        }
      } catch (error) {
        this.logWarning('Failed to load persisted state', { error: (error as Error).message });
      }
    }

    // Initialize welcome message if no existing messages and welcome message is enabled
    if (!hasExistingMessages && this._configuration.welcomeMessage.enabled) {
      try {
        await this.initializeWelcomeMessage();
        this.debugLog('Welcome message initialized during provider setup');
      } catch (error) {
        this.logError(error as Error, 'welcome_message_provider_initialization');
      }
    }

    // Set up session timer
    this.setupSessionTimer();
    
    // Set up auto-persistence
    if (this._configuration.enablePersistence) {
      this.setupAutoPersistence();
    }

    // Set up activity tracking
    if (this._configuration.enableActivityTracking) {
      this.setupActivityTracking();
    }

    // Set up memory monitoring
    if (this._configuration.memoryMonitoring.enabled) {
      this.setupMemoryMonitoring();
    }

    this.recordOperation();
  }

  protected onCleanup(): void {
    // Clear timers
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
      this.persistenceTimer = null;
    }
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear listeners
    this.messageAddedListeners.clear();
    this.messageUpdatedListeners.clear();
    this.messageRemovedListeners.clear();
    this.messagesClearedListeners.clear();
    this.typingStateChangedListeners.clear();
    this.sessionChangedListeners.clear();
    this.sessionExpiredListeners.clear();

    // Persist final state
    if (this._configuration.enablePersistence) {
      this.sessionOps.persistState().catch(error => {
        this.logError(error as Error, 'final_state_persistence');
      });
    }
  }

  protected validateOptions(options: import('../types/providers/base').ProviderInitOptions): boolean {
    if (!options.sessionId) {
      return false;
    }
    
    // SessionId can be either a branded type (object with __brand and value) or a string
    if (typeof options.sessionId === 'string') {
      return options.sessionId.length > 0;
    }
    
    // Check if it's a branded type with the correct structure
    if (typeof options.sessionId === 'object' && options.sessionId !== null) {
      const branded = options.sessionId as any;
      return branded.__brand === 'SessionId' && 
             typeof branded.value === 'string' && 
             branded.value.length > 0;
    }
    
    return false;
  }

  /* ===== PUBLIC PROPERTIES ===== */

  public get messages(): readonly ChatContextMessage[] {
    return [...this._messages];
  }

  public get sessionId(): SessionId {
    return this._sessionId;
  }

  public get isTyping(): boolean {
    return this._isTyping;
  }

  public readonly setIsTyping = (isTyping: boolean): void => {
    if (this._isTyping !== isTyping) {
      this._isTyping = isTyping;
      this.updateLastActivity();

      // Notify listeners immediately for instant UI updates
      this.typingStateChangedListeners.forEach(listener => {
        try {
          listener(isTyping, this._sessionId);
        } catch (error) {
          this.logError(error as Error, 'typing_state_changed_listener');
        }
      });

      this.debugLog('Typing state changed', { isTyping, sessionId: this._sessionId });
    }
  };

  public get lastActivity(): Timestamp {
    return this._lastActivity;
  }

  public get messageCount(): MessageCount {
    return this._messages.length as MessageCount;
  }

  /* ===== MESSAGE OPERATIONS ===== */

  public readonly messageOps: MessageStateOperations = {
    addMessage: async (message: MessageInput, operationId?: OperationId): Promise<MessageId> => {
      const self = this as any as ChatStateProviderImpl;
      self.assertInitialized();
      const timerId = self.startTiming('addMessage');
      
      try {
        // Validate message  
        const validation = await self.messageOps.validateMessage(message);
        if (!validation.isValid) {
          throw self.createError(`Message validation failed: ${validation.errors.join(', ')}`, 'VALIDATION_ERROR');
        }

        // Create message with ID
        const messageId = createMessageId();
        
        console.log('🔍 Creating chat message:', {
          originalMessage: message,
          messageId: messageId.value,
          contentType: typeof message.content,
          contentLength: message.content?.length || 0
        });
        
        let sanitizedContent;
        try {
          sanitizedContent = await self.messageOps.sanitizeMessageContent(message.content);
          console.log('🔍 Content sanitized successfully');
        } catch (error) {
          console.error('🔍 Content sanitization failed:', error);
          sanitizedContent = String(message.content || ''); // Ensure it's always a string
        }
        
        const chatMessage: ChatContextMessage = {
          ...message,
          id: messageId.value,
          timestamp: createTimestamp(Date.now()).value,
          content: sanitizedContent,
          type: message.type || 'text',
          sender: message.sender
        };

        // Add to state - create new array to trigger React re-renders
        self._messages = [...self._messages, chatMessage];
        console.log('🔍 Message added to state:', {
          messageId: chatMessage.id,
          sender: chatMessage.sender,
          type: chatMessage.type,
          content: typeof sanitizedContent === 'string' ? sanitizedContent.substring(0, 50) + '...' : 'NOT_STRING',
          totalMessages: self._messages.length
        });
        
        self.updateLastActivity();

        // Auto-trim if necessary
        if (self._configuration.autoTrimEnabled && 
            self._messages.length > self._configuration.autoTrimThreshold) {
          await self.trimOldMessages(self._configuration.maxStoredMessages);
        }

        // Notify listeners
        self.messageAddedListeners.forEach(listener => {
          try {
            listener(chatMessage, operationId);
          } catch (error) {
            self.logError(error as Error, 'message_added_listener');
          }
        });

        self.recordOperation();
        self.debugLog('Message added', { messageId, messageType: message.type });
        
        return messageId;
      } finally {
        self.endTiming(timerId);
      }
    },

    updateMessage: async (messageId: MessageId, updates: Partial<ChatContextMessage>, operationId?: OperationId): Promise<boolean> => {
      const self = this as any as ChatStateProviderImpl;
      self.assertInitialized();
      const timerId = self.startTiming('updateMessage');
      
      try {
        const messageIndex = self._messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
          self.logWarning('Attempted to update non-existent message', { messageId });
          return false;
        }

        const oldMessage = self._messages[messageIndex];
        const updatedMessage = { ...oldMessage, ...updates };
        // Create a new array to trigger React re-renders
        this._messages = [
          ...this._messages.slice(0, messageIndex),
          updatedMessage,
          ...this._messages.slice(messageIndex + 1)
        ];
        this.updateLastActivity();

        // Notify listeners
        this.messageUpdatedListeners.forEach(listener => {
          try {
            listener(messageId, updates, operationId);
          } catch (error) {
            this.logError(error as Error, 'message_updated_listener');
          }
        });

        this.recordOperation();
        this.debugLog('Message updated', { messageId, updateKeys: Object.keys(updates) });
        
        return true;
      } finally {
        this.endTiming(timerId);
      }
    },

    removeMessage: async (messageId: MessageId, operationId?: OperationId): Promise<boolean> => {
      this.assertInitialized();
      const timerId = this.startTiming('removeMessage');
      
      try {
        const messageIndex = this._messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
          this.logWarning('Attempted to remove non-existent message', { messageId });
          return false;
        }

        const removedMessage = this._messages[messageIndex];
        // Create new array to trigger React re-renders
        this._messages = [
          ...this._messages.slice(0, messageIndex),
          ...this._messages.slice(messageIndex + 1)
        ];
        this.updateLastActivity();

        // Notify listeners
        this.messageRemovedListeners.forEach(listener => {
          try {
            listener(messageId, removedMessage, operationId);
          } catch (error) {
            this.logError(error as Error, 'message_removed_listener');
          }
        });

        this.recordOperation();
        this.debugLog('Message removed', { messageId });
        
        return true;
      } finally {
        this.endTiming(timerId);
      }
    },

    clearMessages: async (operationId?: OperationId): Promise<void> => {
      this.assertInitialized();
      const timerId = this.startTiming('clearMessages');
      
      try {
        const clearedCount = this._messages.length as MessageCount;
        this._messages = [];
        this.updateLastActivity();

        // Notify listeners
        this.messagesClearedListeners.forEach(listener => {
          try {
            listener(clearedCount, operationId);
          } catch (error) {
            this.logError(error as Error, 'messages_cleared_listener');
          }
        });

        this.recordOperation();
        this.debugLog('Messages cleared', { clearedCount });
      } finally {
        this.endTiming(timerId);
      }
    },

    getMessageById: (messageId: MessageId): ChatContextMessage | null => {
      return this._messages.find(msg => msg.id === messageId) || null;
    },

    getMessageHistory: (limit?: number, offset?: number): readonly ChatContextMessage[] => {
      const start = offset || 0;
      const end = limit ? start + limit : undefined;
      return this._messages.slice(start, end);
    },

    getMessagesByType: (type: 'user' | 'assistant' | 'system'): readonly ChatContextMessage[] => {
      return this._messages.filter(msg => msg.type === type);
    },

    getMessagesByDateRange: (start: Timestamp, end: Timestamp): readonly ChatContextMessage[] => {
      return this._messages.filter(msg => 
        msg.timestamp >= start && msg.timestamp <= end
      );
    },

    searchMessages: (query: string, options?: import('../types/providers/state').MessageSearchOptions): readonly ChatContextMessage[] => {
      const searchOptions = {
        caseSensitive: false,
        includeMetadata: false,
        limit: 100,
        sortBy: 'timestamp' as const,
        sortOrder: 'desc' as const,
        ...options
      };

      let results = this._messages.filter(msg => {
        const searchText = searchOptions.caseSensitive ? msg.content : msg.content.toLowerCase();
        const searchQuery = searchOptions.caseSensitive ? query : query.toLowerCase();
        return searchText.includes(searchQuery);
      });

      // Apply filters
      if (searchOptions.messageTypes) {
        results = results.filter(msg => searchOptions.messageTypes!.includes(msg.type));
      }

      if (searchOptions.dateRange) {
        results = results.filter(msg => 
          msg.timestamp >= searchOptions.dateRange!.start && 
          msg.timestamp <= searchOptions.dateRange!.end
        );
      }

      // Sort results
      results.sort((a, b) => {
        const aValue = searchOptions.sortBy === 'timestamp' ? a.timestamp : 0;
        const bValue = searchOptions.sortBy === 'timestamp' ? b.timestamp : 0;
        return searchOptions.sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      });

      return results.slice(0, searchOptions.limit);
    },

    validateMessage: async (message: MessageInput): Promise<MessageValidationResult> => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Basic validation
      if (!message.content || message.content.trim().length === 0) {
        errors.push('Message content cannot be empty');
      }

      const maxContentLength = 10000; // Default max content length
      if (message.content && message.content.length > maxContentLength) {
        errors.push(`Message content exceeds maximum length of ${maxContentLength} characters`);
      }

      if (!message.sender || !['user', 'assistant', 'system'].includes(message.sender)) {
        errors.push('Invalid message sender');
      }

      // Content sanitization
      let processedContent: SafeContent | undefined;
      try {
        processedContent = createSafeContent(message.content || '');
      } catch (error) {
        errors.push(`Content sanitization failed: ${(error as Error).message}`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        processedContent
      };
    },

    processMessage: async (message: MessageInput): Promise<ChatContextMessage> => {
      const validation = await this.validateMessage(message);
      if (!validation.isValid) {
        throw this.createError(`Message processing failed: ${validation.errors.join(', ')}`, 'VALIDATION_ERROR');
      }

      return {
        ...message,
        id: createMessageId().value,
        timestamp: createTimestamp(Date.now()).value,
        content: validation.processedContent || (message.content as SafeContent),
        type: message.type || 'text',
        sender: message.sender
      };
    },

    sanitizeMessageContent: async (content: string, options?: ContentSanitizationOptions): Promise<SafeContent> => {
      try {
        return await contentSanitizer.sanitizeMessage(content, options);
      } catch (error) {
        throw this.createError(`Content sanitization failed: ${(error as Error).message}`, 'VALIDATION_ERROR');
      }
    },

    processAdvancedMessage: async (message: MessageInput, options?: ContentSanitizationOptions): Promise<MessageProcessingResult> => {
      const startTime = performance.now();
      const warnings: string[] = [];
      
      try {
        // Validate message first
        const validation = await this.validateMessage(message);
        if (!validation.isValid) {
          throw this.createError(`Message validation failed: ${validation.errors.join(', ')}`, 'VALIDATION_ERROR');
        }
        warnings.push(...validation.warnings);

        // Sanitize content with options
        const sanitizedContent = await this.messageOps.sanitizeMessageContent(message.content, options);

        // Create processed message
        const processedMessage: ChatContextMessage = {
          ...message,
          id: createMessageId().value,
          timestamp: createTimestamp(Date.now()).value,
          content: sanitizedContent,
          type: message.type || 'text',
          sender: message.sender
        };

        const processingTime = performance.now() - startTime;
        
        return {
          success: true,
          message: processedMessage,
          sanitizedContent,
          warnings,
          processingTime
        };
      } catch (error) {
        const processingTime = performance.now() - startTime;
        throw this.createError(`Advanced message processing failed: ${(error as Error).message}`, 'PROCESSING_ERROR');
      }
    },

    generateWelcomeMessage: async (config: WelcomeMessageConfig): Promise<ChatContextMessage> => {
      if (!config.enabled) {
        throw this.createError('Welcome message is disabled', 'CONFIGURATION_ERROR');
      }

      const sanitizedContent = await this.messageOps.sanitizeMessageContent(
        config.message || 'Hello! How can I help you today?'
      );

      return {
        id: 'welcome',
        role: 'assistant',
        content: sanitizedContent,
        type: 'text',
        timestamp: createTimestamp(Date.now()).value,
        sender: 'assistant',
        actions: config.actionChips ? [...config.actionChips] : undefined
      };
    },

    generateActionChips: (chipConfig: readonly ActionChip[]): readonly ActionChip[] => {
      // Validate and sanitize action chips
      return chipConfig.filter(chip => {
        return chip.id && chip.text && chip.action;
      }).map(chip => ({
        ...chip,
        text: chip.text.substring(0, 100), // Limit text length
        action: chip.action.substring(0, 200) // Limit action length
      }));
    },

    createWelcomeMessageWithActions: async (message: string, actionChips?: readonly ActionChip[]): Promise<ChatContextMessage> => {
      const sanitizedContent = await this.messageOps.sanitizeMessageContent(message);
      const processedChips = actionChips ? this.messageOps.generateActionChips(actionChips) : [];

      return {
        id: 'welcome',
        role: 'assistant',
        content: sanitizedContent,
        type: 'text',
        timestamp: createTimestamp(Date.now()).value,
        sender: 'assistant',
        actions: processedChips.length > 0 ? processedChips : undefined
      };
    },

    addMessages: async (messages: readonly MessageInput[]): Promise<readonly MessageId[]> => {
      const messageIds: MessageId[] = [];
      for (const message of messages) {
        const messageId = await this.messageOps.addMessage(message);
        messageIds.push(messageId);
      }
      return messageIds;
    },

    updateMessages: async (updates: readonly import('../types/providers/state').MessageUpdate[]): Promise<number> => {
      let updatedCount = 0;
      for (const update of updates) {
        const success = await this.messageOps.updateMessage(update.messageId, update.updates, update.operationId);
        if (success) updatedCount++;
      }
      return updatedCount;
    },

    removeMessages: async (messageIds: readonly MessageId[]): Promise<number> => {
      let removedCount = 0;
      for (const messageId of messageIds) {
        const success = await this.messageOps.removeMessage(messageId);
        if (success) removedCount++;
      }
      return removedCount;
    },

    getMessageCount: (): MessageCount => {
      return this._messages.length as MessageCount;
    },

    getMessageStatistics: (): MessageStatistics => {
      const total = this._messages.length as MessageCount;
      const byType = {
        user: this._messages.filter(m => m.type === 'user').length as MessageCount,
        assistant: this._messages.filter(m => m.type === 'assistant').length as MessageCount,
        system: this._messages.filter(m => m.type === 'system').length as MessageCount
      };

      const totalCharacters = this._messages.reduce((sum, msg) => sum + msg.content.length, 0);
      const averageLength = total > 0 ? totalCharacters / total : 0;

      const timestamps = this._messages.map(m => m.timestamp).sort((a, b) => a - b);
      const oldestMessage = timestamps[0];
      const newestMessage = timestamps[timestamps.length - 1];

      return {
        total,
        byType,
        averageLength,
        totalCharacters,
        oldestMessage,
        newestMessage,
        mostActiveHour: 12, // TODO: Calculate from message timestamps
        messagesPerDay: {} // TODO: Calculate from message timestamps
      };
    }
  };

  /* ===== SESSION OPERATIONS ===== */

  public readonly sessionOps: SessionStateOperations = {
    getSessionId: (): SessionId => this._sessionId,

    createNewSession: async (tenantHash?: ValidTenantHash): Promise<SessionId> => {
      const oldSessionId = this._sessionId;
      this._sessionId = createSessionId(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      this._lastActivity = createTimestamp(Date.now());
      
      // Clear messages for new session
      await this.messageOps.clearMessages();
      
      // Setup new session timer
      this.setupSessionTimer();
      
      // Notify listeners
      this.sessionChangedListeners.forEach(listener => {
        try {
          listener(this._sessionId, oldSessionId);
        } catch (error) {
          this.logError(error as Error, 'session_changed_listener');
        }
      });

      this.debugLog('New session created', { 
        newSessionId: this._sessionId, 
        oldSessionId,
        tenantHash 
      });
      
      return this._sessionId;
    },

    restoreSession: async (sessionId: SessionId): Promise<import('../types/providers/state').SessionRestoreResult> => {
      try {
        // TODO: Implement session restoration from storage
        this.debugLog('Session restoration not yet implemented', { sessionId });
        
        return {
          success: false,
          sessionId,
          messagesRestored: 0 as MessageCount,
          errors: ['Session restoration not yet implemented'],
          warnings: []
        };
      } catch (error) {
        return {
          success: false,
          sessionId,
          messagesRestored: 0 as MessageCount,
          errors: [(error as Error).message],
          warnings: []
        };
      }
    },

    clearSession: async (): Promise<void> => {
      await this.messageOps.clearMessages();
      this._lastActivity = createTimestamp(Date.now());
      this.debugLog('Session cleared');
    },

    terminateSession: async (reason?: string): Promise<void> => {
      if (this.sessionTimer) {
        clearTimeout(this.sessionTimer);
        this.sessionTimer = null;
      }
      
      // Persist state before termination
      if (this._configuration.enablePersistence) {
        await this.sessionOps.persistState();
      }
      
      this.debugLog('Session terminated', { reason });
    },

    persistState: async (): Promise<import('../types/providers/state').SessionPersistResult> => {
      if (!this._configuration.enablePersistence) {
        return {
          success: false,
          bytesStored: 0,
          messagesStored: 0 as MessageCount,
          errors: ['Persistence is disabled'],
        };
      }

      try {
        // Use enhanced session manager for persistence
        const success = sessionManager.persistMessages(this._messages, this._sessionId);
        
        if (success) {
          const serializedData = JSON.stringify(this._messages);
          this.debugLog('State persisted successfully', {
            messageCount: this._messages.length,
            sessionId: this._sessionId,
            bytesStored: serializedData.length
          });
          
          return {
            success: true,
            bytesStored: serializedData.length,
            messagesStored: this._messages.length as MessageCount,
            errors: []
          };
        } else {
          throw new Error('Session manager persistence failed');
        }
      } catch (error) {
        this.logError(error as Error, 'session_persistence');
        return {
          success: false,
          bytesStored: 0,
          messagesStored: 0 as MessageCount,
          errors: [(error as Error).message]
        };
      }
    },

    loadPersistedState: async (): Promise<import('../types/providers/state').SessionLoadResult> => {
      try {
        // Use enhanced session manager for loading
        const messages = sessionManager.loadPersistedMessages();
        
        if (messages.length > 0) {
          this.debugLog('Persisted state loaded successfully', {
            messageCount: messages.length,
            sessionId: this._sessionId
          });
          
          return {
            success: true,
            messages,
            sessionInfo: this.sessionOps.getSessionInfo(),
            errors: [],
            warnings: []
          };
        } else {
          return {
            success: false,
            messages: [],
            sessionInfo: this.sessionOps.getSessionInfo(),
            errors: [],
            warnings: ['No valid persisted state found or session expired']
          };
        }
      } catch (error) {
        this.logError(error as Error, 'session_load');
        return {
          success: false,
          messages: [],
          sessionInfo: this.sessionOps.getSessionInfo(),
          errors: [(error as Error).message],
          warnings: []
        };
      }
    },

    clearPersistedState: async (): Promise<void> => {
      try {
        sessionManager.clearPersistedData();
        this.debugLog('Persisted state cleared using session manager');
      } catch (error) {
        this.logError(error as Error, 'clear_persisted_state');
      }
    },

    exportSessionData: async (): Promise<import('../types/providers/state').SessionExportData> => {
      return {
        version: '1.0.0',
        sessionId: this._sessionId,
        tenantHash: this.getTenantHash(),
        createdAt: createTimestamp(Date.now() - (60 * 60 * 1000)), // Estimated
        exportedAt: createTimestamp(Date.now()),
        messages: this._messages,
        sessionInfo: this.sessionOps.getSessionInfo(),
        metadata: {
          messageCount: this._messages.length,
          configuration: this._configuration
        }
      };
    },

    importSessionData: async (data: import('../types/providers/state').SessionImportData): Promise<import('../types/providers/state').SessionImportResult> => {
      try {
        if (data.validateOnly) {
          // Validation only mode
          return {
            success: true,
            sessionId: this._sessionId,
            messagesImported: 0 as MessageCount,
            messagesSkipped: 0 as MessageCount,
            errors: [],
            warnings: ['Validation only mode - no data imported']
          };
        }

        // Import messages
        let importedCount = 0;
        for (const messageInput of data.messages) {
          try {
            await this.messageOps.addMessage(messageInput);
            importedCount++;
          } catch (error) {
            this.logWarning('Failed to import message', { error: (error as Error).message });
          }
        }

        return {
          success: true,
          sessionId: data.sessionId || this._sessionId,
          messagesImported: importedCount as MessageCount,
          messagesSkipped: (data.messages.length - importedCount) as MessageCount,
          errors: [],
          warnings: []
        };
      } catch (error) {
        return {
          success: false,
          sessionId: this._sessionId,
          messagesImported: 0 as MessageCount,
          messagesSkipped: data.messages.length as MessageCount,
          errors: [(error as Error).message],
          warnings: []
        };
      }
    },

    isSessionExpired: (): boolean => {
      return sessionManager.isSessionExpired(this._lastActivity);
    },

    extendSession: async (duration?: number): Promise<void> => {
      const extensionTime = duration || this._configuration.sessionTimeout;
      this._lastActivity = createTimestamp(Date.now());
      this.setupSessionTimer();
      this.debugLog('Session extended', { extensionTime });
    },

    getSessionInfo: (): SessionInfo => {
      const now = Date.now();
      return {
        sessionId: this._sessionId,
        tenantHash: this.getTenantHash(),
        createdAt: createTimestamp(now - (60 * 60 * 1000)), // Estimated
        lastActivityAt: this._lastActivity,
        expiresAt: createTimestamp(this._lastActivity + this._configuration.sessionTimeout),
        messageCount: this._messages.length as MessageCount,
        isExpired: this.sessionOps.isSessionExpired(),
        isActive: !this.sessionOps.isSessionExpired(),
        totalDuration: now - (this._lastActivity - (30 * 60 * 1000)), // Estimated
        persistenceEnabled: this._configuration.enablePersistence
      };
    },

    getSessionMetrics: (): import('../types/providers/state').SessionMetrics => {
      const now = Date.now();
      const duration = now - (this._lastActivity - (30 * 60 * 1000)); // Estimated
      
      return {
        duration,
        messageCount: this._messages.length as MessageCount,
        averageResponseTime: 1500, // TODO: Calculate from actual response times
        activityScore: Math.min(100, (this._messages.length / 10) * 100),
        memoryUsage: this.getMemoryUsage(),
        persistenceSize: JSON.stringify(this._messages).length,
        errorCount: this.metricsState.errorCount,
        warningCount: 0 // TODO: Track warnings
      };
    },

    recordActivity: (activity: import('../types/providers/state').SessionActivity): void => {
      this._lastActivity = createTimestamp(Date.now());
      // TODO: Store activity history
      this.debugLog('Activity recorded', { activityType: activity.type });
    },

    getActivityHistory: (): readonly import('../types/providers/state').SessionActivity[] => {
      // TODO: Implement activity history tracking
      return [];
    },

    getLastActivityTime: (): Timestamp => {
      return this._lastActivity;
    },

    isSessionActive: (): boolean => {
      return !this.sessionOps.isSessionExpired();
    },

    initializeSession: async (options?: { enablePersistence?: boolean }): Promise<SessionId> => {
      // Ensure session exists
      if (!this._sessionId) {
        this._sessionId = createSessionId(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
        this._lastActivity = createTimestamp(Date.now());
      }
      
      // Take memory snapshot for session initialization
      try {
        MemoryOptimizationHooks.snapshotFor('chat_state_provider', 'session_init');
      } catch (error) {
        this.debugLog('Failed to take memory snapshot', { error: (error as Error).message });
      }
      
      // Persist session ID to sessionStorage for compatibility
      try {
        sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, this._sessionId);
        this.debugLog('Session ID persisted to sessionStorage', { sessionId: this._sessionId });
      } catch (error) {
        this.logError(error as Error, 'session_storage_persistence');
      }
      
      // Setup session timer
      this.setupSessionTimer();
      
      return this._sessionId;
    }
  };

  /* ===== EVENT HANDLERS ===== */

  public readonly onMessageAdded = (callback: MessageAddedCallback): (() => void) => {
    this.messageAddedListeners.add(callback);
    return () => this.messageAddedListeners.delete(callback);
  };

  public readonly onMessageUpdated = (callback: MessageUpdatedCallback): (() => void) => {
    this.messageUpdatedListeners.add(callback);
    return () => this.messageUpdatedListeners.delete(callback);
  };

  public readonly onMessageRemoved = (callback: MessageRemovedCallback): (() => void) => {
    this.messageRemovedListeners.add(callback);
    return () => this.messageRemovedListeners.delete(callback);
  };

  public readonly onMessagesCleared = (callback: MessagesClearedCallback): (() => void) => {
    this.messagesClearedListeners.add(callback);
    return () => this.messagesClearedListeners.delete(callback);
  };

  public readonly onTypingStateChanged = (callback: TypingStateChangedCallback): (() => void) => {
    this.typingStateChangedListeners.add(callback);
    return () => this.typingStateChangedListeners.delete(callback);
  };

  public readonly onSessionChanged = (callback: SessionChangedCallback): (() => void) => {
    this.sessionChangedListeners.add(callback);
    return () => this.sessionChangedListeners.delete(callback);
  };

  public readonly onSessionExpired = (callback: SessionExpiredCallback): (() => void) => {
    this.sessionExpiredListeners.add(callback);
    return () => this.sessionExpiredListeners.delete(callback);
  };

  /* ===== TYPE GUARDS & VALIDATION ===== */

  public readonly isValidMessage = (message: unknown): message is ChatContextMessage => {
    return (
      typeof message === 'object' &&
      message !== null &&
      'id' in message &&
      'content' in message &&
      'type' in message &&
      'timestamp' in message
    );
  };

  public readonly isStreamingMessage = (messageId: MessageId): boolean => {
    const message = this.messageOps.getMessageById(messageId);
    return message?.streaming === true;
  };

  public readonly isValidSession = (sessionId: unknown): sessionId is SessionId => {
    return typeof sessionId === 'string' && sessionId.startsWith('session_');
  };

  /* ===== CONFIGURATION & UTILITIES ===== */

  public readonly getConfiguration = (): StateProviderConfiguration => {
    return { ...this._configuration };
  };

  public readonly updateConfiguration = async (config: Partial<StateProviderConfiguration>): Promise<void> => {
    this._configuration = { ...this._configuration, ...config };
    this.debugLog('Configuration updated', { updatedKeys: Object.keys(config) });
  };

  public readonly trimOldMessages = async (keepCount: number): Promise<MessageCount> => {
    if (this._messages.length <= keepCount) {
      return 0 as MessageCount;
    }

    const trimCount = this._messages.length - keepCount;
    // Create new array to trigger React re-renders
    this._messages = this._messages.slice(trimCount);
    this.debugLog('Old messages trimmed', { trimCount, remaining: this._messages.length });
    
    return trimCount as MessageCount;
  };

  public readonly compactMessageHistory = async (): Promise<void> => {
    // TODO: Implement message compaction (e.g., merge consecutive messages from same sender)
    this.debugLog('Message history compaction not yet implemented');
  };

  public readonly getMemoryUsage = (): StateProviderMemoryUsage => {
    const memoryInfo = this.memoryMonitor.getMemoryInfo();
    const messageMemory = JSON.stringify(this._messages).length;
    
    return {
      totalMemory: memoryInfo.usedJSHeapSize,
      messageMemory,
      sessionMemory: JSON.stringify({ sessionId: this._sessionId, lastActivity: this._lastActivity }).length,
      cacheMemory: 0, // TODO: Calculate cache memory
      indexMemory: 0, // TODO: Calculate index memory
      compressionRatio: 1.0, // TODO: Calculate compression ratio
      monitor: memoryInfo,
      growthAlerts: this.memoryMonitor.getGrowthAlerts(),
      lastCleanup: createTimestamp(Date.now() - (5 * 60 * 1000)) // Estimate last cleanup
    };
  };

  public readonly dumpState = (): import('../types/providers/state').StateProviderDump => {
    return {
      version: '1.0.0',
      timestamp: createTimestamp(Date.now()),
      sessionInfo: this.sessionOps.getSessionInfo(),
      messages: [...this._messages],
      configuration: this._configuration,
      metrics: this.sessionOps.getSessionMetrics(),
      memoryUsage: this.getMemoryUsage(),
      errors: []
    };
  };

  public readonly validateIntegrity = async (): Promise<import('../types/providers/state').StateIntegrityResult> => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const correctedIssues: string[] = [];
    const orphanedMessages: MessageId[] = [];
    const duplicateMessages: MessageId[] = [];

    // Check for duplicate message IDs
    const messageIds = new Set<MessageId>();
    for (const message of this._messages) {
      if (messageIds.has(message.id)) {
        duplicateMessages.push(message.id);
        errors.push(`Duplicate message ID found: ${message.id}`);
      } else {
        messageIds.add(message.id);
      }
    }

    // Validate message structure
    for (const message of this._messages) {
      if (!this.isValidMessage(message)) {
        errors.push(`Invalid message structure: ${message.id || 'unknown'}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      correctedIssues,
      messagesValidated: this._messages.length as MessageCount,
      orphanedMessages,
      duplicateMessages
    };
  };

  /* ===== ADVANCED STATE OPERATIONS ===== */

  public readonly advancedOps: AdvancedStateOperations = {
    createMemoryMonitor: (): SessionMemoryMonitor => {
      return createMemoryMonitor();
    },

    triggerMemoryCleanup: async (aggressive = false): Promise<MemoryCleanupResult> => {
      const beforeMemory = this.memoryMonitor.getMemoryInfo();
      const itemsCleanedUp = {
        controllers: 0,
        timeouts: 0,
        logs: 0,
        messages: 0
      };

      try {
        // Message cleanup - trim old messages if needed
        if (aggressive && this._messages.length > this._configuration.maxStoredMessages) {
          const beforeCount = this._messages.length;
          await this.trimOldMessages(this._configuration.maxStoredMessages / 2);
          itemsCleanedUp.messages = beforeCount - this._messages.length;
        }

        // Force garbage collection if available
        if (typeof window !== 'undefined' && (window as any).gc) {
          (window as any).gc();
        }

        const afterMemory = this.memoryMonitor.getMemoryInfo();
        const memoryFreed = Math.max(0, beforeMemory.usedJSHeapSize - afterMemory.usedJSHeapSize);

        this.debugLog('Memory cleanup completed', {
          aggressive,
          memoryFreed: Math.round(memoryFreed / 1024) + 'KB',
          itemsCleanedUp
        });

        return {
          success: true,
          beforeMemory,
          afterMemory,
          itemsCleanedUp,
          memoryFreed
        };
      } catch (error) {
        this.logError(error as Error, 'memory_cleanup');
        return {
          success: false,
          beforeMemory,
          afterMemory: beforeMemory,
          itemsCleanedUp,
          memoryFreed: 0
        };
      }
    },

    getMemorySnapshot: (): SessionMemoryInfo => {
      return this.memoryMonitor.getMemoryInfo();
    },

    validateMemoryHealth: (): MemoryHealthReport => {
      const currentUsage = this.memoryMonitor.getMemoryInfo();
      const growthAlerts = this.memoryMonitor.getGrowthAlerts();
      const sessionDuration = this.memoryMonitor.getSessionDuration();
      
      // Calculate growth rate (MB per minute)
      const growthRate = sessionDuration > 0 ? 
        (currentUsage.usedJSHeapSize / (1024 * 1024)) / (sessionDuration / (1000 * 60)) : 0;

      const recommendations: string[] = [];
      const alerts: string[] = [];
      let isHealthy = true;

      // Memory utilization checks
      if (currentUsage.memoryUtilization > 85) {
        isHealthy = false;
        alerts.push('High memory utilization detected');
        recommendations.push('Consider clearing old messages or restarting the session');
      }

      // Growth rate checks
      if (growthRate > 1) { // More than 1MB per minute
        isHealthy = false;
        alerts.push('High memory growth rate detected');
        recommendations.push('Enable aggressive cleanup or investigate memory leaks');
      }

      // Growth alerts check
      if (growthAlerts > this._configuration.memoryMonitoring.maxGrowthAlerts) {
        isHealthy = false;
        alerts.push('Multiple memory growth alerts triggered');
        recommendations.push('Restart session to clear memory accumulation');
      }

      return {
        isHealthy,
        currentUsage,
        growthRate,
        recommendations,
        alerts,
        nextCleanupIn: this._configuration.memoryMonitoring.checkInterval
      };
    },

    optimizeMessageHistory: async (): Promise<MessageOptimizationResult> => {
      const beforeCount = this._messages.length;
      const optimizations: string[] = [];
      let memorySaved = 0;

      try {
        // Calculate initial memory usage
        const beforeMemory = JSON.stringify(this._messages).length;

        // Remove duplicate consecutive messages from same sender (if any)
        let compacted = 0;
        const optimizedMessages = this._messages.filter((msg, index) => {
          if (index === 0) return true;
          const prev = this._messages[index - 1];
          if (prev.sender === msg.sender && prev.content === msg.content) {
            compacted++;
            return false;
          }
          return true;
        });

        if (compacted > 0) {
          this._messages = optimizedMessages;
          optimizations.push(`Removed ${compacted} duplicate messages`);
        }

        // Calculate memory saved
        const afterMemory = JSON.stringify(this._messages).length;
        memorySaved = beforeMemory - afterMemory;

        if (memorySaved > 0) {
          optimizations.push(`Saved ${Math.round(memorySaved / 1024)}KB of memory`);
        }

        this.debugLog('Message history optimized', {
          beforeCount,
          afterCount: this._messages.length,
          compacted,
          memorySaved
        });

        return {
          success: true,
          messagesProcessed: beforeCount as MessageCount,
          messagesCompacted: compacted as MessageCount,
          memorySaved,
          optimizations
        };
      } catch (error) {
        this.logError(error as Error, 'message_optimization');
        return {
          success: false,
          messagesProcessed: beforeCount as MessageCount,
          messagesCompacted: 0 as MessageCount,
          memorySaved: 0,
          optimizations: [`Failed to optimize: ${(error as Error).message}`]
        };
      }
    }
  };

  /* ===== PRIVATE HELPER METHODS ===== */

  private updateLastActivity(): void {
    this._lastActivity = createTimestamp(Date.now());
    sessionManager.updateActivityTime();
  }

  private setupSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }

    this.sessionTimer = setTimeout(() => {
      this.sessionExpiredListeners.forEach(listener => {
        try {
          listener(this._sessionId, 'timeout');
        } catch (error) {
          this.logError(error as Error, 'session_expired_listener');
        }
      });
    }, this._configuration.sessionTimeout);
  }

  private setupAutoPersistence(): void {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
    }

    this.persistenceTimer = setInterval(async () => {
      try {
        await this.sessionOps.persistState();
      } catch (error) {
        this.logError(error as Error, 'auto_persistence');
      }
    }, 60000); // Persist every minute
  }

  private setupActivityTracking(): void {
    // Track page visibility changes
    if (typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        this.sessionOps.recordActivity({
          type: 'page_visibility_change',
          timestamp: createTimestamp(Date.now()),
          data: { hidden: document.hidden }
        });
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      this.registerCleanupTask(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      });
    }
  }

  private setupMemoryMonitoring(): void {
    const config = this._configuration.memoryMonitoring;
    
    // Set up periodic memory checks
    this.memoryCheckTimer = setInterval(() => {
      const currentMemory = this.memoryMonitor.getMemoryInfo();
      const sessionDuration = this.memoryMonitor.getSessionDuration();
      
      // Log memory status every 10 minutes
      if (sessionDuration % (10 * 60 * 1000) < config.checkInterval) {
        this.debugLog('Memory Status', {
          ...currentMemory,
          messageCount: this._messages.length,
          growthAlerts: this.memoryMonitor.getGrowthAlerts()
        });
      }
      
      // Check for memory growth issues
      if (this.lastMemorySnapshot) {
        const hasMemoryGrowth = this.memoryMonitor.checkMemoryGrowth(
          this.lastMemorySnapshot, 
          currentMemory
        );
        
        if (hasMemoryGrowth) {
          this.memoryMonitor.incrementGrowthAlerts();
          const growthMB = (currentMemory.usedJSHeapSize - this.lastMemorySnapshot.usedJSHeapSize) / (1024 * 1024);
          
          this.logWarning('Memory growth detected', {
            growthMB: growthMB.toFixed(2),
            currentMemoryMB: (currentMemory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
            sessionDurationMinutes: currentMemory.sessionDurationMinutes,
            totalGrowthAlerts: this.memoryMonitor.getGrowthAlerts(),
            messageCount: this._messages.length
          });
          
          // Trigger aggressive cleanup if memory is growing too fast
          if (growthMB > config.alertThreshold || 
              this.memoryMonitor.getGrowthAlerts() > config.maxGrowthAlerts) {
            if (config.enableAggressiveCleanup) {
              this.logWarning('Triggering aggressive memory cleanup due to growth');
              this.advancedOps.triggerMemoryCleanup(true).catch(error => {
                this.logError(error as Error, 'aggressive_memory_cleanup');
              });
            }
          }
        }
      }
      
      this.lastMemorySnapshot = currentMemory;
      this.memoryMonitor.updateLastMemoryCheck();
    }, config.checkInterval);
    
    // Set up periodic general cleanup
    this.cleanupTimer = setInterval(() => {
      this.advancedOps.triggerMemoryCleanup(false).catch(error => {
        this.logError(error as Error, 'periodic_memory_cleanup');
      });
    }, 5 * 60 * 1000); // Every 5 minutes
    
    this.debugLog('Memory monitoring setup completed', {
      checkInterval: config.checkInterval,
      alertThreshold: config.alertThreshold,
      enableAggressiveCleanup: config.enableAggressiveCleanup
    });
  }

  private async initializeWelcomeMessage(): Promise<void> {
    try {
      const welcomeConfig = this._configuration.welcomeMessage;
      const welcomeMessage = await this.messageOps.generateWelcomeMessage(welcomeConfig);
      
      this._messages = [welcomeMessage];
      
      // Notify listeners
      this.messageAddedListeners.forEach(listener => {
        try {
          listener(welcomeMessage);
        } catch (error) {
          this.logError(error as Error, 'welcome_message_listener');
        }
      });
      
      this.debugLog('Welcome message initialized', {
        messageId: welcomeMessage.id,
        hasActionChips: !!welcomeMessage.actions && welcomeMessage.actions.length > 0
      });
    } catch (error) {
      this.logError(error as Error, 'welcome_message_initialization');
    }
  }

  /* ===== PROVIDER EVENT EMITTER INTERFACE ===== */

  public readonly emit = <T extends unknown>(type: import('../types/providers/base').ProviderEventType, data: T, correlationId?: OperationId): void => {
    // TODO: Implement event emission
    this.debugLog('Event emitted', { type, correlationId });
  };

  public readonly on = <T extends unknown>(type: import('../types/providers/base').ProviderEventType, listener: import('../types/providers/base').ProviderEventListener<T>): import('../types/providers/base').ProviderEventSubscription => {
    // TODO: Implement event subscription
    return () => {};
  };

  public readonly once = <T extends unknown>(type: import('../types/providers/base').ProviderEventType, listener: import('../types/providers/base').ProviderEventListener<T>): import('../types/providers/base').ProviderEventSubscription => {
    // TODO: Implement one-time event subscription
    return () => {};
  };

  public readonly off = (type: import('../types/providers/base').ProviderEventType, listener: import('../types/providers/base').ProviderEventListener): void => {
    // TODO: Implement event listener removal
  };

  public readonly removeAllListeners = (type?: import('../types/providers/base').ProviderEventType): void => {
    // TODO: Implement all listeners removal
  };
}

/* ===== REACT CONTEXT ===== */

const ChatStateContext = createContext<IChatStateProvider | null>(null);

/* ===== PROVIDER COMPONENT ===== */

export const ChatStateProvider: React.FC<ChatStateProviderProps> = ({ 
  children, 
  initialMessages = [],
  sessionId,
  tenantHash,
  configuration,
  onError,
  onSessionExpired
}) => {
  const providerRef = useRef<ChatStateProviderImpl | null>(null);
  const [renderCount, setRenderCount] = useState(0);
  const forceUpdate = useCallback(() => setRenderCount(c => c + 1), []);

  // Initialize provider
  useEffect(() => {
    const initProvider = async () => {
      try {
        const provider = new ChatStateProviderImpl();
        
        // Update configuration if provided
        if (configuration) {
          await provider.updateConfiguration(configuration);
        }

        // Add initial messages
        if (initialMessages.length > 0) {
          await provider.messageOps.addMessages(initialMessages);
        }

        // Set up error handler
        if (onError) {
          // TODO: Connect to provider error events
        }

        // Set up session expiry handler
        if (onSessionExpired) {
          provider.onSessionExpired(onSessionExpired);
        }
        
        // Set up message change listener to force React re-renders
        provider.onMessageAdded(() => {
          console.log('🔄 ChatStateProvider message added - forcing React re-render');
          forceUpdate();
        });
        
        provider.onMessageUpdated(() => {
          console.log('🔄 ChatStateProvider message updated - forcing React re-render');
          forceUpdate();
        });
        
        provider.onMessagesCleared(() => {
          console.log('🔄 ChatStateProvider messages cleared - forcing React re-render');
          forceUpdate();
        });

        // Initialize provider with proper options
        const initSessionId = sessionId || createSessionId(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
        await (provider as any).initialize({
          tenantHash: tenantHash || null,
          sessionId: initSessionId,
          debug: process.env.NODE_ENV === 'development'
        });

        providerRef.current = provider;
        console.log('✅ ChatStateProvider initialized, message count:', provider.messages.length);
      } catch (error) {
        console.error('Failed to initialize ChatStateProvider:', error);
        if (onError) {
          onError(error as any);
        }
      }
    };

    initProvider();

    return () => {
      if (providerRef.current) {
        providerRef.current.cleanup();
      }
    };
  }, []);

  // Handle configuration updates after initialization
  useEffect(() => {
    if (providerRef.current && configuration) {
      Promise.resolve()
        .then(async () => {
          try {
            console.log('🔄 ChatStateProvider configuration effect triggered:', {
              hasProvider: !!providerRef.current,
              hasConfig: !!configuration,
              welcomeMessageConfig: configuration.welcomeMessage,
              currentMessageCount: providerRef.current.messages.length
            });
            
            await providerRef.current.updateConfiguration(configuration);
            console.log('✅ ChatStateProvider configuration updated with tenant config');
            
            // Check if we need to initialize welcome message (for empty message list)
            if (configuration.welcomeMessage?.enabled && providerRef.current?.messages.length === 0) {
              console.log('🔄 Initializing welcome message (empty message list)');
              await (providerRef.current as any).initializeWelcomeMessage();
              console.log('✅ Welcome message initialized, current message count:', providerRef.current.messages.length);
              // Force React re-render after welcome message initialization
              forceUpdate();
              return;
            }
            
            // Check if we need to update existing welcome message with new config
            if (configuration.welcomeMessage?.enabled && providerRef.current?.messages.length > 0) {
              const firstMessage = providerRef.current.messages[0];
              console.log('🔍 Checking first message for welcome update:', {
                firstMessageId: firstMessage.id,
                firstMessageSender: firstMessage.sender,
                isWelcomeMessage: firstMessage.id === 'welcome' && firstMessage.sender === 'assistant'
              });
              
              if (firstMessage.id === 'welcome' && firstMessage.sender === 'assistant') {
                console.log('🔄 Updating existing welcome message with new tenant config');
                const sanitizedContent = await providerRef.current.messageOps.sanitizeMessageContent(
                  configuration.welcomeMessage.message || 'Hello! How can I help you today?'
                );
                await providerRef.current.messageOps.updateMessage(
                  'welcome',
                  { 
                    content: sanitizedContent,
                    actions: configuration.welcomeMessage.actionChips || []
                  }
                );
                console.log('✅ Welcome message updated with new config');
                // Force React re-render after welcome message update
                forceUpdate();
              }
            }
          } catch (error) {
            console.error('❌ ChatStateProvider configuration update failed:', error);
            // Don't rethrow - prevent unhandled promise rejection
          }
        })
        .catch(error => {
          console.error('❌ ChatStateProvider configuration effect failed:', error);
          // Prevent unhandled promise rejection
        });
    }
  }, [configuration]);

  // CRITICAL FIX: Direct dependency on provider messages to ensure reactivity
  const providerValue = useMemo(() => {
    const provider = providerRef.current;
    if (!provider) {
      console.log('⚠️ ChatStateProvider provider not ready yet, creating loading interface');
      // Return a minimal loading interface to prevent context errors
      return {
        messages: [],
        isTyping: false,
        sessionId: createSessionId(`loading_${Date.now()}`),
        messageOps: {
          addMessage: async () => createMessageId(`loading_${Date.now()}`),
          updateMessage: async () => {},
          removeMessage: async () => false,
          clearMessages: async () => 0,
          addMessages: async () => []
        },
        sessionOps: {
          getSessionInfo: () => ({
            sessionId: createSessionId(`loading_${Date.now()}`),
            createdAt: createTimestamp(Date.now()),
            lastActivityAt: createTimestamp(Date.now()),
            expiresAt: createTimestamp(Date.now() + 30 * 60 * 1000),
            messageCount: 0,
            isExpired: false,
            isActive: true,
            totalDuration: 0
          }),
          isSessionExpired: () => false,
          extendSession: async () => {},
          getSessionMetrics: () => ({
            duration: 0,
            messageCount: 0,
            averageResponseTime: 0,
            activityScore: 0,
            memoryUsage: { totalMemory: 0, messageMemory: 0, cacheMemory: 0, persistenceMemory: 0 },
            persistenceSize: 0,
            errorCount: 0,
            warningCount: 0
          })
        },
        advancedOps: {
          exportState: async () => ({
            version: '1.0.0',
            createdAt: createTimestamp(Date.now()),
            exportedAt: createTimestamp(Date.now()),
            messages: [],
            sessionInfo: {
              sessionId: createSessionId(`loading_${Date.now()}`),
              createdAt: createTimestamp(Date.now()),
              lastActivityAt: createTimestamp(Date.now()),
              expiresAt: createTimestamp(Date.now() + 30 * 1000),
              messageCount: 0,
              isExpired: false,
              isActive: true,
              totalDuration: 0
            },
            metadata: { messageCount: 0, configuration: null }
          }),
          importState: async () => ({
            success: false,
            sessionId: createSessionId(`loading_${Date.now()}`),
            messagesImported: 0,
            messagesSkipped: 0,
            errors: ['Provider not ready'],
            warnings: []
          }),
          validateState: async () => ({
            isValid: false,
            errors: ['Provider not ready'],
            warnings: [],
            correctedIssues: [],
            messagesValidated: 0,
            orphanedMessages: [],
            duplicateMessages: []
          }),
          optimizeMessageHistory: async () => ({
            success: false,
            messagesBefore: 0,
            messagesAfter: 0,
            memorySaved: 0,
            optimizations: [],
            errors: ['Provider not ready']
          }),
          performCleanup: async () => ({
            success: false,
            itemsCleanedUp: { controllers: 0, timeouts: 0, logs: 0, messages: 0 },
            memorySaved: 0,
            errors: ['Provider not ready'],
            warnings: []
          })
        }
      } as IChatStateProvider;
    }
    
    // CRITICAL FIX: Force fresh message access to break memoization cycles
    const currentMessages = provider.messages;
    const currentMessageCount = currentMessages?.length || 0;
    const internalMessages = (provider as any)._messages;
    const internalMessageCount = internalMessages?.length || 0;
    
    console.log('🔄 ChatStateProvider context value updated, message count:', currentMessageCount, 'renderCount:', renderCount);
    console.log('🎯 CRITICAL DEBUG - messages reference:', {
      hasMessages: !!currentMessages,
      isArray: Array.isArray(currentMessages), 
      messagesLength: currentMessageCount,
      firstMessage: currentMessages?.[0],
      renderCount,
      // CRITICAL DEBUG: Check internal state vs public interface
      internalMessageCount,
      internalMessages: internalMessages?.map((m: any) => ({ id: m.id, content: m.content.substring(0, 30) })),
      publicMessagesMatch: internalMessageCount === currentMessageCount,
      // CRITICAL FIX: If messages don't match, log the issue
      messagesMismatch: internalMessageCount !== currentMessageCount
    });
    
    // CRITICAL FIX: If internal and public messages don't match, this is the bug!
    if (internalMessageCount !== currentMessageCount) {
      console.error('🚨 CRITICAL BUG FOUND: Internal messages don\'t match public messages:', {
        internalCount: internalMessageCount,
        publicCount: currentMessageCount,
        internalMessages: internalMessages,
        publicMessages: currentMessages
      });
    }
    
    return provider;
  }, [
    // CRITICAL FIX: Add internal message count to dependencies to detect changes
    renderCount,
    (providerRef.current as any)?._messages?.length
  ]);

  return (
    <ChatStateContext.Provider value={providerValue}>
      {children}
    </ChatStateContext.Provider>
  );
};

/* ===== CUSTOM HOOK ===== */

export const useChatState = (): IChatStateProvider => {
  const context = useContext(ChatStateContext);
  if (!context) {
    throw new Error('useChatState must be used within a ChatStateProvider');
  }
  return context;
};

export default ChatStateProvider;