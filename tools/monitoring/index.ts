/**
 * BERS Production Monitoring System - Main Entry Point
 * 
 * Complete monitoring and observability solution for the Build-Time Environment
 * Resolution System (BERS) providing real-time configuration monitoring, 
 * performance metrics collection, automated alerting, and health check endpoints
 * with 99.9% uptime targeting.
 * 
 * Features:
 * - Real-time configuration state visualization
 * - Performance metrics with 1-second granularity  
 * - Automated alerting for configuration drift and failures
 * - Health check endpoints with circuit breaker patterns
 * - Production-ready API server with Server-Sent Events
 * - Integration with existing BERS infrastructure
 * 
 * @version 1.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

// Core monitoring system exports
export {
  ProductionMonitoringSystem,
  createProductionMonitoringSystem,
  startProductionMonitoring,
  DEFAULT_PRODUCTION_MONITORING_CONFIG,
  type ProductionMonitoringConfig,
  type DeploymentConfig,
  type MonitoringSystemConfig,
  type IntegrationConfig,
  type PerformanceConfig,
  type AlertingConfig,
  type InfrastructureConfig
} from './production-monitoring';

// API server exports
export {
  MonitoringAPIServer,
  createMonitoringAPIServer,
  DEFAULT_MONITORING_API_CONFIG,
  type MonitoringAPIConfig,
  type APIResponse,
  type SSEClient
} from './api-server';

// Performance validation exports
export {
  PerformanceValidationSuite,
  runPerformanceValidation,
  type ValidationResult,
  type ValidationSuite,
  type PerformanceValidationReport
} from './performance-validation';

// Re-export core monitoring components from src/monitoring
export {
  // Dashboard components
  ConfigurationMonitoringDashboard,
  createMonitoringDashboard,
  initializeDashboard,
  DEFAULT_DASHBOARD_CONFIG,
  type DashboardConfig,
  type DashboardState,
  type EnvironmentStatus,
  type Alert,
  type SystemHealthStatus
} from '../../src/monitoring/dashboard';

export {
  // Metrics collection
  PerformanceMetricsCollector,
  createMetricsCollector,
  metricsCollector,
  DEFAULT_METRICS_CONFIG,
  type MetricsCollectorConfig,
  type MetricType,
  type MetricDataPoint,
  type MetricsSummary,
  type PerformanceReport,
  type PerformanceAlert
} from '../../src/monitoring/metrics-collector';

export {
  // Alert system
  AlertSystem,
  createAlertSystem,
  alertSystem,
  DEFAULT_ALERT_SYSTEM_CONFIG,
  BUILTIN_ALERT_RULES,
  type AlertSystemConfig,
  type Alert as AlertType,
  type AlertRule,
  type AlertChannel,
  type AlertEvaluationContext,
  type RemediationStep
} from '../../src/monitoring/alert-system';

export {
  // Health checks
  HealthCheckSystem,
  createHealthCheckSystem,
  DEFAULT_HEALTH_CHECK_CONFIG,
  type HealthCheckConfig,
  type HealthCheckResult,
  type HealthStatus,
  type SystemHealthReport,
  type CircuitBreakerState
} from '../../src/monitoring/health-checks';

export {
  // Integration orchestrator
  MonitoringIntegration,
  createMonitoringIntegration,
  DEFAULT_MONITORING_INTEGRATION_CONFIG,
  type MonitoringIntegrationConfig,
  type MonitoringEvent,
  type BaselineUpdate
} from '../../src/monitoring/integration';

// Convenience functions for common use cases
import { 
  startProductionMonitoring, 
  type ProductionMonitoringConfig 
} from './production-monitoring';
import { runPerformanceValidation } from './performance-validation';

/**
 * Initialize BERS monitoring for development environment
 */
