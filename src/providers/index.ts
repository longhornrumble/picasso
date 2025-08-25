/**
 * Providers Index
 * 
 * Central export point for all distributed providers in the ChatProvider
 * architecture. Provides clean imports and maintains proper dependency order.
 */

// Export all individual providers and their hooks
export { ChatStateProvider, useChatState } from './ChatStateProvider';
export { ChatAPIProvider, useChatAPI } from './ChatAPIProvider';
export { ChatStreamingProvider, useChatStreaming } from './ChatStreamingProvider';
export { ChatContentProvider, useChatContent } from './ChatContentProvider';
export { ChatMonitoringProvider, useChatMonitoring } from './ChatMonitoringProvider';
export { ChatDebugProvider, useChatDebug } from './ChatDebugProvider';

// Export the main orchestrating provider and unified hook
export { 
  ChatProvider, 
  useChat, 
  getChatContext,
  ChatOrchestratorImpl 
} from './ChatProvider';

// Export provider types for advanced usage
export type { UnifiedChatInterface, ChatProviderProps } from './ChatProvider';

// Re-export commonly used provider types
export type {
  ChatStateProvider as IChatStateProvider,
  ChatAPIProvider as IChatAPIProvider,
  ChatStreamingProvider as IChatStreamingProvider,
  ChatContentProvider as IChatContentProvider,
  ChatMonitoringProvider as IChatMonitoringProvider,
  ChatDebugProvider as IChatDebugProvider
} from '../types/providers';

export default ChatProvider;