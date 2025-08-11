/**
 * Chat API Type Definitions for chat.myrecruiter.ai
 * 
 * Enhanced type definitions specifically for the Master_Function API endpoints
 * Ensures type safety for all streaming and non-streaming communications
 */

import type {
  ValidTenantHash,
  SafeHTML,
  SecureURL,
  SanitizedError
} from './security';

/* ===== MASTER FUNCTION ENDPOINTS ===== */

/**
 * Master Function endpoint configuration
 * SECURITY: All URLs must use chat.myrecruiter.ai domain
 */
export interface MasterFunctionEndpoints {
  readonly baseUrl: 'https://chat.myrecruiter.ai';
  readonly chat: '/Master_Function?action=chat';
  readonly stream: '/Master_Function?action=stream';
  readonly config: '/Master_Function?action=get_config';
  readonly health: '/Master_Function?action=health';
}

/**
 * Request headers for Master Function API
 */
export interface MasterFunctionHeaders {
  readonly 'Content-Type': 'application/json';
  readonly 'Accept': 'application/json';
  readonly 'x-tenant-id': ValidTenantHash;
  readonly 'x-session-id': string;
  readonly 'User-Agent'?: string;
  readonly 'Authorization'?: string;
}

/* ===== CHAT API TYPES ===== */

/**
 * Chat request payload for Master_Function
 */
export interface ChatApiRequest {
  readonly tenant_hash: ValidTenantHash;
  readonly user_input: string;
  readonly session_id: string;
  readonly files?: readonly FileUpload[];
  readonly messageId: string;
  readonly context?: {
    readonly conversationHistory?: readonly string[];
    readonly userPreferences?: Record<string, unknown>;
    readonly metadata?: Record<string, unknown>;
  };
}

/**
 * File upload structure for chat requests
 */
export interface FileUpload {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly content?: string; // Base64 encoded content
  readonly url?: SecureURL; // Pre-signed URL for large files
}

/**
 * Action chip response structure
 */
export interface ActionChipResponse {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly action: string;
  readonly style?: 'primary' | 'secondary' | 'outline';
  readonly disabled?: boolean;
}

/**
 * Chat API response structure
 */
export interface ChatApiResponse {
  readonly success: boolean;
  readonly content?: string;
  readonly actions?: readonly ActionChipResponse[];
  readonly session_id?: string;
  readonly api_version?: string;
  readonly messages?: readonly {
    readonly content: string;
  }[];
  readonly body?: string;
  readonly response?: string;
  readonly fallback_message?: string;
  readonly file_acknowledgment?: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
  readonly metadata?: {
    readonly processing_time_ms?: number;
    readonly model_version?: string;
    readonly confidence_score?: number;
  };
}

/* ===== STREAMING API TYPES ===== */

/**
 * Streaming request configuration
 */
export interface StreamingRequest {
  readonly userInput: string;
  readonly sessionId: string;
  readonly tenantHash: ValidTenantHash;
  readonly messageId: string;
  readonly streamingConfig?: {
    readonly bufferSize?: number;
    readonly chunkTimeout?: number;
    readonly enableCompression?: boolean;
  };
}

/**
 * Streaming event types from Master_Function
 */
export type StreamingEventType = 
  | 'connection_open'
  | 'message_start'
  | 'content_chunk'
  | 'message_complete'
  | 'action_chips'
  | 'error'
  | 'connection_close';

/**
 * Base streaming event structure
 */
export interface BaseStreamingEvent {
  readonly type: StreamingEventType;
  readonly timestamp: number;
  readonly message_id: string;
  readonly session_id: string;
}

/**
 * Connection opened event
 */
export interface ConnectionOpenEvent extends BaseStreamingEvent {
  readonly type: 'connection_open';
  readonly capabilities: {
    readonly supports_action_chips: boolean;
    readonly supports_file_uploads: boolean;
    readonly max_message_length: number;
  };
}

/**
 * Message start event
 */
export interface MessageStartEvent extends BaseStreamingEvent {
  readonly type: 'message_start';
  readonly sender: 'assistant';
  readonly expected_length?: number;
}

/**
 * Content chunk event
 */
export interface ContentChunkEvent extends BaseStreamingEvent {
  readonly type: 'content_chunk';
  readonly content: string;
  readonly chunk_index: number;
  readonly is_final_chunk: boolean;
}

/**
 * Message complete event
 */
export interface MessageCompleteEvent extends BaseStreamingEvent {
  readonly type: 'message_complete';
  readonly final_content: string;
  readonly content_type: 'text' | 'markdown' | 'html';
  readonly metadata?: {
    readonly total_chunks: number;
    readonly processing_time_ms: number;
  };
}

/**
 * Action chips event
 */
export interface ActionChipsEvent extends BaseStreamingEvent {
  readonly type: 'action_chips';
  readonly actions: readonly ActionChipResponse[];
}

/**
 * Streaming error event
 */
export interface StreamingErrorEvent extends BaseStreamingEvent {
  readonly type: 'error';
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
    readonly retry_after_ms?: number;
  };
}

/**
 * Connection close event
 */
export interface ConnectionCloseEvent extends BaseStreamingEvent {
  readonly type: 'connection_close';
  readonly reason: string;
  readonly code: number;
  readonly was_clean: boolean;
}

/**
 * Union type for all streaming events
 */
export type StreamingEvent = 
  | ConnectionOpenEvent
  | MessageStartEvent  
  | ContentChunkEvent
  | MessageCompleteEvent
  | ActionChipsEvent
  | StreamingErrorEvent
  | ConnectionCloseEvent;

/* ===== STREAMING CONFIGURATION ===== */

