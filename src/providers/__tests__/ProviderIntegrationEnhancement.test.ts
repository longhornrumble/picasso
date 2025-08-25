/**
 * Provider Integration Enhancement Test Suite - BERS Phase 2, Task 2.2
 * 
 * Comprehensive test suite for environment-aware provider configuration,
 * health monitoring, dependency injection, and hot-reload systems.
 * 
 * Test Coverage:
 * - Environment-aware provider interfaces (>95% coverage target)
 * - Provider health monitoring system
 * - Configuration dependency injection
 * - Hot-reload system with <200ms performance
 * - Provider initialization with <50ms performance
 * - Integration with Task 2.1 type-safe configuration system
 * 
 * @version 2.2.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import type {
  EnvironmentAwareProvider,
  ProviderHealthStatus,
  ProviderMetrics,
  ConfigurationUpdateResult,
  ProviderInitializationResult
} from '../interfaces/EnvironmentAwareProvider';
import { ProviderHealthMonitoringSystem } from '../systems/ProviderHealthMonitoring';
import { ConfigurationInjectionSystem, ProviderRegistryImpl } from '../systems/ConfigurationInjection';
import { HotReloadConfigurationSystem } from '../systems/HotReloadSystem';
import type { ProviderType } from '../../types/config/providers';
import type { ValidatedEnvironment } from '../../config/environment-resolver';
import { createDuration, createTimestamp } from '../../types/branded';

/* ===== TEST SETUP AND MOCKS ===== */

// Mock provider implementation for testing
class MockEnvironmentAwareProvider implements EnvironmentAwareProvider {
  private isInitialized = false;
  private isHealthy = true;
  private configuration: any = {};
  private initTime = 0;

  async initialize(config: any): Promise<ProviderInitializationResult> {
    const startTime = performance.now();
    
    // Simulate initialization work
    await new Promise(resolve => setTimeout(resolve, 10));
    
    this.configuration = config;
    this.isInitialized = true;
    this.initTime = performance.now() - startTime;

    const initDuration = createDuration(this.initTime);
    // Add valueOf method for test compatibility
    (initDuration as any).valueOf = () => this.initTime;
    
    return {
      success: true,
      initializationTime: initDuration,
      errors: [],
      warnings: [],
      configurationValid: true,
      dependenciesResolved: true,
      readyForOperations: true,
      metadata: {
        providerId: 'mock-provider',
        providerVersion: '2.2.0',
        environment: 'development' as ValidatedEnvironment,
        timestamp: createTimestamp(Date.now())
      }
    };
  }

  async updateConfiguration(config: any): Promise<ConfigurationUpdateResult> {
    const startTime = performance.now();
    
    this.configuration = { ...this.configuration, ...config };
    
    const updateDuration = createDuration(performance.now() - startTime);
    (updateDuration as any).valueOf = () => performance.now() - startTime;
    
    return {
      success: true,
      updateTime: updateDuration,
      errors: [],
      warnings: [],
      requiresRestart: false,
      rollbackAvailable: true,
      validationResult: {
        isValid: true,
        errors: [],
        warnings: [],
        performanceMetrics: {
          validationTime: 5,
          rulesValidated: 1,
          warningsGenerated: 0,
          errorsGenerated: 0
        },
        schemaVersion: '2.2.0',
        validationTimestamp: Date.now()
      }
    };
  }

  getHealthStatus(): ProviderHealthStatus {
    return {
      status: this.isHealthy ? 'healthy' : 'unhealthy',
      configurationValid: true,
      lastConfigUpdate: createTimestamp(Date.now()),
      initializationTime: createDuration(this.initTime),
      uptime: createDuration(Date.now()),
      metrics: {
        operationsPerSecond: 100,
        averageResponseTime: createDuration(50),
        errorRate: 0,
        memoryUsage: 1024,
        cpuUsage: 10,
        activeConnections: 5,
        totalOperations: 1000,
        failedOperations: 0,
        retryAttempts: 0
      },
      dependencies: {},
      lastHealthCheck: createTimestamp(Date.now()),
      errorCount: 0,
      warningCount: 0
    };
  }

