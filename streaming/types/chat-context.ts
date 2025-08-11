/**
 * Chat Context Type Definitions
 * 
 * Type definitions for the ChatProvider context and related hooks
 * Ensures type safety for chat state management and operations
 */

import { ReactNode } from 'react';
import type {
  ChatMessage,
  FileAttachment
} from './api';
import type {
  TenantConfigResponse,
  ApiErrorClassification
} from './chat-api';
import type { ValidTenantHash } from './security';

/* ===== CHAT MESSAGE TYPES ===== */

/**
 * Internal chat message structure with enhanced metadata
 */
export interface ChatContextMessage extends ChatMessage {
  readonly isStreaming?: boolean;
  readonly uploadState?: 'pending' | 'uploading' | 'completed' | 'failed';
  readonly metadata?: {
    readonly session_id?: string;
    readonly api_version?: string;
    readonly can_retry?: boolean;
    readonly retry_failed?: boolean;
    readonly messageId?: string;
    readonly error?: string;
    readonly api_type?: string;
    readonly final_error?: string;
    readonly retry_success?: boolean;
  };
}

/**
 * Message input for adding new messages
 */
export interface MessageInput {
  readonly id?: string;
  readonly content: string;
  readonly type?: 'text' | 'html' | 'markdown' | 'system' | 'error';
  readonly sender: 'user' | 'assistant' | 'system';
  readonly files?: readonly FileAttachment[];
  readonly replaceId?: string;
  readonly skipBotResponse?: boolean;
  readonly uploadState?: 'pending' | 'uploading' | 'completed' | 'failed';
  readonly timestamp?: number;
}

/* ===== RETRY SYSTEM TYPES ===== */

/**
 * Retry data structure for pending retries
 */
export interface RetryData {
  readonly errorClassification: ApiErrorClassification;
  readonly attempt: number;
  readonly retries: number;
  readonly url: string;
  readonly options: RequestInit;
}

/**
 * Pending retries map
 */
export type PendingRetriesMap = Map<string, RetryData>;

/* ===== MEMORY MONITORING TYPES ===== */

/**
 * Memory monitoring information
 */
export interface MemoryInfo {
  readonly timestamp: string;
  readonly sessionDurationMinutes: number;
  readonly usedJSHeapSize: number;
  readonly totalJSHeapSize: number;
  readonly jsHeapSizeLimit: number;
  readonly memoryUtilization: number;
}

/**
 * Memory monitor utilities
 */
export interface MemoryMonitor {
  readonly getMemoryInfo: () => MemoryInfo;
  readonly checkMemoryGrowth: (previous: MemoryInfo, current: MemoryInfo) => boolean;
  readonly getGrowthAlerts: () => number;
  readonly incrementGrowthAlerts: () => void;
  readonly getSessionDuration: () => number;
  readonly getLastMemoryCheck: () => number;
  readonly updateLastMemoryCheck: () => void;
}

/**
 * Memory statistics for debugging
 */
export interface MemoryStats {
  readonly activeControllers: number;
  readonly activeTimeouts: number;
  readonly sessionDurationMinutes: number;
  readonly memoryGrowthAlerts: number;
  readonly errorLogStats: {
    readonly totalLogs: number;
    readonly memoryUsageKB: number;
  };
}

/* ===== CHAT CONTEXT VALUE ===== */

/**
 * Chat context debug information
 */
export interface ChatContextDebug {
  readonly tenantHash: ValidTenantHash | null;
  readonly apiType: 'streaming' | 'actions-only';
  readonly configLoaded: boolean;
  readonly chatEndpoint: string;
  readonly streamingSource?: string;
  readonly streamingReason?: string;
  readonly environment: string;
  readonly networkStatus: 'online' | 'offline';
  readonly pendingRetryCount: number;
  readonly streamingEnabled: boolean;
  readonly memoryStats: MemoryStats;
}

/**
 * Complete chat context value interface
 */
export interface ChatContextValue {
  // State
  readonly messages: readonly ChatContextMessage[];
  readonly isTyping: boolean;
  readonly tenantConfig: TenantConfigResponse | null;
  readonly isOnline: boolean;
  readonly pendingRetries: PendingRetriesMap;
  
  // Actions
  readonly addMessage: (message: MessageInput) => Promise<void>;
  readonly updateMessage: (messageId: string, updates: Partial<ChatContextMessage>) => void;
  readonly clearMessages: () => void;
  readonly retryMessage: (messageId: string) => Promise<void>;
  
  // Streaming
  readonly isStreaming: boolean;
  readonly streamingEnabled: boolean;
  
  // Debug information
  readonly _debug: ChatContextDebug;
}