/**
 * Streaming connection configuration
 */
export interface StreamingConfig {
  readonly enabled: boolean;
  readonly endpoint: SecureURL | null;
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
 * Streaming metrics for monitoring
 */
export interface StreamingMetrics {
  readonly connection_time_ms: number;
  readonly total_chunks_received: number;
  readonly total_bytes_received: number;
  readonly average_chunk_size: number;
  readonly errors_count: number;
  readonly reconnections_count: number;
  readonly last_activity_timestamp: number;
}

/* ===== TENANT CONFIGURATION API ===== */

/**
 * Tenant configuration request
 */
export interface TenantConfigRequest {
  readonly tenant_hash: ValidTenantHash;
  readonly include_features?: boolean;
  readonly include_branding?: boolean;
  readonly include_endpoints?: boolean;
}

/**
 * Feature configuration from tenant API
 */
export interface TenantFeatureConfig {
  readonly streaming?: boolean;
  readonly streaming_enabled?: boolean;
  readonly file_uploads_enabled?: boolean;
  readonly action_chips?: {
    readonly enabled: boolean;
    readonly max_display: number;
    readonly show_on_welcome: boolean;
    readonly default_chips?: readonly ActionChipResponse[];
    readonly short_text_threshold?: number;
  };
  readonly typing_indicator_enabled?: boolean;
  readonly message_persistence?: boolean;
  readonly auto_scroll?: boolean;
  readonly sound_notifications?: boolean;
}

/**
 * Branding configuration from tenant API
 */
export interface TenantBrandingConfig {
  readonly primary_color?: string;
  readonly secondary_color?: string;
  readonly accent_color?: string;
  readonly font_family?: string;
  readonly logo_url?: SecureURL;
  readonly avatar_url?: SecureURL;
  readonly bot_avatar_url?: SecureURL;
  readonly bot_name?: string;
  readonly chat_title?: string;
  readonly welcome_message?: string;
  readonly company_name?: string;
  readonly custom_css?: string;
  readonly theme?: 'light' | 'dark' | 'auto';
}

/**
 * Endpoint configuration from tenant API
 */
export interface TenantEndpointConfig {
  readonly chat?: SecureURL;
  readonly streaming?: SecureURL;
  readonly file_upload?: SecureURL;
  readonly config?: SecureURL;
  readonly health?: SecureURL;
}

/**
 * Complete tenant configuration response
 */
export interface TenantConfigResponse {
  readonly tenant_hash: ValidTenantHash;
  readonly tenant_id?: string;
  readonly features?: TenantFeatureConfig;
  readonly branding?: TenantBrandingConfig;
  readonly endpoints?: TenantEndpointConfig;
  readonly metadata?: {
    readonly tenantHash?: ValidTenantHash;
    readonly created_at?: string;
    readonly updated_at?: string;
    readonly version?: string;
  };
  readonly _cloudfront?: {
    readonly urls?: {
      readonly avatar?: SecureURL;
      readonly logo?: SecureURL;
    };
  };
}

/* ===== HEALTH CHECK API ===== */

/**
 * Health check response
 */
export interface HealthCheckResponse {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly timestamp: number;
  readonly version: string;
  readonly services: {
    readonly database: 'up' | 'down';
    readonly cache: 'up' | 'down';
    readonly streaming: 'up' | 'down';
    readonly ai_service: 'up' | 'down';
  };
  readonly metrics: {
    readonly response_time_ms: number;
    readonly active_connections: number;
    readonly cpu_usage_percent: number;
    readonly memory_usage_percent: number;
  };
}

/* ===== ERROR HANDLING TYPES ===== */

/**
 * API error classification for retry logic
 */
export interface ApiErrorClassification {
  readonly type: 'NETWORK_ERROR' | 'TIMEOUT_ERROR' | 'SERVER_ERROR' | 'CLIENT_ERROR' | 'UNKNOWN_ERROR';
  readonly code?: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Retry configuration for API calls
 */
export interface RetryConfiguration {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly retryableErrors: readonly string[];
}

/* ===== PERFORMANCE MONITORING ===== */

/**
 * API performance metrics
 */
export interface ApiPerformanceMetrics {
  readonly request_id: string;
  readonly endpoint: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly start_time: number;
  readonly end_time: number;
  readonly duration_ms: number;
  readonly status_code?: number;
  readonly error?: SanitizedError;
  readonly retry_count: number;
  readonly tenant_hash: ValidTenantHash;
}

/* ===== TYPE GUARDS ===== */

/**
 * Type guard for streaming events
 */
export function isStreamingEvent(data: unknown): data is StreamingEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'timestamp' in data &&
    'message_id' in data &&
    'session_id' in data
  );
}

/**
 * Type guard for chat API response
 */
export function isChatApiResponse(data: unknown): data is ChatApiResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    typeof (data as any).success === 'boolean'
  );
}

/**
 * Type guard for tenant config response
 */
export function isTenantConfigResponse(data: unknown): data is TenantConfigResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'tenant_hash' in data &&
    typeof (data as any).tenant_hash === 'string'
  );
}

/* ===== CONSTANTS ===== */

/**
 * Default Master Function configuration
 */
export const DEFAULT_MASTER_FUNCTION_CONFIG = {
  baseUrl: 'https://chat.myrecruiter.ai' as const,
  endpoints: {
    chat: '/Master_Function?action=chat',
    stream: '/Master_Function?action=stream', 
    config: '/Master_Function?action=get_config',
    health: '/Master_Function?action=health'
  },
  timeout: 30000, // 30 seconds
  retryAttempts: 3
} as const;

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfiguration = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'SERVER_ERROR']
} as const;