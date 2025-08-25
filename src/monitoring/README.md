# BERS Monitoring and Observability System

## Overview

The Build-Time Environment Resolution System (BERS) Monitoring and Observability framework provides comprehensive real-time monitoring, alerting, and health tracking for all system components. This document serves as the operational guide for the monitoring system implemented in Task 4.1.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Monitoring Dashboard                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │   Real-time     │ │   Performance   │ │   Configuration │  │
│  │   Status        │ │    Metrics      │ │    History      │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Monitoring Integration                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │   Metrics       │ │   Alert         │ │   Health        │  │
│  │   Collector     │ │   System        │ │   Checks        │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Integration                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │  Environment    │ │   Build System  │ │  Deployment     │  │
│  │   Resolver      │ │   (Task 3.1)    │ │  Pipeline       │  │
│  │                 │ │                 │ │  (Task 3.3)     │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │  Validation     │ │   Provider      │ │   External      │  │
│  │  Framework      │ │   Health        │ │   Services      │  │
│  │  (Task 3.2)     │ │                 │ │                 │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Configuration Monitoring Dashboard (`dashboard.ts`)

**Responsibilities:**
- Real-time visualization of configuration states across environments
- Environment detection status and performance metrics  
- Configuration drift detection and alerting
- Historical configuration change tracking

**Key Features:**
- Server-Sent Events (SSE) for real-time updates
- Interactive charts and visualizations
- Alert management interface
- Responsive design with dark/light theme support

### 2. Performance Metrics Collection (`metrics-collector.ts`)

**Responsibilities:**
- High-frequency metrics collection with 1-second granularity
- Configuration resolution time tracking (<100ms target)
- Provider initialization metrics (10-20ms achieved)
- Build and deployment performance monitoring

**Key Features:**
- Memory-efficient circular buffers
- Configurable retention policies (realtime, short-term, medium-term, long-term)
- Automatic aggregation (1-minute, 5-minute, 1-hour)
- Adaptive sampling strategy

### 3. Alert System (`alert-system.ts`)

**Responsibilities:**
- Configuration load failure alerts
- Performance degradation detection (>20% threshold)
- Environment detection failure monitoring
- Provider health issue alerts

**Key Features:**
- Multi-channel alert delivery (console, webhook, email, Slack)
- Alert deduplication and rate limiting
- Escalation and acknowledgment workflows
- Actionable remediation recommendations

### 4. Health Check System (`health-checks.ts`)

**Responsibilities:**
- Environment health status monitoring
- Configuration validity checks
- Provider health monitoring
- System resource utilization tracking

**Key Features:**
- Lightweight and cacheable health checks
- Circuit breaker pattern for degraded services
- Dependency-aware health evaluation
- Graceful degradation handling

### 5. Infrastructure Integration (`integration.ts`)

**Responsibilities:**
- Integration with existing BERS infrastructure
- Build system performance baseline tracking
- Validation framework result monitoring
- Deployment pipeline status tracking

**Key Features:**
- Event correlation across systems
- Automatic baseline updates
- Cross-system performance tracking
- External system health monitoring

## Quick Start

### Prerequisites

- Node.js 18+ 
- TypeScript 4.9+
- Modern browser with EventSource support
- Access to existing BERS infrastructure

### Installation

```bash
# Install dependencies (already included in main project)
npm install

# Import monitoring components
import { initializeMonitoring } from './src/monitoring/index';
```

### Basic Setup

```typescript
import { 
  createMonitoringIntegration,
  DEFAULT_MONITORING_INTEGRATION_CONFIG 
} from './src/monitoring/integration';
import { environmentResolver } from './src/config/environment-resolver';

// Initialize monitoring system
const monitoring = createMonitoringIntegration(
  DEFAULT_MONITORING_INTEGRATION_CONFIG,
  environmentResolver
);

// Start monitoring
await monitoring.start();
```

### Dashboard Setup

```html
<!-- Add dashboard container to your HTML -->
<div id="monitoring-dashboard"></div>

<!-- Include dashboard styles -->
<link rel="stylesheet" href="./src/monitoring/dashboard.css">
```

