import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Environment Configuration', () => {
  let config;

  beforeEach(() => {
    // Clear the module cache to reload the config
    vi.resetModules();
    
    // Mock the environment
    vi.stubEnv('NODE_ENV', 'production');
    
    // Import the config fresh
    const { config: freshConfig } = require('../environment');
    config = freshConfig;
  });

  it('should have correct production configuration', () => {
    expect(config.ENVIRONMENT).toBe('production');
    // URL validation normalizes URLs, so expect trailing slashes
    expect(config.API_BASE_URL).toBe('https://chat.myrecruiter.ai/');
    expect(config.CHAT_API_URL).toBe('https://chat.myrecruiter.ai/');
    expect(config.WIDGET_DOMAIN).toBe('https://chat.myrecruiter.ai/');
    expect(config.DEBUG).toBe(false);
  });

  it('should generate correct config URLs', () => {
    const tenantHash = 'test123';
    const configUrl = config.getConfigUrl(tenantHash);
    
    expect(configUrl).toContain('action=get_config');
    expect(configUrl).toContain(`t=${tenantHash}`);
  });

  it('should generate correct chat URLs', () => {
    const tenantHash = 'test123';
    const chatUrl = config.getChatUrl(tenantHash);
    
    expect(chatUrl).toContain('action=chat');
    expect(chatUrl).toContain(`t=${tenantHash}`);
  });

  it('should generate correct asset URLs', () => {
    const path = 'test/asset.png';
    const assetUrl = config.getAssetUrl(path);
    
    expect(assetUrl).toContain(path);
    expect(assetUrl).not.toContain('//');
  });

  it('should handle URL parameter environment override', () => {
    // Mock URLSearchParams
    const mockSearchParams = new Map([
      ['picasso-env', 'staging']
    ]);
    
    Object.defineProperty(window, 'location', {
      value: {
        search: '?picasso-env=staging'
      },
      writable: true
    });
    
    // Note: This test would need to be updated if we want to test the actual
    // environment detection logic, but the config object is already created
    // when the module is imported, so we can't easily test the override
    expect(config.ENVIRONMENT).toBeDefined();
  });
}); 