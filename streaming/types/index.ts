/**
 * Type Definitions Index
 * 
 * Central export point for all TypeScript type definitions
 * Provides clean imports for all type interfaces
 */

// API Types
export type {
  // Core API
  MasterFunctionConfig,
  ValidTenantHash,
  SecureURL,
  SafeContent,
  BaseApiRequest,
  BaseApiResponse,
  ApiErrorResponse,
  ApiSuccessResponse,
  ApiResponse,
  
  // Tenant Configuration
  BrandingConfig,
  FeatureConfig,
  EndpointConfig,
  TenantConfig,
  GetConfigRequest,
  GetConfigResponse,
  
  // Chat Messages
  MessageType,
  MessageSender,
  FileAttachment,
  ActionChip,
  ChatMessage,
  ChatRequest,
  ChatResponseData,
  ChatResponse,
  
  // Streaming
  StreamingEventType,
  BaseStreamingEvent,
  MessageStartEvent,
  ContentDeltaEvent,
  MessageCompleteEvent,
  ErrorEvent,
  ConnectionCloseEvent,
  StreamingEvent,
  StreamingRequest,
  
  // Health Check
  HealthCheckData,
  HealthCheckResponse,
  
  // Type Guards
  ExtractApiData,
  Mutable,
  ApiCallOptions,
  
  // Constants
  DEFAULT_API_CONFIG
} from './api';

// Chat API Types (specific to chat.myrecruiter.ai)
export type {
  // Master Function API
  MasterFunctionEndpoints,
  MasterFunctionHeaders,
  ChatApiRequest,
  ChatApiResponse,
  FileUpload,
  ActionChipResponse,
  
  // Streaming API
  StreamingRequest as ChatApiStreamingRequest,
  StreamingEvent as ChatApiStreamingEvent,
  StreamingEventType as ChatApiStreamingEventType,
  StreamingConfig as ChatApiStreamingConfig,
  StreamingMetrics,
  ConnectionOpenEvent,
  MessageStartEvent as ChatApiMessageStartEvent,
  ContentChunkEvent,
  MessageCompleteEvent as ChatApiMessageCompleteEvent,
  ActionChipsEvent,
  StreamingErrorEvent,
  ConnectionCloseEvent as ChatApiConnectionCloseEvent,
  
  // Tenant Configuration
  TenantConfigRequest,
  TenantConfigResponse,
  TenantFeatureConfig,
  TenantBrandingConfig,
  TenantEndpointConfig,
  
  // Health Check
  HealthCheckResponse as ChatApiHealthCheckResponse,
  
  // Error Handling & Performance
  ApiErrorClassification,
  RetryConfiguration,
  ApiPerformanceMetrics,
  
  // Type Guards
  isStreamingEvent,
  isChatApiResponse,
  isTenantConfigResponse,
  
  // Constants
  DEFAULT_MASTER_FUNCTION_CONFIG,
  DEFAULT_RETRY_CONFIG
} from './chat-api';

// Chat Context Types
export type {
  // Chat Context
  ChatContextMessage,
  MessageInput,
  ChatContextValue,
  ChatProviderProps,
  UseChatReturn,
  
  // Retry System
  RetryData,
  PendingRetriesMap,
  
  // Memory Monitoring
  MemoryInfo,
  MemoryMonitor,
  MemoryStats,
  
  // Session Management
  SessionStorageKeys,
  SessionConfig,
  
  // Streaming
  StreamingHookOptions,
  StreamingHookReturn,
  
  // Error Handling
  ChatErrorType,
  ChatError,
  
  // Performance
  ChatPerformanceMetrics,
  
  // Type Guards
  isChatContextMessage,
  isStreamingMessage,
  isRetryableMessage,
  
  // Utility Types
  MessageSender as ChatContextMessageSender,
  MessageUpdate,
  ChatOperationResult,
  
  // Constants
  DEFAULT_SESSION_CONFIG,
  SESSION_STORAGE_KEYS
} from './chat-context';

