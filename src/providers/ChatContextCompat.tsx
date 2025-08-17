/**
 * ChatProvider Compatibility Module
 * 
 * Provides backward compatibility exports that were removed during orchestration simplification.
 * This small module maintains API compatibility while keeping the main ChatProvider lean.
 */

import { createContext } from 'react';
import type { UnifiedChatInterface } from './ChatProvider';

// Shared context instance that matches the one in ChatProvider.tsx
export const UnifiedChatContext = createContext<UnifiedChatInterface | null>(null);

/**
 * Export function for backward compatibility with existing imports
 */
export const getChatContext = () => {
  return UnifiedChatContext;
};

// Development utilities for backward compatibility
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // Test API functions
  window.testChatAPI = async (message: string, tenantHash?: string) => {
    console.log('🧪 Testing Chat API with message:', message);
    return { success: true, message: 'Test functionality moved to distributed providers' };
  };

  // Quick test commands
  window.testVolunteer = () => window.testChatAPI("I want to volunteer");
  window.testDonate = () => window.testChatAPI("How can I donate?");
  window.testContact = () => window.testChatAPI("How do I contact you?");
  window.testServices = () => window.testChatAPI("What services do you offer?");

  // Memory leak detection
  window.startMemoryLeakDetection = () => {
    console.log('🔍 Memory leak detection has been moved to ChatMonitoringProvider');
    console.log('Use the monitoring provider APIs for memory tracking');
  };

  window.debugGetActiveControllers = () => {
    return window.debugChatContext?.memoryStats?.activeControllers || 0;
  };

  window.debugGetActiveTimeouts = () => {
    return window.debugChatContext?.memoryStats?.activeTimeouts || 0;
  };

  console.log('🛠️ Chat API test commands available (distributed architecture)', {
    commands: ['testChatAPI', 'testVolunteer', 'testDonate', 'testContact', 'testServices'],
    note: 'Advanced debugging moved to individual providers'
  });
}