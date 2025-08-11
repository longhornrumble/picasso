# PICASSO Lean Audit System

A production-ready, PII-free audit logging system designed for SaaS compliance and security monitoring.

## Overview

This lean audit system replaces over-engineered healthcare-grade solutions with a practical, business-appropriate approach that provides:

- **Zero PII Storage** - Automatic redaction with metadata-only logging
- **High Performance** - <10ms logging overhead per operation
- **SaaS Compliance** - 90-day default retention (configurable up to 1 year)
- **Security Focus** - Immutable audit trail with encryption
- **Cost Effective** - Pay-per-request DynamoDB with automatic TTL cleanup

## Key Features

### PII-Free Principles
- No conversation text, names, emails, phone numbers stored
- Regex-based PII detection and redaction before storage
- Metadata-only logging for security/debugging/compliance
- SHA-256 integrity hashing for tamper detection

### Event Categories
- **Authentication & Tenant Events**: JWT validation, tenant inference
- **Security Events**: Cross-tenant attempts, rate limiting, unauthorized access
- **State Management**: Clear operations with performance tracking
- **Handoff Events**: Secure form handoffs and completions

### Performance Targets
- <10ms logging overhead per operation
- <200ms state clear execution
- <500ms query latency for compliance reporting

## Files Overview

| File | Purpose |
|------|---------|
| `audit_logger.py` | Core audit logger with PII redaction |
| `tenant_inference.py` | Updated with audit integration |
| `lambda_function.py` | Updated with audit calls |
| `state_clear_handler.py` | Example audit integration |
| `create_audit_table.py` | DynamoDB table creation |
| `test_audit_system.py` | Comprehensive test suite |

## Data Model

### DynamoDB Table: `picasso-audit-{env}`

```
Partition Key: tenant_hash (SHA-256 of tenant ID)
Sort Key: timestamp_event_id (YYYYMMDDTHHMMSS_evt_XXXX)

Attributes:
- event_type: String (AUTH_JWT_GENERATED, SECURITY_UNAUTHORIZED_ACCESS, etc.)
- session_id: String (session identifier)
- timestamp: String (ISO 8601 format)
- context: String (JSON of operational metadata)
- severity: String (LOW | MEDIUM | HIGH | CRITICAL)
- retention_expires_at: Number (TTL for automatic cleanup)
- integrity_hash: String (SHA-256 for tamper detection)
- environment: String (staging/production)
```

## Quick Start

### 1. Environment Setup

Set required environment variables:
```bash
export ENVIRONMENT=staging  # or production
export AWS_REGION=us-east-1
```

### 2. Create DynamoDB Table

```bash
cd lambda-review
python3 create_audit_table.py create
```

Verify table creation:
```bash
python3 create_audit_table.py verify
```

### 3. Test the System

Run comprehensive tests:
```bash
python3 test_audit_system.py
```

### 4. Deploy Lambda Functions

The audit logger is automatically integrated when you deploy the lambda functions:

```bash
# Your existing deployment process
./deploy-lambda-update.sh
```

## Event Types Reference

### Authentication & Tenant Events (LOW-MEDIUM Severity)
```python
# JWT Events
audit_logger.log_jwt_generated(tenant_id, session_id, purpose, expires_in)
audit_logger.log_jwt_validated(tenant_id, session_id, jwt_purpose, source)
audit_logger.log_jwt_invalid(tenant_id, session_id, error_type, source_ip)

# Tenant Events
audit_logger.log_tenant_inferred(tenant_id, session_id, inference_method, matched_value)
audit_logger.log_tenant_inference_failed(tenant_id, session_id, failure_reason, source_ip)
```

### Security Events (HIGH-CRITICAL Severity)
```python
# Security Violations
audit_logger.log_cross_tenant_attempt(tenant_id, session_id, attempted_tenant, source_ip)
audit_logger.log_rate_limit_triggered(tenant_id, session_id, source_ip, limit_type, current_count)
audit_logger.log_unauthorized_access(tenant_id, session_id, resource, action, source_ip, reason)
```

### State Management (MEDIUM Severity)
```python
# State Operations
audit_logger.log_state_clear_requested(tenant_id, session_id, clear_type, requester_ip)
audit_logger.log_state_clear_completed(tenant_id, session_id, clear_type, items_cleared, duration_ms)
audit_logger.log_state_clear_failed(tenant_id, session_id, clear_type, error_type)
```

## Integration Examples

### Basic Audit Logging
```python
from audit_logger import audit_logger

# Log successful tenant inference
audit_logger.log_tenant_inferred(
    tenant_id='tenant_abc123',
    session_id='sess_xyz789',
    inference_method='jwt_token',
    matched_value='jwt_payload'
)

# Log security event
audit_logger.log_unauthorized_access(
    tenant_id='unknown',
    session_id=request_id,
    resource='config',
    action='get_config',
    source_ip=source_ip,
    reason='missing_tenant_hash'
)
```

