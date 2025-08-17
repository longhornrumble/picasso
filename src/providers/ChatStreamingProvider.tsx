/**
 * ChatStreamingProvider - Real-time Streaming and Connection Management
 * 
 * Handles all real-time streaming operations including:
 * - WebSocket/SSE connection management with automatic reconnection
 * - Stream processing and validation with chunk assembly
 * - Connection quality monitoring and performance metrics
 * - Session management and concurrent streaming support
 */

import React, { createContext, useContext, useCallback, useEffect, useRef, useMemo } from 'react';
import { BaseProvider } from '../context/providers/BaseProvider';
import type {
  ChatStreamingProvider as IChatStreamingProvider,
  ChatStreamingProviderProps,
  StreamingConnectionState,
  StreamingConnectionQuality,
  StreamingConnectionConfig,
  StreamingConnectionManager,
  StreamingConnectionInfo,
  StreamingConnectionMetrics,
  QualityMeasurement,
  StreamProcessor,
  StreamChunk,
  ProcessedChunk,
  ChunkValidationResult,
  PartialMessageResult,
  EnhancedStreamingRequest,
  StreamingRetryConfig,
  StreamingSession,
  StreamingStartOptions,
  EndpointValidationResult,
  ConnectionTestResult,
  ConnectionBenchmarkResult,
  StreamingDiagnostics,
  StreamingMetricsExport,
  StreamingEventCallback,
  StreamingSessionCallback,
  ChunkReceivedCallback,
  ConnectionStateChangeCallback,
  ConnectionQualityChangeCallback,
  ConnectionErrorCallback,
  ReconnectAttemptCallback
} from '../types/providers/streaming';
import { DEFAULT_STREAMING_CONFIG, QUALITY_THRESHOLDS } from '../types/providers/streaming';
import type { 
  StreamingRequest,
  StreamingEvent,
  StreamingEventType
} from '../types/chat-api';
import type { ValidTenantHash, SecureURL } from '../types/security';
import { createSafeContent } from '../types/security';
import type { ChatError } from '../types/chat-context';
import type { ResponseProcessingContext } from '../types/providers/api';
import type {
  ConnectionId,
  OperationId,
  MessageId,
  Timestamp,
  Duration,
  SessionId,
  RequestId
} from '../types/branded';
import { 
  createConnectionId, 
  createTimestamp, 
  createDuration,
  createSessionId
} from '../types/branded';
import { PROVIDER_IDS } from '../types/providers';
import { config as environmentConfig } from '../config/environment';
import { 
  errorLogger,
  classifyError,
  shouldRetry,
  getUserFriendlyMessage
} from '../utils/errorHandling';
import { sanitizeMessage } from '../utils/security';
import { 
  MemoryOptimizationHooks,
  SafeEventSourceManager,
  SafeTimerManager 
} from '../utils/memoryOptimization';

/* ===== STREAMING CONFIGURATION TYPES ===== */

/**
 * Streaming configuration result from sophisticated endpoint detection
 */
interface StreamingConfigResult {
  readonly enabled: boolean;
  readonly endpoint: SecureURL | null;
  readonly reason: string;
  readonly source?: 'tenant_config' | 'environment_fallback' | 'default_environment';
}

/**
 * Enhanced streaming configuration with tenant integration
 */
interface EnhancedStreamingConfig {
  readonly getStreamingConfig: (tenantConfig: any) => StreamingConfigResult;
  readonly validateEndpoint: (endpoint: SecureURL) => Promise<boolean>;
  readonly getMetrics: () => any;
}

/* ===== CHAT STREAMING PROVIDER IMPLEMENTATION ===== */

class ChatStreamingProviderImpl extends BaseProvider implements IChatStreamingProvider {
  // Core components
  private _connectionManager: StreamingConnectionManagerImpl;
  private _processor: StreamProcessorImpl;
  
  // Streaming state
  private _isStreaming: boolean = false;
  private _currentSession: StreamingSession | null = null;
  private _activeSessions: Map<SessionId, StreamingSession> = new Map();
  private _metrics: StreamingConnectionMetrics;
  
  // Error boundary state
  private _errorBoundaryActive: boolean = false;
  private _consecutiveErrors: number = 0;
  private _lastErrorTime: Timestamp | null = null;
  private readonly _maxConsecutiveErrors: number = 3;
  private readonly _errorCooldownPeriod: Duration = createDuration(60000); // 1 minute
  
  // Event listeners
  private streamingEventListeners = new Set<StreamingEventCallback>();
  private sessionStartListeners = new Set<StreamingSessionCallback>();
  private sessionEndListeners = new Set<StreamingSessionCallback>();
  private sessionErrorListeners = new Set<StreamingSessionCallback>();
  private chunkReceivedListeners = new Set<ChunkReceivedCallback>();
  private connectionStateChangeListeners = new Set<ConnectionStateChangeCallback>();
  private qualityChangeListeners = new Set<ConnectionQualityChangeCallback>();
  
  // Configuration
  private streamingSpeed: number = 1.0;
  private bufferingEnabled: boolean = true;
  
  // Sophisticated streaming configuration from monolith
  private tenantConfig: any = null;
  private streamingMessageRef: MessageId | null = null;
  
  // Enhanced streaming configuration
  private enhancedConfig: EnhancedStreamingConfig;

  constructor() {
    super(PROVIDER_IDS.STREAMING, 'ChatStreamingProvider');
    this._connectionManager = new StreamingConnectionManagerImpl();
    this._processor = new StreamProcessorImpl();
    this._metrics = this.initializeMetrics();
    this.enhancedConfig = this.createEnhancedConfig();
    
    // FIXED: Disable memory optimization to prevent 50GB leak
    // MemoryOptimizationHooks.initializeFor('streaming_provider');
    errorLogger.logInfo('Memory optimization disabled for streaming provider');
  }

  /* ===== PROVIDER INTERFACE IMPLEMENTATION ===== */

  protected async onInitialize(options: import('../types/providers/base').ProviderInitOptions): Promise<void> {
    this.debugLog('Initializing ChatStreamingProvider');
    
    // Initialize connection manager
    await this._connectionManager.initialize();
    
    // Set up connection state change handler
    this._connectionManager.onStateChange((newState, oldState, connectionId) => {
      this.connectionStateChangeListeners.forEach(listener => {
        try {
          listener(newState, oldState, connectionId);
        } catch (error) {
          this.logError(error as Error, 'connection_state_change_listener');
        }
      });
    });

    // Set up quality change handler
    this._connectionManager.onQualityChange((newQuality, oldQuality, measurement) => {
      this.qualityChangeListeners.forEach(listener => {
        try {
          listener(newQuality, oldQuality, measurement);
        } catch (error) {
          this.logError(error as Error, 'quality_change_listener');
        }
      });
    });

    // Set up error handler
    this._connectionManager.onError((error, connectionId) => {
      this.logError(error, 'connection_manager_error');
    });

    // Set up reconnection handler
    this._connectionManager.onReconnectAttempt((attempt, maxAttempts, delay) => {
      this.debugLog('Reconnection attempt', { attempt, maxAttempts, delay: delay.value });
    });

    // Start metrics collection
    this.startMetricsCollection();
    
    this.recordOperation();
  }

  protected onCleanup(): void {
    errorLogger.logInfo('🧹 Starting comprehensive ChatStreamingProvider cleanup');
    
    // Take cleanup snapshot
    // FIXED: Disable memory snapshots to prevent accumulation
    // const cleanupSnapshot = MemoryOptimizationHooks.snapshotFor('streaming_provider', 'cleanup_start');
    
    // Stop all active sessions with enhanced tracking
    let sessionsCleanedUp = 0;
    for (const [sessionId] of this._activeSessions) {
      this.stopStreaming(sessionId, 'Provider cleanup').catch(error => {
        this.logError(error as Error, 'session_cleanup');
      });
      sessionsCleanedUp++;
    }
    
    // Enhanced connection manager cleanup
    this._connectionManager.cleanup();
    
    // Close all EventSource connections using SafeEventSourceManager
    const connectionsCleanedUp = SafeEventSourceManager.closeAllConnections();
    
    // Clear all timers using SafeTimerManager
    const timersCleanedUp = SafeTimerManager.clearAllTimers();
    
    // Clear listeners with size tracking
    const listenersCleanedUp = {
      streamingEvents: this.streamingEventListeners.size,
      sessionStart: this.sessionStartListeners.size,
      sessionEnd: this.sessionEndListeners.size,
      sessionError: this.sessionErrorListeners.size,
      chunkReceived: this.chunkReceivedListeners.size,
      connectionStateChange: this.connectionStateChangeListeners.size,
      qualityChange: this.qualityChangeListeners.size
    };
    
    this.streamingEventListeners.clear();
    this.sessionStartListeners.clear();
    this.sessionEndListeners.clear();
    this.sessionErrorListeners.clear();
    this.chunkReceivedListeners.clear();
    this.connectionStateChangeListeners.clear();
    this.qualityChangeListeners.clear();
    
    // Clear session and message callbacks
    const callbacksCleanedUp = {
      sessionCallbacks: this.sessionCallbacks.size,
      messageCallbacks: this.messageCallbacks.size
    };
    
    this.sessionCallbacks.clear();
    this.messageCallbacks.clear();
    
    // Clear sessions
    this._activeSessions.clear();
    this._currentSession = null;
    this._isStreaming = false;
    
    // Check for memory pressure after cleanup
    // FIXED: Disable memory pressure checks to prevent accumulation
    // MemoryOptimizationHooks.checkMemoryPressure('streaming_provider').then(cleanupTriggered => {
    //   const endSnapshot = MemoryOptimizationHooks.snapshotFor('streaming_provider', 'cleanup_end');
      
    errorLogger.logInfo('✅ ChatStreamingProvider cleanup completed', {
      sessionsCleanedUp,
      connectionsCleanedUp,
      timersCleanedUp,
      listenersCleanedUp,
      callbacksCleanedUp
      // emergencyCleanupTriggered: cleanupTriggered,
      // memoryBefore: (cleanupSnapshot.utilization * 100).toFixed(2) + '%',
      // memoryAfter: (endSnapshot.utilization * 100).toFixed(2) + '%'
    });
  }

