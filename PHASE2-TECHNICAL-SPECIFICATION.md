# PHASE 2 TECHNICAL SPECIFICATION
## PICASSO Unified Coordination Architecture - Security & Compliance Implementation

**Version:** 1.0  
**Date:** August 11, 2025  
**Status:** Ready for Implementation  
**Scope:** Phase 2 Implementation Only (Days 3-4 of PRD)

---

## Executive Summary

This document defines the exact technical requirements for Phase 2 of the PICASSO unified coordination architecture. Based on analysis of current Lambda functions and PRD requirements, we identify precisely what needs to be built - no more, no less.

## Current State Analysis

### ✅ Already Implemented (Phase 1 Complete)
- **Server-side tenant inference**: Implemented via `tenant_config_loader.py` with hash validation
- **Conversation state clearing**: Infrastructure exists via DynamoDB TTL and table structure
- **Function URLs**: Deployed with AuthType: NONE and JWT coordination
- **Two-table DynamoDB architecture**: ConversationSummariesTable (7d TTL) + RecentMessagesTable (24h TTL)

### ❌ Missing Phase 2 Requirements
Based on PRD lines 316-323 and line 87, we need to implement:
1. **Cross-tenant isolation monitoring** 
2. **Audit logging system**

---

## Phase 2 Requirements Definition

### 1. Cross-Tenant Isolation Monitoring
**PRD Requirement**: "Implement cross-tenant isolation monitoring" (line 319)  
**Success Metric**: "0% cross-tenant access" (line 84)

#### Technical Definition
Cross-tenant isolation monitoring is **basic security event detection and alerting**, not a complex monitoring dashboard. The PRD focuses on "0% cross-tenant access" verification, meaning:

- Detect when a tenant hash attempts to access another tenant's data
- Log security events when cross-tenant access is attempted  
- Alert operations when isolation violations occur
- Track isolation success rate (target: 0% violations succeed)

#### What TO Build
1. **Security Event Detection Logic**
   - Function to detect when tenant A's hash tries to access tenant B's config/data
   - Validation that resolved tenant_id matches expected tenant for the hash
   - Detection of hash manipulation attempts

2. **Security Event Logging**  
   - Structured CloudWatch logs for security events
   - Integration with existing `log_security_event()` function in `tenant_config_loader.py`

3. **CloudWatch Metrics and Alarms**
   - Custom metric: `CrossTenantAccessAttempts` 
   - Alarm triggers when any cross-tenant access detected
   - Basic metric tracking for "0% cross-tenant access" verification

#### What NOT to Build
- ❌ Complex monitoring dashboards
- ❌ Real-time security visualization tools  
- ❌ Advanced threat detection systems
- ❌ User interfaces for security monitoring
- ❌ Integration with third-party security tools

### 2. Audit Logging System
**PRD Requirement**: "Create audit logging system" (line 321)  
**Success Metric**: "100% of operations logged for compliance review" (line 87)

#### Technical Definition
The audit logging system is **basic compliance logging** for healthcare requirements, not a comprehensive audit platform. The PRD specifies "100% of operations logged" for compliance review.

#### What TO Build
1. **Audit Event Logging Functions**
   - Function to log all config access attempts (success/failure)
   - Function to log all chat operations with tenant context
   - Function to log all data purging operations
   - Function to log all JWT token generation events

2. **Structured Audit Logs**
   - Standardized audit log format for CloudWatch
   - Include: timestamp, tenant_id, operation_type, source_ip, user_agent, result
   - Comply with healthcare audit trail requirements

3. **Audit Log Retention**
   - Configure CloudWatch log retention for compliance requirements
   - Ensure audit logs are preserved separately from application logs

#### What NOT to Build  
- ❌ Audit log analysis tools
- ❌ Compliance reporting dashboards
- ❌ Audit log search interfaces
- ❌ Integration with external audit systems
- ❌ Advanced audit analytics or correlation

---

## Technical Implementation Specifications

### Cross-Tenant Isolation Monitoring Implementation

#### File: `lambda-review/security_monitor.py` (NEW)
```python
"""
Basic cross-tenant isolation monitoring for PICASSO Phase 2
Focuses on detection and logging, not advanced monitoring dashboards
"""

def log_cross_tenant_violation(attempted_hash, actual_tenant_id, operation_type):
    """Log when cross-tenant access is attempted"""
    
def log_unauthorized_access_attempt(tenant_hash, operation_type, details):
    """Log unauthorized access attempts with context"""
    
def log_invalid_hash_attempt(tenant_hash):
    """Log attempts with invalid tenant hash format"""
    
def send_isolation_metrics():
    """Send basic metrics to CloudWatch for alerting"""
```

#### Integration Points
- **tenant_config_loader.py**: Already has `log_security_event()` - enhance to use new security_monitor
- **lambda_function.py**: Add cross-tenant validation calls at request entry points
- **CloudFormation template**: Add CloudWatch alarm for cross-tenant access detection

### Audit Logging System Implementation

#### File: `lambda-review/audit_logger.py` (NEW)
```python
"""
Basic audit logging for PICASSO Phase 2 compliance
Focuses on structured logging, not audit analysis tools  
"""

def log_config_access(tenant_hash, source_ip, success, details):
    """Log all config access attempts for audit trail"""
    
def log_chat_operation(tenant_hash, operation_type, source_ip):
    """Log chat operations with tenant context"""
    
def log_data_purge_operation(tenant_hash, operation_type, data_cleared):
    """Log data purging operations for compliance"""
    
def log_jwt_operation(tenant_hash, token_purpose, source_ip):
    """Log JWT token generation for audit trail"""
```

