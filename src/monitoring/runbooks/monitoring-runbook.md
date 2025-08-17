# BERS Monitoring System Operational Runbook

## Overview

This runbook provides step-by-step procedures for operating and maintaining the BERS Monitoring and Observability system. It covers common operational scenarios, incident response procedures, and maintenance tasks.

## Table of Contents

1. [System Startup and Shutdown](#system-startup-and-shutdown)
2. [Incident Response Procedures](#incident-response-procedures)  
3. [Performance Degradation Handling](#performance-degradation-handling)
4. [Alert Management](#alert-management)
5. [Health Check Management](#health-check-management)
6. [Configuration Changes](#configuration-changes)
7. [Maintenance Procedures](#maintenance-procedures)
8. [Emergency Procedures](#emergency-procedures)

## System Startup and Shutdown

### Starting the Monitoring System

**Prerequisites:**
- BERS environment resolver is running
- Required configuration files are in place
- Database connections are available (if applicable)

**Procedure:**

1. **Initialize Environment**
```bash
# Set environment variables
export BERS_MONITORING_ENABLED=true
export BERS_MONITORING_GRANULARITY=1000
export NODE_ENV=production
```

2. **Start Monitoring Components**
```typescript
import { createMonitoringIntegration } from './integration';
import { environmentResolver } from '../config/environment-resolver';

// Create monitoring instance
const monitoring = createMonitoringIntegration(
  {
    enabled: true,
    integrations: {
      buildSystem: { enabled: true },
      validationFramework: { enabled: true },
      deploymentPipeline: { enabled: true },
      environmentResolver: { enabled: true }
    }
  },
  environmentResolver
);

// Start monitoring
await monitoring.start();
```

3. **Verify Startup**
```bash
# Check system health
curl -f http://localhost:3000/api/monitoring/health || exit 1

# Check metrics collection
curl -f http://localhost:3000/api/monitoring/metrics || exit 1

# Check alert system
curl -f http://localhost:3000/api/monitoring/alerts || exit 1
```

4. **Validate Integration**
```typescript
// Check integration status
const status = monitoring.getIntegrationStatus();
console.log('Integration status:', status);

// Verify all components are running
if (!status.isRunning) {
  throw new Error('Monitoring integration not running');
}

// Check individual components
Object.entries(status.components).forEach(([name, running]) => {
  if (!running) {
    console.warn(`Component ${name} is not running`);
  }
});
```

**Expected Results:**
- All health checks return "healthy" status
- Metrics collection shows recent data points
- Dashboard displays real-time information
- No critical alerts are active

### Shutting Down the Monitoring System

**Procedure:**

1. **Graceful Shutdown**
```typescript
// Stop monitoring integration
await monitoring.stop();

// Verify shutdown
const status = monitoring.getIntegrationStatus();
if (status.isRunning) {
  console.warn('Monitoring system did not shut down cleanly');
}
```

2. **Save Final State**
```bash
# Export final metrics (if needed)
curl http://localhost:3000/api/monitoring/metrics/report > final-metrics-$(date +%Y%m%d-%H%M%S).json

# Export active alerts
curl http://localhost:3000/api/monitoring/alerts > active-alerts-$(date +%Y%m%d-%H%M%S).json
```

3. **Cleanup Resources**
```typescript
await monitoring.destroy();
```

## Incident Response Procedures

### Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|----------------|------------|
| P0 | System Down | Immediate | On-call engineer |
| P1 | Critical Performance Degradation | 15 minutes | Team lead |
| P2 | Non-critical Issues | 2 hours | Regular support |
| P3 | Minor Issues | Next business day | Regular support |

### P0: System Down

**Symptoms:**
- Health checks failing across multiple components
- Dashboard not accessible
- Critical alerts firing

**Immediate Actions:**

1. **Assess Impact**
```bash
# Check overall system health
curl -m 5 http://localhost:3000/api/monitoring/health/report

# Check critical components
for component in environment-resolver configuration-validity provider-health; do
  echo "Checking $component..."
  curl -m 5 "http://localhost:3000/api/monitoring/health/$component"
done
```

2. **Identify Root Cause**
```bash
# Check system resources
top -n 1 | head -20
df -h
free -m

# Check application logs
tail -100 /var/log/bers/monitoring.log | grep ERROR

# Check process status
ps aux | grep node
```

3. **Immediate Recovery**
```bash
# Restart monitoring system
systemctl restart bers-monitoring

# Wait for startup
sleep 30

# Verify recovery
curl -f http://localhost:3000/api/monitoring/health || echo "Recovery failed"
```

4. **Post-Recovery Actions**
- Document incident timeline
- Update stakeholders
- Begin root cause analysis

### P1: Critical Performance Degradation

**Symptoms:**
- Response times >1000ms consistently
- Error rates >5%
- Multiple performance alerts active

**Response Procedure:**

1. **Immediate Assessment**
```typescript
// Get performance metrics
const configMetrics = await metricsCollector.getMetricsSummary('configuration_resolution_time');
const providerMetrics = await metricsCollector.getMetricsSummary('provider_initialization_time');
const buildMetrics = await metricsCollector.getMetricsSummary('build_performance');

console.log('Current performance:');
console.log('Config resolution P95:', configMetrics.p95, 'ms');
console.log('Provider init P95:', providerMetrics.p95, 'ms');
console.log('Build time P95:', buildMetrics.p95, 'ms');
```

2. **Identify Bottlenecks**
```bash
# Check resource utilization
iostat -x 1 5
vmstat 1 5

# Check network latency
ping -c 5 external-service.com

# Check database performance (if applicable)
# Database-specific commands here
```

3. **Apply Immediate Mitigations**
```typescript
// Reduce metrics collection frequency temporarily
const urgentConfig = {
  granularity: 5000, // Increase from 1000ms
  sampling: {
    rate: 0.5, // Reduce sampling
    strategy: 'random'
  }
};

// Restart metrics collector with reduced load
metricsCollector.stop();
const newCollector = createMetricsCollector(urgentConfig);
newCollector.start();
```

4. **Monitor Recovery**
```bash
# Monitor performance improvement
watch -n 5 'curl -s http://localhost:3000/api/monitoring/metrics/configuration_resolution_time/summary | jq .p95'
```

## Performance Degradation Handling

### Configuration Resolution Slow (>100ms)

**Investigation Steps:**

1. **Check Cache Performance**
```typescript
// Get environment resolver metrics
const envMetrics = environmentResolver.getPerformanceMetrics();
console.log('Cache hit rate:', envMetrics.cacheHitRate);
console.log('Average detection time:', envMetrics.averageDetectionTime);
```

2. **Clear Cache if Needed**
```typescript
environmentResolver.clearCache();
console.log('Environment cache cleared');
```

3. **Check Configuration Files**
```bash
# Verify configuration file accessibility
ls -la /path/to/config/files/
test -r /path/to/config/development.json && echo "Development config readable"
test -r /path/to/config/staging.json && echo "Staging config readable"
test -r /path/to/config/production.json && echo "Production config readable"
```

4. **Monitor Improvement**
```typescript
// Record baseline before changes
const beforeMetrics = metricsCollector.getMetricsSummary('configuration_resolution_time');

// Apply fixes, then check after 5 minutes
setTimeout(() => {
  const afterMetrics = metricsCollector.getMetricsSummary('configuration_resolution_time');
  const improvement = (beforeMetrics.average - afterMetrics.average) / beforeMetrics.average * 100;
  console.log(`Configuration resolution improved by ${improvement.toFixed(1)}%`);
}, 300000);
```

### Provider Initialization Slow (>50ms)

**Investigation Steps:**

1. **Check Provider Health**
```typescript
// Get provider health status
const providerHealth = await healthCheckSystem.getHealthStatus('provider-health');
console.log('Provider health:', providerHealth);

// Check individual providers
const providers = ['ChatAPIProvider', 'ChatStateProvider', 'ChatStreamingProvider'];
for (const provider of providers) {
  // Would check individual provider health
  console.log(`Checking ${provider}...`);
}
```

2. **Restart Unhealthy Providers**
```typescript
// This would restart specific providers
// Implementation depends on provider architecture
console.log('Restarting unhealthy providers...');
```

3. **Monitor Recovery**
```bash
# Monitor provider initialization times
watch -n 5 'curl -s http://localhost:3000/api/monitoring/metrics/provider_initialization_time/summary | jq .p95'
```

### Build Performance Degraded (>5s from <1s baseline)

**Investigation Steps:**

1. **Check Build System Integration**
```bash
# Check build baseline file
cat /tools/build/baselines.json

# Check recent build metrics
curl http://localhost:3000/api/monitoring/metrics/build_performance/summary
```

2. **Analyze Build Phases**
```typescript
// Get build performance report
const buildReport = metricsCollector.getPerformanceReport('production', '1h');
const buildMetrics = buildReport.metrics.build_performance;

console.log('Build performance analysis:');
console.log('Current average:', buildMetrics.average, 'ms');
console.log('P95:', buildMetrics.p95, 'ms');
console.log('Trend:', buildMetrics.trend);
```

3. **Check Build Dependencies**
```bash
# Check node_modules size
du -sh node_modules/

# Check for large files
find node_modules/ -size +10M -type f

# Check build cache
ls -la .cache/ || echo "No build cache found"
```

4. **Apply Optimizations**
```bash
# Clear build cache
rm -rf .cache/ dist/

# Rebuild with fresh cache
npm run build:clean
```

## Alert Management

### Acknowledging Alerts

**Procedure:**

1. **List Active Alerts**
```bash
curl http://localhost:3000/api/monitoring/alerts | jq '.[] | select(.status == "active")'
```

2. **Acknowledge Alert**
```typescript
await alertSystem.acknowledgeAlert(
  'alert-id-123',
  'operator-john',
  'Investigating configuration resolution slowdown'
);
```

3. **Track Progress**
```bash
# Check alert status
curl http://localhost:3000/api/monitoring/alerts/alert-id-123 | jq '.status'
```

### Resolving Alerts

**Procedure:**

1. **Verify Issue Resolution**
```typescript
// Check if underlying issue is resolved
const metric = metricsCollector.getMetricsSummary('configuration_resolution_time');
if (metric.healthStatus === 'healthy') {
  console.log('Issue appears resolved');
} else {
  console.log('Issue still exists:', metric.healthStatus);
}
```

2. **Resolve Alert**
```typescript
await alertSystem.resolveAlert(
  'alert-id-123',
  'manual',
  'operator-john',
  'Configuration cache cleared, performance restored'
);
```

3. **Document Resolution**
```markdown
## Alert Resolution: Configuration Resolution Slow

**Alert ID:** alert-id-123
**Resolved By:** operator-john
**Resolution Time:** 2024-01-15 14:30:00 UTC
**Root Cause:** Configuration cache was stale
**Resolution:** Cleared cache, performance restored to baseline
**Prevention:** Implement automatic cache refresh
```

### Managing Alert Noise

**Reducing False Positives:**

1. **Adjust Thresholds**
```typescript
// Update alert rule thresholds
const updatedRule = {
  ...existingRule,
  conditions: [
    {
      metric: 'configuration_resolution_time',
      operator: 'greater_than',
      value: 150, // Increase from 100ms
      duration: 120000 // Require 2 minutes of degradation
    }
  ]
};
```

2. **Enable Rate Limiting**
```typescript
const rateLimitConfig = {
  enabled: true,
  maxAlerts: 5, // Reduce from 10
  window: 600000, // Increase window to 10 minutes
  backoffMultiplier: 3
};
```

3. **Improve Deduplication**
```typescript
const deduplicationConfig = {
  enabled: true,
  window: 600000, // Increase window to 10 minutes
  fields: ['type', 'ruleId', 'environment', 'severity']
};
```

## Health Check Management

### Diagnosing Failed Health Checks

**Procedure:**

1. **Get Detailed Health Report**
```bash
curl http://localhost:3000/api/monitoring/health/report | jq '.'
```

2. **Check Specific Component**
```typescript
const componentHealth = await healthCheckSystem.getHealthStatus('environment-resolver');
console.log('Component details:', componentHealth.details);
console.log('Error:', componentHealth.error);
console.log('Remediation:', componentHealth.remediation);
```

3. **Check Dependencies**
```bash
# Check health check dependencies
curl http://localhost:3000/api/monitoring/health/environment-resolver | jq '.details.dependencies'
```

4. **Reset Circuit Breakers**
```typescript
// Reset circuit breaker for problematic component
healthCheckSystem.resetCircuitBreaker('environment-resolver');
console.log('Circuit breaker reset');

// Wait and re-check
setTimeout(async () => {
  const health = await healthCheckSystem.getHealthStatus('environment-resolver');
  console.log('Health after reset:', health.status);
}, 30000);
```

### Adding New Health Checks

**Procedure:**

1. **Define Health Check**
```typescript
const newHealthCheck = {
  name: 'custom-service',
  description: 'Custom service health check',
  enabled: true,
  critical: false,
  timeout: 5000,
  interval: 60000,
  retryAttempts: 3,
  dependencies: []
};
```

2. **Implement Check Logic**
```typescript
// Add to health check system implementation
// This would require modifying the health check system
```

3. **Test New Check**
```bash
# Test the new health check
curl http://localhost:3000/api/monitoring/health/custom-service
```

## Configuration Changes

### Updating Monitoring Configuration

**Procedure:**

1. **Backup Current Configuration**
```bash
# Backup configuration files
cp monitoring.config.json monitoring.config.json.backup.$(date +%Y%m%d-%H%M%S)
```

2. **Validate New Configuration**
```typescript
import { validateMonitoringConfig } from './config-validator';

const newConfig = {
  // New configuration here
};

const validation = validateMonitoringConfig(newConfig);
if (!validation.isValid) {
  console.error('Configuration validation failed:', validation.errors);
  process.exit(1);
}
```

3. **Apply Configuration**
```bash
# Update configuration file
cp monitoring.config.new.json monitoring.config.json

# Restart monitoring system
systemctl restart bers-monitoring

# Verify configuration applied
curl http://localhost:3000/api/monitoring/status | jq '.configuration'
```

4. **Validate Changes**
```bash
# Check health after configuration change
curl -f http://localhost:3000/api/monitoring/health || echo "Health check failed"

# Check metrics collection
curl -f http://localhost:3000/api/monitoring/metrics || echo "Metrics collection failed"
```

### Updating Alert Rules

**Procedure:**

1. **Export Current Rules**
```bash
curl http://localhost:3000/api/monitoring/alerts/rules > current-rules.json
```

2. **Update Rules**
```typescript
// Example: Adding new alert rule
const newRule = {
  id: 'deployment-slow',
  name: 'Deployment Performance Degraded',
  description: 'Deployment taking longer than expected',
  enabled: true,
  type: 'performance_degradation',
  conditions: [
    {
      metric: 'deployment_performance',
      operator: 'greater_than',
      value: 300000, // 5 minutes
      duration: 60000 // 1 minute
    }
  ],
  channels: ['console', 'webhook'],
  severity: 'warning',
  cooldown: 600000, // 10 minutes
  autoResolve: true,
  remediation: [
    {
      id: 'check-deployment-logs',
      title: 'Check Deployment Logs',
      description: 'Review deployment logs for bottlenecks',
      action: 'manual',
      priority: 1,
      estimatedTime: '10 minutes'
    }
  ]
};
```

3. **Test New Rules**
```typescript
// Create test alert context
const testContext = {
  environment: 'staging',
  metrics: {
    deployment_performance: {
      current: 400000, // Should trigger alert
      healthStatus: 'degraded'
    }
  },
  configurationValid: true,
  providerHealth: {},
  systemHealth: 'healthy',
  metadata: {}
};

// Test rule evaluation
await alertSystem.evaluateRules(testContext);
```

## Maintenance Procedures

### Daily Maintenance

**Checklist:**

- [ ] Check system health status
- [ ] Review active alerts
- [ ] Verify metrics collection
- [ ] Check dashboard accessibility
- [ ] Review performance trends

**Procedure:**

```bash
#!/bin/bash
# Daily monitoring maintenance script

echo "=== Daily Monitoring Maintenance $(date) ==="

# Check system health
echo "Checking system health..."
HEALTH_STATUS=$(curl -s http://localhost:3000/api/monitoring/health | jq -r '.overallStatus')
echo "System health: $HEALTH_STATUS"

if [ "$HEALTH_STATUS" != "healthy" ]; then
  echo "WARNING: System health is not healthy!"
  curl -s http://localhost:3000/api/monitoring/health/report | jq '.checks[] | select(.status != "healthy")'
fi

# Check active alerts
echo "Checking active alerts..."
ACTIVE_ALERTS=$(curl -s http://localhost:3000/api/monitoring/alerts | jq '. | length')
echo "Active alerts: $ACTIVE_ALERTS"

if [ "$ACTIVE_ALERTS" -gt 0 ]; then
  echo "Active alerts found:"
  curl -s http://localhost:3000/api/monitoring/alerts | jq '.[] | {id, type, severity, message}'
fi

# Check metrics collection
echo "Checking metrics collection..."
METRICS_STATUS=$(curl -s http://localhost:3000/api/monitoring/metrics | jq -r '.status')
echo "Metrics collection status: $METRICS_STATUS"

# Performance summary
echo "Performance summary:"
curl -s http://localhost:3000/api/monitoring/metrics/report | jq '.metrics | to_entries[] | {metric: .key, status: .value.healthStatus, current: .value.current}'

echo "=== Daily maintenance complete ==="
```

### Weekly Maintenance

**Checklist:**

- [ ] Review performance baselines
- [ ] Analyze alert patterns
- [ ] Update performance thresholds if needed
- [ ] Clean up old data
- [ ] Review external system integrations

**Procedure:**

```bash
#!/bin/bash
# Weekly monitoring maintenance script

echo "=== Weekly Monitoring Maintenance $(date) ==="

# Performance baseline review
echo "Reviewing performance baselines..."
curl -s http://localhost:3000/api/monitoring/baselines | jq '.'

# Alert pattern analysis
echo "Analyzing alert patterns..."
curl -s http://localhost:3000/api/monitoring/alerts/stats?period=604800000 | jq '.'

# Data cleanup (if manual cleanup needed)
echo "Data cleanup status:"
curl -s http://localhost:3000/api/monitoring/status | jq '.dataRetention'

echo "=== Weekly maintenance complete ==="
```

### Monthly Maintenance

**Checklist:**

- [ ] Generate monthly performance report
- [ ] Review and update documentation
- [ ] Plan capacity adjustments
- [ ] Update monitoring system dependencies
- [ ] Review and test disaster recovery procedures

**Procedure:**

```bash
#!/bin/bash
# Monthly monitoring maintenance script

echo "=== Monthly Monitoring Maintenance $(date) ==="

# Generate monthly report
echo "Generating monthly performance report..."
REPORT_FILE="monthly-report-$(date +%Y-%m).json"
curl -s "http://localhost:3000/api/monitoring/metrics/report?period=2592000000" > "$REPORT_FILE"
echo "Report saved to: $REPORT_FILE"

# Capacity analysis
echo "Capacity analysis:"
curl -s http://localhost:3000/api/monitoring/status | jq '.resources'

# Dependency updates check
echo "Checking for dependency updates..."
npm outdated

echo "=== Monthly maintenance complete ==="
```

## Emergency Procedures

### Complete System Recovery

**Scenario:** Monitoring system is completely down and needs full recovery

**Procedure:**

1. **Stop All Monitoring Services**
```bash
systemctl stop bers-monitoring
pkill -f "monitoring"
```

2. **Check System Resources**
```bash
# Check disk space
df -h
if [ $(df / | tail -1 | awk '{print $5}' | sed 's/%//') -gt 90 ]; then
  echo "WARNING: Disk space critical"
fi

# Check memory
free -h
if [ $(free | grep Mem | awk '{print ($3/$2) * 100.0}' | cut -d. -f1) -gt 90 ]; then
  echo "WARNING: Memory usage critical"
fi
```

3. **Clean Up If Needed**
```bash
# Clear temporary files
rm -rf /tmp/bers-monitoring-*

# Clear old logs if disk space is critical
find /var/log/bers/ -name "*.log" -mtime +7 -delete
```

4. **Restore from Backup**
```bash
# Restore configuration from backup
cp monitoring.config.json.backup /path/to/monitoring.config.json

# Restore baseline data if needed
cp baselines.json.backup /path/to/baselines.json
```

5. **Start Monitoring System**
```bash
systemctl start bers-monitoring

# Wait for startup
sleep 30

# Verify recovery
curl -f http://localhost:3000/api/monitoring/health || echo "Recovery verification failed"
```

6. **Post-Recovery Validation**
```bash
# Run full system check
./scripts/monitoring-health-check.sh

# Verify integrations
curl -f http://localhost:3000/api/monitoring/integration/status
```

### Data Recovery

**Scenario:** Monitoring data has been lost or corrupted

**Procedure:**

1. **Assess Data Loss**
```typescript
// Check what data is available
const status = monitoring.getIntegrationStatus();
console.log('Available data:', status);

// Check metrics data
const metricsStatus = metricsCollector.getStatus();
console.log('Metrics data:', metricsStatus.metricsCount);
```

2. **Restore from External Sources**
```bash
# If metrics are exported to external systems
# Restore from external monitoring system, logs, etc.

# Example: Restore from backup database
# mysql -u user -p bers_monitoring < bers_monitoring_backup.sql
```

3. **Rebuild Baselines**
```typescript
// Rebuild performance baselines from recent data
const environments = ['development', 'staging', 'production'];
for (const env of environments) {
  // Would rebuild baselines for each environment
  console.log(`Rebuilding baselines for ${env}...`);
}
```

4. **Verify Data Integrity**
```bash
# Check data consistency
curl http://localhost:3000/api/monitoring/metrics/report | jq '.timestamp'

# Verify against external sources if available
```

### Emergency Contacts

**P0 Incidents:**
- On-call Engineer: +1-555-0123
- Team Lead: +1-555-0124
- Engineering Manager: +1-555-0125

**Escalation Path:**
1. On-call Engineer (immediate)
2. Team Lead (if not resolved in 30 minutes)
3. Engineering Manager (if not resolved in 1 hour)
4. Director of Engineering (if not resolved in 2 hours)

**Communication Channels:**
- Slack: #bers-monitoring-alerts
- Email: bers-team@company.com
- Incident Management: https://company.pagerduty.com

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2024-01-15 | Initial runbook creation | BERS Team |

---

**Note:** This runbook should be updated regularly based on operational experience and changes to the monitoring system. Review and update at least quarterly.