```typescript
import { initializeDashboard } from './src/monitoring/dashboard';

// Initialize dashboard
const dashboard = initializeDashboard('monitoring-dashboard');
```

## Configuration

### Environment Variables

```bash
# Monitoring Configuration
BERS_MONITORING_ENABLED=true
BERS_MONITORING_GRANULARITY=1000
BERS_MONITORING_RETENTION_REALTIME=300
BERS_MONITORING_RETENTION_SHORT_TERM=60
BERS_MONITORING_RETENTION_MEDIUM_TERM=288
BERS_MONITORING_RETENTION_LONG_TERM=30

# Alert Configuration
BERS_ALERTS_ENABLED=true
BERS_ALERTS_WEBHOOK_ENDPOINT=https://your-webhook.com/alerts
BERS_ALERTS_DEDUPLICATION_WINDOW=300000
BERS_ALERTS_RATE_LIMIT_MAX=10
BERS_ALERTS_RATE_LIMIT_WINDOW=300000

# Health Check Configuration
BERS_HEALTH_ENABLED=true
BERS_HEALTH_INTERVAL=30000
BERS_HEALTH_TIMEOUT=5000
BERS_HEALTH_CACHE_TTL=10000

# Performance Thresholds
BERS_THRESHOLD_CONFIG_RESOLUTION=100
BERS_THRESHOLD_PROVIDER_INIT=50
BERS_THRESHOLD_BUILD_TIME=30000
BERS_THRESHOLD_DEPLOYMENT_TIME=300000
BERS_THRESHOLD_RESPONSE_TIME=1000
BERS_THRESHOLD_ERROR_RATE=0.01
```

### Configuration Files

#### Monitoring Configuration (`monitoring.config.json`)

```json
{
  "enabled": true,
  "dashboard": {
    "refreshInterval": 5000,
    "historyRetention": 30,
    "theme": "auto"
  },
  "metrics": {
    "granularity": 1000,
    "retention": {
      "realtime": 300,
      "shortTerm": 60,
      "mediumTerm": 288,
      "longTerm": 30
    },
    "sampling": {
      "rate": 1.0,
      "strategy": "adaptive",
      "adaptiveThreshold": 500
    }
  },
  "alerts": {
    "channels": [
      {
        "id": "console",
        "type": "console",
        "enabled": true
      },
      {
        "id": "webhook",
        "type": "webhook",
        "enabled": true,
        "config": {
          "endpoint": "/api/monitoring/alerts",
          "timeout": 5000
        }
      }
    ]
  },
  "health": {
    "interval": 30000,
    "timeout": 5000,
    "cacheEnabled": true,
    "cacheTTL": 10000
  }
}
```

## Operations Guide

### Starting the Monitoring System

```typescript
import { MonitoringIntegration } from './src/monitoring/integration';

const monitoring = new MonitoringIntegration(config, environmentResolver);

// Start all monitoring components
await monitoring.start();

// Verify startup
const status = monitoring.getIntegrationStatus();
console.log('Monitoring status:', status);
```

### Monitoring Health

```typescript
// Check overall system health
const healthReport = await healthCheckSystem.runAllHealthChecks();
console.log('System health:', healthReport.overallStatus);

// Check specific component
const envResolverHealth = await healthCheckSystem.getHealthStatus('environment-resolver');
console.log('Environment Resolver:', envResolverHealth.status);
```

### Viewing Metrics

```typescript
// Get performance summary
const configMetrics = metricsCollector.getMetricsSummary('configuration_resolution_time');
console.log('Config resolution P95:', configMetrics.p95, 'ms');

// Get performance report
const report = metricsCollector.getPerformanceReport('production', '5m');
console.log('Performance report:', report);
```

### Managing Alerts

```typescript
// Get active alerts
const activeAlerts = alertSystem.getActiveAlerts();
console.log('Active alerts:', activeAlerts.length);

// Acknowledge alert
await alertSystem.acknowledgeAlert('alert-id', 'operator-name', 'Investigating issue');

// Resolve alert
await alertSystem.resolveAlert('alert-id', 'manual', 'operator-name', 'Issue resolved');
```

## API Endpoints

The monitoring system exposes REST API endpoints for integration and automation:

### Health Endpoints

