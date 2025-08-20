/**
 * Minimal Streaming Bridge
 * 
 * Provides a clean integration point for optional streaming implementations.
 * This allows the main chat functionality to remain simple while enabling
 * streaming capabilities to be added via an adapter pattern.
 * 
 * The bridge pattern keeps the core ChatProvider clean and focused on HTTP
 * while allowing future streaming implementations to be plugged in without
 * modifying core code.
 */

import { useState, useCallback } from 'react';

export const useStreamingBridge = () => {
  const [streamingAdapter, setStreamingAdapter] = useState(null);
  
  // Allow external streaming implementation to register
  const registerStreamingAdapter = useCallback((adapter) => {
    // Validate the adapter has required methods
    if (adapter && 
        typeof adapter.startStream === 'function' &&
        typeof adapter.stopStream === 'function' &&
        typeof adapter.isStreaming === 'function') {
      setStreamingAdapter(adapter);
      console.log('✅ Streaming adapter registered successfully');
    } else if (adapter) {
      console.warn('⚠️ Invalid streaming adapter - missing required methods');
    }
  }, []);
  
  // Unregister adapter (for cleanup)
  const unregisterStreamingAdapter = useCallback(() => {
    if (streamingAdapter && typeof streamingAdapter.cleanup === 'function') {
      streamingAdapter.cleanup();
    }
    setStreamingAdapter(null);
  }, [streamingAdapter]);
  
  return {
    streamingAdapter,
    registerStreamingAdapter,
    unregisterStreamingAdapter,
    hasStreamingCapability: !!streamingAdapter
  };
};

/**
 * Streaming Adapter Interface
 * 
 * Any streaming implementation must implement this interface:
 * 
 * interface StreamingAdapter {
 *   // Start streaming with the given configuration
 *   startStream(config: {
 *     endpoint: string;
 *     message: string;
 *     tenantHash: string;
 *     sessionId: string;
 *     onChunk: (chunk: string) => void;
 *     onComplete: () => void;
 *     onError: (error: Error) => void;
 *   }): Promise<void>;
 *   
 *   // Stop any active stream
 *   stopStream(): void;
 *   
 *   // Check if currently streaming
 *   isStreaming(): boolean;
 *   
 *   // Optional cleanup method
 *   cleanup?(): void;
 * }
 */