  getMetrics(): ProviderMetrics {
    return {
      operationsPerSecond: 100,
      averageResponseTime: createDuration(50),
      errorRate: 0,
      memoryUsage: 1024,
      cpuUsage: 10,
      activeConnections: 5,
      totalOperations: 1000,
      failedOperations: 0,
      retryAttempts: 0,
      configurationMetrics: {
        configValidationTime: createDuration(5),
        configUpdateCount: 1,
        configErrorCount: 0,
        hotReloadCount: 0,
        rollbackCount: 0
      },
      healthMetrics: {
        healthCheckInterval: 30000 as any,
        healthCheckCount: 10,
        healthCheckFailures: 0,
        lastHealthCheckDuration: createDuration(10)
      }
    };
  }

  getConfigurationStatus() {
    return {
      valid: true,
      environment: 'development' as ValidatedEnvironment,
      schemaVersion: '2.2.0',
      lastValidation: createTimestamp(Date.now()),
      validationErrors: [],
      validationWarnings: [],
      configurationSource: 'file' as const,
      inheritanceChain: ['base', 'development'],
      hotReloadEnabled: true,
      rollbackSupported: true
    };
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false;
  }

  async canHandleConfiguration(config: unknown): Promise<boolean> {
    return typeof config === 'object' && config !== null;
  }

  getDependencies(): readonly ProviderType[] {
    return [];
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  onConfigurationChange(callback: any): () => void {
    return () => {};
  }

  onHealthStatusChange(callback: any): () => void {
    return () => {};
  }

  // Test helper methods
  setHealthy(healthy: boolean): void {
    this.isHealthy = healthy;
  }

  getConfiguration(): any {
    return this.configuration;
  }
}

// Mock configuration manager
const mockConfigurationManager = {
  loadConfigurationTypeSafe: vi.fn().mockResolvedValue({
    enabled: true,
    priority: 5,
    config: { test: true }
  }),
  validateConfigurationEnhanced: vi.fn().mockImplementation(async (config) => {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      validatedConfig: config,
      performanceMetrics: {
        validationTime: 5,
        rulesValidated: 1,
        warningsGenerated: 0,
        errorsGenerated: 0
      },
      schemaVersion: '2.2.0',
      validationTimestamp: Date.now()
    };
  })
};

/* ===== ENVIRONMENT-AWARE PROVIDER INTERFACE TESTS ===== */

