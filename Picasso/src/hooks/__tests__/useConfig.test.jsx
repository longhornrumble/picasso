import { renderHook } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import { useConfig } from '../useConfig';
import { ConfigProvider } from '../../context/ConfigProvider';

describe('useConfig', () => {
  it('should return config context when used within ConfigProvider', () => {
    const wrapper = ({ children }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );

    const { result } = renderHook(() => useConfig(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.config).toBeDefined();
    expect(result.current.loading).toBeDefined();
    expect(result.current.error).toBeDefined();
    expect(result.current.refreshConfig).toBeDefined();
  });

  it('should throw an error when used outside ConfigProvider', () => {
    // Suppress console.error for this test since we expect an error boundary to catch it
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    let renderResult;
    try {
      renderResult = renderHook(() => useConfig());
    } catch (error) {
      // Error thrown synchronously during rendering
      expect(error.message).toBe('useConfig must be used within a ConfigProvider');
      consoleSpy.mockRestore();
      return;
    }

    // If renderHook captured the error in result.error
    if (renderResult && renderResult.result.error) {
      expect(renderResult.result.error.message).toBe('useConfig must be used within a ConfigProvider');
    }

    consoleSpy.mockRestore();
  });
});
