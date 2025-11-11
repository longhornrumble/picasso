/**
 * Shared Chat Context
 * 
 * This context definition is shared between HTTP and Streaming providers.
 * It defines the contract that both providers must fulfill.
 */

import { createContext } from 'react';

// Create context with null default so useChat can detect when it's used outside a provider
export const ChatContext = createContext(null);

export default ChatContext;