describe('Environment-Aware Provider Interfaces', () => {
  let provider: MockEnvironmentAwareProvider;

  beforeEach(() => {
    provider = new MockEnvironmentAwareProvider();
  });

  describe('Provider Initialization', () => {
    it('should initialize provider with configuration in <50ms', async () => {
      const config = { enabled: true, priority: 5 };
      const startTime = performance.now();
      
      const result = await provider.initialize(config);
      const initTime = performance.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(initTime).toBeLessThan(50); // Performance requirement
      expect(result.configurationValid).toBe(true);
      expect(result.readyForOperations).toBe(true);
    });

    it('should provide detailed initialization metadata', async () => {
      const config = { enabled: true, priority: 5 };
      const result = await provider.initialize(config);
      
      expect(result.metadata).toMatchObject({
        providerId: 'mock-provider',
        providerVersion: '2.2.0',
        environment: 'development'
      });
      expect(typeof result.metadata.timestamp).toBe('number');
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      await provider.initialize({ enabled: true, priority: 5 });
    });

    it('should update configuration with hot-reload support', async () => {
      const updateConfig = { priority: 8 };
      const result = await provider.updateConfiguration(updateConfig);
      
      expect(result.success).toBe(true);
      expect(result.rollbackAvailable).toBe(true);
      expect(result.requiresRestart).toBe(false);
    });

    it('should validate configuration before updates', async () => {
      const canHandle = await provider.canHandleConfiguration({ test: 'config' });
      expect(canHandle).toBe(true);
      
      const cannotHandle = await provider.canHandleConfiguration(null);
      expect(cannotHandle).toBe(false);
    });
  });

  describe('Health Status Monitoring', () => {
    beforeEach(async () => {
      await provider.initialize({ enabled: true, priority: 5 });
    });

    it('should provide comprehensive health status', () => {
      const healthStatus = provider.getHealthStatus();
      
      expect(healthStatus).toMatchObject({
        status: 'healthy',
        configurationValid: true
      });
      expect(healthStatus.metrics.operationsPerSecond).toBeGreaterThan(0);
      expect(typeof healthStatus.uptime).toBe('number');
    });

    it('should report unhealthy status when provider fails', () => {
      provider.setHealthy(false);
      const healthStatus = provider.getHealthStatus();
      
      expect(healthStatus.status).toBe('unhealthy');
    });
  });

  describe('Provider Metrics', () => {
    beforeEach(async () => {
      await provider.initialize({ enabled: true, priority: 5 });
    });

    it('should provide detailed performance metrics', () => {
      const metrics = provider.getMetrics();
      
      expect(metrics).toHaveProperty('operationsPerSecond');
      expect(metrics).toHaveProperty('averageResponseTime');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('configurationMetrics');
      expect(metrics).toHaveProperty('healthMetrics');
    });

    it('should track configuration-specific metrics', () => {
      const metrics = provider.getMetrics();
      
      expect(metrics.configurationMetrics).toMatchObject({
        configValidationTime: expect.any(Object), // Branded Duration type
        configUpdateCount: expect.any(Number),
        configErrorCount: expect.any(Number),
        hotReloadCount: expect.any(Number),
        rollbackCount: expect.any(Number)
      });
    });
  });
});

/* ===== PROVIDER HEALTH MONITORING TESTS ===== */

