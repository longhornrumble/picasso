import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useChat } from '../useChat';
import { ChatProvider } from '../../context/ChatProvider';
import { ConfigProvider } from '../../context/ConfigProvider';

describe('useChat', () => {
  it('should throw error when used outside ChatProvider', () => {
    // Suppress console.error for this test since we expect an error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      renderHook(() => useChat());
    }).toThrow('useChat must be used within a ChatProvider');
    
    consoleSpy.mockRestore();
  });

  it('should return chat context when used within ChatProvider', () => {
    const wrapper = ({ children }) => (
      <ConfigProvider>
        <ChatProvider>{children}</ChatProvider>
      </ConfigProvider>
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.messages).toBeDefined();
    expect(result.current.isTyping).toBeDefined();
    expect(result.current.addMessage).toBeDefined();
    expect(result.current.updateMessage).toBeDefined();
    expect(result.current.clearMessages).toBeDefined();
    expect(result.current.retryMessage).toBeDefined();
  });
}); 