  protected validateOptions(options: import('../types/providers/base').ProviderInitOptions): boolean {
    return true; // Streaming provider has minimal requirements
  }

  /* ===== PUBLIC PROPERTIES ===== */

  public get connectionManager(): StreamingConnectionManager {
    return this._connectionManager;
  }

  public get processor(): StreamProcessor {
    return this._processor;
  }

  public get isStreaming(): boolean {
    return this._isStreaming;
  }

  public get currentSession(): StreamingSession | null {
    return this._currentSession ? { ...this._currentSession } : null;
  }

  public get activeSessions(): readonly StreamingSession[] {
    return Array.from(this._activeSessions.values()).map(session => ({ ...session }));
  }

  public get metrics(): StreamingConnectionMetrics {
    return { ...this._metrics };
  }

  /* ===== ERROR BOUNDARY IMPLEMENTATION ===== */

  /**
   * Check if error boundary should prevent streaming
   */
  private shouldPreventStreaming(): { prevent: boolean; reason?: string } {
    if (!this._errorBoundaryActive) {
      return { prevent: false };
    }

    const now = createTimestamp(Date.now());
    const timeSinceLastError = this._lastErrorTime 
      ? createDuration(now.value - this._lastErrorTime.value)
      : createDuration(0);

    if (timeSinceLastError.value > this._errorCooldownPeriod.value) {
      // Reset error boundary after cooldown
      this.resetErrorBoundary();
      return { prevent: false };
    }

    return { 
      prevent: true, 
      reason: `Streaming temporarily disabled due to ${this._consecutiveErrors} consecutive errors. Cooldown period active.`
    };
  }

  /**
   * Reset error boundary state
   */
  private resetErrorBoundary(): void {
    this._errorBoundaryActive = false;
    this._consecutiveErrors = 0;
    this._lastErrorTime = null;
    this.debugLog('Error boundary reset - streaming re-enabled');
  }