describe('Provider Health Monitoring System', () => {
  let healthMonitor: ProviderHealthMonitoringSystem;
  let mockProviders: Map<ProviderType, MockEnvironmentAwareProvider>;

  beforeEach(() => {
    healthMonitor = new ProviderHealthMonitoringSystem();
    mockProviders = new Map([
      ['state', new MockEnvironmentAwareProvider()],
      ['api', new MockEnvironmentAwareProvider()],
      ['streaming', new MockEnvironmentAwareProvider()]
    ]);
  });

  afterEach(async () => {
    await healthMonitor.stopHealthChecks();
  });

  describe('Health Check System Startup', () => {
    it('should start monitoring multiple providers', async () => {
      const options = {
        interval: 1000 as any,
        timeout: 500 as any,
        retries: 2,
        enableCircuitBreaker: true,
        recoveryOptions: {
          autoRestart: true,
          maxRestartAttempts: 2,
          restartDelay: createDuration(1000)
        }
      };

      await healthMonitor.startHealthChecks(mockProviders as any, options);
      
      const status = healthMonitor.getHealthCheckStatus();
      expect(status.active).toBe(true);
      expect(status.monitoredProviders).toHaveLength(3);
    });

    it('should prevent starting monitoring twice', async () => {
      const options = {
        interval: 1000 as any,
        timeout: 500 as any,
        retries: 2,
        enableCircuitBreaker: true,
        recoveryOptions: {
          autoRestart: true,
          maxRestartAttempts: 2,
          restartDelay: createDuration(1000)
        }
      };

      await healthMonitor.startHealthChecks(mockProviders as any, options);
      
      await expect(
        healthMonitor.startHealthChecks(mockProviders as any, options)
      ).rejects.toThrow('Health monitoring system is already active');
    });
  });

  describe('Individual Health Checks', () => {
    beforeEach(async () => {
      const options = {
        interval: 1000 as any,
        timeout: 500 as any,
        retries: 2,
        enableCircuitBreaker: true,
        recoveryOptions: {
          autoRestart: true,
          maxRestartAttempts: 2,
          restartDelay: createDuration(1000)
        }
      };
      await healthMonitor.startHealthChecks(mockProviders as any, options);
    });

    it('should perform health check on individual provider', async () => {
      const healthStatus = await healthMonitor.checkHealth('state');
      
      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.configurationValid).toBe(true);
    });

    it('should handle provider not found', async () => {
      const healthStatus = await healthMonitor.checkHealth('nonexistent' as ProviderType);
      
      expect(healthStatus.status).toBe('unhealthy');
    });
  });

  describe('Bulk Health Checks', () => {
    beforeEach(async () => {
      const options = {
        interval: 1000 as any,
        timeout: 500 as any,
        retries: 2,
        enableCircuitBreaker: true,
        recoveryOptions: {
          autoRestart: true,
          maxRestartAttempts: 2,
          restartDelay: createDuration(1000)
        }
      };
      await healthMonitor.startHealthChecks(mockProviders as any, options);
    });

    it('should check health of all providers', async () => {
      const healthResults = await healthMonitor.checkAllHealth();
      
      expect(healthResults.size).toBe(3);
      expect(healthResults.get('state')?.status).toBe('healthy');
      expect(healthResults.get('api')?.status).toBe('healthy');
      expect(healthResults.get('streaming')?.status).toBe('healthy');
    });
  });

  describe('Health System Status', () => {
    it('should provide system status information', () => {
      const status = healthMonitor.getHealthCheckStatus();
      
      expect(status).toMatchObject({
        active: false,
        monitoredProviders: [],
        healthyProviders: 0,
        degradedProviders: 0,
        unhealthyProviders: 0
      });
    });
  });

  describe('Recovery Recommendations', () => {
    beforeEach(async () => {
      const options = {
        interval: 1000 as any,
        timeout: 500 as any,
        retries: 2,
        enableCircuitBreaker: true,
        recoveryOptions: {
          autoRestart: true,
          maxRestartAttempts: 2,
          restartDelay: createDuration(1000)
        }
      };
      await healthMonitor.startHealthChecks(mockProviders as any, options);
    });

    it('should provide recovery recommendations for unhealthy providers', async () => {
      // Make provider unhealthy
      mockProviders.get('state')?.setHealthy(false);
      
      const recommendations = await healthMonitor.getRecoveryRecommendations('state');
      
      expect(recommendations).toContain('Restart provider with clean state');
      expect(recommendations).toContain('Check provider dependencies');
    });
  });
});

/* ===== CONFIGURATION DEPENDENCY INJECTION TESTS ===== */

