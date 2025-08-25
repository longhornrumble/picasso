/**
 * JWT and Function URL Authentication Types
 * Type definitions for the new JWT/Function URL streaming architecture
 */

export interface JWTTokenResponse {
  /** JWT token for authentication */
  jwt: string;
  /** Function URL for streaming */
  streaming_url: string;
  /** Token expiration time (optional) */
  expires_at?: string;
  /** Session ID associated with the token */
  session_id?: string;
}

export interface JWTStreamingConfig {
  /** The streaming endpoint URL (can be Function URL) */
  streamingEndpoint: string;
  /** The tenant hash */
  tenantHash: string;
  /** JWT token for authentication (optional, enables JWT/Function URL flow) */
  jwt?: string;
  /** Callback for each streamed message chunk */
  onMessage: (content: string) => void;
  /** Callback when streaming completes */
  onComplete: () => void;
  /** Callback for errors */
  onError: (error: Error) => void;
  /** Enable Safari-specific optimizations */
  enableSafariOptimizations?: boolean;
}

export interface StreamingParameters {
  /** User input message */
  userInput: string;
  /** Session ID */
  sessionId: string;
  /** JWT token for authentication (optional) */
  jwt?: string;
}

export interface StreamingMetrics {
  /** When streaming started */
  startTime: number | null;
  /** When first token was received */
  firstTokenTime: number | null;
  /** When streaming ended */
  endTime: number | null;
  /** Number of tokens received */
  tokenCount: number;
  /** Number of reconnection attempts */
  reconnectionAttempts: number;
  /** Number of background disconnections */
  backgroundDisconnections: number;
  /** Authentication method used */
  authMethod: 'jwt' | 'legacy';
  /** Time to first token */
  timeToFirstToken?: number | null;
  /** Total time for streaming */
  totalTime?: number | null;
  /** Tokens per second rate */
  tokensPerSecond?: string | null;
  /** Whether Safari optimizations were used */
  safariOptimizationsUsed?: boolean;
  /** Whether this is Mobile Safari */
  isMobileSafari?: boolean;
  /** Current connection state */
  connectionState?: string;
  /** Whether JWT was used */
  hasJWT?: boolean;
}

export interface JWTErrorContext {
  /** Context where the error occurred */
  context: string;
  /** Session ID */
  sessionId?: string;
  /** User input (truncated for security) */
  userInput?: string;
  /** Whether JWT was being used */
  hasJWT?: boolean;
  /** Authentication method */
  authMethod?: 'jwt' | 'legacy';
}

export interface JWTValidationError extends Error {
  /** JWT validation error type */
  type: 'JWT_EXPIRED' | 'JWT_INVALID' | 'JWT_MISSING' | 'JWT_MALFORMED';
  /** Additional context */
  context: JWTErrorContext;
}

export interface FunctionURLError extends Error {
  /** Function URL error type */
  type: 'FUNCTION_URL_INVALID' | 'FUNCTION_URL_TIMEOUT' | 'FUNCTION_URL_UNAVAILABLE';
  /** Function URL that failed */
  functionUrl?: string;
  /** Additional context */
  context: JWTErrorContext;
}

/**
 * Chat Provider methods related to JWT authentication
 */
export interface JWTChatMethods {
  /** Generate streaming JWT token */
  generateStreamingToken: (userInput: string, sessionId: string) => Promise<JWTTokenResponse>;
}

/**
 * Environment configuration for JWT/Function URL support
 */
export interface JWTEnvironmentConfig {
  /** Get streaming token generation URL */
  getStreamTokenUrl: (tenantHash: string) => string;
  /** Check if JWT streaming is enabled */
  isJWTStreamingEnabled: (tenantConfig: any) => boolean;
}

/**
 * Streaming hook return values with JWT support
 */
export interface JWTStreamingHook {
  /** Whether streaming is active */
  isStreaming: boolean;
  /** Current connection state */
  connectionState: string;
  /** Whether connected */
  isConnected: boolean;
  /** Whether reconnecting */
  isReconnecting: boolean;
  /** Start streaming with JWT authentication */
  startStreaming: (params: StreamingParameters) => Promise<void>;
  /** Stop streaming */
  stopStreaming: () => void;
  /** Manually reconnect */
  reconnect: () => void;
  /** Get streaming metrics */
  getMetrics: () => StreamingMetrics | null;
  /** Get Safari-specific information */
  getSafariInfo: () => any;
  /** Whether Safari browser is detected */
  isSafari: boolean;
  /** Whether Mobile Safari is detected */
  isMobileSafari: boolean;
  /** Whether Safari optimizations are enabled */
  safariOptimizationsEnabled: boolean;
  /** Whether tab is in background */
  isBackgroundTab: boolean;
  /** Connection manager instance */
  connectionManager: any;
  /** Whether JWT authentication is available */
  hasJWT: boolean;
  /** Authentication method being used */
  authMethod: 'jwt' | 'legacy';
}