// Security Types
export type {
  // Branded Types
  ValidTenantHash as SecurityValidTenantHash,
  SafeHTML,
  SafeText,
  SecureURL as SecuritySecureURL,
  SafeFilePath,
  SecureNonce,
  
  // Validation
  InputType,
  ContentType,
  ValidationResult,
  SecurityValidationOptions,
  HTMLSanitizationConfig,
  SanitizationLevel,
  SanitizationLevelConfig,
  
  // File Validation
  AllowedMimeType,
  AllowedFileExtension,
  DangerousFileExtension,
  FileValidationConstraints,
  FileValidationResult,
  
  // Environment
  Environment,
  EnvironmentSecurityConfig,
  SecurityError,
  
  // CSP
  CSPDirective,
  CSPSource,
  CSPConfig,
  
  // XSS/Injection Protection
  XSSPattern,
  XSSDetectionResult,
  InjectionType,
  InjectionPattern,
  InjectionDetectionResult,
  
  // Security Validator
  SecurityValidator,
  SecurityContext,
  SanitizedError,
  
  // Constants
  DEFAULT_FILE_CONSTRAINTS,
  SANITIZATION_LEVELS
} from './security';

// Component Types
export type {
  // Base Components
  BaseComponentProps,
  ComponentWithChildren,
  
  // Message Bubble
  MessageBubbleVariant,
  MessageBubbleSize,
  MessageBubbleProps,
  MessageContentProps,
  ActionChipsProps,
  AttachmentDisplayProps,
  
  // Chat Window
  ChatWindowState,
  ChatWindowProps,
  ChatHeaderProps,
  ChatFooterProps,
  
  // Input Components
  InputBarState,
  InputBarProps,
  AttachmentMenuProps,
  
  // Message List
  MessageListProps,
  VirtualListItemData,
  TypingIndicatorProps,
  
  // Error Handling
  ErrorBoundaryState,
  ErrorBoundaryProps,
  ErrorDisplayProps,
  
  // Loading States
  LoadingState,
  LoadingSpinnerProps,
  SkeletonLoaderProps,
  
  // Widget Mounting
  WidgetMountOptions,
  WidgetInstance,
  
  // Theme Components
  ThemeColors,
  ThemeTypography,
  ThemeSpacing,
  
  // Accessibility
  AriaAttributes,
  FocusManagementProps,
  
  // Event Handlers
  MessageEventHandlers,
  WidgetEventHandlers,
  
  // Utility Types
  ExtractProps,
  PartialBy,
  RequiredBy,
  ComponentRef,
  EventHandler
} from './components';

// Configuration Types
export type {
  // Environment
  BuildEnvironment,
  APIEnvironmentConfig,
  CDNConfig,
  SecurityConfig,
  LoggingConfig,
  PerformanceConfig,
  EnvironmentConfig,
  
  // Feature Flags
  GlobalFeatureFlags,
  TenantFeatureFlags,
  ExperimentalFeatures,
  
  // Widget Configuration
  WidgetDisplayConfig,
  WidgetBehaviorConfig,
  AnimationConfig,
  WidgetConfig,
  
  // Theme Configuration
  ColorScheme,
  TypographyConfig,
  SpacingConfig,
  ShadowConfig,
  BorderConfig,
  TransitionConfig,
  ThemeConfig,
  
  // Localization
  SupportedLanguage,
  LocalizationConfig,
  
  // Analytics
  AnalyticsProvider,
  AnalyticsConfig,
  
  // Integrations
  IntegrationConfig,
  
  // Runtime Configuration
  RuntimeConfig,
  ConfigValidationResult,
  ConfigValidator,
  
  // Constants
  DEFAULT_ENVIRONMENT_CONFIG,
  DEFAULT_WIDGET_CONFIG
} from './config';

// Re-export commonly used types with convenient names
export type {
  // Most commonly used API types
  ChatMessage as Message,
  ActionChip as Action,
  FileAttachment as Attachment,
  TenantConfig as Config
} from './api';

export type {
  // Most commonly used component types
  MessageBubbleProps as MessageProps,
  ChatWindowProps as WindowProps,
  InputBarProps as InputProps
} from './components';

export type {
  // Most commonly used security types
  SafeHTML as HTML,
  SafeText as Text,
  ValidTenantHash as TenantHash
} from './security';

export type {
  // Most commonly used config types
  WidgetConfig as Widget,
  ThemeConfig as Theme
} from './config';

// Utility type for branded type creation
export interface BrandedType<T, Brand extends string> {
  readonly __brand: Brand;
  readonly value: T;
}

// Utility type for strict object keys
export type StrictExtract<T, U extends T> = T extends U ? T : never;

// Utility type for recursive partial
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Utility type for recursive readonly
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};