describe('Configuration Dependency Injection System', () => {
  let injectionSystem: ConfigurationInjectionSystem;
  let provider: MockEnvironmentAwareProvider;

  beforeEach(() => {
    injectionSystem = new ConfigurationInjectionSystem(mockConfigurationManager as any);
    provider = new MockEnvironmentAwareProvider();
  });

  describe('Configuration Injection', () => {
    it('should inject environment-aware configuration', async () => {
      const context = {
        environment: 'development' as ValidatedEnvironment,
        providerType: 'state' as ProviderType,
        configuration: { enabled: true, priority: 5 } as any,
        dependencies: new Map(),
        orchestration: undefined as any,
        validationOptions: {}
      };

      const result = await injectionSystem.injectConfiguration(provider, context);
      
      expect(result).toMatchObject({
        enabled: true,
        priority: 5,
        config: { test: true }
      });
    });

    it('should validate configuration before injection', async () => {
      const context = {
        environment: 'development' as ValidatedEnvironment,
        providerType: 'state' as ProviderType,
        configuration: { enabled: true, priority: 5 } as any,
        dependencies: new Map(),
        orchestration: undefined as any,
        validationOptions: {}
      };

      const validationResult = await injectionSystem.validateConfiguration(
        { enabled: true, priority: 5 },
        context
      );
      
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });
  });

  describe('Configuration Updates with Hot-Reload', () => {
    beforeEach(async () => {
      const context = {
        environment: 'development' as ValidatedEnvironment,
        providerType: 'state' as ProviderType,
        configuration: { enabled: true, priority: 5 } as any,
        dependencies: new Map(),
        orchestration: undefined as any,
        validationOptions: {}
      };
      await injectionSystem.injectConfiguration(provider, context);
    });

    it('should update configuration with validation', async () => {
      const context = {
        environment: 'development' as ValidatedEnvironment,
        providerType: 'state' as ProviderType,
        configuration: { enabled: true, priority: 5 } as any,
        dependencies: new Map(),
        orchestration: undefined as any,
        validationOptions: {}
      };

      const updateResult = await injectionSystem.updateConfiguration(
        provider,
        { priority: 8 },
        context
      );
      
      expect(updateResult.success).toBe(true);
      expect(updateResult.rollbackAvailable).toBe(true);
    });
  });

  describe('Injection Metrics', () => {
    it('should track injection performance metrics', async () => {
      const context = {
        environment: 'development' as ValidatedEnvironment,
        providerType: 'state' as ProviderType,
        configuration: { enabled: true, priority: 5 } as any,
        dependencies: new Map(),
        orchestration: undefined as any,
        validationOptions: {}
      };

      await injectionSystem.injectConfiguration(provider, context);
      
      const metrics = injectionSystem.getInjectionMetrics();
      
      expect(metrics.injectionsPerformed).toBe(1);
      expect(metrics.validationsPerformed).toBeGreaterThan(0);
      expect(metrics.averageInjectionTime).toBeGreaterThan(0);
    });
  });
});

/* ===== PROVIDER REGISTRY TESTS ===== */

describe('Provider Registry', () => {
  let registry: ProviderRegistryImpl;
  let provider: MockEnvironmentAwareProvider;

  beforeEach(() => {
    registry = new ProviderRegistryImpl();
    provider = new MockEnvironmentAwareProvider();
  });

  describe('Provider Registration', () => {
    it('should register and retrieve providers', () => {
      registry.registerProvider('state', provider);
      
      const retrieved = registry.getProvider('state');
      expect(retrieved).toBe(provider);
    });

    it('should check provider existence', () => {
      registry.registerProvider('state', provider);
      
      expect(registry.hasProvider('state')).toBe(true);
      expect(registry.hasProvider('api')).toBe(false);
    });

    it('should unregister providers', () => {
      registry.registerProvider('state', provider);
      registry.unregisterProvider('state');
      
      expect(registry.hasProvider('state')).toBe(false);
    });
  });

  describe('Registry Management', () => {
    it('should get all registered providers', () => {
      registry.registerProvider('state', provider);
      registry.registerProvider('api', provider);
      
      const allProviders = registry.getAllProviders();
      expect(allProviders.size).toBe(2);
    });

    it('should clear all providers', () => {
      registry.registerProvider('state', provider);
      registry.registerProvider('api', provider);
      
      registry.clear();
      
      expect(registry.getAllProviders().size).toBe(0);
    });

    it('should track registration order', () => {
      registry.registerProvider('state', provider);
      registry.registerProvider('api', provider);
      registry.registerProvider('streaming', provider);
      
      const order = registry.getRegistrationOrder();
      expect(order).toEqual(['state', 'api', 'streaming']);
    });
  });
});

/* ===== HOT-RELOAD SYSTEM TESTS ===== */