```http
GET /api/monitoring/health
GET /api/monitoring/health/{component}
GET /api/monitoring/health/report
```

**Response Example:**
```json
{
  "timestamp": 1638360000000,
  "overallStatus": "healthy",
  "checks": [
    {
      "name": "environment-resolver",
      "status": "healthy",
      "duration": 45,
      "message": "Environment resolver is healthy"
    }
  ]
}
```

### Metrics Endpoints

```http
GET /api/monitoring/metrics
GET /api/monitoring/metrics/{type}
GET /api/monitoring/metrics/{type}/summary
GET /api/monitoring/metrics/report
```

**Response Example:**
```json
{
  "type": "configuration_resolution_time",
  "current": 75,
  "average": 82,
  "p95": 95,
  "trend": "down",
  "healthStatus": "healthy"
}
```

### Alert Endpoints

```http
GET /api/monitoring/alerts
POST /api/monitoring/alerts/{id}/acknowledge
POST /api/monitoring/alerts/{id}/resolve
GET /api/monitoring/alerts/stats
```

**Response Example:**
```json
{
  "id": "alert-123",
  "type": "performance_degradation",
  "severity": "warning",
  "title": "Configuration Resolution Slow",
  "status": "active",
  "timestamp": 1638360000000
}
```

### Dashboard Endpoints

```http
GET /api/monitoring/dashboard/status
GET /api/monitoring/events (Server-Sent Events)
```

## Performance Baselines

### Achieved Performance (from Tasks 3.1-3.3)

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| Build Time | <30s | <1s | ✅ Excellent |
| Configuration Resolution | <100ms | ~75ms | ✅ Good |
| Provider Initialization | <50ms | 10-20ms | ✅ Excellent |
| Deployment Time | <5min | <2min | ✅ Good |
| Test Coverage | >95% | 95.2% | ✅ Good |

### Monitoring Targets

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Configuration Resolution Time | <100ms | >100ms |
| Provider Initialization | <50ms | >50ms |
| Build Performance | <1s | >5s |
| Deployment Performance | <5min | >5min |
| System Response Time | <1s | >1s |
| Error Rate | <1% | >1% |
| Memory Usage | <80% | >80% |
| CPU Usage | <70% | >70% |

## Troubleshooting

### Common Issues

#### 1. Dashboard Not Loading

**Symptoms:**
- Dashboard shows blank page
- Console errors about missing elements

**Resolution:**
```typescript
// Check if container element exists
const container = document.getElementById('monitoring-dashboard');
if (!container) {
  console.error('Dashboard container not found');
}

// Verify dashboard initialization
import { initializeDashboard } from './src/monitoring/dashboard';
const dashboard = initializeDashboard('monitoring-dashboard');
```

#### 2. Metrics Not Collecting

**Symptoms:**
- Metrics show zero values
- Performance charts are empty

**Resolution:**
```typescript
// Check metrics collector status
const status = metricsCollector.getStatus();
console.log('Metrics collector running:', status.isRunning);

// Restart metrics collection
metricsCollector.stop();
metricsCollector.start();

// Manually record test metric
metricsCollector.recordMetric('test_metric', 123, { source: 'troubleshooting' });
```

#### 3. Alerts Not Firing

**Symptoms:**
- No alerts despite performance issues
- Alert system shows as inactive

**Resolution:**
```typescript
// Check alert system status
const alertStatus = alertSystem.getStatus();
console.log('Alert system running:', alertStatus.isRunning);

// Check alert rules
const rules = alertSystem.config.rules;
console.log('Enabled rules:', rules.filter(r => r.enabled).length);

// Test alert evaluation
const testContext = buildTestAlertContext();
await alertSystem.evaluateRules(testContext);
```

#### 4. Health Checks Failing

**Symptoms:**
- Health status shows as "unhealthy"
- Circuit breakers are open

**Resolution:**
```typescript
// Check individual health check
const envHealth = await healthCheckSystem.getHealthStatus('environment-resolver');
console.log('Environment resolver health:', envHealth);

// Reset circuit breakers
healthCheckSystem.resetCircuitBreaker('environment-resolver');

// Run comprehensive health check
const report = await healthCheckSystem.runAllHealthChecks();
console.log('Full health report:', report);
```