  /**
   * Handle streaming error with boundary logic
   */
  private handleStreamingError(error: Error, context: string): void {
    this._consecutiveErrors++;
    this._lastErrorTime = createTimestamp(Date.now());
    
    this.logError(error, context);

    if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
      this._errorBoundaryActive = true;
      this.logError(
        new Error(`Streaming error boundary activated after ${this._consecutiveErrors} consecutive errors`),
        'error_boundary_activation'
      );
    }
  }

  /**
   * Handle successful streaming event (resets error counter)
   */
  private handleStreamingSuccess(): void {
    if (this._consecutiveErrors > 0) {
      this.debugLog(`Resetting error counter after successful streaming (was ${this._consecutiveErrors})`);
      this._consecutiveErrors = 0;
    }
  }

  /**
   * Provide graceful degradation when streaming fails
   */
  public readonly getStreamingFallbackInfo = (): {
    isStreamingAvailable: boolean;
    degradationReason?: string;
    fallbackRecommendation: string;
    retryAvailableIn?: Duration;
  } => {
    const errorBoundaryCheck = this.shouldPreventStreaming();
    
    if (errorBoundaryCheck.prevent) {
      const timeUntilRetry = this._lastErrorTime
        ? createDuration(
            this._errorCooldownPeriod.value - 
            (Date.now() - this._lastErrorTime.value)
          )
        : createDuration(0);

      return {
        isStreamingAvailable: false,
        degradationReason: errorBoundaryCheck.reason,
        fallbackRecommendation: 'Using standard API chat mode with immediate responses',
        retryAvailableIn: timeUntilRetry.value > 0 ? timeUntilRetry : undefined
      };
    }

    return {
      isStreamingAvailable: true,
      fallbackRecommendation: 'Streaming is available and functioning normally'
    };
  };

  /* ===== RESPONSE PROCESSING ===== */

  /**
   * Handle streaming response with cross-provider coordination
   * Migrated from ChatProvider to support distributed architecture
   */
  public readonly handleStreamingResponse = async (
    userMessage: any,
    userContent: string,
    tenantHash: ValidTenantHash,
    sessionId: string,
    providerContext: ResponseProcessingContext
  ): Promise<void> => {
    this.assertInitialized();
    const timerId = this.startTiming('handleStreamingResponse');
    
    try {
      // Create placeholder message for streaming
      const botMessageId = `bot_${Date.now()}_${Math.random()}`;
      const botMessage = {
        id: botMessageId,
        sender: "assistant",
        content: createSafeContent(""),
        type: 'text' as const,
        timestamp: Date.now(),
        isStreaming: true,
        metadata: {
          session_id: sessionId,
          api_version: 'streaming'
        }
      };

      // Add placeholder message to local state immediately for instant display
      providerContext.setLocalMessages(prev => [...prev, botMessage]);
      
      // Try to add to state provider in background (async)
      if (providerContext.stateProvider?.messageOps) {
        providerContext.stateProvider.messageOps.addMessage(botMessage).catch(error => {
          this.logError(error as Error, 'streaming_placeholder_provider');
        });
      }

      // Start streaming with enhanced request
      await this.sendStreamingMessage({
        userInput: userContent,
        sessionId: sessionId,
        tenantHash: tenantHash,
        messageId: userMessage.id,
        files: userMessage.files || []
      }, botMessageId as MessageId, {
        onMessage: (chunk: string) => {
          // Update local state immediately for instant display
          providerContext.setLocalMessages(prev => 
            prev.map(msg => 
              msg.id === botMessageId 
                ? { ...msg, content: chunk, isStreaming: true }
                : msg
            )
          );
          
          // Try to update state provider in background (async)
          if (providerContext.stateProvider?.messageOps) {
            providerContext.stateProvider.messageOps.updateMessage(botMessageId, {
              content: chunk,
              isStreaming: true
            }).catch(error => {
              this.logError(error as Error, 'streaming_update_provider');
            });
          }
        },
        onComplete: (finalContent: string, actions?: any[]) => {
          // Finalize message in local state immediately
          providerContext.setLocalMessages(prev => 
            prev.map(msg => 
              msg.id === botMessageId 
                ? { 
                    ...msg, 
                    content: finalContent, 
                    actions: actions || [],
                    isStreaming: false,
                    metadata: {
                      session_id: sessionId,
                      api_version: 'streaming',
                      streaming_complete: true
                    }
                  }
                : msg
            )
          );
          
          // Try to update state provider in background (async)
          if (providerContext.stateProvider?.messageOps) {
            providerContext.stateProvider.messageOps.updateMessage(botMessageId, {
              content: finalContent,
              actions: actions || [],
              isStreaming: false,
              metadata: {
                session_id: sessionId,
                api_version: 'streaming',
                streaming_complete: true
              }
            }).catch(error => {
              this.logError(error as Error, 'streaming_complete_provider');
            });
          }

          // Clear typing indicator using provider context if available
          if (providerContext.stateProvider?.setIsTyping) {
            providerContext.stateProvider.setIsTyping(false);
          } else if (providerContext.setLocalIsTyping) {
            providerContext.setLocalIsTyping(false);
          }

          this.debugLog('Streaming response completed', {
            messageId: userMessage.id,
            botMessageId,
            finalContentLength: finalContent.length
          });
        },
        onError: (error: Error) => {
          this.logError(error, 'streaming_response_error');

          // Update error message in local state immediately
          providerContext.setLocalMessages(prev => 
            prev.map(msg => 
              msg.id === botMessageId 
                ? { 
                    ...msg, 
                    content: getUserFriendlyMessage(error),
                    isStreaming: false,
                    metadata: {
                      error: error.message,
                      api_type: 'streaming',
                      can_retry: shouldRetry(classifyError(error)),
                      messageId: userMessage.id
                    }
                  }
                : msg
            )
          );
          
          // Try to update state provider in background (async)
          if (providerContext.stateProvider?.messageOps) {
            providerContext.stateProvider.messageOps.updateMessage(botMessageId, {
              content: getUserFriendlyMessage(error),
              isStreaming: false,
              metadata: {
                error: error.message,
                api_type: 'streaming',
                can_retry: shouldRetry(classifyError(error)),
                messageId: userMessage.id
              }
            }).catch(providerError => {
              this.logError(providerError as Error, 'streaming_error_provider');
            });
          }

          // Clear typing indicator using provider context if available
          if (providerContext.stateProvider?.setIsTyping) {
            providerContext.stateProvider.setIsTyping(false);
          } else if (providerContext.setLocalIsTyping) {
            providerContext.setLocalIsTyping(false);
          }

          // Re-throw error to maintain existing error handling chain
          throw error;
        }
      });
      
    } finally {
      this.endTiming(timerId);
    }
  };

  /* ===== CORE STREAMING OPERATIONS ===== */

  /**
   * Send streaming message - Main entry point for streaming requests
   * Provides compatibility with existing ChatProvider integration
   */
  public readonly sendStreamingMessage = async (
    request: {
      userInput: string;
      sessionId: string;
      tenantHash: ValidTenantHash;
      messageId: MessageId;
      files?: any[];
    },
    messageId: MessageId,
    callbacks: {
      onMessage: (chunk: string) => void;
      onComplete: (finalContent: string, actions?: any[]) => void;
      onError: (error: Error) => void;
    }
  ): Promise<SessionId> => {
    this.assertInitialized();
    
    // Check error boundary
    const errorBoundaryCheck = this.shouldPreventStreaming();
    if (errorBoundaryCheck.prevent) {
      const error = new Error(errorBoundaryCheck.reason || 'Streaming prevented by error boundary');
      callbacks.onError(error);
      throw error;
    }
    
    // Convert request to EnhancedStreamingRequest format
    const enhancedRequest: EnhancedStreamingRequest = {
      userInput: request.userInput,
      sessionId: request.sessionId,
      tenantHash: request.tenantHash,
      messageId: request.messageId,
      files: request.files || [],
      metadata: {
        timestamp: createTimestamp(Date.now()),
        requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as RequestId
      }
    };

    // Set up streaming callbacks for this message
    this.setupStreamingCallbacksForMessage(messageId, callbacks);

    // Start streaming session
    return this.startStreaming(enhancedRequest, messageId);
  };

  public readonly startStreaming = async (
    request: EnhancedStreamingRequest,
    messageId: MessageId,
    options?: StreamingStartOptions
  ): Promise<SessionId> => {
    // EMERGENCY: Disable streaming to stop memory leak
    throw new Error('Streaming temporarily disabled to prevent massive memory leak');
    
    this.assertInitialized();
    const timerId = this.startTiming('startStreaming');
    
    try {
      // Create session
      const sessionId = createSessionId(`stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      const session: StreamingSession = {
        sessionId,
        messageId,
        startTime: createTimestamp(Date.now()),
        state: 'active',
        request,
        chunksReceived: 0,
        bytesReceived: 0,
        averageChunkTime: createDuration(0),
        lastChunkTime: createTimestamp(Date.now()),
        errors: []
      };

      // Add to active sessions
      this._activeSessions.set(sessionId, session);
      this._currentSession = session;
      this._isStreaming = true;

      // Notify session start listeners
      this.sessionStartListeners.forEach(listener => {
        try {
          listener(session);
        } catch (error) {
          this.logError(error as Error, 'session_start_listener');
        }
      });

      // Start the actual streaming
      await this.initializeStreamingConnection(session, options);

      this.debugLog('Streaming session started', { sessionId, messageId });
      return sessionId;
      
    } finally {
      this.endTiming(timerId);
    }
  };

  public readonly stopStreaming = async (sessionId?: SessionId, reason?: string): Promise<void> => {
    this.assertInitialized();
    const timerId = this.startTiming('stopStreaming');
    
    try {
      const targetSessionId = sessionId || this._currentSession?.sessionId;
      if (!targetSessionId) {
        this.logWarning('No active streaming session to stop');
        return;
      }

      const session = this._activeSessions.get(targetSessionId);
      if (!session) {
        this.logWarning('Streaming session not found', { sessionId: targetSessionId });
        return;
      }

      // Update session state
      const updatedSession: StreamingSession = {
        ...session,
        state: 'completed',
        endTime: createTimestamp(Date.now())
      };
      
      this._activeSessions.set(targetSessionId, updatedSession);

      // Close connection if this is the current session
      if (this._currentSession?.sessionId === targetSessionId) {
        await this._connectionManager.disconnect(reason);
        this._currentSession = null;
        this._isStreaming = false;
      }

      // Notify session end listeners
      this.sessionEndListeners.forEach(listener => {
        try {
          listener(updatedSession);
        } catch (error) {
          this.logError(error as Error, 'session_end_listener');
        }
      });

      this.debugLog('Streaming session stopped', { sessionId: targetSessionId, reason });
      
    } finally {
      this.endTiming(timerId);
    }
  };

  public readonly pauseStreaming = async (sessionId?: SessionId): Promise<void> => {
    this.assertInitialized();
    
    const targetSessionId = sessionId || this._currentSession?.sessionId;
    if (!targetSessionId) {
      this.logWarning('No active streaming session to pause');
      return;
    }

    const session = this._activeSessions.get(targetSessionId);
    if (!session) {
      this.logWarning('Streaming session not found', { sessionId: targetSessionId });
      return;
    }

    // Update session state
    const updatedSession: StreamingSession = {
      ...session,
      state: 'paused'
    };
    
    this._activeSessions.set(targetSessionId, updatedSession);
    
    if (this._currentSession?.sessionId === targetSessionId) {
      this._isStreaming = false;
    }

    this.debugLog('Streaming session paused', { sessionId: targetSessionId });
  };

  public readonly resumeStreaming = async (sessionId?: SessionId): Promise<void> => {
    this.assertInitialized();
    
    const targetSessionId = sessionId || this._currentSession?.sessionId;
    if (!targetSessionId) {
      this.logWarning('No streaming session to resume');
      return;
    }

    const session = this._activeSessions.get(targetSessionId);
    if (!session || session.state !== 'paused') {
      this.logWarning('Cannot resume streaming session', { 
        sessionId: targetSessionId, 
        state: session?.state 
      });
      return;
    }

    // Update session state
    const updatedSession: StreamingSession = {
      ...session,
      state: 'active'
    };
    
    this._activeSessions.set(targetSessionId, updatedSession);
    
    if (this._currentSession?.sessionId === targetSessionId) {
      this._isStreaming = true;
    }

    this.debugLog('Streaming session resumed', { sessionId: targetSessionId });
  };

  public readonly cancelStreaming = async (sessionId: SessionId, reason?: string): Promise<void> => {
    this.assertInitialized();
    
    const session = this._activeSessions.get(sessionId);
    if (!session) {
      this.logWarning('Streaming session not found for cancellation', { sessionId });
      return;
    }

    // Update session state
    const updatedSession: StreamingSession = {
      ...session,
      state: 'cancelled',
      endTime: createTimestamp(Date.now())
    };
    
    this._activeSessions.set(sessionId, updatedSession);

    // Close connection if this is the current session
    if (this._currentSession?.sessionId === sessionId) {
      await this._connectionManager.disconnect(reason);
      this._currentSession = null;
      this._isStreaming = false;
    }

    this.debugLog('Streaming session cancelled', { sessionId, reason });
  };

  /* ===== SESSION MANAGEMENT ===== */

  public readonly getSession = (sessionId: SessionId): StreamingSession | null => {
    const session = this._activeSessions.get(sessionId);
    return session ? { ...session } : null;
  };

  public readonly getAllSessions = (): readonly StreamingSession[] => {
    return Array.from(this._activeSessions.values()).map(session => ({ ...session }));
  };

  public readonly cleanupCompletedSessions = (): number => {
    let cleaned = 0;
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [sessionId, session] of this._activeSessions) {
      const shouldCleanup = (
        session.state === 'completed' || 
        session.state === 'cancelled' || 
        session.state === 'failed'
      ) && (
        session.endTime && (now - session.endTime.value) > maxAge
      );
      
      if (shouldCleanup) {
        this._activeSessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.debugLog('Cleaned up completed sessions', { count: cleaned });
    }
    
    return cleaned;
  };

  /* ===== STREAM CONTROL ===== */

  public readonly setStreamingSpeed = (speed: number): void => {
    this.streamingSpeed = Math.max(0.1, Math.min(5.0, speed)); // Clamp between 0.1x and 5.0x
    this.debugLog('Streaming speed updated', { speed: this.streamingSpeed });
  };

  public readonly getStreamingSpeed = (): number => {
    return this.streamingSpeed;
  };

  public readonly enableBuffering = (enabled: boolean): void => {
    this.bufferingEnabled = enabled;
    this.debugLog('Buffering state updated', { enabled });
  };

  public readonly isBufferingEnabled = (): boolean => {
    return this.bufferingEnabled;
  };

  /* ===== EVENT HANDLERS ===== */

  public readonly onStreamingEvent = (callback: StreamingEventCallback): (() => void) => {
    this.streamingEventListeners.add(callback);
    return () => this.streamingEventListeners.delete(callback);
  };

  public readonly onSessionStart = (callback: StreamingSessionCallback): (() => void) => {
    this.sessionStartListeners.add(callback);
    return () => this.sessionStartListeners.delete(callback);
  };

  public readonly onSessionEnd = (callback: StreamingSessionCallback): (() => void) => {
    this.sessionEndListeners.add(callback);
    return () => this.sessionEndListeners.delete(callback);
  };

  public readonly onSessionError = (callback: StreamingSessionCallback): (() => void) => {
    this.sessionErrorListeners.add(callback);
    return () => this.sessionErrorListeners.delete(callback);
  };

  public readonly onChunkReceived = (callback: ChunkReceivedCallback): (() => void) => {
    this.chunkReceivedListeners.add(callback);
    return () => this.chunkReceivedListeners.delete(callback);
  };

  public readonly onConnectionStateChange = (callback: ConnectionStateChangeCallback): (() => void) => {
    this.connectionStateChangeListeners.add(callback);
    return () => this.connectionStateChangeListeners.delete(callback);
  };

  public readonly onQualityChange = (callback: ConnectionQualityChangeCallback): (() => void) => {
    this.qualityChangeListeners.add(callback);
    return () => this.qualityChangeListeners.delete(callback);
  };

  /* ===== VALIDATION & TESTING ===== */

  public readonly validateEndpoint = async (endpoint: SecureURL): Promise<EndpointValidationResult> => {
    const timerId = this.startTiming('validateEndpoint');
    
    try {
      const errors: string[] = [];
      const warnings: string[] = [];
      const recommendations: string[] = [];
      
      // Basic URL validation
      try {
        const url = new URL(endpoint);
        
        if (url.protocol !== 'wss:' && url.protocol !== 'ws:' && url.protocol !== 'https:' && url.protocol !== 'http:') {
          errors.push('Invalid protocol. Expected ws://, wss://, http://, or https://');
        }
        
        if (url.protocol === 'ws:' || url.protocol === 'http:') {
          warnings.push('Insecure protocol detected. Consider using wss:// or https://');
        }
        
      } catch (error) {
        errors.push('Invalid URL format');
      }

      // Test connection
      const connectionTest = await this.testConnection(endpoint);
      const latency = connectionTest.success ? connectionTest.latency : createDuration(999999);

      // Determine supported protocols
      const supportedProtocols: string[] = [];
      if (endpoint.startsWith('wss://') || endpoint.startsWith('ws://')) {
        supportedProtocols.push('websocket');
      }
      if (endpoint.startsWith('https://') || endpoint.startsWith('http://')) {
        supportedProtocols.push('sse');
      }

      // Add recommendations
      if (latency.value > 1000) {
        recommendations.push('High latency detected. Consider using a closer server.');
      }
      
      if (!connectionTest.success) {
        recommendations.push('Connection test failed. Check firewall and network settings.');
      }

      return {
        isValid: errors.length === 0 && connectionTest.success,
        supportedProtocols,
        latency,
        errors,
        warnings,
        recommendations
      };
      
    } finally {
      this.endTiming(timerId);
    }
  };

  public readonly testConnection = async (endpoint: SecureURL): Promise<ConnectionTestResult> => {
    const startTime = Date.now();
    
    try {
      // For WebSocket endpoints
      if (endpoint.startsWith('wss://') || endpoint.startsWith('ws://')) {
        return new Promise<ConnectionTestResult>((resolve) => {
          const ws = new WebSocket(endpoint);
          const timeout = setTimeout(() => {
            ws.close();
            resolve({
              success: false,
              latency: createDuration(Date.now() - startTime),
              quality: 'offline',
              error: 'Connection timeout'
            });
          }, 5000);

          ws.onopen = () => {
            clearTimeout(timeout);
            const latency = createDuration(Date.now() - startTime);
            ws.close();
            resolve({
              success: true,
              latency,
              quality: this.assessConnectionQuality(latency)
            });
          };

          ws.onerror = (error) => {
            clearTimeout(timeout);
            resolve({
              success: false,
              latency: createDuration(Date.now() - startTime),
              quality: 'offline',
              error: 'WebSocket connection failed'
            });
          };
        });
      }
      
      // For HTTP/HTTPS endpoints (SSE)
      else {
        const response = await fetch(endpoint, { 
          method: 'HEAD',
          cache: 'no-cache',
          signal: AbortSignal.timeout(5000)
        });
        
        const latency = createDuration(Date.now() - startTime);
        
        return {
          success: response.ok,
          latency,
          quality: this.assessConnectionQuality(latency),
          error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
        };
      }
      
    } catch (error) {
      return {
        success: false,
        latency: createDuration(Date.now() - startTime),
        quality: 'offline',
        error: (error as Error).message
      };
    }
  };

  public readonly benchmarkConnection = async (endpoint: SecureURL): Promise<ConnectionBenchmarkResult> => {
    const timerId = this.startTiming('benchmarkConnection');
    
    try {
      // Perform multiple connection tests
      const testRuns = 5;
      const results: ConnectionTestResult[] = [];
      
      for (let i = 0; i < testRuns; i++) {
        const result = await this.testConnection(endpoint);
        results.push(result);
        
        // Wait between tests
        if (i < testRuns - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const successfulResults = results.filter(r => r.success);
      const latencies = successfulResults.map(r => r.latency.value);
      
      if (latencies.length === 0) {
        throw new Error('All connection tests failed');
      }
      
      // Calculate statistics
      const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
      const minLatency = Math.min(...latencies);
      const maxLatency = Math.max(...latencies);
      
      // Estimate throughput (simplified)
      const estimatedThroughput = 1000 / avgLatency; // requests per second
      
      const recommendations: string[] = [];
      if (avgLatency > 500) {
        recommendations.push('High average latency. Consider optimizing network or using a closer server.');
      }
      if (successfulResults.length < testRuns) {
        recommendations.push('Some connection attempts failed. Check network stability.');
      }
      
      return {
        connectionTime: createDuration(minLatency),
        firstByteTime: createDuration(avgLatency),
        throughput: estimatedThroughput,
        latency: createDuration(avgLatency),
        packetLoss: ((testRuns - successfulResults.length) / testRuns) * 100,
        quality: this.assessConnectionQuality(createDuration(avgLatency)),
        recommendations
      };
      
    } finally {
      this.endTiming(timerId);
    }
  };

  /* ===== CONFIGURATION ===== */

  public readonly updateConfig = async (config: Partial<StreamingConnectionConfig>): Promise<void> => {
    await this._connectionManager.updateConfig(config);
    this.debugLog('Streaming configuration updated', { config });
  };

  /**
   * Update tenant configuration for sophisticated endpoint detection
   */
  public readonly updateTenantConfig = (tenantConfig: any): void => {
    this.tenantConfig = tenantConfig;
    
    // Update tenant hash in init options for getTenantHash() method
    const tenantHash = this.getTenantHashFromConfig(tenantConfig);
    if (tenantHash && this.initOptions) {
      this.initOptions.tenantHash = tenantHash;
    }
    
    // Recalculate streaming configuration with new tenant config
    const streamingConfig = this.enhancedConfig.getStreamingConfig(tenantConfig);
    
    this.debugLog('Tenant configuration updated', { 
      hasConfig: !!tenantConfig,
      tenantHash: tenantHash?.slice(0, 8) + '...',
      streamingEnabled: streamingConfig.enabled,
      endpoint: streamingConfig.endpoint,
      source: streamingConfig.source,
      reason: streamingConfig.reason
    });
  };

  /**
   * Get current streaming configuration status
   */
  public readonly getStreamingStatus = (): StreamingConfigResult => {
    return this.enhancedConfig.getStreamingConfig(this.tenantConfig);
  };

  /**
   * Get current streaming message reference
   * Essential for message state tracking as extracted from monolith
   */
  public readonly getCurrentStreamingMessageId = (): MessageId | null => {
    return this.streamingMessageRef;
  };

  /**
   * Check if a specific message is currently streaming
   */
  public readonly isMessageStreaming = (messageId: MessageId): boolean => {
    return this.streamingMessageRef === messageId;
  };

  /**
   * Clear streaming message reference (for emergency cleanup)
   */
  public readonly clearStreamingMessageRef = (): void => {
    if (this.streamingMessageRef) {
      errorLogger.logInfo('🧹 Manually clearing streaming message ref', { 
        messageId: this.streamingMessageRef 
      });
      this.streamingMessageRef = null;
    }
  };

  /* ===== ENHANCED STREAMING CONFIGURATION INTERFACE ===== */

  /**
   * Initialize streaming with intelligent endpoint detection
   * Combines the sophisticated configuration from monolith with enhanced streaming capabilities
   */
  public readonly initializeStreamingWithConfig = async (
    tenantConfig: any,
    request: EnhancedStreamingRequest,
    messageId: MessageId,
    options?: StreamingStartOptions
  ): Promise<SessionId> => {
    // Update tenant configuration for intelligent endpoint detection
    this.updateTenantConfig(tenantConfig);
    
    // Get streaming configuration
    const streamingConfig = this.getStreamingStatus();
    
    if (!streamingConfig.enabled) {
      throw new Error(`Streaming initialization failed: ${streamingConfig.reason}`);
    }
    
    // Start streaming with the configured endpoint
    return this.startStreaming(request, messageId, options);
  };

  /**
   * Get comprehensive streaming information for debugging and monitoring
   */
  public readonly getStreamingInfo = () => {
    const status = this.getStreamingStatus();
    const metrics = this.getStreamingMetrics();
    const diagnostics = this.getDiagnostics();
    
    return {
      // Configuration status
      configuration: {
        enabled: status.enabled,
        endpoint: status.endpoint,
        reason: status.reason,
        source: status.source,
        tenantConfigPresent: !!this.tenantConfig
      },
      
      // Current state
      state: {
        isStreaming: this._isStreaming,
        currentSession: this._currentSession,
        activeSessions: this._activeSessions.size,
        streamingMessageId: this.streamingMessageRef,
        connectionState: this._connectionManager.state,
        connectionQuality: this._connectionManager.quality
      },
      
      // Performance metrics
      metrics: {
        ...metrics,
        healthScore: this._connectionManager.getHealthScore()
      },
      
      // Diagnostics
      diagnostics: {
        recentErrors: diagnostics.recentErrors.length,
        performanceIssues: diagnostics.performanceIssues,
        recommendations: diagnostics.recommendations,
        memoryUsage: diagnostics.memoryUsage
      }
    };
  };

  /**
   * Validate streaming setup and configuration
   * Comprehensive validation that checks all aspects of streaming readiness
   */
  public readonly validateStreamingSetup = async (): Promise<{
    isValid: boolean;
    issues: string[];
    warnings: string[];
    recommendations: string[];
  }> => {
    const issues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Check tenant configuration
    if (!this.tenantConfig) {
      issues.push('No tenant configuration provided');
    } else {
      const streamingConfig = this.getStreamingStatus();
      
      if (!streamingConfig.enabled) {
        issues.push(`Streaming disabled: ${streamingConfig.reason}`);
      } else if (!streamingConfig.endpoint) {
        issues.push('No streaming endpoint available');
      } else {
        // Validate endpoint
        try {
          const validation = await this.validateEndpoint(streamingConfig.endpoint);
          if (!validation.isValid) {
            issues.push(...validation.errors);
            warnings.push(...validation.warnings);
            recommendations.push(...validation.recommendations);
          }
        } catch (error) {
          issues.push(`Endpoint validation failed: ${(error as Error).message}`);
        }
      }
    }
    
    // Check connection manager health
    const healthScore = this._connectionManager.getHealthScore();
    if (healthScore < 50) {
      warnings.push('Connection manager health is poor');
      recommendations.push('Check network connectivity and configuration');
    }
    
    // Check for active sessions that might conflict
    if (this._activeSessions.size > 5) {
      warnings.push('High number of active sessions detected');
      recommendations.push('Consider cleaning up completed sessions');
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      recommendations
    };
  };

  public readonly getConfig = (): StreamingConnectionConfig => {
    return this._connectionManager.config;
  };

  public readonly resetConfig = async (): Promise<void> => {
    // TODO: Implement configuration reset
    this.debugLog('Configuration reset not yet implemented');
  };

  /* ===== DIAGNOSTICS ===== */

  public readonly getDiagnostics = (): StreamingDiagnostics => {
    return {
      connectionInfo: this._connectionManager.getConnectionInfo(),
      metrics: this._metrics,
      activeSessions: this.getAllSessions(),
      recentErrors: [], // TODO: Track recent errors
      performanceIssues: [], // TODO: Detect performance issues
      qualityHistory: [], // TODO: Track quality history
      memoryUsage: this.getMemoryUsage(),
      recommendations: [] // TODO: Generate recommendations
    };
  };

  public readonly exportMetrics = (): StreamingMetricsExport => {
    const now = createTimestamp(Date.now());
    const oneHourAgo = createTimestamp(now.value - (60 * 60 * 1000));
    
    return {
      version: '1.0.0',
      exportTime: now,
      timeRange: {
        start: oneHourAgo,
        end: now
      },
      connectionMetrics: this._metrics,
      sessionHistory: this.getAllSessions(),
      qualityMeasurements: [], // TODO: Include quality measurements
      errorSummary: {} // TODO: Include error summary
    };
  };

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

  /* ===== SOPHISTICATED STREAMING CONFIGURATION (EXTRACTED FROM MONOLITH) ===== */

  /**
   * Create enhanced streaming configuration with intelligent endpoint detection
   * Extracted from ChatProvider.jsx monolith (lines 282-332)
   */
  private createEnhancedConfig(): EnhancedStreamingConfig {
    return {
      getStreamingConfig: (tenantConfig: any): StreamingConfigResult => {
        return this.getStreamingConfig(tenantConfig);
      },
      validateEndpoint: async (endpoint: SecureURL): Promise<boolean> => {
        const result = await this.validateEndpoint(endpoint);
        return result.isValid;
      },
      getMetrics: () => {
        return this.getStreamingMetrics();
      }
    };
  }

  /**
   * Sophisticated streaming configuration detection with intelligent fallback
   * Direct extraction from ChatProvider.jsx monolith (lines 282-332)
   * Preserves all production-tested streaming logic that customers depend on
   */
  private getStreamingConfig(tenantConfig: any): StreamingConfigResult {
    if (!tenantConfig) {
      return { 
        enabled: false, 
        endpoint: null, 
        reason: 'No tenant config' 
      };
    }
    
    // Check if streaming is explicitly disabled
    if (tenantConfig.features?.streaming === false || tenantConfig.features?.streaming_enabled === false) {
      return { 
        enabled: false, 
        endpoint: null, 
        reason: 'Explicitly disabled in config' 
      };
    }
    
    // Check for configured streaming endpoint
    const configuredEndpoint = tenantConfig.endpoints?.streaming;
    if (configuredEndpoint) {
      return { 
        enabled: true, 
        endpoint: configuredEndpoint as SecureURL, 
        reason: 'Configured endpoint available',
        source: 'tenant_config'
      };
    }
    
    // Check if streaming is enabled but endpoint missing - use environment default
    const streamingFeatureEnabled = tenantConfig.features?.streaming_enabled || 
                                    tenantConfig.features?.streaming;
    
    if (streamingFeatureEnabled) {
      const fallbackEndpoint = this.getEnvironmentStreamingUrl();
      if (fallbackEndpoint) {
        return { 
          enabled: true, 
          endpoint: fallbackEndpoint, 
          reason: 'Using environment fallback endpoint',
          source: 'environment_fallback'
        };
      }
    }
    
    // Default: Try environment streaming if no explicit configuration
    try {
      const tenantHash = this.getTenantHashFromConfig(tenantConfig);
      if (tenantHash) {
        const defaultEndpoint = environmentConfig.getStreamingUrl(tenantHash) as SecureURL;
        return { 
          enabled: true, 
          endpoint: defaultEndpoint, 
          reason: 'Using default streaming endpoint',
          source: 'default_environment'
        };
      }
    } catch (error) {
      return { 
        enabled: false, 
        endpoint: null, 
        reason: 'Failed to generate streaming URL: ' + (error as Error).message 
      };
    }
    
    return { 
      enabled: false, 
      endpoint: null, 
      reason: 'No valid configuration found' 
    };
  }

  /**
   * Get environment streaming URL with tenant hash validation
   */
  private getEnvironmentStreamingUrl(): SecureURL | null {
    try {
      const tenantHash = this.getTenantHash();
      if (tenantHash) {
        return environmentConfig.getStreamingUrl(tenantHash) as SecureURL;
      }
    } catch (error) {
      this.logError(error as Error, 'environment_streaming_url');
    }
    return null;
  }

  /**
   * Extract tenant hash from tenant config with fallback logic
   */
  private getTenantHashFromConfig(tenantConfig: any): ValidTenantHash | null {
    const hash = tenantConfig?.tenant_hash || 
                 tenantConfig?.metadata?.tenantHash || 
                 tenantConfig?.tenantHash;
    
    return this.validateTenantHash(hash) ? hash as ValidTenantHash : null;
  }

  /**
   * Validate tenant hash format
   */
  private validateTenantHash(hash: any): boolean {
    return typeof hash === 'string' && hash.length > 0;
  }

  /**
   * Get streaming metrics in the format expected by monolith consumers
   */
  private getStreamingMetrics(): any {
    return {
      connectionAttempts: this._metrics.connectionAttempts,
      successfulConnections: this._metrics.successfulConnections,
      averageLatency: this._metrics.averageLatency.value,
      totalChunksReceived: this._metrics.totalChunksReceived,
      errorRate: this._metrics.errorRate,
      isStreaming: this._isStreaming,
      activeSessions: this._activeSessions.size
    };
  }

  /* ===== PRIVATE HELPER METHODS ===== */

  private initializeMetrics(): StreamingConnectionMetrics {
    return {
      connectionAttempts: 0,
      successfulConnections: 0,
      failedConnections: 0,
      reconnectionAttempts: 0,
      totalUptime: createDuration(0),
      totalDowntime: createDuration(0),
      averageConnectionTime: createDuration(0),
      averageLatency: createDuration(0),
      minLatency: createDuration(999999),
      maxLatency: createDuration(0),
      totalChunksReceived: 0,
      totalChunksSent: 0,
      averageChunkSize: 0,
      totalBytesReceived: 0,
      totalBytesSent: 0,
      compressionRatio: 1.0,
      errorRate: 0,
      lastConnectionTime: createTimestamp(0),
      qualityHistory: []
    };
  }

  private startMetricsCollection(): void {
    // EMERGENCY DISABLED: Prevents infinite memory accumulation
    // SafeTimerManager.setInterval(() => {
    //   this.updateMetrics();
    // }, 30000, 'streaming_metrics_collection');
    console.warn('Streaming metrics collection disabled due to memory leak risk');
  }

  private updateMetrics(): void {
    // Update connection quality based on current state
    if (this._connectionManager.isConnected()) {
      const currentLatency = this._connectionManager.getConnectionMetrics().averageLatency;
      const quality = this.assessConnectionQuality(currentLatency);
      
      // Update quality history
      this._metrics.qualityHistory.push({
        timestamp: createTimestamp(Date.now()),
        quality,
        latency: currentLatency,
        measurement: {
          timestamp: createTimestamp(Date.now()),
          latency: currentLatency,
          bandwidth: 0, // TODO: Implement bandwidth measurement
          jitter: createDuration(0), // TODO: Implement jitter measurement
          packetLoss: 0, // TODO: Implement packet loss measurement
          quality,
          connectionStability: this.calculateConnectionStability()
        }
      });
      
      // Keep only last 100 quality measurements
      if (this._metrics.qualityHistory.length > 100) {
        this._metrics.qualityHistory = this._metrics.qualityHistory.slice(-100);
      }
      
      this._metrics.successfulConnections++;
      this._metrics.lastConnectionTime = createTimestamp(Date.now());
      this._metrics.averageLatency = currentLatency;
    }
    
    // Update session metrics with performance data
    this._metrics.totalChunksReceived = Array.from(this._activeSessions.values())
      .reduce((total, session) => total + session.chunksReceived, 0);
    
    this._metrics.totalBytesReceived = Array.from(this._activeSessions.values())
      .reduce((total, session) => total + session.bytesReceived, 0);
    
    // Calculate real-time error rate
    const totalSessions = this._activeSessions.size;
    const failedSessions = Array.from(this._activeSessions.values())
      .filter(session => session.state === 'failed').length;
    
    this._metrics.errorRate = totalSessions > 0 ? failedSessions / totalSessions : 0;
    
    // Calculate average chunk size
    if (this._metrics.totalChunksReceived > 0) {
      this._metrics.averageChunkSize = this._metrics.totalBytesReceived / this._metrics.totalChunksReceived;
    }
    
    this.debugLog('Enhanced metrics updated', {
      connections: this._metrics.successfulConnections,
      chunks: this._metrics.totalChunksReceived,
      sessions: this._activeSessions.size,
      errorRate: (this._metrics.errorRate * 100).toFixed(2) + '%',
      averageLatency: this._metrics.averageLatency.value + 'ms',
      qualityHistorySize: this._metrics.qualityHistory.length
    });
  }

  /**
   * Initialize streaming connection with production-tested logic from useStreaming hook
   * Extracted from useStreaming.js and ChatProvider.jsx monolith (lines 468-543)
   */
  private async initializeStreamingConnection(
    session: StreamingSession, 
    options?: StreamingStartOptions
  ): Promise<void> {
    const timerId = this.startTiming('initializeStreamingConnection');
    
    try {
      const streamingConfig = this.enhancedConfig.getStreamingConfig(this.tenantConfig);
      
      if (!streamingConfig.enabled || !streamingConfig.endpoint) {
        throw new Error(`Streaming not available: ${streamingConfig.reason}`);
      }

      const tenantHash = this.getTenantHash();
      if (!tenantHash) {
        throw new Error('Tenant hash required for streaming');
      }

      // Set up connection with sophisticated endpoint handling
      const connectionId = await this._connectionManager.connect(
        streamingConfig.endpoint,
        tenantHash,
        {
          protocol: 'auto',
          reconnectAttempts: 3,
          connectionTimeout: createDuration(5000),
          heartbeatInterval: createDuration(30000)
        }
      );

      // Set up production-tested streaming callbacks
      this.setupStreamingCallbacks(session);
      
      // Start the actual streaming request
      await this.startStreamingRequest(session, streamingConfig.endpoint, tenantHash);
      
      this.debugLog('Streaming connection initialized', {
        sessionId: session.sessionId,
        connectionId,
        endpoint: streamingConfig.endpoint,
        source: streamingConfig.source
      });
      
    } catch (error) {
      this.logError(error as Error, 'streaming_connection_init');
      
      // Update session state to failed
      const failedSession: StreamingSession = {
        ...session,
        state: 'failed',
        endTime: createTimestamp(Date.now()),
        errors: [...session.errors, error as Error]
      };
      
      this._activeSessions.set(session.sessionId, failedSession);
      
      // Notify error listeners
      this.sessionErrorListeners.forEach(listener => {
        try {
          listener(failedSession);
        } catch (listenerError) {
          this.logError(listenerError as Error, 'session_error_listener');
        }
      });
      
      throw error;
    } finally {
      this.endTiming(timerId);
    }
  }

  /**
   * Set up sophisticated streaming callbacks extracted from monolith
   * Direct extraction from ChatProvider.jsx (lines 477-542)
   */
  private setupStreamingCallbacks(session: StreamingSession): void {
    // Set the current streaming message reference
    this.streamingMessageRef = session.messageId;
    
    // onMessage callback - handles real-time content streaming
    const onMessage = (content: string) => {
      if (this.streamingMessageRef) {
        // Update session metrics
        const updatedSession: StreamingSession = {
          ...session,
          chunksReceived: session.chunksReceived + 1,
          bytesReceived: session.bytesReceived + content.length,
          lastChunkTime: createTimestamp(Date.now())
        };
        
        this._activeSessions.set(session.sessionId, updatedSession);
        
        // Notify chunk received listeners
        this.chunkReceivedListeners.forEach(listener => {
          try {
            const chunk: StreamChunk = {
              id: `chunk_${session.chunksReceived + 1}`,
              sequenceNumber: session.chunksReceived + 1,
              messageId: session.messageId,
              timestamp: createTimestamp(Date.now()),
              data: content,
              isComplete: false
            };
            listener(chunk, session.sessionId);
          } catch (error) {
            this.logError(error as Error, 'chunk_received_listener');
          }
        });
        
        // Emit streaming event
        this.streamingEventListeners.forEach(listener => {
          try {
            const event = {
              type: 'content_delta' as const,
              content,
              timestamp: Date.now(),
              sessionId: session.sessionId
            };
            listener(event as any, session.sessionId);
          } catch (error) {
            this.logError(error as Error, 'streaming_event_listener');
          }
        });
      }
    };

    // onComplete callback - handles streaming completion with content sanitization
    const onComplete = async () => {
      if (this.streamingMessageRef) {
        const messageId = this.streamingMessageRef;
        const completedSession: StreamingSession = {
          ...session,
          state: 'completed',
          endTime: createTimestamp(Date.now())
        };
        
        this._activeSessions.set(session.sessionId, completedSession);
        
        // Get and log metrics if available
        try {
          const metrics = this.getStreamingMetrics();
          if (metrics) {
            errorLogger.logInfo('📊 Streaming metrics', metrics);
          }
        } catch (e) {
          // Ignore metrics errors
        }
        
        errorLogger.logInfo('🧹 Clearing streaming message ref after completion', { 
          messageId: this.streamingMessageRef 
        });
        
        this.streamingMessageRef = null;
        
        // Notify completion listeners
        this.sessionEndListeners.forEach(listener => {
          try {
            listener(completedSession);
          } catch (error) {
            this.logError(error as Error, 'session_end_listener');
          }
        });
      }
    };

    // onError callback - handles streaming errors with proper cleanup
    const onError = (error: Error) => {
      errorLogger.logError(error, { context: 'streaming_error' });
      
      if (this.streamingMessageRef) {
        const messageId = this.streamingMessageRef;
        const failedSession: StreamingSession = {
          ...session,
          state: 'failed',
          endTime: createTimestamp(Date.now()),
          errors: [...session.errors, error]
        };
        
        this._activeSessions.set(session.sessionId, failedSession);
        
        errorLogger.logInfo('🧹 Clearing streaming message ref after error', { 
          messageId: this.streamingMessageRef 
        });
        
        this.streamingMessageRef = null;
        
        // Notify error listeners
        this.sessionErrorListeners.forEach(listener => {
          try {
            listener(failedSession);
          } catch (listenerError) {
            this.logError(listenerError as Error, 'session_error_listener');
          }
        });
      }
    };

    // Store callbacks for this session
    this.storeSessionCallbacks(session.sessionId, { onMessage, onComplete, onError });
  }

  /**
   * Store session-specific callbacks for cleanup
   */
  private sessionCallbacks = new Map<SessionId, {
    onMessage: (content: string) => void;
    onComplete: () => Promise<void>;
    onError: (error: Error) => void;
  }>();

  /**
   * Store message-specific callbacks for direct integration
   */
  private messageCallbacks = new Map<MessageId, {
    onMessage: (chunk: string) => void;
    onComplete: (finalContent: string, actions?: any[]) => void;
    onError: (error: Error) => void;
  }>();

  private storeSessionCallbacks(sessionId: SessionId, callbacks: {
    onMessage: (content: string) => void;
    onComplete: () => Promise<void>;
    onError: (error: Error) => void;
  }): void {
    this.sessionCallbacks.set(sessionId, callbacks);
  }

  /**
   * Set up message-specific callbacks for ChatProvider integration
   */
  private setupStreamingCallbacksForMessage(messageId: MessageId, callbacks: {
    onMessage: (chunk: string) => void;
    onComplete: (finalContent: string, actions?: any[]) => void;
    onError: (error: Error) => void;
  }): void {
    this.messageCallbacks.set(messageId, callbacks);
  }

  /**
   * Start streaming request with production-tested EventSource logic
   * Extracted from useStreaming.js startStreaming method
   */
  private async startStreamingRequest(
    session: StreamingSession,
    endpoint: SecureURL,
    tenantHash: ValidTenantHash
  ): Promise<void> {
    const callbacks = this.sessionCallbacks.get(session.sessionId);
    if (!callbacks) {
      throw new Error('Session callbacks not found');
    }

    const { onMessage, onComplete, onError } = callbacks;

    try {
      // Build query parameters as in original useStreaming hook
      const params = new URLSearchParams({
        tenant_hash: tenantHash,
        user_input: session.request.userInput || '',
        session_id: session.request.sessionId || '',
        message_id: session.messageId
      });
      
      const url = `${endpoint}?${params.toString()}`;
      
      errorLogger.logInfo('🚀 Starting streaming connection', {
        endpoint,
        tenantHash: tenantHash.slice(0, 8) + '...',
        messageId: session.messageId,
        sessionId: session.sessionId,
        timestamp: new Date().toISOString()
      });
      
      // This would normally create EventSource connection
      // For now, we'll integrate with the connection manager
      await this.setupEventSourceConnection(url, { onMessage, onComplete, onError });
      
    } catch (error) {
      onError(error as Error);
      throw error;
    }
  }

  /**
   * Set up EventSource connection with enhanced memory management and leak prevention
   */
  private async setupEventSourceConnection(
    url: string,
    callbacks: {
      onMessage: (content: string) => void;
      onComplete: () => Promise<void>;
      onError: (error: Error) => void;
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.debugLog('Setting up enhanced EventSource connection', { 
          url: url.replace(/tenant_hash=[^&]+/, 'tenant_hash=***') 
        });
        
        // Generate unique connection ID for tracking
        const connectionId = `streaming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Take memory snapshot before connection
        // FIXED: Disable memory snapshots to prevent accumulation
        // const beforeSnapshot = MemoryOptimizationHooks.snapshotFor('streaming_provider', 'connection_start');
        
        // Create EventSource connection using SafeEventSourceManager
        const eventSource = SafeEventSourceManager.createConnection(url, connectionId, {
          timeout: 25000, // 25 seconds
          onOpen: () => {
            this.debugLog('Enhanced EventSource connection opened successfully', { connectionId });
            this.handleStreamingSuccess(); // Reset error counter on successful connection
            
            // Take snapshot after successful connection
            // FIXED: Disable memory snapshots to prevent accumulation
            // MemoryOptimizationHooks.snapshotFor('streaming_provider', 'connection_established');
            resolve();
          },
          onMessage: (event) => {
            if (event.data === '[DONE]') {
              this.debugLog('EventSource streaming completed', { connectionId });
              SafeEventSourceManager.closeConnection(connectionId);
              callbacks.onComplete();
            } else {
              try {
                // Try to parse as JSON first
                const data = JSON.parse(event.data);
                if (data.type === 'text' && data.content) {
                  callbacks.onMessage(data.content);
                } else if (data.type === 'error') {
                  callbacks.onError(new Error(data.message));
                }
              } catch (parseError) {
                // If not JSON, treat as plain text
                callbacks.onMessage(event.data);
              }
            }
          },
          onError: (error) => {
            const streamingError = new Error(
              eventSource.readyState === EventSource.CLOSED
                ? 'EventSource connection closed'
                : 'EventSource connection error'
            );
            
            this.handleStreamingError(streamingError, 'EventSource connection error');
            SafeEventSourceManager.closeConnection(connectionId);
            
            // Check memory after error
            MemoryOptimizationHooks.checkMemoryPressure('streaming_provider').catch(memError => {
              this.logError(memError as Error, 'memory_check_after_error');
            });
            
            callbacks.onError(streamingError);
          },
          onClose: () => {
            // Take memory snapshot after connection close
            // FIXED: Disable memory snapshots to prevent accumulation
            // const afterSnapshot = MemoryOptimizationHooks.snapshotFor('streaming_provider', 'connection_closed');
            
            this.debugLog('EventSource connection cleanup completed', {
              connectionId,
              // FIXED: Remove memory snapshot references
              // memoryBefore: (beforeSnapshot.utilization * 100).toFixed(2) + '%',
              // memoryAfter: (afterSnapshot.utilization * 100).toFixed(2) + '%'
            });
          }
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  private assessConnectionQuality(latency: Duration): StreamingConnectionQuality {
    const latencyMs = latency.value;
    
    if (latencyMs <= QUALITY_THRESHOLDS.EXCELLENT_LATENCY.value) {
      return 'excellent';
    } else if (latencyMs <= QUALITY_THRESHOLDS.GOOD_LATENCY.value) {
      return 'good';
    } else if (latencyMs <= QUALITY_THRESHOLDS.FAIR_LATENCY.value) {
      return 'fair';
    } else if (latencyMs <= QUALITY_THRESHOLDS.POOR_LATENCY.value) {
      return 'poor';
    } else {
      return 'critical';
    }
  }

  /**
   * Calculate connection stability based on recent performance history
   */
  private calculateConnectionStability(): number {
    const recentQuality = this._metrics.qualityHistory.slice(-10); // Last 10 measurements
    
    if (recentQuality.length === 0) return 1.0;
    
    // Calculate stability based on quality consistency
    const qualityScores = recentQuality.map(entry => {
      switch (entry.quality) {
        case 'excellent': return 1.0;
        case 'good': return 0.8;
        case 'fair': return 0.6;
        case 'poor': return 0.4;
        case 'critical': return 0.2;
        case 'offline': return 0.0;
        default: return 0.5;
      }
    });
    
    // Calculate average and variance
    const average = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
    const variance = qualityScores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / qualityScores.length;
    
    // Stability is inverse of variance, scaled by average quality
    const stability = average * (1 - Math.min(variance, 1));
    
    return Math.max(0, Math.min(1, stability));
  }
}

/* ===== CONNECTION MANAGER IMPLEMENTATION ===== */

class StreamingConnectionManagerImpl implements StreamingConnectionManager {
  private _connectionId: ConnectionId;
  private _state: StreamingConnectionState = 'disconnected';
  private _quality: StreamingConnectionQuality = 'offline';
  private _config: StreamingConnectionConfig;
  private _lastError: Error | null = null;
  
  // Event listeners
  private stateChangeListeners = new Set<ConnectionStateChangeCallback>();
  private qualityChangeListeners = new Set<ConnectionQualityChangeCallback>();
  private errorListeners = new Set<ConnectionErrorCallback>();
  private reconnectAttemptListeners = new Set<ReconnectAttemptCallback>();
  
  // Connection objects
  private websocket: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this._connectionId = createConnectionId();
    this._config = { ...DEFAULT_STREAMING_CONFIG };
  }

  public get connectionId(): ConnectionId {
    return this._connectionId;
  }

  public get state(): StreamingConnectionState {
    return this._state;
  }

  public get quality(): StreamingConnectionQuality {
    return this._quality;
  }

  public get config(): StreamingConnectionConfig {
    return { ...this._config };
  }

  public get lastError(): Error | null {
    return this._lastError;
  }

  public async initialize(): Promise<void> {
    // Setup is done in constructor
  }

  public cleanup(): void {
    this.disconnect('Cleanup').catch(() => {});
    this.clearTimers();
    this.stateChangeListeners.clear();
    this.qualityChangeListeners.clear();
    this.errorListeners.clear();
    this.reconnectAttemptListeners.clear();
  }

  public async connect(
    endpoint: SecureURL, 
    tenantHash: ValidTenantHash,
    options?: Partial<StreamingConnectionConfig>
  ): Promise<ConnectionId> {
    // Update config if options provided
    if (options) {
      this._config = { ...this._config, ...options };
    }
    
    this._config = { ...this._config, endpoint };
    this.setState('connecting');
    
    try {
      if (endpoint.startsWith('wss://') || endpoint.startsWith('ws://')) {
        await this.connectWebSocket(endpoint, tenantHash);
      } else if (endpoint.startsWith('https://') || endpoint.startsWith('http://')) {
        await this.connectSSE(endpoint, tenantHash);
      } else {
        throw new Error('Unsupported endpoint protocol');
      }
      
      this.setState('connected');
      this.startHeartbeat();
      
      return this._connectionId;
      
    } catch (error) {
      this._lastError = error as Error;
      this.setState('failed');
      this.notifyError(error as Error);
      throw error;
    }
  }

  public async disconnect(reason?: string): Promise<void> {
    this.clearTimers();
    
    if (this.websocket) {
      this.websocket.close(1000, reason);
      this.websocket = null;
    }
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.setState('disconnected');
  }

  public async reconnect(force?: boolean): Promise<ConnectionId> {
    if (this._state === 'connecting' && !force) {
      throw new Error('Already connecting');
    }
    
    await this.disconnect('Reconnecting');
    
    // Use the existing endpoint and configuration
    if (!this._config.endpoint) {
      throw new Error('No endpoint configured for reconnection');
    }
    
    return this.connect(this._config.endpoint, '' as ValidTenantHash); // TODO: Store tenant hash
  }

  public async terminate(reason?: string): Promise<void> {
    this.clearTimers();
    this.setState('terminated');
    await this.disconnect(reason);
  }

  public isConnected(): boolean {
    return this._state === 'connected' || this._state === 'streaming';
  }

  public isStreaming(): boolean {
    return this._state === 'streaming';
  }

  public getConnectionInfo(): StreamingConnectionInfo {
    return {
      connectionId: this._connectionId,
      endpoint: this._config.endpoint,
      protocol: this.websocket ? 'websocket' : (this.eventSource ? 'sse' : 'unknown'),
      state: this._state,
      quality: this._quality,
      connectedAt: createTimestamp(Date.now()), // TODO: Track actual connection time
      lastActivity: createTimestamp(Date.now()), // TODO: Track actual activity
      uptime: createDuration(0), // TODO: Calculate actual uptime
      reconnectCount: 0, // TODO: Track reconnections
      totalBytesReceived: 0, // TODO: Track bytes
      totalBytesSent: 0, // TODO: Track bytes
      averageLatency: createDuration(0), // TODO: Calculate latency
      packetLossRate: 0 // TODO: Calculate packet loss
    };
  }

  public getConnectionMetrics(): StreamingConnectionMetrics {
    // Return default metrics - would be implemented with actual tracking
    return {
      connectionAttempts: 0,
      successfulConnections: 0,
      failedConnections: 0,
      reconnectionAttempts: 0,
      totalUptime: createDuration(0),
      totalDowntime: createDuration(0),
      averageConnectionTime: createDuration(0),
      averageLatency: createDuration(0),
      minLatency: createDuration(0),
      maxLatency: createDuration(0),
      totalChunksReceived: 0,
      totalChunksSent: 0,
      averageChunkSize: 0,
      totalBytesReceived: 0,
      totalBytesSent: 0,
      compressionRatio: 1.0,
      errorRate: 0,
      lastConnectionTime: createTimestamp(Date.now()),
      qualityHistory: []
    };
  }

  public async measureLatency(): Promise<Duration> {
    // TODO: Implement actual latency measurement
    return createDuration(50); // Placeholder
  }

  public async testConnection(): Promise<ConnectionTestResult> {
    // TODO: Implement connection test
    return {
      success: this.isConnected(),
      latency: createDuration(50),
      quality: this._quality
    };
  }

  public getHealthScore(): number {
    // Calculate health score based on multiple factors
    let score = 0;
    
    // Connection health (40 points)
    if (this.isConnected()) {
      score += 30;
      if (this._quality === 'excellent') score += 10;
      else if (this._quality === 'good') score += 8;
      else if (this._quality === 'fair') score += 6;
      else if (this._quality === 'poor') score += 4;
      else if (this._quality === 'critical') score += 2;
    }
    
    // Error rate health (30 points)
    const errorRate = this.getConnectionMetrics().errorRate;
    if (errorRate === 0) score += 30;
    else if (errorRate < 0.01) score += 25;
    else if (errorRate < 0.05) score += 20;
    else if (errorRate < 0.1) score += 15;
    else if (errorRate < 0.2) score += 10;
    else score += 5;
    
    // Latency health (20 points)
    const avgLatency = this.getConnectionMetrics().averageLatency.value;
    if (avgLatency < 100) score += 20;
    else if (avgLatency < 300) score += 15;
    else if (avgLatency < 500) score += 10;
    else if (avgLatency < 1000) score += 5;
    
    // Session stability (10 points)
    const totalSessions = this.getConnectionMetrics().connectionAttempts;
    const successfulSessions = this.getConnectionMetrics().successfulConnections;
    if (totalSessions > 0) {
      const successRate = successfulSessions / totalSessions;
      score += Math.round(successRate * 10);
    }
    
    return Math.min(100, Math.max(0, score));
  }

  public onStateChange(callback: ConnectionStateChangeCallback): (() => void) {
    this.stateChangeListeners.add(callback);
    return () => this.stateChangeListeners.delete(callback);
  }

  public onQualityChange(callback: ConnectionQualityChangeCallback): (() => void) {
    this.qualityChangeListeners.add(callback);
    return () => this.qualityChangeListeners.delete(callback);
  }

  public onError(callback: ConnectionErrorCallback): (() => void) {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  public onReconnectAttempt(callback: ReconnectAttemptCallback): (() => void) {
    this.reconnectAttemptListeners.add(callback);
    return () => this.reconnectAttemptListeners.delete(callback);
  }

  public async updateConfig(config: Partial<StreamingConnectionConfig>): Promise<void> {
    this._config = { ...this._config, ...config };
  }

  private setState(newState: StreamingConnectionState): void {
    const oldState = this._state;
    this._state = newState;
    
    this.stateChangeListeners.forEach(listener => {
      try {
        listener(newState, oldState, this._connectionId);
      } catch (error) {
        console.error('State change listener error:', error);
      }
    });
  }

  private notifyError(error: Error): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(error, this._connectionId);
      } catch (listenerError) {
        console.error('Error listener error:', listenerError);
      }
    });
  }

  private async connectWebSocket(endpoint: SecureURL, tenantHash: ValidTenantHash): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(endpoint, this._config.subprotocols);
        
        const timeout = setTimeout(() => {
          this.websocket?.close();
          reject(new Error('WebSocket connection timeout'));
        }, this._config.connectionTimeout.value);

        this.websocket.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };

        this.websocket.onmessage = (event) => {
          // TODO: Process incoming messages
        };

        this.websocket.onclose = (event) => {
          clearTimeout(timeout);
          if (event.code !== 1000) { // Not a normal closure
            this.handleDisconnection();
          }
        };

        this.websocket.onerror = (error) => {
          clearTimeout(timeout);
          reject(new Error('WebSocket connection failed'));
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private async connectSSE(endpoint: SecureURL, tenantHash: ValidTenantHash): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // EMERGENCY: Prevent EventSource connections to stop memory leak
        throw new Error('EventSource connections disabled to prevent memory leak');
        
        this.eventSource = new EventSource(endpoint);
        
        const timeout = setTimeout(() => {
          this.eventSource?.close();
          reject(new Error('SSE connection timeout'));
        }, this._config.connectionTimeout.value);

        this.eventSource.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          // TODO: Process incoming messages
        };

        this.eventSource.onerror = (error) => {
          clearTimeout(timeout);
          this.handleDisconnection();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(() => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        // Send ping
        this.websocket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, this._config.heartbeatInterval.value);
  }

  private handleDisconnection(): void {
    if (this._config.reconnectAttempts > 0 && this._state !== 'terminated') {
      this.attemptReconnection();
    } else {
      this.setState('failed');
    }
  }

  private attemptReconnection(): void {
    if (this.reconnectTimer) {
      return; // Already attempting reconnection
    }
    
    let attempt = 0;
    const maxAttempts = this._config.reconnectAttempts;
    
    const tryReconnect = () => {
      attempt++;
      
      this.reconnectAttemptListeners.forEach(listener => {
        try {
          listener(attempt, maxAttempts, createDuration(this._config.reconnectDelay.value));
        } catch (error) {
          console.error('Reconnect attempt listener error:', error);
        }
      });
      
      this.reconnect(true).then(() => {
        this.clearTimers();
      }).catch(() => {
        if (attempt < maxAttempts) {
          const delay = Math.min(
            this._config.reconnectDelay.value * Math.pow(this._config.reconnectBackoffMultiplier, attempt - 1),
            this._config.maxReconnectDelay.value
          );
          
          this.reconnectTimer = setTimeout(tryReconnect, delay);
        } else {
          this.setState('failed');
          this.clearTimers();
        }
      });
    };
    
    this.setState('reconnecting');
    tryReconnect();
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

/* ===== STREAM PROCESSOR IMPLEMENTATION ===== */

class StreamProcessorImpl implements StreamProcessor {
  public async processChunk(chunk: StreamChunk): Promise<ProcessedChunk> {
    const startTime = Date.now();
    const validation = this.validateChunk(chunk);
    
    if (!validation.isValid) {
      throw new Error(`Chunk validation failed: ${validation.errors.join(', ')}`);
    }
    
    return {
      ...chunk,
      processed: true,
      sanitizedData: validation.sanitizedData || (typeof chunk.data === 'string' ? chunk.data : ''),
      validationErrors: validation.errors,
      processingTime: createDuration(Date.now() - startTime)
    };
  }

  public validateChunk(chunk: StreamChunk): ChunkValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic validation
    if (!chunk.id) {
      errors.push('Chunk ID is required');
    }
    
    if (typeof chunk.sequenceNumber !== 'number') {
      errors.push('Sequence number must be a number');
    }
    
    if (!chunk.data) {
      errors.push('Chunk data is required');
    }
    
    // Data validation
    let sanitizedData: string | undefined;
    if (typeof chunk.data === 'string') {
      sanitizedData = chunk.data; // TODO: Implement proper sanitization
    } else {
      warnings.push('Non-string data detected, conversion required');
      sanitizedData = JSON.stringify(chunk.data);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData
    };
  }

  public async assembleMessage(chunks: readonly ProcessedChunk[]): Promise<StreamingEvent> {
    // TODO: Implement message assembly from chunks
    const content = chunks.map(chunk => chunk.sanitizedData).join('');
    
    return {
      type: 'content_delta',
      content,
      timestamp: Date.now()
    } as StreamingEvent;
  }

  public handlePartialMessage(chunks: readonly ProcessedChunk[]): PartialMessageResult {
    // TODO: Implement partial message handling
    return {
      canProcess: chunks.length > 0,
      missingChunks: [],
      estimatedCompletion: createTimestamp(Date.now() + 1000),
      timeout: createDuration(5000)
    };
  }
}