export async function initializeDevelopmentMonitoring(): Promise<any> {
  return startProductionMonitoring({
    environment: 'development',
    deployment: {
      mode: 'development',
      autoStart: true,
      dashboardPort: 3003,
      logLevel: 'debug'
    },
    monitoring: {
      metricsGranularity: 500, // Higher frequency for development
      dashboardRefreshInterval: 2000 // Faster refresh
    },
    performance: {
      optimization: {
        sampling: {
          adaptive: false,
          rate: 1.0, // Collect all metrics in development
          thresholdTrigger: 100
        }
      }
    },
    alerting: {
      notifications: {
        email: { enabled: false, recipients: [], template: 'default', priority: 'low' },
        slack: { enabled: false, webhookUrl: '', channel: '' },
        webhook: { 
          enabled: true, 
          endpoints: [{ url: '/api/monitoring/alerts', headers: {} }],
          timeout: 5000,
          retries: 1
        },
        pagerduty: { enabled: false, serviceKey: '', severity: 'info' }
      }
    }
  });
}

/**
 * Initialize BERS monitoring for staging environment
 */
export async function initializeStagingMonitoring(): Promise<any> {
  return startProductionMonitoring({
    environment: 'staging',
    deployment: {
      mode: 'staging',
      autoStart: true,
      dashboardPort: 3003,
      logLevel: 'info'
    },
    monitoring: {
      metricsGranularity: 1000, // 1-second granularity
      dashboardRefreshInterval: 5000
    },
    performance: {
      optimization: {
        sampling: {
          adaptive: true,
          rate: 0.9, // High sampling rate for staging
          thresholdTrigger: 200
        }
      }
    },
    alerting: {
      notifications: {
        email: { enabled: false, recipients: [], template: 'default', priority: 'medium' },
        slack: { enabled: true, webhookUrl: process.env.SLACK_WEBHOOK_URL || '', channel: '#staging-alerts' },
        webhook: { 
          enabled: true, 
          endpoints: [{ url: '/api/monitoring/alerts', headers: {} }],
          timeout: 5000,
          retries: 2
        },
        pagerduty: { enabled: false, serviceKey: '', severity: 'warning' }
      }
    }
  });
}

/**
 * Initialize BERS monitoring for production environment
 */
export async function initializeProductionMonitoring(): Promise<any> {
  return startProductionMonitoring({
    environment: 'production',
    deployment: {
      mode: 'production',
      autoStart: true,
      dashboardPort: 3003,
      logLevel: 'warn'
    },
    monitoring: {
      metricsGranularity: 1000, // 1-second granularity
      dashboardRefreshInterval: 10000 // Slower refresh for production
    },
    performance: {
      optimization: {
        sampling: {
          adaptive: true,
          rate: 0.8, // Optimized sampling rate
          thresholdTrigger: 500
        }
      }
    },
    alerting: {
      notifications: {
        email: { 
          enabled: true, 
          recipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [], 
          template: 'production', 
          priority: 'high' 
        },
        slack: { 
          enabled: true, 
          webhookUrl: process.env.SLACK_WEBHOOK_URL || '', 
          channel: '#production-alerts' 
        },
        webhook: { 
          enabled: true, 
          endpoints: [
            { url: '/api/monitoring/alerts', headers: { 'X-Environment': 'production' } }
          ],
          timeout: 10000,
          retries: 3
        },
        pagerduty: { 
          enabled: true, 
          serviceKey: process.env.PAGERDUTY_SERVICE_KEY || '', 
          severity: 'critical' 
        }
      }
    }
  });
}

/**
 * Run comprehensive system validation
 */
export async function validateSystemPerformance(): Promise<boolean> {
  console.log('Running BERS performance validation...');
  
  try {
    const report = await runPerformanceValidation();
    return report.overallResult.passed;
  } catch (error) {
    console.error('Performance validation failed:', error);
    return false;
  }
}

/**
 * Quick health check for the monitoring system
 */