### Performance Issues

#### High Memory Usage

1. **Check buffer utilization:**
```typescript
const status = metricsCollector.getStatus();
console.log('Buffer utilization:', status.bufferUtilization);
```

2. **Reduce retention periods:**
```typescript
const config = {
  retention: {
    realtime: 150, // Reduce from 300
    shortTerm: 30, // Reduce from 60
    mediumTerm: 144, // Reduce from 288
    longTem: 15 // Reduce from 30
  }
};
```

3. **Enable sampling:**
```typescript
const config = {
  sampling: {
    rate: 0.5, // Sample 50% of metrics
    strategy: 'adaptive'
  }
};
```

#### Slow Dashboard Response

1. **Increase cache TTL:**
```typescript
const config = {
  dashboardConfig: {
    refreshInterval: 10000, // Increase from 5000
  },
  healthConfig: {
    cacheTTL: 30000 // Increase from 10000
  }
};
```

2. **Disable heavy features:**
```typescript
const config = {
  dashboardConfig: {
    displayOptions: {
      showPerformanceCharts: false, // Disable if not needed
      showConfigurationHistory: false
    }
  }
};
```

### Integration Issues

#### Build System Integration

1. **Check baseline file:**
```bash
ls -la /tools/build/baselines.json
cat /tools/build/baselines.json
```

2. **Verify build events:**
```typescript
// Listen for build events
window.addEventListener('build-completed', (event) => {
  console.log('Build event received:', event.detail);
});
```

#### Deployment Integration

1. **Check deployment endpoint:**
```bash
curl -X GET /api/deployment/status
```

2. **Verify deployment events:**
```typescript
// Listen for deployment events
window.addEventListener('deployment-completed', (event) => {
  console.log('Deployment event received:', event.detail);
});
```

## Maintenance

### Daily Tasks

1. **Check system health:**
```bash
curl -X GET /api/monitoring/health | jq '.overallStatus'
```

2. **Review active alerts:**
```bash
curl -X GET /api/monitoring/alerts | jq '.[] | select(.status == "active")'
```

3. **Monitor performance trends:**
```bash
curl -X GET /api/monitoring/metrics/report | jq '.recommendations'
```

### Weekly Tasks

1. **Review performance baselines:**
```typescript
const history = monitoring.getBaselineHistory();
console.log('Recent baseline updates:', history.slice(-10));
```

2. **Analyze alert patterns:**
```typescript
const stats = alertSystem.getAlertStats(7 * 24 * 60 * 60 * 1000); // Last 7 days
console.log('Alert statistics:', stats);
```

3. **Clean up old data:**
```typescript
// Cleanup is automatic, but can be triggered manually
healthCheckSystem.clearResults();
metricsCollector.clearMetrics();
```

### Monthly Tasks

1. **Update performance thresholds based on trends**
2. **Review and optimize retention policies**
3. **Update alert rules based on operational experience**
4. **Generate monthly performance report**

## Security Considerations

### Data Protection

- Sensitive configuration data is sanitized in logs
- Authentication tokens are masked in alerts
- Personal information is excluded from metrics

### Access Control

- Health check endpoints can be public (no sensitive data)
- Metrics endpoints should be authenticated
- Alert management requires operator permissions
- Dashboard access controlled by application security

### Network Security

- All external webhook calls use HTTPS
- Timeouts prevent hanging connections
- Rate limiting prevents abuse
- Input validation on all API endpoints

## Support and Contact

For issues with the monitoring system:

1. **Check the troubleshooting guide above**
2. **Review system logs for error messages**
3. **Create detailed issue reports with:**
   - Component affected
   - Expected vs actual behavior
   - Steps to reproduce
   - Relevant configuration
   - Log excerpts

## Version Information

- **Version:** 1.0.0
- **Build Date:** Task 4.1 Implementation
- **Dependencies:** 
  - Environment Resolver (Phase 1)
  - Build System (Task 3.1)  
  - Validation Framework (Task 3.2)
  - Deployment System (Task 3.3)

## License

This monitoring system is part of the Build-Time Environment Resolution System (BERS) and follows the same licensing as the main project.