#### Integration Points  
- **lambda_function.py**: Add audit logging calls to all major operations
- **tenant_config_loader.py**: Add audit logging to config access functions
- **jwt_coordination.py**: Add audit logging to token generation

---

## Implementation Tasks

### Task 1: Cross-Tenant Isolation Monitoring
**Estimated Time**: 4 hours
**Files to Create**: `lambda-review/security_monitor.py`
**Files to Modify**: `lambda-review/lambda_function.py`, `lambda-review/tenant_config_loader.py`

1. Create security_monitor.py with basic cross-tenant detection functions
2. Integrate security monitoring into existing validation points
3. Add CloudWatch metrics for isolation violation tracking
4. Test cross-tenant access detection with invalid hashes

### Task 2: Audit Logging System  
**Estimated Time**: 4 hours
**Files to Create**: `lambda-review/audit_logger.py`
**Files to Modify**: `lambda-review/lambda_function.py`, `lambda-review/tenant_config_loader.py`

1. Create audit_logger.py with structured logging functions
2. Add audit logging calls to all major operations (config, chat, JWT, purge)
3. Configure CloudWatch log retention for audit compliance
4. Test audit log generation across all operation types

### Task 3: CloudWatch Infrastructure  
**Estimated Time**: 2 hours
**Files to Modify**: `lambda-review/infrastructure/template.yaml`

1. Add CloudWatch alarm for cross-tenant access detection
2. Configure audit log retention policies
3. Add CloudWatch custom metrics for security monitoring
4. Test alarm triggering with simulated violations

---

## Success Criteria

### Cross-Tenant Isolation Monitoring
- ✅ Security events logged when cross-tenant access attempted
- ✅ CloudWatch alarm triggers on any isolation violation
- ✅ Metric shows 0% successful cross-tenant access attempts
- ✅ Integration with existing tenant validation logic

### Audit Logging System
- ✅ All config access operations logged with full context
- ✅ All chat operations logged with tenant identification  
- ✅ All JWT operations logged for compliance review
- ✅ Structured logs available in CloudWatch for compliance review

### Business Goals Achieved
- ✅ **Healthcare-grade security**: Basic monitoring detects isolation violations
- ✅ **Compliance requirements**: 100% operation logging for audit review
- ✅ **0% cross-tenant access**: Monitoring verifies isolation effectiveness

---

## What This Implementation Does NOT Include

### Explicitly Out of Scope
- **Complex security dashboards**: Basic CloudWatch alarms only
- **Real-time monitoring UI**: Compliance logging focus, not operations tools
- **Advanced threat detection**: Simple violation detection only
- **Audit analysis tools**: Structured logs only, no analysis features
- **Third-party integrations**: Self-contained CloudWatch solution only

### Why These Limitations
The PRD specifies basic security monitoring for compliance, not a production-grade healthcare audit system. This Phase 2 implementation:
- Meets PRD success metrics exactly: "0% cross-tenant access" and "100% operations logged"
- Provides foundation for Phase 3 user experience integration
- Maintains lean scope aligned with 7-day project timeline
- Focuses on security compliance, not operational convenience

---

## Integration with Existing Code

### Current Security Implementation (KEEP)
- `tenant_config_loader.py` hash validation: **Enhanced, not replaced**
- `lambda_function.py` security context: **Enhanced with audit logging**
- CloudWatch logging: **Enhanced with structured audit logs**

### Phase 3 Preparation
This Phase 2 implementation provides the security foundation for Phase 3 user experience integration:
- Security monitoring enables safe frontend updates
- Audit logging supports compliance during user experience changes  
- Cross-tenant isolation verification ensures safe multi-tenant features

---

## Validation Plan

### Security Testing
1. **Cross-tenant access attempts**: Test with invalid hashes, verify detection
2. **Isolation violation simulation**: Attempt unauthorized config access, verify logging
3. **CloudWatch alarm testing**: Trigger alarm with simulated violations

### Audit Compliance Testing  
1. **Operation coverage**: Verify all major operations generate audit logs
2. **Log structure validation**: Ensure logs meet compliance format requirements
3. **Retention verification**: Confirm audit logs preserved per healthcare requirements

### Integration Testing
1. **Existing functionality**: Verify no regression in current tenant validation
2. **Performance impact**: Ensure monitoring/logging doesn't impact response times  
3. **Error handling**: Verify graceful degradation if monitoring components fail

---

## Risk Assessment

### Low Risk Items
- **Security monitoring**: Enhances existing validation, doesn't replace it
- **Audit logging**: Additive functionality, no breaking changes
- **CloudWatch integration**: Standard AWS service, well-established patterns

### Mitigation Strategies
- **Graceful degradation**: Monitoring failures don't impact core functionality
- **Minimal performance impact**: Async logging and efficient monitoring code
- **Rollback capability**: All changes are additive, easily reversible

---

**Document Status**: Approved for Phase 2 Implementation  
**Implementation Timeline**: 10 hours total (2 developers × 5 hours each)  
**Success Definition**: PRD Phase 2 requirements met exactly - no scope creep

This specification provides the precise technical requirements needed to complete Phase 2, ensuring we build exactly what the PRD specifies for healthcare compliance and security monitoring.