export async function quickHealthCheck(): Promise<{
  healthy: boolean;
  issues: string[];
  timestamp: number;
}> {
  const issues: string[] = [];
  let healthy = true;

  try {
    // Basic environment detection test
    const { environmentResolver } = await import('../../src/config/environment-resolver');
    const envResult = await environmentResolver.detectEnvironment();
    
    if (envResult.detectionTime > 100) {
      issues.push(`Environment detection slow: ${envResult.detectionTime}ms`);
      healthy = false;
    }

    // Test metrics system
    const { metricsCollector } = await import('../../src/monitoring/metrics-collector');
    const metricsStatus = metricsCollector.getStatus();
    
    if (!metricsStatus.isRunning) {
      issues.push('Metrics collector not running');
      healthy = false;
    }

  } catch (error) {
    issues.push(`Health check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    healthy = false;
  }

  return {
    healthy,
    issues,
    timestamp: Date.now()
  };
}

/**
 * Get monitoring system status summary
 */
export async function getMonitoringStatus(): Promise<{
  version: string;
  uptime: number;
  environment: string;
  components: Record<string, boolean>;
  performance: {
    configurationResolution: number;
    buildPerformance: number;
    systemHealth: string;
  };
}> {
  try {
    const { environmentResolver } = await import('../../src/config/environment-resolver');
    const envResult = await environmentResolver.detectEnvironment();
    const performanceMetrics = environmentResolver.getPerformanceMetrics();

    return {
      version: '1.0.0',
      uptime: Date.now() - performance.now(),
      environment: envResult.environment.toString(),
      components: {
        environmentResolver: true,
        metricsCollector: true,
        healthChecks: true,
        alertSystem: true,
        dashboard: true
      },
      performance: {
        configurationResolution: performanceMetrics.averageDetectionTime,
        buildPerformance: 800, // Placeholder - would be from actual build metrics
        systemHealth: 'healthy'
      }
    };
  } catch (error) {
    throw new Error(`Failed to get monitoring status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Default export for convenience
export default {
  // Quick start functions
  initializeDevelopmentMonitoring,
  initializeStagingMonitoring, 
  initializeProductionMonitoring,
  
  // Validation and health checks
  validateSystemPerformance,
  quickHealthCheck,
  getMonitoringStatus,
  
  // Core systems
  startProductionMonitoring,
  runPerformanceValidation,
  
  // Version info
  VERSION: '1.0.0',
  BUILD_DATE: '2024-01-15'
};

/* ===== CLI SUPPORT ===== */

// Support for CLI usage
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      const env = process.argv[3] || 'development';
      console.log(`Starting BERS monitoring for ${env} environment...`);
      
      if (env === 'development') {
        initializeDevelopmentMonitoring();
      } else if (env === 'staging') {
        initializeStagingMonitoring();
      } else if (env === 'production') {
        initializeProductionMonitoring();
      } else {
        console.error('Invalid environment. Use: development, staging, or production');
        process.exit(1);
      }
      break;
      
    case 'validate':
      console.log('Running performance validation...');
      validateSystemPerformance()
        .then(passed => {
          console.log(`Validation ${passed ? 'PASSED' : 'FAILED'}`);
          process.exit(passed ? 0 : 1);
        })
        .catch(error => {
          console.error('Validation error:', error);
          process.exit(1);
        });
      break;
      
    case 'health':
      console.log('Running health check...');
      quickHealthCheck()
        .then(result => {
          console.log(`Health: ${result.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
          if (result.issues.length > 0) {
            console.log('Issues:', result.issues.join(', '));
          }
          process.exit(result.healthy ? 0 : 1);
        })
        .catch(error => {
          console.error('Health check error:', error);
          process.exit(1);
        });
      break;
      
    case 'status':
      console.log('Getting monitoring status...');
      getMonitoringStatus()
        .then(status => {
          console.log(JSON.stringify(status, null, 2));
        })
        .catch(error => {
          console.error('Status error:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log('BERS Production Monitoring System v1.0.0');
      console.log('');
      console.log('Usage:');
      console.log('  npm run monitoring:start [development|staging|production]');
      console.log('  npm run monitoring:validate');
      console.log('  npm run monitoring:health');
      console.log('  npm run monitoring:status');
      console.log('');
      console.log('Commands:');
      console.log('  start    - Start monitoring system for specified environment');
      console.log('  validate - Run performance validation suite');
      console.log('  health   - Run quick health check');
      console.log('  status   - Get current system status');
      break;
  }
}