### Compliance Queries
```python
from audit_logger import audit_logger

# Query recent events for a tenant
events = audit_logger.query_events_by_tenant(
    tenant_id='tenant_abc123',
    hours_back=24,
    event_types=['SECURITY_UNAUTHORIZED_ACCESS', 'AUTH_JWT_INVALID']
)

# Get security summary
summary = audit_logger.get_security_summary(
    tenant_id='tenant_abc123',
    hours_back=24
)
```

## Security Controls

### PII Detection Patterns
- Email addresses: `user@domain.com` → `[REDACTED_EMAIL]`
- Phone numbers: `(555) 123-4567` → `[REDACTED_PHONE]`
- SSN: `123-45-6789` → `[REDACTED_SSN]`
- Credit cards: `4532-1234-5678-9012` → `[REDACTED_CREDIT_CARD]`
- Conversation content: Detected by keywords → `[REDACTED_CONVERSATION]`

### Hashing Strategy
- Tenant IDs: `SHA-256(tenant_id + environment)[:16]`
- Source IPs: `SHA-256(source_ip + environment)[:8]`
- User agents: `SHA-256(user_agent + environment)[:8]`

### Data Retention
- Default: 90 days (automatic TTL cleanup)
- Maximum: 365 days for compliance requirements
- Configurable per event type if needed

## Monitoring and Alerting

### CloudWatch Metrics
- `PICASSO/Audit/{env}/AuditEventsLogged`
- `PICASSO/Audit/{env}/AuditWriteFailures`
- `PICASSO/Audit/{env}/AuditLogDuration`
- `PICASSO/Audit/{env}/AuditSystemFailures`

### Performance Monitoring
- Automatic performance tracking for >10ms operations
- Buffered metric sending to avoid API limits
- Duration tracking for state operations

## Compliance Features

### Audit Trail Properties
- **Immutable**: Write-once DynamoDB items with condition expressions
- **Integrity**: SHA-256 hashing for tamper detection
- **Encrypted**: Server-side encryption with KMS
- **Searchable**: Event type index for compliance queries
- **Retention**: Automatic TTL-based cleanup

### Compliance Queries
```python
# Security events for compliance report
security_events = audit_logger.query_events_by_tenant(
    tenant_id='tenant_123',
    hours_back=168,  # 7 days
    event_types=[
        'SECURITY_UNAUTHORIZED_ACCESS',
        'SECURITY_CROSS_TENANT_ATTEMPT',
        'SECURITY_RATE_LIMIT_TRIGGERED'
    ]
)

# Generate security summary
summary = audit_logger.get_security_summary('tenant_123', hours_back=24)
```

## Production Deployment

### Prerequisites
1. DynamoDB table created with proper permissions
2. Lambda functions have audit logging permissions
3. CloudWatch metrics namespace configured
4. Environment variables set correctly

### IAM Permissions Required
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:PutItem",
                "dynamodb:Query",
                "dynamodb:DescribeTable"
            ],
            "Resource": "arn:aws:dynamodb:*:*:table/picasso-audit-*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "cloudwatch:PutMetricData"
            ],
            "Resource": "*"
        }
    ]
}
```

### Deployment Steps
1. Create DynamoDB table: `python3 create_audit_table.py create`
2. Run tests: `python3 test_audit_system.py`
3. Deploy Lambda functions with updated code
4. Verify audit logging in CloudWatch
5. Set up CloudWatch alarms for critical events

## Troubleshooting

### Common Issues

**Audit events not appearing in DynamoDB**
- Check IAM permissions for Lambda function
- Verify table name matches environment
- Check CloudWatch logs for error messages

**PII showing up in audit logs**
- Review PII patterns in `audit_logger.py`
- Add custom patterns as needed
- Test with `test_audit_system.py`

**Performance issues**
- Check metric: `AuditLogDuration`
- Verify DynamoDB capacity (should be pay-per-request)
- Review batching configuration

**High costs**
- Check retention settings (default 90 days)
- Verify TTL is enabled for automatic cleanup
- Review event frequency and filtering

### Debug Mode
```python
import os
os.environ['AUDIT_DEBUG'] = 'true'

# This will add verbose logging without storing debug data
```

## Migration from Old System

If migrating from a previous audit system:

1. **Backup existing audit data** before switching
2. **Run parallel systems** for validation period
3. **Update all audit calls** to use new `audit_logger`
4. **Verify compliance queries** return expected data
5. **Decommission old system** after validation

## Cost Estimation

For a typical SaaS application:
- **DynamoDB**: ~$0.25 per million write requests
- **Storage**: ~$0.25 per GB-month (with TTL cleanup)
- **Typical cost**: $5-20/month for small-medium SaaS

This is significantly cheaper than healthcare-grade audit systems while providing appropriate compliance coverage.

## Support and Maintenance

### Regular Maintenance
- Monitor CloudWatch metrics weekly
- Review security event summaries monthly
- Validate PII redaction quarterly
- Update event patterns as needed

### Scaling Considerations
- DynamoDB automatically scales with pay-per-request
- Consider enabling DynamoDB Accelerator (DAX) for high-query workloads
- Review partition key distribution if needed

For questions or issues, review the test suite output and CloudWatch logs first.