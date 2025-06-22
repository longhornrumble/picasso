import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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

  it('should return undefined when used outside ConfigProvider', () => {
    const { result } = renderHook(() => useConfig());

    expect(result.current).toBeUndefined();
  });
}); 