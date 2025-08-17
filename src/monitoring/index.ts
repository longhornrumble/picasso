/**
 * BERS Monitoring and Observability System - Main Entry Point
 * 
 * This is the main entry point for the Build-Time Environment Resolution System (BERS)
 * Monitoring and Observability framework. It provides a unified interface for initializing
 * and managing all monitoring components.
 * 
 * @version 1.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

// Core monitoring components
export { 
  ConfigurationMonitoringDashboard,
  createMonitoringDashboard,
  initializeDashboard,
  type DashboardConfig,
  type DashboardState,
  type EnvironmentStatus,
  type Alert,
  type SystemHealthStatus,
  DEFAULT_DASHBOARD_CONFIG
} from './dashboard';

export {
  PerformanceMetricsCollector,
  createMetricsCollector,
  metricsCollector,
  type MetricsCollectorConfig,
  type MetricType,
  type MetricDataPoint,
  type MetricsSummary,
  type PerformanceReport,
  type PerformanceAlert,
  DEFAULT_METRICS_CONFIG
} from './metrics-collector';

export {
  AlertSystem,
  createAlertSystem,
  alertSystem,
  type AlertSystemConfig,
  type Alert as AlertType,
  type AlertRule,
  type AlertChannel,
  type AlertEvaluationContext,
  type RemediationStep,
  BUILTIN_ALERT_RULES,
  DEFAULT_ALERT_SYSTEM_CONFIG
} from './alert-system';

export {
  HealthCheckSystem,
  createHealthCheckSystem,
  type HealthCheckConfig,
  type HealthCheckResult,
  type HealthStatus,
  type SystemHealthReport,
  type CircuitBreakerState,
  DEFAULT_HEALTH_CHECK_CONFIG
} from './health-checks';

export {
  MonitoringIntegration,
  createMonitoringIntegration,
  type MonitoringIntegrationConfig,
  type MonitoringEvent,
  type BaselineUpdate,
  DEFAULT_MONITORING_INTEGRATION_CONFIG
} from './integration';

// Utility functions and convenience exports
import type { EnvironmentResolver } from '../config/environment-resolver';
import { 
  createMonitoringIntegration,
  DEFAULT_MONITORING_INTEGRATION_CONFIG 
} from './integration';

/**
 * Initialize the complete monitoring system with default configuration
 */
export async function initializeMonitoring(
  environmentResolver: EnvironmentResolver,
  config: Partial<MonitoringIntegrationConfig> = {}
): Promise<MonitoringIntegration> {
  // EMERGENCY DISABLE: Monitoring system causing massive memory leaks
  // Multiple setInterval calls without proper cleanup were consuming 60GB+ RAM
  console.warn('🚨 MONITORING SYSTEM DISABLED - Preventing memory leaks');
  
  const monitoring = createMonitoringIntegration(
    {
      ...DEFAULT_MONITORING_INTEGRATION_CONFIG,
      ...config,
      enabled: false // Force disable
    },
    environmentResolver
  );

  // Don't start - prevents interval creation
  // await monitoring.start();
  return monitoring;
}

/**
 * Quick setup function for development environments
 */
export async function initializeDevMonitoring(
  environmentResolver: EnvironmentResolver
): Promise<MonitoringIntegration> {
  const devConfig = {
    ...DEFAULT_MONITORING_INTEGRATION_CONFIG,
    dashboardConfig: {
      refreshInterval: 2000, // Faster refresh for development
      theme: 'dark'
    },
    metricsConfig: {
      granularity: 500, // Higher frequency for development
      sampling: {
        rate: 1.0, // Collect all metrics in development
        strategy: 'random' as const
      }
    },
    alertConfig: {
      enabled: true,
      channels: [
        {
          id: 'console',
          name: 'Console Logger',
          type: 'console' as const,
          enabled: true,
          config: {},
          filters: []
        }
      ]
    }
  };

  return initializeMonitoring(environmentResolver, devConfig);
}

/**
 * Production setup function with optimized configuration
 */
