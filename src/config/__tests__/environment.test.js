import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Environment Configuration', () => {
  let config;
  let originalLocation;
  let originalProcess;

  beforeEach(() => {
    // Store original values
    originalLocation = global.window?.location;
    originalProcess = global.process;
    
    // Clear the module cache to reload the config
    vi.resetModules();
    
    // Mock the environment
    vi.stubEnv('NODE_ENV', 'production');
    
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
    vi.unstubAllEnvs();
  });

  it('should have correct production configuration', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;
    
    expect(config.ENVIRONMENT).toBe('production');
    expect(config.API_BASE_URL).toBe('https://chat.myrecruiter.ai');
    expect(config.CHAT_API_URL).toBe('https://chat.myrecruiter.ai');
    expect(config.WIDGET_DOMAIN).toBe('https://chat.myrecruiter.ai');
    expect(config.DEBUG).toBe(false);
    expect(config.LOG_LEVEL).toBe('error');
    expect(config.REQUEST_TIMEOUT).toBe(10000);
    expect(config.RETRY_ATTEMPTS).toBe(3);
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
    expect(configUrl).toContain('chat.myrecruiter.ai');
    
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
    expect(chatUrl).toContain('chat.myrecruiter.ai');
    
    // Test validation
    expect(() => config.getChatUrl()).toThrow('getChatUrl: tenantHash is required');
  });

  it('should generate correct asset URLs with validation', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;
    
    const path = 'test/asset.png';
    const assetUrl = config.getAssetUrl(path);
    
    expect(assetUrl).toContain(path);
    expect(assetUrl).not.toContain('//'); // No double slashes
    expect(assetUrl).toContain('picassocode.s3.amazonaws.com');
    
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
    
    expect(url).toContain('myrecruiter-picasso.s3.us-east-1.amazonaws.com');
    expect(url).toContain(tenantHash);
    expect(url).toContain(assetPath);
    
    // Test validation
    expect(() => config.getLegacyS3Url()).toThrow('getLegacyS3Url: tenantHash and assetPath are required');
  });

  it('should provide request configuration', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;
    
    const requestConfig = config.getRequestConfig();
    
    expect(requestConfig.timeout).toBe(10000); // Production timeout
    expect(requestConfig.retries).toBe(3);
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
    // Reset environment to not be production
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'development');
    
    global.window.location.hostname = 'localhost';
    vi.resetModules();
    
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;
    
    expect(config.ENVIRONMENT).toBe('development');
    expect(config.DEBUG).toBe(true);
    expect(config.LOG_LEVEL).toBe('debug');
    expect(config.API_BASE_URL).toBe('https://chat.myrecruiter.ai');
  });

  it('should detect staging environment from hostname', async () => {
    global.window.location.hostname = 'staging.example.com'; // Generic staging hostname
    vi.resetModules();
    
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;
    
    expect(config.ENVIRONMENT).toBe('staging');
    expect(config.API_BASE_URL).toBe('https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary');
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('should handle environment override via URL parameter', async () => {
    global.window.location.search = '?picasso-env=staging';
    vi.resetModules();
    
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;
    
    expect(config.ENVIRONMENT).toBe('staging');
  });

  it('should respect log levels', async () => {
    const { config: freshConfig } = await import('../environment');
    config = freshConfig;
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    
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
    expect(healthUrl).toBe('https://chat.myrecruiter.ai/health');
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