# BERS Production Monitoring System - Operational Runbook

## Overview

The Build-Time Environment Resolution System (BERS) Production Monitoring System provides comprehensive observability for the distributed ChatProvider architecture with real-time configuration monitoring, performance metrics collection, automated alerting, and health check endpoints.

**Version**: 1.0.0  
**Last Updated**: Task 4.1 Implementation  
**Target Uptime**: 99.9%

## Quick Reference

### Emergency Contacts
- **Primary**: Development Team
- **Secondary**: Infrastructure Team
- **Escalation**: Technical Lead

### Critical Thresholds
- Configuration Resolution: <100ms (Alert at >100ms)
- Provider Initialization: <50ms (Achieved: 10-20ms)
- Build Time: <30s (Achieved: <1s)
- Monitoring Uptime: 99.9%
- Error Rate: <1%

### Service Ports
- **Dashboard**: 3003
- **Health Checks**: 3001  
- **Metrics API**: 3002
- **SSE Events**: 3003/api/monitoring/events

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                Production Monitoring            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │ Dashboard   │ │ API Server  │ │ Alert       ││
│  │ (Port 3003) │ │ (SSE/REST)  │ │ System      ││
│  └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              Core Monitoring Components         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │ Metrics     │ │ Health      │ │ Environment ││
│  │ Collector   │ │ Checks      │ │ Resolver    ││
│  │ (1s grain.) │ │ (Circuit    │ │ Integration ││
│  │             │ │ Breakers)   │ │             ││
│  └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│            BERS Infrastructure Integration      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │ Build       │ │ Validation  │ │ Deployment  ││
│  │ System      │ │ Framework   │ │ Pipeline    ││
│  │ (Task 3.1)  │ │ (Task 3.2)  │ │ (Task 3.3)  ││
│  └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────────────────────────────┘
```

## Startup Procedures

### 1. Standard Startup

```bash
# Navigate to project directory
cd /Users/chrismiller/Desktop/build-process/picasso

# Start production monitoring
npm run monitoring:start

# Verify startup
curl http://localhost:3001/api/monitoring/health
```

### 2. Development Startup

```bash
# Start in development mode
npm run monitoring:dev

# Check all components
curl http://localhost:3003/api/monitoring/dashboard/status
```

### 3. Programmatic Startup

```typescript
import { startProductionMonitoring } from './tools/monitoring/production-monitoring';

// Start with default configuration
const monitoringSystem = await startProductionMonitoring();

// Start with custom configuration
const customSystem = await startProductionMonitoring({
  environment: 'production',
  deployment: {
    dashboardPort: 8080,
    logLevel: 'info'
  },
  performance: {
    targets: {
      configurationResolution: 75 // Stricter than default 100ms
    }
  }
});
```

## Health Check Procedures

### 1. System Health Overview

```bash
# Check overall system health
curl -s http://localhost:3001/api/monitoring/health | jq '.'

# Expected response:
{
  "success": true,
  "data": {
    "timestamp": 1640995200000,
    "overallStatus": "healthy",
    "version": "1.0.0",
    "uptime": 3600000,
    "environment": "production",
    "checks": [...]
  }
}
```

### 2. Component Health Checks

```bash
# Environment resolver health
curl http://localhost:3001/api/monitoring/health/environment-resolver

# Configuration validity
curl http://localhost:3001/api/monitoring/health/configuration-validity

# Provider health
curl http://localhost:3001/api/monitoring/health/provider-health

# System resources
curl http://localhost:3001/api/monitoring/health/system-resources

# Metrics collector
curl http://localhost:3001/api/monitoring/health/metrics-collector
```

### 3. Health Status Interpretation

| Status | Meaning | Action Required |
|--------|---------|----------------|
| `healthy` | All systems operating normally | None |
| `degraded` | Performance issues detected | Monitor closely, investigate |
| `unhealthy` | Critical failure detected | Immediate investigation required |
| `unknown` | Unable to determine status | Check system connectivity |

## Performance Monitoring

### 1. Real-time Metrics

```bash
# Get all current metrics
curl http://localhost:3002/api/monitoring/metrics | jq '.'

# Get specific metric type
curl http://localhost:3002/api/monitoring/metrics/configuration_resolution_time