/* ===== CHAT PROVIDER PROPS ===== */

/**
 * ChatProvider component props
 */
export interface ChatProviderProps {
  readonly children: ReactNode;
}

/* ===== HOOK TYPES ===== */

/**
 * UseChat hook return type
 */
export interface UseChatReturn extends Omit<ChatContextValue, '_debug'> {
  // Additional convenience methods for the hook
  readonly sendMessage: (content: string, files?: readonly FileAttachment[]) => Promise<void>;
  readonly getLastMessage: () => ChatContextMessage | null;
  readonly getMessageById: (id: string) => ChatContextMessage | null;
  readonly hasMessages: boolean;
  readonly messageCount: number;
}

/* ===== SESSION MANAGEMENT ===== */

/**
 * Session storage keys
 */
export interface SessionStorageKeys {
  readonly MESSAGES: 'picasso_messages';
  readonly SESSION_ID: 'picasso_session_id';
  readonly LAST_ACTIVITY: 'picasso_last_activity';
}

/**
 * Session configuration
 */
export interface SessionConfig {
  readonly timeout: number; // Session timeout in milliseconds
  readonly persistMessages: boolean;
  readonly maxStoredMessages: number;
}

/* ===== STREAMING TYPES ===== */

/**
 * Streaming configuration
 */
export interface StreamingConfig {
  readonly enabled: boolean;
  readonly endpoint: string | null;
  readonly reason: string;
  readonly source: 'tenant_config' | 'environment_fallback' | 'default_environment';
  readonly fallbackToPolling?: boolean;
  readonly reconnection?: {
    readonly enabled: boolean;
    readonly maxAttempts: number;
    readonly backoffMs: number;
  };
}

/**
 * Streaming hook options
 */
export interface StreamingHookOptions {
  readonly streamingEndpoint: string | null;
  readonly tenantHash: ValidTenantHash | null;
  readonly onMessage: (content: string) => void;
  readonly onComplete: () => void;
  readonly onError: (error: Error) => void;
}

/**
 * Streaming hook return type
 */
export interface StreamingHookReturn {
  readonly isStreaming: boolean;
  readonly startStreaming: (request: {
    readonly userInput: string;
    readonly sessionId: string;
    readonly messageId: string;
  }) => Promise<void>;
  readonly stopStreaming: () => void;
  readonly getMetrics: () => Record<string, unknown> | null;
}

/* ===== ERROR HANDLING ===== */

/**
 * Chat error types
 */
export type ChatErrorType = 
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR' 
  | 'SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'STREAMING_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Chat error interface
 */
export interface ChatError extends Error {
  readonly type: ChatErrorType;
  readonly code?: string;
  readonly retryable: boolean;
  readonly context?: Record<string, unknown>;
}

/* ===== PERFORMANCE MONITORING ===== */

/**
 * Performance metrics for chat operations
 */
export interface ChatPerformanceMetrics {
  readonly timeToFirstMessage: number;
  readonly averageResponseTime: number;
  readonly totalMessages: number;
  readonly failedMessages: number;
  readonly retryCount: number;
  readonly streamingMetrics?: {
    readonly connectionTime: number;
    readonly totalChunks: number;
    readonly averageChunkTime: number;
  };
}

/* ===== TYPE GUARDS ===== */

/**
 * Type guard for chat context messages
 */
export function isChatContextMessage(message: unknown): message is ChatContextMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'id' in message &&
    'content' in message &&
    'sender' in message &&
    'timestamp' in message
  );
}

/**
 * Type guard for streaming messages
 */
export function isStreamingMessage(message: ChatContextMessage): boolean {
  return message.isStreaming === true;
}

/**
 * Type guard for retryable messages
 */
export function isRetryableMessage(message: ChatContextMessage): boolean {
  return message.metadata?.can_retry === true && message.metadata?.retry_failed !== true;
}

/* ===== UTILITY TYPES ===== */

/**
 * Message sender union type
 */
export type MessageSender = ChatContextMessage['sender'];

/**
 * Message update object
 */
export type MessageUpdate = Partial<Pick<ChatContextMessage, 'content' | 'metadata' | 'isStreaming'>>;

/**
 * Chat operation result
 */
export interface ChatOperationResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: ChatError;
}

/* ===== CONSTANTS ===== */

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  timeout: 30 * 60 * 1000, // 30 minutes
  persistMessages: true,
  maxStoredMessages: 100
} as const;

/**
 * Session storage keys
 */
export const SESSION_STORAGE_KEYS: SessionStorageKeys = {
  MESSAGES: 'picasso_messages',
  SESSION_ID: 'picasso_session_id',
  LAST_ACTIVITY: 'picasso_last_activity'
} as const;