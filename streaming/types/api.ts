/**
 * API Type Definitions for Picasso Chat Widget
 * 
 * Comprehensive type definitions for all API interactions with chat.myrecruiter.ai
 * Ensures type safety for all Master_Function endpoints and data structures
 */

/* ===== CORE API CONFIGURATION ===== */

/**
 * Base API configuration for chat.myrecruiter.ai endpoints
 * SECURITY: All URLs must use HTTPS in production
 */
export interface MasterFunctionConfig {
  readonly baseUrl: 'https://chat.myrecruiter.ai';
  readonly endpoints: {
    readonly config: '/Master_Function?action=get_config';
    readonly chat: '/Master_Function?action=chat';
    readonly streaming: '/Master_Function?action=stream';
    readonly health: '/Master_Function?action=health';
  };
  readonly timeout: number;
  readonly retryAttempts: number;
}

/**
 * Valid tenant hash - must be alphanumeric, 8-32 characters
 * SECURITY: Enforces strict validation to prevent injection attacks
 */
export type ValidTenantHash = string & { readonly __brand: 'ValidTenantHash' };

/**
 * Secure URL - validated and safe for use
 * SECURITY: Only HTTPS URLs allowed in production
 */
export type SecureURL = string & { readonly __brand: 'SecureURL' };

/**
 * Sanitized content - HTML sanitized and safe for display
 * SECURITY: All user content must be sanitized before display
 */
export type SafeContent = string & { readonly __brand: 'SafeContent' };

/* ===== REQUEST/RESPONSE TYPES ===== */

/**
 * Base API request structure
 */
export interface BaseApiRequest {
  readonly action: string;
  readonly tenant_hash: ValidTenantHash;
  readonly timestamp?: number;
  readonly request_id?: string;
}

/**
 * Base API response structure
 */
export interface BaseApiResponse {
  readonly success: boolean;
  readonly timestamp: number;
  readonly request_id?: string;
}

/**
 * API error response
 */