export async function initializeProductionMonitoring(
  environmentResolver: EnvironmentResolver,
  webhookEndpoint?: string
): Promise<MonitoringIntegration> {
  const prodConfig = {
    ...DEFAULT_MONITORING_INTEGRATION_CONFIG,
    dashboardConfig: {
      refreshInterval: 10000, // Slower refresh for production
      theme: 'light'
    },
    metricsConfig: {
      granularity: 2000, // Less frequent collection
      sampling: {
        rate: 0.8, // Sample 80% of metrics
        strategy: 'adaptive' as const,
        adaptiveThreshold: 1000
      }
    },
    alertConfig: {
      enabled: true,
      channels: [
        {
          id: 'console',
          name: 'Console Logger',
          type: 'console' as const,
          enabled: true,
          config: {},
          filters: []
        },
        ...(webhookEndpoint ? [{
          id: 'webhook',
          name: 'Production Webhook',
          type: 'webhook' as const,
          enabled: true,
          config: {
            endpoint: webhookEndpoint,
            timeout: 10000,
            retryAttempts: 3
          },
          filters: []
        }] : [])
      ]
    },
    integrations: {
      ...DEFAULT_MONITORING_INTEGRATION_CONFIG.integrations,
      buildSystem: {
        ...DEFAULT_MONITORING_INTEGRATION_CONFIG.integrations.buildSystem,
        autoUpdateBaselines: true
      },
      deploymentPipeline: {
        ...DEFAULT_MONITORING_INTEGRATION_CONFIG.integrations.deploymentPipeline,
        rollbackDetection: true
      }
    }
  };

  return initializeMonitoring(environmentResolver, prodConfig);
}

/**
 * Minimal monitoring setup for testing environments
 */
export async function initializeTestingMonitoring(
  environmentResolver: EnvironmentResolver
): Promise<MonitoringIntegration> {
  const testConfig = {
    enabled: true,
    dashboardConfig: {
      refreshInterval: 30000, // Very slow refresh
      displayOptions: {
        showPerformanceCharts: false,
        showConfigurationHistory: false,
        showEnvironmentMap: true,
        theme: 'auto' as const
      }
    },
    metricsConfig: {
      enabled: false, // Disable metrics collection in tests
      granularity: 5000
    },
    alertConfig: {
      enabled: false // Disable alerts in tests
    },
    healthConfig: {
      enabled: true,
      interval: 60000, // Less frequent health checks
      cacheEnabled: false // Disable caching in tests
    },
    integrations: {
      buildSystem: { enabled: false },
      validationFramework: { enabled: false },
      deploymentPipeline: { enabled: false },
      environmentResolver: { enabled: true },
      externalSystems: []
    }
  };

  return initializeMonitoring(environmentResolver, testConfig);
}

/**
 * Health check utility - quick system health verification
 */
export async function checkSystemHealth(
  monitoring: MonitoringIntegration
): Promise<{
  healthy: boolean;
  issues: string[];
  report: any;
}> {
  try {
    const status = monitoring.getIntegrationStatus();
    
    if (!status.isRunning) {
      return {
        healthy: false,
        issues: ['Monitoring system is not running'],
        report: status
      };
    }

    const issues: string[] = [];
    
    // Check components
    Object.entries(status.components).forEach(([name, running]) => {
      if (!running) {
        issues.push(`Component ${name} is not running`);
      }
    });

    // Check integrations
    const criticalIntegrations = ['environmentResolver'];
    Object.entries(status.integrations).forEach(([name, enabled]) => {
      if (criticalIntegrations.includes(name) && !enabled) {
        issues.push(`Critical integration ${name} is disabled`);
      }
    });

    return {
      healthy: issues.length === 0,
      issues,
      report: status
    };
  } catch (error) {
    return {
      healthy: false,
      issues: [`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      report: null
    };
  }
}

/**
 * Monitoring system version and info
 */
export const MONITORING_VERSION = '1.0.0';
export const MONITORING_BUILD_DATE = '2024-01-15';

/**
 * Default exports for common use cases
 */
import { environmentResolver } from '../config/environment-resolver';

// Singleton instances for easy use
let globalMonitoring: MonitoringIntegration | null = null;

/**
 * Get or create global monitoring instance
 */
export async function getGlobalMonitoring(): Promise<MonitoringIntegration> {
  if (!globalMonitoring) {
    globalMonitoring = await initializeMonitoring(environmentResolver);
  }
  return globalMonitoring;
}

/**
 * Stop and cleanup global monitoring instance
 */
export async function destroyGlobalMonitoring(): Promise<void> {
  if (globalMonitoring) {
    await globalMonitoring.destroy();
    globalMonitoring = null;
  }
}

// Re-export types for convenience
export type { MonitoringIntegrationConfig } from './integration';
export type { Environment, ValidatedEnvironment } from '../config/environment-resolver';

// Default export
export default {
  initializeMonitoring,
  initializeDevMonitoring,
  initializeProductionMonitoring,
  initializeTestingMonitoring,
  checkSystemHealth,
  getGlobalMonitoring,
  destroyGlobalMonitoring,
  MONITORING_VERSION,
  MONITORING_BUILD_DATE
};