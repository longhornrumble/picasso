/**
 * ChatProvider Orchestrator
 * 
 * SINGLE RESPONSIBILITY: Choose between HTTP and Streaming providers
 * Makes the decision ONCE at initialization and never checks again.
 * 
 * This eliminates the 100+ runtime checks that cause 45-second delays.
 */

import React, { useEffect, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { isStreamingEnabled } from '../config/streaming-config';
import { logger } from '../utils/logger';

// Import providers directly (esbuild doesn't handle React.lazy well)
import HTTPChatProvider from './HTTPChatProvider';
import StreamingChatProvider from './StreamingChatProvider';
import './ChatProviderOrchestrator.css';

export default function ChatProviderOrchestrator({ children }) {
  const [SelectedProvider, setSelectedProvider] = useState(null);
  const [decision, setDecision] = useState(null);
  const { config: tenantConfig } = useConfig();
  
  useEffect(() => {
    console.log('🔷 ChatProviderOrchestrator useEffect triggered, tenantConfig:', tenantConfig);
    // ONE-TIME DECISION POINT
    async function selectProvider() {
      try {
        // Step 1: Determine streaming preference
        const useStreaming = isStreamingEnabled(tenantConfig);
        console.log('🔷 Streaming decision:', useStreaming);
        
        // Step 2: Log the decision ONCE (not 100+ times!)
        console.log(`
╔════════════════════════════════════════════════════════════╗
║                  CHAT PROVIDER INITIALIZED                 ║
║                                                            ║
║  Mode: ${useStreaming ? 'STREAMING' : 'HTTP     '} PATH                              ║
║  Decision: FINAL (no further checks will be made)         ║
║  Performance: Optimized for selected path                 ║
╚════════════════════════════════════════════════════════════╝
        `);
        
        logger.info(`🎯 ORCHESTRATOR DECISION: ${useStreaming ? 'STREAMING' : 'HTTP'} PATH SELECTED`, {
          streaming: useStreaming,
          source: 'ChatProviderOrchestrator',
          timestamp: new Date().toISOString()
        });
        
        // Step 3: Select provider and never look back
        setSelectedProvider(() => useStreaming ? StreamingChatProvider : HTTPChatProvider);
        setDecision(useStreaming ? 'streaming' : 'http');
        
        // Step 4: Report to window for debugging
        if (typeof window !== 'undefined') {
          window.__PICASSO_CHAT_MODE__ = useStreaming ? 'STREAMING' : 'HTTP';
          window.__PICASSO_DECISION_TIME__ = new Date().toISOString();
        }
        
      } catch (error) {
        console.error('Failed to initialize chat provider:', error);
        // Default to HTTP on error (safer, simpler)
        setSelectedProvider(() => HTTPChatProvider);
        setDecision('http-fallback');
      }
    }
    
    // Only run when we have config
    if (tenantConfig) {
      selectProvider();
    }
  }, [tenantConfig]); // Only re-run if tenant config changes (shouldn't happen)
  
  // Show loading state while deciding
  if (!SelectedProvider) {
    return (
      <div className="chat-provider-loading">
        Initializing chat system...
      </div>
    );
  }
  
  // Render the selected provider
  return (
    <div data-chat-mode={decision} className="chat-provider-wrapper">
      <SelectedProvider>
        {children}
      </SelectedProvider>
    </div>
  );
}

// Export for testing
export { ChatProviderOrchestrator };