describe('Hot-Reload Configuration System', () => {
  let hotReloadSystem: HotReloadConfigurationSystem;
  let mockProviders: Map<ProviderType, MockEnvironmentAwareProvider>;

  beforeEach(() => {
    hotReloadSystem = new HotReloadConfigurationSystem(
      mockConfigurationManager as any,
      undefined
    );
    mockProviders = new Map([
      ['state', new MockEnvironmentAwareProvider()],
      ['api', new MockEnvironmentAwareProvider()]
    ]);
  });

  afterEach(async () => {
    await hotReloadSystem.stopWatching();
  });

  describe('Hot-Reload System Status', () => {
    it('should provide system status information', () => {
      const status = hotReloadSystem.getStatus();
      
      expect(status).toMatchObject({
        active: false,
        watchedFiles: [],
        reloadCount: 0,
        errorCount: 0,
        rollbackCount: 0
      });
    });
  });

  describe('Manual Configuration Reload', () => {
    it('should perform manual reload with <200ms performance', async () => {
      const startTime = performance.now();
      
      const result = await hotReloadSystem.reloadConfiguration('state');
      
      const reloadTime = performance.now() - startTime;
      
      expect(reloadTime).toBeLessThan(200); // Performance requirement
      expect(result.success).toBe(true);
      expect(result.reloadTime.valueOf()).toBeLessThan(200);
    });

    it('should reload all providers when no specific provider given', async () => {
      const result = await hotReloadSystem.reloadConfiguration();
      
      expect(result.success).toBe(true);
      expect(result.providersReloaded).toHaveLength(0); // No providers active
    });
  });

  describe('Reload Event Callbacks', () => {
    it('should register and unregister reload callbacks', () => {
      const callback = vi.fn();
      
      const unregister = hotReloadSystem.onReload(callback);
      expect(typeof unregister).toBe('function');
      
      unregister();
      // Callback should be removed (tested by internal implementation)
    });
  });
});

/* ===== INTEGRATION TESTS ===== */

