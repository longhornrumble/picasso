# BERS Operational Runbook

## Build-time Environment Resolution System (BERS) v2.0.0

### Operations and Maintenance Guide

This runbook provides comprehensive operational procedures for managing, maintaining, and troubleshooting the Build-time Environment Resolution System (BERS) in production environments.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Daily Operations](#daily-operations)
3. [Monitoring and Health Checks](#monitoring-and-health-checks)
4. [Deployment Procedures](#deployment-procedures)
5. [Maintenance Tasks](#maintenance-tasks)
6. [Emergency Response](#emergency-response)
7. [Performance Optimization](#performance-optimization)
8. [Security Operations](#security-operations)
9. [Configuration Management](#configuration-management)
10. [Backup and Recovery](#backup-and-recovery)
11. [Scaling Operations](#scaling-operations)
12. [Troubleshooting Guide](#troubleshooting-guide)

---

## System Overview

### BERS Components Status Dashboard

```
Component                  Status    Health Check Endpoint
─────────────────────────────────────────────────────────
Environment Resolver      🟢 Active  /api/monitoring/health/resolver
Configuration Manager     🟢 Active  /api/monitoring/health/config
Provider Ecosystem        🟢 Active  /api/monitoring/health/providers
Monitoring System         🟢 Active  /api/monitoring/health/monitoring
Security Infrastructure   🟢 Active  /api/monitoring/health/security
Build Integration         🟢 Active  /api/monitoring/health/build
```

### Key Performance Indicators (KPIs)

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Environment Detection Time | <100ms | <50ms | ✅ |
| Configuration Resolution Time | <100ms | <80ms | ✅ |
| Provider Initialization Time | <50ms | 10-20ms | ✅ |
| System Uptime | 99.9% | >99.9% | ✅ |
| Error Rate | <1% | <0.5% | ✅ |
| Cache Hit Rate | >90% | >95% | ✅ |

---

## Daily Operations

### 1. Morning Health Check (09:00 UTC)

```bash
# Check overall system status
curl -s http://localhost:3003/api/monitoring/health | jq '.'

# Verify all components are running
curl -s http://localhost:3003/api/monitoring/health/detailed | jq '.checks[] | select(.status != "healthy")'

# Check performance metrics from last 24 hours
curl -s "http://localhost:3003/api/monitoring/metrics/summary?period=24h" | jq '.'
```

**Expected Results**:
- All health checks return `"status": "healthy"`
- No alerts in critical or warning state
- Performance metrics within targets

**Action Items**:
- Review any warnings or degraded components
- Check alert history for overnight issues
- Verify backup completion status

### 2. Environment Detection Validation

```bash
# Test environment detection across all environments
node scripts/validate-environments.js

# Check environment detection performance
curl -s "http://localhost:3003/api/monitoring/metrics/environment_detection_time?period=1h" | jq '.summary'
```

**Validation Checklist**:
- [ ] Development environment detection working
- [ ] Staging environment detection working  
- [ ] Production environment detection working
- [ ] Custom environment configurations valid
- [ ] Detection times within <100ms target

### 3. Configuration System Validation

```bash
# Validate configuration loading for all environments
npm run test:config-validation

# Check S3 connectivity and configuration loading
curl -s http://localhost:3003/api/monitoring/health/s3 | jq '.'

# Validate tenant configurations
node scripts/validate-tenant-configs.js
```

**Validation Checklist**:
- [ ] S3 bucket accessible and responsive
- [ ] Tenant configurations loading successfully
- [ ] Schema validation passing
- [ ] Configuration inheritance working correctly
- [ ] Cache performance optimal

### 4. Provider Ecosystem Check

```bash
# Check provider health and initialization times
curl -s http://localhost:3003/api/monitoring/health/providers | jq '.checks'

# Validate provider configuration injection
npm run test:provider-integration

# Check provider performance metrics
curl -s "http://localhost:3003/api/monitoring/metrics/provider_initialization_time?period=1h" | jq '.'
```

**Provider Validation Checklist**:
- [ ] ChatAPIProvider healthy and responsive
- [ ] ChatStateProvider maintaining state correctly
- [ ] ChatStreamingProvider handling streams
- [ ] ChatContentProvider processing content
- [ ] ChatDebugProvider (dev environment only)
- [ ] ChatMonitoringProvider collecting metrics

---

## Monitoring and Health Checks

### 1. Accessing Monitoring Dashboard

**Primary Dashboard**: http://localhost:3003/api/monitoring/dashboard

**Key Sections**:
- System Health Overview
- Performance Metrics (Real-time)
- Alert Status and History
- Environment Detection Status
- Configuration Resolution Metrics
- Provider Performance Dashboard

### 2. Critical Monitoring Endpoints

```bash
# Overall system health
GET /api/monitoring/health

# Detailed component health
GET /api/monitoring/health/detailed

# Real-time metrics stream
GET /api/monitoring/metrics/stream

# Alert status
GET /api/monitoring/alerts

# Performance summary
GET /api/monitoring/metrics/summary
```

### 3. Log Monitoring

**Primary Log Locations**:
```
Application Logs:    /var/log/bers/application.log
Performance Logs:    /var/log/bers/performance.log
Security Logs:       /var/log/bers/security.log
Error Logs:          /var/log/bers/errors.log
Audit Logs:          /var/log/bers/audit.log
```

**Log Monitoring Commands**:
```bash
# Monitor real-time application logs
tail -f /var/log/bers/application.log

# Check for errors in the last hour
grep "ERROR" /var/log/bers/errors.log | grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')"

# Monitor performance issues
grep "PERFORMANCE_WARNING\|PERFORMANCE_CRITICAL" /var/log/bers/performance.log | tail -20

# Security event monitoring
grep "SECURITY_EVENT\|AUTHENTICATION_FAILURE" /var/log/bers/security.log | tail -10
```

### 4. Alert Management

**Alert Severity Levels**:
- 🔴 **Critical**: System down, data loss risk, security breach
- 🟡 **Warning**: Performance degradation, non-critical failures
- 🔵 **Info**: Operational events, scheduled maintenance

**Alert Response Times**:
- Critical: Immediate response (< 5 minutes)
- Warning: Response within 30 minutes
- Info: Review during next business day

**Alert Acknowledgment**:
```bash
# Acknowledge alert
curl -X POST http://localhost:3003/api/monitoring/alerts/{alert_id}/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"acknowledged_by": "operator_name", "reason": "investigating issue"}'

# Resolve alert
curl -X POST http://localhost:3003/api/monitoring/alerts/{alert_id}/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolved_by": "operator_name", "resolution": "issue resolved"}'
```

---

## Deployment Procedures

### 1. Pre-Deployment Validation

**Checklist**:
- [ ] All tests passing in CI/CD pipeline
- [ ] Performance benchmarks met
- [ ] Security scans completed
- [ ] Configuration validation successful
- [ ] Backup completed
- [ ] Rollback plan prepared

**Pre-deployment Commands**:
```bash
# Run full test suite
npm run test:all

# Validate configuration schemas
npm run test:config-schemas

# Performance benchmark
npm run test:performance

# Security validation
npm run test:security
```

### 2. Deployment Process

#### Development Environment
```bash
# 1. Deploy to development
npm run deploy:development

# 2. Smoke tests
npm run test:smoke:development

# 3. Integration tests
npm run test:integration:development
```

#### Staging Environment
```bash
# 1. Deploy to staging
npm run deploy:staging

# 2. Run full validation suite
npm run test:validation:staging

# 3. Load testing
npm run test:load:staging

# 4. Security validation
npm run test:security:staging
```

#### Production Environment
```bash
# 1. Final pre-deployment checks
npm run pre-deployment:production

# 2. Deploy with monitoring
npm run deploy:production:monitored

# 3. Post-deployment validation
npm run post-deployment:production

# 4. Performance verification
npm run verify:performance:production
```

### 3. Post-Deployment Verification

**Immediate Checks (0-5 minutes)**:
```bash
# Verify all components started successfully
curl -s http://localhost:3003/api/monitoring/health/detailed

# Check for immediate errors
grep "ERROR\|CRITICAL" /var/log/bers/application.log | tail -20

# Verify environment detection working
curl -s http://localhost:3003/api/environment/detect
```

**Short-term Monitoring (5-30 minutes)**:
```bash
# Monitor performance metrics
watch -n 30 'curl -s http://localhost:3003/api/monitoring/metrics/summary | jq ".performanceTargets"'

# Check for alerts
watch -n 60 'curl -s http://localhost:3003/api/monitoring/alerts | jq ".active"'
```

**Extended Validation (30 minutes - 2 hours)**:
- Monitor error rates and performance trends
- Validate configuration loading across all tenants
- Verify provider ecosystem stability
- Check memory usage and resource consumption

### 4. Rollback Procedures

**Immediate Rollback Triggers**:
- Critical system failures
- Error rate >5%
- Performance degradation >50%
- Security vulnerabilities detected

**Rollback Steps**:
```bash
# 1. Stop current deployment
npm run deployment:stop

# 2. Restore previous version
npm run rollback:production

# 3. Verify rollback success
npm run verify:rollback

# 4. Monitor system recovery
npm run monitor:recovery
```

---

## Maintenance Tasks

### 1. Weekly Maintenance (Sundays 02:00 UTC)

```bash
# Clear old logs (keep 30 days)
find /var/log/bers -name "*.log" -mtime +30 -delete

# Clean up metrics cache
curl -X POST http://localhost:3003/api/monitoring/cache/cleanup

# Vacuum configuration cache
curl -X POST http://localhost:3003/api/config/cache/optimize

# Update performance baselines
npm run baselines:update
```

### 2. Monthly Maintenance (First Sunday)

```bash
# Full system backup
npm run backup:full

# Security audit
npm run security:audit

# Performance analysis
npm run performance:analyze

# Update dependencies (after testing)
npm run dependencies:update:safe
```

### 3. Quarterly Maintenance

- **Configuration Schema Review**: Update schemas for new requirements
- **Security Assessment**: Comprehensive security review
- **Performance Optimization**: Analyze and optimize based on usage patterns
- **Capacity Planning**: Review scaling requirements
- **Documentation Updates**: Keep operational docs current

---

## Emergency Response

### 1. System Down (Critical)

**Immediate Actions (0-5 minutes)**:
1. Acknowledge the alert
2. Check system status: `curl http://localhost:3003/api/monitoring/health`
3. Review recent logs: `tail -100 /var/log/bers/errors.log`
4. Escalate to on-call engineer if needed

**Investigation (5-15 minutes)**:
1. Identify failing components
2. Check resource utilization
3. Review recent deployments
4. Analyze error patterns

**Resolution Actions**:
```bash
# Restart BERS monitoring system
npm run restart:monitoring

# Restart full BERS system (if needed)
npm run restart:system

# Emergency rollback (if deployment-related)
npm run emergency:rollback
```

### 2. Performance Degradation (Warning)

**Triage Steps**:
1. Check current performance metrics
2. Compare to baseline performance
3. Identify bottleneck components
4. Assess impact on users

**Performance Analysis**:
```bash
# Get detailed performance metrics
curl -s "http://localhost:3003/api/monitoring/metrics/detailed?period=1h" | jq '.'

# Check resource utilization
curl -s http://localhost:3003/api/monitoring/system/resources

# Analyze slow queries/operations
curl -s http://localhost:3003/api/monitoring/slow-operations
```

### 3. Configuration Issues

**Common Issues**:
- S3 connectivity problems
- Invalid tenant configurations
- Schema validation failures
- Environment detection failures

**Diagnostic Commands**:
```bash
# Test S3 connectivity
aws s3 ls s3://myrecruiter-picasso/tenants/ --region us-east-1

# Validate specific tenant configuration
node scripts/validate-tenant.js --tenant=<tenant_hash>

# Test environment detection
node scripts/test-environment-detection.js --environment=production

# Check configuration schema validity
npm run test:schemas
```

### 4. Security Incidents

**Immediate Response**:
1. Isolate affected systems
2. Preserve audit logs
3. Notify security team
4. Document incident details

**Security Commands**:
```bash
# Check recent security events
grep "SECURITY_EVENT" /var/log/bers/security.log | tail -50

# Review access patterns
grep "ACCESS_VIOLATION\|AUTH_FAILURE" /var/log/bers/audit.log

# Validate current security configuration
npm run security:validate
```

---

## Performance Optimization

### 1. Cache Optimization

**Cache Performance Monitoring**:
```bash
# Check cache hit rates
curl -s http://localhost:3003/api/monitoring/cache/stats | jq '.'

# Environment detection cache stats
curl -s http://localhost:3003/api/monitoring/cache/environment-detection

# Configuration cache stats
curl -s http://localhost:3003/api/monitoring/cache/configuration
```

**Cache Tuning**:
```bash
# Adjust cache TTL for environment detection (5 minutes default)
curl -X POST http://localhost:3003/api/config/cache/environment-detection/ttl \
  -d '{"ttl": 300000}'

# Adjust configuration cache TTL (10 minutes default)  
curl -X POST http://localhost:3003/api/config/cache/configuration/ttl \
  -d '{"ttl": 600000}'

# Clear cache if needed
curl -X POST http://localhost:3003/api/config/cache/clear
```

### 2. Database Optimization

**Configuration Storage Optimization**:
```bash
# Analyze S3 access patterns
aws s3api get-bucket-analytics-configuration --bucket myrecruiter-picasso

# Optimize S3 request patterns
aws s3api put-bucket-request-payment --bucket myrecruiter-picasso --request-payment-configuration Payer=BucketOwner
```

### 3. Memory Management

**Memory Monitoring**:
```bash
# Check memory usage
curl -s http://localhost:3003/api/monitoring/system/memory

# Analyze memory leaks
npm run monitor:memory-leaks

# Force garbage collection (if needed)
curl -X POST http://localhost:3003/api/system/gc
```

---

## Security Operations

### 1. Daily Security Checks

```bash
# Check for security events
grep "SECURITY" /var/log/bers/security.log | grep "$(date +%Y-%m-%d)"

# Validate access controls
npm run security:validate-access

# Check for suspicious access patterns
npm run security:analyze-access-patterns
```

### 2. Security Configuration

**Environment-Specific Security**:
- **Development**: URL parameter detection allowed (localhost only)
- **Staging**: Production-like security with additional logging
- **Production**: Full security hardening, no URL parameter detection

**Security Settings Validation**:
```bash
# Validate security configuration
curl -s http://localhost:3003/api/security/config/validate

# Check encryption status
curl -s http://localhost:3003/api/security/encryption/status

# Verify access control rules
curl -s http://localhost:3003/api/security/access-control/validate
```

### 3. Audit and Compliance

**Daily Audit Tasks**:
```bash
# Generate daily audit report
npm run audit:daily

# Check compliance status
npm run compliance:check

# Export audit logs
npm run audit:export --date=$(date +%Y-%m-%d)
```

---

## Configuration Management

### 1. Configuration Updates

**Safe Configuration Update Process**:
1. Validate new configuration locally
2. Deploy to development environment
3. Run integration tests
4. Deploy to staging environment
5. Run full validation suite
6. Deploy to production with monitoring

```bash
# Validate configuration locally
npm run config:validate --file=new-config.json

# Deploy configuration to development
npm run config:deploy:development --file=new-config.json

# Deploy configuration to staging
npm run config:deploy:staging --file=new-config.json

# Deploy configuration to production
npm run config:deploy:production --file=new-config.json
```

### 2. Schema Management

**Schema Update Process**:
```bash
# Validate new schema
npm run schema:validate --schema=new-schema.json

# Test schema compatibility
npm run schema:compatibility-test --schema=new-schema.json

# Deploy schema update
npm run schema:deploy --schema=new-schema.json
```

### 3. Environment Configuration

**Environment-Specific Operations**:
```bash
# Get current environment configuration
curl -s http://localhost:3003/api/config/environment/current

# Update environment configuration
curl -X PUT http://localhost:3003/api/config/environment \
  -H "Content-Type: application/json" \
  -d @new-environment-config.json

# Validate environment configuration
curl -s http://localhost:3003/api/config/environment/validate
```

---

## Backup and Recovery

### 1. Backup Procedures

**Daily Backup (02:00 UTC)**:
```bash
# Backup configuration data
aws s3 sync s3://myrecruiter-picasso s3://myrecruiter-picasso-backup/$(date +%Y-%m-%d)/

# Backup monitoring data
npm run backup:monitoring-data

# Backup system configuration
npm run backup:system-config
```

**Weekly Full Backup (Sunday 01:00 UTC)**:
```bash
# Complete system backup
npm run backup:full

# Verify backup integrity
npm run backup:verify

# Test recovery procedures
npm run backup:test-recovery
```

### 2. Recovery Procedures

**Configuration Recovery**:
```bash
# List available backups
aws s3 ls s3://myrecruiter-picasso-backup/

# Restore from specific backup
npm run restore:configuration --backup-date=2025-08-01

# Validate restored configuration
npm run config:validate:all
```

**System Recovery**:
```bash
# Full system restore
npm run restore:full --backup-date=2025-08-01

# Verify system functionality
npm run test:post-recovery

# Resume normal operations
npm run system:resume-normal
```

---

## Scaling Operations

### 1. Horizontal Scaling

**Scaling Triggers**:
- Environment detection requests >1000/minute
- Configuration resolution requests >500/minute
- Response time >200ms sustained
- Error rate >2%

**Scaling Commands**:
```bash
# Scale monitoring system
npm run scale:monitoring --instances=3

# Scale configuration management
npm run scale:config-management --instances=2

# Monitor scaling effects
npm run monitor:scaling-effects
```

### 2. Vertical Scaling

**Resource Monitoring**:
```bash
# Check current resource usage
curl -s http://localhost:3003/api/monitoring/resources

# Analyze resource trends
npm run analyze:resource-trends --period=7d

# Recommend scaling actions
npm run recommend:scaling
```

### 3. Performance Tuning

**Optimization Areas**:
- Cache sizes and TTL values
- S3 request patterns
- Memory allocation
- GC tuning
- Network optimizations

---

## Troubleshooting Guide

### 1. Environment Detection Issues

**Symptom**: Environment detection failing or returning incorrect results

**Diagnostic Steps**:
```bash
# Test environment detection manually
node -e "
const { environmentResolver } = require('./src/config/environment-resolver');
environmentResolver.detectEnvironment().then(console.log).catch(console.error);
"

# Check environment variables
env | grep -E "(NODE_ENV|PICASSO_ENV|VITE_)"

# Validate hostname detection
curl -s http://localhost:3003/api/environment/hostname-detection
```

**Common Fixes**:
- Verify environment variables are set correctly
- Check hostname patterns for production environments
- Validate URL parameters (development only)
- Clear environment detection cache

### 2. Configuration Loading Issues

**Symptom**: Configuration loading slow or failing

**Diagnostic Steps**:
```bash
# Test S3 connectivity
aws s3 ls s3://myrecruiter-picasso/tenants/ --region us-east-1

# Check configuration validation
npm run test:config-validation

# Monitor configuration loading performance
curl -s "http://localhost:3003/api/monitoring/metrics/configuration_resolution_time?period=10m"
```

**Common Fixes**:
- Verify S3 bucket permissions
- Check network connectivity to S3
- Validate configuration schema
- Clear configuration cache

### 3. Provider Integration Issues

**Symptom**: Providers not initializing or performing poorly

**Diagnostic Steps**:
```bash
# Check provider health
curl -s http://localhost:3003/api/monitoring/health/providers

# Test provider initialization
npm run test:provider-integration

# Monitor provider performance
curl -s "http://localhost:3003/api/monitoring/metrics/provider_initialization_time?period=10m"
```

**Common Fixes**:
- Restart provider services
- Check provider configuration injection
- Validate environment-specific settings
- Review provider dependency status

### 4. Performance Issues

**Symptom**: System performance below targets

**Diagnostic Steps**:
```bash
# Comprehensive performance analysis
npm run performance:analyze

# Check for bottlenecks
curl -s http://localhost:3003/api/monitoring/bottlenecks

# Review resource utilization
curl -s http://localhost:3003/api/monitoring/resources
```

**Common Fixes**:
- Optimize cache settings
- Scale system components
- Tune garbage collection
- Review database query patterns

---

## Contact Information

### Escalation Procedures

**Level 1 - Operations Team**
- Response Time: <15 minutes
- Contact: operations@company.com
- Coverage: 24/7

**Level 2 - Engineering Team**  
- Response Time: <30 minutes
- Contact: engineering@company.com
- Coverage: Business hours + on-call

**Level 3 - BERS Development Team**
- Response Time: <1 hour
- Contact: bers-team@company.com
- Coverage: On-call rotation

### Emergency Contacts

**Critical System Issues**:
- Primary: +1-XXX-XXX-XXXX
- Secondary: +1-XXX-XXX-XXXX
- Escalation: engineering-lead@company.com

**Security Incidents**:
- Security Team: security@company.com
- Security Hotline: +1-XXX-XXX-XXXX

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-08-02  
**Next Review**: 2025-09-02  
**Owner**: BERS Operations Team