/* ===== REACT CONTEXT ===== */

const ChatStreamingContext = createContext<IChatStreamingProvider | null>(null);

/* ===== PROVIDER COMPONENT ===== */

export const ChatStreamingProvider: React.FC<ChatStreamingProviderProps> = ({ 
  children, 
  endpoint,
  protocol,
  reconnectAttempts,
  reconnectDelay,
  chunkTimeout,
  enableCompression,
  enableBinaryMode,
  onError,
  onConnectionStateChange,
  onQualityChange
}) => {
  // Create provider instance synchronously to avoid null context issues
  const providerRef = useRef<ChatStreamingProviderImpl | null>(null);
  
  if (!providerRef.current) {
    providerRef.current = new ChatStreamingProviderImpl();
  }

  // Initialize provider asynchronously
  useEffect(() => {
    const initProvider = async () => {
      try {
        const provider = providerRef.current!;
        
        // Set up event handlers
        if (onError) {
          // TODO: Connect to provider error events
        }

        if (onConnectionStateChange) {
          provider.onConnectionStateChange(onConnectionStateChange);
        }

        if (onQualityChange) {
          provider.onQualityChange(onQualityChange);
        }

        // Initialize provider
        await (provider as any).initialize({
          tenantHash: 'test_tenant_hash_12345',
          sessionId: createSessionId(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),
          debug: process.env.NODE_ENV === 'development'
        });
      } catch (error) {
        console.error('Failed to initialize ChatStreamingProvider:', error);
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
  }, [endpoint, protocol, reconnectAttempts, reconnectDelay, chunkTimeout, enableCompression, enableBinaryMode]);

  // Provider is always available, even during initialization
  const providerValue = providerRef.current;

  return (
    <ChatStreamingContext.Provider value={providerValue}>
      {children}
    </ChatStreamingContext.Provider>
  );
};

/* ===== CUSTOM HOOK ===== */

export const useChatStreaming = (): IChatStreamingProvider => {
  const context = useContext(ChatStreamingContext);
  if (!context) {
    throw new Error('useChatStreaming must be used within a ChatStreamingProvider');
  }
  return context;
};

export default ChatStreamingProvider;