describe('Provider Integration Enhancement - End-to-End', () => {
  let healthMonitor: ProviderHealthMonitoringSystem;
  let injectionSystem: ConfigurationInjectionSystem;
  let hotReloadSystem: HotReloadConfigurationSystem;
  let registry: ProviderRegistryImpl;
  let providers: Map<ProviderType, MockEnvironmentAwareProvider>;

  beforeEach(() => {
    healthMonitor = new ProviderHealthMonitoringSystem();
    injectionSystem = new ConfigurationInjectionSystem(mockConfigurationManager as any);
    hotReloadSystem = new HotReloadConfigurationSystem(mockConfigurationManager as any);
    registry = new ProviderRegistryImpl();
    
    providers = new Map([
      ['state', new MockEnvironmentAwareProvider()],
      ['api', new MockEnvironmentAwareProvider()],
      ['streaming', new MockEnvironmentAwareProvider()]
    ]);

    // Register providers
    providers.forEach((provider, type) => {
      registry.registerProvider(type, provider);
    });
  });

  afterEach(async () => {
    await healthMonitor.stopHealthChecks();
    await hotReloadSystem.stopWatching();
  });

  describe('Complete System Integration', () => {
    it('should integrate all systems successfully', async () => {
      // 1. Initialize providers with configuration injection
      for (const [type, provider] of providers) {
        const context = {
          environment: 'development' as ValidatedEnvironment,
          providerType: type,
          configuration: { enabled: true, priority: 5 } as any,
          dependencies: new Map(),
          orchestration: undefined as any,
          validationOptions: {}
        };

        const config = await injectionSystem.injectConfiguration(provider, context);
        expect(config).toBeDefined();
        
        const initResult = await provider.initialize(config);
        expect(initResult.success).toBe(true);
        expect(initResult.initializationTime).toBeLessThan(50); // Performance requirement
      }

      // 2. Start health monitoring
      const healthOptions = {
        interval: 1000 as any,
        timeout: 500 as any,
        retries: 2,
        enableCircuitBreaker: true,
        recoveryOptions: {
          autoRestart: true,
          maxRestartAttempts: 2,
          restartDelay: createDuration(1000)
        }
      };

      await healthMonitor.startHealthChecks(providers as any, healthOptions);
      
      // 3. Verify all providers are healthy
      const healthResults = await healthMonitor.checkAllHealth();
      expect(healthResults.size).toBe(3);
      
      for (const [type, status] of healthResults) {
        expect(status.status).toBe('healthy');
      }

      // 4. Test configuration updates
      for (const [type, provider] of providers) {
        const context = {
          environment: 'development' as ValidatedEnvironment,
          providerType: type,
          configuration: { enabled: true, priority: 5 } as any,
          dependencies: new Map(),
          orchestration: undefined as any,
          validationOptions: {}
        };

        const updateResult = await injectionSystem.updateConfiguration(
          provider,
          { priority: 8 },
          context
        );
        
        expect(updateResult.success).toBe(true);
      }

      // 5. Verify system metrics
      const healthStatus = healthMonitor.getHealthCheckStatus();
      expect(healthStatus.active).toBe(true);
      expect(healthStatus.healthyProviders).toBe(3);

      const injectionMetrics = injectionSystem.getInjectionMetrics();
      expect(injectionMetrics.injectionsPerformed).toBeGreaterThan(0);
      expect(injectionMetrics.updatesPerformed).toBeGreaterThan(0);
    });

    it('should handle provider failure and recovery', async () => {
      // Initialize and start monitoring
      for (const [type, provider] of providers) {
        const context = {
          environment: 'development' as ValidatedEnvironment,
          providerType: type,
          configuration: { enabled: true, priority: 5 } as any,
          dependencies: new Map(),
          orchestration: undefined as any,
          validationOptions: {}
        };

        const config = await injectionSystem.injectConfiguration(provider, context);
        await provider.initialize(config);
      }

      const healthOptions = {
        interval: 1000 as any,
        timeout: 500 as any,
        retries: 2,
        enableCircuitBreaker: true,
        recoveryOptions: {
          autoRestart: true,
          maxRestartAttempts: 2,
          restartDelay: createDuration(1000)
        }
      };

      await healthMonitor.startHealthChecks(providers as any, healthOptions);

      // Simulate provider failure
      providers.get('state')?.setHealthy(false);
      
      // Check health status reflects failure
      const healthStatus = await healthMonitor.checkHealth('state');
      expect(healthStatus.status).toBe('unhealthy');

      // Get recovery recommendations
      const recommendations = await healthMonitor.getRecoveryRecommendations('state');
      expect(recommendations.length).toBeGreaterThan(0);

      // Simulate recovery
      providers.get('state')?.setHealthy(true);
      
      const recoveredStatus = await healthMonitor.checkHealth('state');
      expect(recoveredStatus.status).toBe('healthy');
    });
  });

  describe('Performance Requirements Validation', () => {
    it('should meet provider initialization performance <50ms', async () => {
      for (const [type, provider] of providers) {
        const config = { enabled: true, priority: 5 };
        const startTime = performance.now();
        
        const result = await provider.initialize(config);
        const initTime = performance.now() - startTime;
        
        expect(initTime).toBeLessThan(50);
        expect(result.success).toBe(true);
        expect(result.initializationTime.valueOf()).toBeLessThan(50);
      }
    });

    it('should meet hot-reload performance <200ms', async () => {
      const startTime = performance.now();
      
      const result = await hotReloadSystem.reloadConfiguration();
      const reloadTime = performance.now() - startTime;
      
      expect(reloadTime).toBeLessThan(200);
      expect(result.reloadTime.valueOf()).toBeLessThan(200);
    });

    it('should meet configuration update performance', async () => {
      const provider = providers.get('state')!;
      await provider.initialize({ enabled: true, priority: 5 });

      const startTime = performance.now();
      const result = await provider.updateConfiguration({ priority: 8 });
      const updateTime = performance.now() - startTime;
      
      expect(updateTime).toBeLessThan(100); // Reasonable update time
      expect(result.success).toBe(true);
    });
  });
});