# Get performance report
curl http://localhost:3002/api/monitoring/metrics/report?period=5m
```

### 2. Key Performance Indicators

#### Configuration Resolution Time
- **Target**: <100ms
- **Current Average**: ~75ms
- **P95**: Should be <100ms
- **Alert Threshold**: >100ms for 60 seconds

```bash
# Monitor configuration resolution
curl -s http://localhost:3002/api/monitoring/metrics/configuration_resolution_time | jq '.data.current'
```

#### Provider Initialization Time
- **Target**: <50ms
- **Achieved**: 10-20ms
- **Alert Threshold**: >50ms

```bash
# Monitor provider initialization
curl -s http://localhost:3002/api/monitoring/metrics/provider_initialization_time | jq '.data'
```

#### Build Performance
- **Target**: <30s
- **Achieved**: <1s
- **Alert Threshold**: >5s (significant degradation)

```bash
# Monitor build performance
curl -s http://localhost:3002/api/monitoring/metrics/build_performance | jq '.data'
```

### 3. Performance Baselines

Current baselines from Tasks 3.1-3.3:

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| Build Time | <30s | <1s | ✅ Excellent |
| Configuration Resolution | <100ms | ~75ms | ✅ Good |
| Provider Initialization | <50ms | 10-20ms | ✅ Excellent |
| Deployment Time | <5min | <2min | ✅ Good |
| Test Coverage | >95% | 95.2% | ✅ Good |

## Alert Management

### 1. Active Alerts

```bash
# Get active alerts
curl http://localhost:3003/api/monitoring/alerts

# Get alert statistics
curl http://localhost:3003/api/monitoring/alerts/stats
```

### 2. Alert Response Procedures

#### Configuration Resolution Slow (WARNING)
```bash
# Alert: Configuration resolution time >100ms

# 1. Check current metrics
curl http://localhost:3002/api/monitoring/metrics/configuration_resolution_time

# 2. Check cache hit rate
curl -s http://localhost:3002/api/monitoring/metrics/cache_hit_rate | jq '.data.current'

# 3. Clear environment cache if needed
curl -X POST http://localhost:3003/api/monitoring/environment-resolver/clear-cache

# 4. Monitor for improvement
watch -n 5 'curl -s http://localhost:3002/api/monitoring/metrics/configuration_resolution_time | jq ".data.current"'
```

#### Build Performance Degraded (ERROR)
```bash
# Alert: Build time >5s (significant degradation from <1s baseline)

# 1. Check recent build metrics
curl http://localhost:3002/api/monitoring/metrics/build_performance

# 2. Review build logs
tail -f logs/build.log

# 3. Check system resources
curl http://localhost:3001/api/monitoring/health/system-resources

# 4. Check dependencies
npm audit
npm outdated
```

#### Environment Detection Failed (CRITICAL)
```bash
# Alert: Environment detection consistently failing

# 1. Check environment resolver health
curl http://localhost:3001/api/monitoring/health/environment-resolver

# 2. Verify environment variables
echo $NODE_ENV
echo $PICASSO_ENV

# 3. Check configuration files
ls -la .env* picasso.config.json

# 4. Test environment detection manually
node -e "
const { environmentResolver } = require('./src/config/environment-resolver');
environmentResolver.detectEnvironment().then(console.log).catch(console.error);
"
```

### 3. Alert Acknowledgment and Resolution

```bash
# Acknowledge an alert
curl -X POST http://localhost:3003/api/monitoring/alerts/{alert-id}/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"operator": "admin", "notes": "Investigating configuration issue"}'

# Resolve an alert
curl -X POST http://localhost:3003/api/monitoring/alerts/{alert-id}/resolve \
  -H "Content-Type: application/json" \
  -d '{"operator": "admin", "notes": "Fixed by clearing cache"}'
```

## Troubleshooting Guide

### 1. Dashboard Not Loading

**Symptoms:**
- Dashboard shows blank page at http://localhost:3003
- Console errors about missing API endpoints

**Resolution:**
```bash
# 1. Check if API server is running
curl http://localhost:3003/api/monitoring/dashboard/status

# 2. Check server logs
tail -f logs/monitoring.log

# 3. Restart monitoring system
npm run monitoring:restart

# 4. Check port conflicts
lsof -i :3003
```

### 2. Metrics Not Collecting

**Symptoms:**
- Metrics API returns empty data
- Performance charts show no data
- Alerts not firing despite performance issues

**Resolution:**
```bash
# 1. Check metrics collector status
curl -s http://localhost:3003/api/monitoring/dashboard/status | jq '.data.components.metricsCollector'

