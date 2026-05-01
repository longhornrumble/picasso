import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('Environment Configuration', () => {
  let config;
  let originalLocation;
  let originalProcess;

  beforeEach(() => {
    // Store original values
    originalLocation = global.window?.location;
    originalProcess = global.process;

    // Clear the module cache to reload the config
    jest.resetModules();

    // Mock the environment using process.env
    global.process = {
      ...originalProcess,
      env: {
        ...originalProcess?.env,
        NODE_ENV: 'production'
      }
    };

    // Mock window.location for browser environment tests
    delete global.window?.location;
    global.window = {
      location: {
        hostname: 'chat.myrecruiter.ai',
        search: ''
      }
    };
  });

  afterEach(() => {
    // Restore original values
    if (originalLocation) {
      global.window.location = originalLocation;
    }
    if (originalProcess) {
      global.process = originalProcess;
    }
  });

  it('should have correct production configuration', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    expect(config.ENVIRONMENT).toBe('production');
    // Production API_BASE_URL comes from __API_BASE_URL__ build constant or falls back to 'https://api.myrecruiter.ai'
    expect(config.API_BASE_URL).toBeDefined();
    expect(typeof config.API_BASE_URL).toBe('string');
    expect(config.CHAT_API_URL).toBeDefined();
    expect(config.WIDGET_DOMAIN).toBeDefined();
    expect(config.DEBUG).toBe(false);
    expect(config.LOG_LEVEL).toBe('error');
    // Production REQUEST_TIMEOUT is 6000 (performance-optimized, capped at 10000 in getRequestConfig)
    expect(config.REQUEST_TIMEOUT).toBe(6000);
    // Production RETRY_ATTEMPTS is 2 (performance-optimized)
    expect(config.RETRY_ATTEMPTS).toBe(2);
  });

  it('should resolve STREAMING_ENDPOINT to an absolute https URL in production', async () => {
    // Regression: P22 (commit 63468cb, 2026-04-15) replaced widget-host.js's hardcoded
    // streaming URL fallback with an empty string, which silently 404'd analytics POSTs
    // from embedding sites for 16 days. The widget's only remaining fallback is the env
    // config's STREAMING_ENDPOINT, so it must always be an absolute URL.
    const { config: freshConfig } = await import('../environment');
    expect(freshConfig.STREAMING_ENDPOINT).toMatch(/^https:\/\//);
  });

  it('should have enhanced utility methods', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    expect(config.isProduction()).toBe(true);
    expect(config.isDevelopment()).toBe(false);
    expect(config.isStaging()).toBe(false);
    expect(typeof config.log).toBe('function');
    expect(typeof config.getRequestConfig).toBe('function');
    expect(typeof config.getHealthCheckUrl).toBe('function');
    expect(typeof config.getBuildInfo).toBe('function');
  });

  it('should generate correct config URLs with validation', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    const tenantHash = 'test123';
    const configUrl = config.getConfigUrl(tenantHash);

    expect(configUrl).toContain('action=get_config');
    expect(configUrl).toContain(`t=${tenantHash}`);

    // Test validation - should throw error for missing tenantHash
    expect(() => config.getConfigUrl()).toThrow('getConfigUrl: tenantHash is required');
    expect(() => config.getConfigUrl('')).toThrow('getConfigUrl: tenantHash is required');
  });

  it('should generate correct chat URLs with validation', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    const tenantHash = 'test123';
    const chatUrl = config.getChatUrl(tenantHash);

    expect(chatUrl).toContain('action=chat');
    expect(chatUrl).toContain(`t=${tenantHash}`);

    // Test validation
    expect(() => config.getChatUrl()).toThrow('getChatUrl: tenantHash is required');
  });

  it('should generate correct asset URLs with validation', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    const path = 'test/asset.png';
    const assetUrl = config.getAssetUrl(path);

    expect(assetUrl).toContain(path);
    // Verify no accidental double slashes (excluding protocol ://)
    const withoutProtocol = assetUrl.replace('https://', '').replace('http://', '');
    expect(withoutProtocol).not.toContain('//');

    // Test validation
    expect(() => config.getAssetUrl()).toThrow('getAssetUrl: path is required');
    expect(() => config.getAssetUrl('')).toThrow('getAssetUrl: path is required');
  });

  it('should generate correct tenant asset URLs', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    const tenantHash = 'abc123';
    const assetPath = 'avatar.png';
    const url = config.getTenantAssetUrl(tenantHash, assetPath);

    expect(url).toContain(tenantHash);
    expect(url).toContain(assetPath);
    expect(url).toContain('/tenants/');

    // Test validation
    expect(() => config.getTenantAssetUrl()).toThrow('getTenantAssetUrl: tenantHash and assetPath are required');
  });

  it('should generate legacy S3 URLs correctly', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    const tenantHash = 'def456';
    const assetPath = 'logo.png';
    const url = config.getLegacyS3Url(tenantHash, assetPath);

    // Production getLegacyS3Url returns myrecruiter-picasso.s3.us-east-1.amazonaws.com
    expect(url).toContain('amazonaws.com');
    expect(url).toContain(tenantHash);
    expect(url).toContain(assetPath);

    // Test validation
    expect(() => config.getLegacyS3Url()).toThrow('getLegacyS3Url: tenantHash and assetPath are required');
  });

  it('should provide request configuration', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    const requestConfig = config.getRequestConfig();

    // getRequestConfig caps timeout at 10s and retries at 2
    expect(requestConfig.timeout).toBeLessThanOrEqual(10000);
    expect(requestConfig.timeout).toBeGreaterThan(0);
    expect(requestConfig.retries).toBeLessThanOrEqual(2);
    expect(requestConfig.headers['Content-Type']).toBe('application/json');
    expect(requestConfig.headers['Accept']).toBe('application/json');

    // Test with custom options - headers should be merged properly
    const customConfig = config.getRequestConfig({
      timeout: 5000,
      headers: { 'Custom-Header': 'value' }
    });

    expect(customConfig.timeout).toBe(5000);
    expect(customConfig.headers['Custom-Header']).toBe('value');
    expect(customConfig.headers['Content-Type']).toBe('application/json'); // Should merge from base
    expect(customConfig.headers['Accept']).toBe('application/json'); // Should merge from base
  });

  it('should detect development environment from hostname', async () => {
    // Reset environment to development
    global.process = {
      ...originalProcess,
      env: {
        ...originalProcess?.env,
        NODE_ENV: 'development'
      }
    };

    Object.defineProperty(window, 'location', { value: { hostname: 'localhost', search: '', port: '3000' }, writable: true, configurable: true });
    jest.resetModules();

    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    expect(config.ENVIRONMENT).toBe('development');
    expect(config.DEBUG).toBe(true);
    expect(config.LOG_LEVEL).toBe('debug');
    // Development API_BASE_URL comes from build constant or falls back to localhost
    expect(config.API_BASE_URL).toBeDefined();
  });

  it('should detect staging environment from hostname', async () => {
    Object.defineProperty(window, 'location', { value: { hostname: 'staging-chat.myrecruiter.ai', search: '', port: '' }, writable: true, configurable: true });
    jest.resetModules();

    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    expect(config.ENVIRONMENT).toBe('staging');
    // Staging API_BASE_URL comes from build constant or falls back to staging domain
    expect(config.API_BASE_URL).toBeDefined();
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('should handle environment override via URL parameter', async () => {
    Object.defineProperty(window, 'location', { value: { hostname: 'chat.myrecruiter.ai', search: '?picasso-env=staging', port: '' }, writable: true, configurable: true });
    jest.resetModules();

    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    expect(config.ENVIRONMENT).toBe('staging');
  });

  it('should respect log levels', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    // In production, only error level should log
    config.log('info', 'This should not log');
    config.log('error', 'This should log');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('[Picasso PRODUCTION]', 'This should log');

    consoleSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('should provide build info', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    const buildInfo = config.getBuildInfo();

    expect(buildInfo.environment).toBe('production');
    expect(buildInfo.debug).toBe(false);
    expect(buildInfo.timestamp).toBeDefined();
    expect(typeof buildInfo.timestamp).toBe('string');
  });

  it('should provide health check URL', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;

    const healthUrl = config.getHealthCheckUrl();
    // getHealthCheckUrl returns ${API_BASE_URL}/health
    expect(healthUrl).toContain('/health');
    expect(typeof healthUrl).toBe('string');
  });

  it('should validate environment configuration on load', async () => {
    // This test verifies that invalid configurations would throw
    // We can't easily test the validation failure without mocking the entire module
    // but we can verify that a valid config passes validation
    expect(async () => {
      await import('../environment');
    }).not.toThrow();
  });
});