export interface ApiErrorResponse extends BaseApiResponse {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

/**
 * API success response
 */
export interface ApiSuccessResponse<T = unknown> extends BaseApiResponse {
  readonly success: true;
  readonly data: T;
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/* ===== TENANT CONFIGURATION ===== */

/**
 * Branding configuration for tenant
 */
export interface BrandingConfig {
  readonly primary_color: string;
  readonly secondary_color: string;
  readonly accent_color: string;
  readonly logo_url?: SecureURL;
  readonly company_name: string;
  readonly font_family?: string;
  readonly widget_title?: string;
  readonly welcome_message?: SafeContent;
}

/**
 * Feature flags configuration
 */
export interface FeatureConfig {
  readonly streaming_enabled: boolean;
  readonly file_uploads_enabled: boolean;
  readonly typing_indicator_enabled: boolean;
  readonly message_history_enabled: boolean;
  readonly auto_scroll_enabled: boolean;
  readonly sound_notifications_enabled: boolean;
  readonly dark_mode_available: boolean;
  readonly mobile_optimized: boolean;
}

/**
 * Endpoint configuration for tenant
 */
export interface EndpointConfig {
  readonly chat_endpoint: SecureURL;
  readonly streaming_endpoint?: SecureURL;
  readonly file_upload_endpoint?: SecureURL;
  readonly feedback_endpoint?: SecureURL;
}

/**
 * Complete tenant configuration
 */
export interface TenantConfig {
  readonly tenant_hash: ValidTenantHash;
  readonly branding: BrandingConfig;
  readonly features: FeatureConfig;
  readonly endpoints: EndpointConfig;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: string;
}

/**
 * Tenant configuration request
 */
export interface GetConfigRequest extends BaseApiRequest {
  readonly action: 'get_config';
}

/**
 * Tenant configuration response
 */
export type GetConfigResponse = ApiResponse<TenantConfig>;

/* ===== CHAT MESSAGE TYPES ===== */

/**
 * Message types supported by the chat system
 */
export type MessageType = 'text' | 'html' | 'markdown' | 'system' | 'error';

/**
 * Message sender types
 */
export type MessageSender = 'user' | 'assistant' | 'system';

/**
 * File attachment interface
 */
export interface FileAttachment {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly url?: SecureURL;
  readonly upload_status: 'pending' | 'uploading' | 'completed' | 'failed';
}

/**
 * Action chip interface for interactive elements
 */
export interface ActionChip {
  readonly id: string;
  readonly label: string;
  readonly action: string;
  readonly data?: Record<string, unknown>;
  readonly style?: 'primary' | 'secondary' | 'outline';
}

/**
 * Core chat message structure
 */
export interface ChatMessage {
  readonly id: string;
  readonly content: SafeContent;
  readonly type: MessageType;
  readonly sender: MessageSender;
  readonly timestamp: number;
  readonly attachments?: readonly FileAttachment[];
  readonly action_chips?: readonly ActionChip[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Chat request payload
 */
export interface ChatRequest extends BaseApiRequest {
  readonly action: 'chat';
  readonly message: string;
  readonly message_type?: MessageType;
  readonly conversation_id?: string;
  readonly attachments?: readonly FileAttachment[];
  readonly context?: Record<string, unknown>;
}

/**
 * Chat response data
 */
export interface ChatResponseData {
  readonly message: ChatMessage;
  readonly conversation_id: string;
  readonly suggested_responses?: readonly string[];
  readonly action_chips?: readonly ActionChip[];
}

/**
 * Chat response
 */
export type ChatResponse = ApiResponse<ChatResponseData>;

/* ===== STREAMING TYPES ===== */

/**
 * Streaming event types
 */
export type StreamingEventType = 
  | 'message_start'
  | 'content_delta' 
  | 'message_complete'
  | 'error'
  | 'connection_close';

/**
 * Base streaming event
 */
export interface BaseStreamingEvent {
  readonly type: StreamingEventType;
  readonly timestamp: number;
  readonly message_id: string;
}

/**
 * Message start event
 */
export interface MessageStartEvent extends BaseStreamingEvent {
  readonly type: 'message_start';
  readonly sender: MessageSender;
  readonly message_type: MessageType;
}

/**
 * Content delta event
 */
export interface ContentDeltaEvent extends BaseStreamingEvent {
  readonly type: 'content_delta';
  readonly delta: string;
  readonly content_type: 'text' | 'html' | 'markdown';
}

/**
 * Message complete event
 */
export interface MessageCompleteEvent extends BaseStreamingEvent {
  readonly type: 'message_complete';
  readonly final_content: SafeContent;
  readonly action_chips?: readonly ActionChip[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Error event
 */
export interface ErrorEvent extends BaseStreamingEvent {
  readonly type: 'error';
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
  };
}

/**
 * Connection close event
 */
export interface ConnectionCloseEvent extends BaseStreamingEvent {
  readonly type: 'connection_close';
  readonly reason: string;
  readonly code: number;
}

/**
 * Union of all streaming events
 */
export type StreamingEvent = 
  | MessageStartEvent
  | ContentDeltaEvent
  | MessageCompleteEvent
  | ErrorEvent
  | ConnectionCloseEvent;

/**
 * Streaming request payload
 */
export interface StreamingRequest extends BaseApiRequest {
  readonly action: 'stream';
  readonly message: string;
  readonly conversation_id?: string;
  readonly stream_config?: {
    readonly buffer_size?: number;
    readonly chunk_timeout?: number;
  };
}

/* ===== HEALTH CHECK TYPES ===== */

/**
 * Health check response data
 */
export interface HealthCheckData {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly version: string;
  readonly timestamp: number;
  readonly services: {
    readonly database: 'up' | 'down';
    readonly cache: 'up' | 'down';
    readonly streaming: 'up' | 'down';
  };
  readonly response_time_ms: number;
}

/**
 * Health check response
 */
export type HealthCheckResponse = ApiResponse<HealthCheckData>;

/* ===== TYPE GUARDS ===== */

/**
 * Type guard for API error responses
 */
export function isApiErrorResponse(response: ApiResponse): response is ApiErrorResponse {
  return !response.success;
}

/**
 * Type guard for API success responses
 */
export function isApiSuccessResponse<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return response.success;
}

/**
 * Type guard for streaming events
 */
export function isStreamingEvent(event: unknown): event is StreamingEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    'timestamp' in event &&
    'message_id' in event
  );
}

/* ===== UTILITY TYPES ===== */

/**
 * Extract data type from API response
 */
export type ExtractApiData<T> = T extends ApiResponse<infer U> ? U : never;

/**
 * Make all properties in T mutable (opposite of Readonly)
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Configuration options for API calls
 */
export interface ApiCallOptions {
  readonly timeout?: number;
  readonly retries?: number;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
}

/**
 * Default API configuration values
 */
export const DEFAULT_API_CONFIG: MasterFunctionConfig = {
  baseUrl: 'https://chat.myrecruiter.ai',
  endpoints: {
    config: '/Master_Function?action=get_config',
    chat: '/Master_Function?action=chat',
    streaming: '/Master_Function?action=stream',
    health: '/Master_Function?action=health'
  },
  timeout: 30000, // 30 seconds
  retryAttempts: 3
} as const;