# 2. Verify metrics collector is running
curl http://localhost:3001/api/monitoring/health/metrics-collector

# 3. Check sampling configuration
# Ensure sampling rate is not set too low

# 4. Restart metrics collector
curl -X POST http://localhost:3003/api/monitoring/metrics/restart
```

### 3. Health Checks Failing

**Symptoms:**
- Health endpoints return "unhealthy" status
- Circuit breakers showing as "open"
- System health shows "critical"

**Resolution:**
```bash
# 1. Check individual component health
curl http://localhost:3001/api/monitoring/health/environment-resolver
curl http://localhost:3001/api/monitoring/health/configuration-validity
curl http://localhost:3001/api/monitoring/health/provider-health

# 2. Reset circuit breakers
curl -X POST http://localhost:3003/api/monitoring/health/circuit-breakers/reset

# 3. Check system resources
curl http://localhost:3001/api/monitoring/health/system-resources

# 4. Review component logs
tail -f logs/environment-resolver.log
tail -f logs/provider-health.log
```

### 4. High Memory Usage

**Symptoms:**
- Memory usage >80% threshold
- Performance degradation
- Out of memory errors

**Resolution:**
```bash
# 1. Check current memory usage
curl -s http://localhost:3001/api/monitoring/health/system-resources | jq '.data.details.memoryUsage'

# 2. Check buffer utilization
curl -s http://localhost:3002/api/monitoring/metrics | jq '.bufferUtilization'

# 3. Reduce metrics retention
# Edit configuration to reduce retention periods

# 4. Enable adaptive sampling
# Configure adaptive sampling in production-monitoring config

# 5. Clear metrics cache
curl -X POST http://localhost:3003/api/monitoring/metrics/clear-cache
```

### 5. SSE Connection Issues

**Symptoms:**
- Dashboard not updating in real-time
- SSE connection errors in browser console
- No live updates

**Resolution:**
```bash
# 1. Test SSE endpoint directly
curl -N http://localhost:3003/api/monitoring/events

# 2. Check SSE client count
curl -s http://localhost:3003/api/monitoring/dashboard/status | jq '.data.server.sseClients'

# 3. Check proxy/firewall settings
# Ensure EventSource is allowed through proxies

# 4. Fallback to polling
# Dashboard will automatically fallback to periodic refresh
```

## Maintenance Procedures

### Daily Maintenance

```bash
#!/bin/bash
# daily-monitoring-maintenance.sh

echo "Starting daily monitoring maintenance..."

# 1. Check system health
echo "Checking system health..."
curl -s http://localhost:3001/api/monitoring/health | jq '.data.overallStatus'

# 2. Review active alerts
echo "Checking active alerts..."
ACTIVE_ALERTS=$(curl -s http://localhost:3003/api/monitoring/alerts | jq '.data | length')
echo "Active alerts: $ACTIVE_ALERTS"

# 3. Check performance trends
echo "Checking performance trends..."
curl -s http://localhost:3002/api/monitoring/metrics/report | jq '.data.recommendations'

# 4. Verify 99.9% uptime target
echo "Checking uptime..."
UPTIME=$(curl -s http://localhost:3003/api/monitoring/dashboard/status | jq '.data.server.uptime')
echo "System uptime: $UPTIME ms"

echo "Daily maintenance complete."
```

### Weekly Maintenance

```bash
#!/bin/bash
# weekly-monitoring-maintenance.sh

echo "Starting weekly monitoring maintenance..."

# 1. Review performance baselines
echo "Reviewing performance baselines..."
curl http://localhost:3002/api/monitoring/metrics/report?period=7d > weekly-report.json

# 2. Analyze alert patterns
echo "Analyzing alert patterns..."
curl http://localhost:3003/api/monitoring/alerts/stats?period=604800000 # 7 days

# 3. Check log file sizes
echo "Checking log file sizes..."
du -sh logs/

# 4. Backup monitoring configuration
echo "Backing up configuration..."
cp tools/monitoring/production-monitoring.ts backups/monitoring-config-$(date +%Y%m%d).ts

# 5. Update performance thresholds if needed
echo "Reviewing thresholds..."
# Manual review of thresholds based on trend data

echo "Weekly maintenance complete."
```

### Monthly Maintenance

1. **Review performance baselines and update thresholds**
2. **Analyze alert patterns and optimize alert rules**
3. **Update monitoring system dependencies**
4. **Generate monthly performance report**
5. **Review and optimize retention policies**

## Performance Optimization

### 1. Metrics Collection Optimization

```typescript
// Reduce metrics granularity in high-load scenarios
const optimizedConfig = {
  monitoring: {
    metricsGranularity: 2000, // Increase from 1000ms to 2000ms
    retentionPolicies: {
      realtime: 150, // Reduce from 300 seconds
      shortTerm: 30, // Reduce from 60 minutes
    }
  },
  performance: {
    optimization: {
      sampling: {
        adaptive: true,
        rate: 0.5, // Reduce sampling rate
        thresholdTrigger: 200 // Lower threshold
      }
    }
  }
};
```

### 2. Dashboard Performance

```typescript
// Optimize dashboard refresh rates
const dashboardConfig = {
  monitoring: {
    dashboardRefreshInterval: 10000, // Increase from 5000ms
  }
};
```

### 3. Alert Optimization

```typescript
// Optimize alert rules to reduce noise
const alertConfig = {
  deduplication: {
    enabled: true,
    window: 600000, // Increase from 300000ms (10 minutes)
  },
  rateLimiting: {
    maxAlerts: 5, // Reduce from 10
    window: 600000, // Increase window
  }
};
```

## Security Considerations

### 1. Network Security

- All monitoring endpoints should be behind authentication in production
- Use HTTPS for all external webhook notifications
- Implement IP whitelisting for monitoring API access
- Rate limiting is enabled by default to prevent abuse

### 2. Data Protection

- Sensitive configuration data is sanitized in logs and alerts
- Authentication tokens are masked in monitoring data
- Personal information is excluded from metrics collection
- All metric data is ephemeral and follows retention policies

### 3. Access Control

```bash
# Enable authentication (production)
export BERS_MONITORING_AUTH_ENABLED=true
export BERS_MONITORING_API_KEY="your-secure-api-key"

# Restrict IP access
export BERS_MONITORING_ALLOWED_IPS="10.0.0.0/8,172.16.0.0/12"
```

## Integration Points

### 1. Build System Integration (Task 3.1)

The monitoring system automatically tracks:
- Build start/completion events
- Build performance metrics
- Dependency resolution times
- Bundle size tracking

```javascript
// Build events are automatically captured
window.addEventListener('build-completed', (event) => {
  // Monitoring system records metrics automatically
});
```

### 2. Validation Framework Integration (Task 3.2)

Monitors:
- Test suite execution time
- Test failure rates
- Coverage metrics
- Cross-environment validation results

### 3. Deployment Pipeline Integration (Task 3.3)

Tracks:
- Deployment start/completion
- Staging validation results
- Production deployment success rates
- Rollback events

## Backup and Recovery

### 1. Configuration Backup

```bash
# Backup monitoring configuration
tar -czf monitoring-backup-$(date +%Y%m%d).tar.gz \
  tools/monitoring/ \
  src/monitoring/ \
  logs/monitoring.log

# Store in safe location
aws s3 cp monitoring-backup-$(date +%Y%m%d).tar.gz s3://backup-bucket/monitoring/
```

### 2. Data Recovery

```bash
# Restore from backup
tar -xzf monitoring-backup-YYYYMMDD.tar.gz

# Restart monitoring system
npm run monitoring:restart

# Verify restoration
curl http://localhost:3001/api/monitoring/health
```

### 3. Disaster Recovery

1. **Service Recovery**: Monitoring system can be rebuilt from configuration
2. **Data Recovery**: Historical data is available from retention periods
3. **Alert Recovery**: Alert rules and channels are configuration-driven
4. **Dashboard Recovery**: Dashboard rebuilds automatically from API data

## Contact Information

For issues with the BERS Production Monitoring System:

1. **Check this runbook first**
2. **Review system logs**: `logs/monitoring.log`
3. **Check GitHub issues**: Link to project repository
4. **Contact development team**: Technical lead contact

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Task 4.1 | Initial production monitoring system |

---

**End of Operational Runbook**

This runbook should be kept up-to-date as the monitoring system evolves. All operators should be familiar with the health check procedures and alert response protocols.