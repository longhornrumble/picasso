# PICASSO Tenant Inference System - Test Suite

## Overview

This comprehensive test suite validates the PICASSO tenant inference system for healthcare-grade production readiness. The system implements bulletproof security hardening with fail-closed behavior, comprehensive audit logging, and performance optimization for healthcare environments.

## Test Coverage

The test suite provides **90%+ code coverage** with the following test categories:

### 1. Unit Tests (`test_*.py`)
- **JWT Validation** (`test_jwt_validation.py`): 25+ test cases covering token validation, expiry, claims verification, and security hardening
- **Host/Origin Normalization** (`test_host_origin_normalization.py`): IDN support, protocol handling, security validation
- **Path Validation** (`test_path_validation.py`): Path traversal protection, character validation, length limits
- **Tenant Registry** (`test_tenant_registry.py`): S3 loading, caching strategy, graceful degradation

### 2. Integration Tests (`test_tenant_inference_integration.py`)
- Full `resolveTenant` function workflow
- Token→Host→Origin→Path→Config precedence order
- Cross-tenant isolation validation
- End-to-end inference scenarios

### 3. Security Tests (`test_security_features.py`)
- Rate limiting (10 failures per 5-minute window)
- Fail-closed security behavior
- Attack prevention (XSS, SQL injection, path traversal)
- Timing attack resistance
- Zero-trust security model

### 4. Performance Tests (`test_performance.py`)
- **<50ms inference latency** requirement validation
- Concurrent load testing
- Memory usage optimization
- Cold start performance
- Scalability stress testing

### 5. Healthcare Compliance Tests (`test_healthcare_compliance.py`)
- HIPAA-compliant audit logging
- PHI (Protected Health Information) protection
- Healthcare security standards
- Compliance documentation requirements

### 6. Error Handling Tests (`test_error_handling.py`)
- AWS service failures (S3, Secrets Manager, CloudWatch)
- Data corruption handling
- Resource exhaustion protection
- Concurrency and race condition testing
- Edge case input validation

## Test Configuration

### Requirements
```bash
# Install test dependencies
pip install -r tests/requirements.txt
```

### Key Dependencies
- `pytest>=7.4.0` - Core testing framework
- `pytest-cov>=4.1.0` - Coverage reporting
- `moto>=4.2.0` - AWS service mocking
- `PyJWT>=2.8.0` - JWT token testing
- `pytest-benchmark>=4.0.0` - Performance testing

## Running Tests

### Quick Start
```bash
# Run basic test suite
make test

# Run complete test suite with coverage
make test-all

# Generate coverage report
make coverage-html
```

### Test Categories
```bash
# Unit tests only
make test-unit

# Integration tests
make test-integration

# Security tests
make test-security

# Performance tests (validates <50ms requirement)
make test-performance

# Healthcare compliance tests
make test-healthcare

# Critical path tests (must always pass)
make test-critical
```

### Healthcare-Specific Testing
```bash
# HIPAA compliance validation
make test-hipaa

# Audit logging validation
make test-audit

# Fail-closed security behavior
make test-fail-closed

# Rate limiting functionality
make test-rate-limit
```

### Production Readiness Validation
```bash
# Complete healthcare validation
make validate-healthcare

# Security validation
make validate-security

# Performance validation
make validate-performance

# Full production readiness check
make validate-production
```

## Test Markers

Tests are categorized using pytest markers:

- `@pytest.mark.unit` - Individual function tests
- `@pytest.mark.integration` - Full workflow tests  
- `@pytest.mark.security` - Security hardening tests
- `@pytest.mark.performance` - Performance requirement tests
- `@pytest.mark.healthcare` - Healthcare compliance tests
- `@pytest.mark.critical` - Critical path tests
- `@pytest.mark.audit` - Audit logging tests
- `@pytest.mark.slow` - Tests taking >5 seconds

## Test Data Fixtures

### Healthcare Scenarios (`fixtures.py`)
- **Medical Centers**: Large hospitals with multiple departments
- **Multi-Clinic Groups**: Independent clinic networks
- **Specialty Providers**: Cardiology, oncology, pediatrics, mental health
- **Emergency Services**: Triage systems, trauma centers
- **Telehealth**: Remote consultation systems

### Security Testing
- **Malicious Events**: Path traversal, SQL injection, XSS attacks
- **DDoS Simulation**: High-volume attack patterns
- **JWT Manipulation**: Token tampering attempts
- **Healthcare Threats**: Medical record enumeration, EHR probing

### Performance Testing
- **High Load Events**: 1000+ concurrent requests
- **Concurrent Users**: Multi-user simulation
- **Stress Testing**: Resource exhaustion scenarios

## Coverage Requirements

### Minimum Coverage Thresholds
- **Overall Coverage**: 90%
- **Critical Functions**: 95%
- **Security Functions**: 100%
- **Healthcare Compliance**: 100%

### Coverage Reports
```bash
# Generate HTML coverage report
make coverage-html

# View coverage report (opens in browser)
make coverage-report
```

## CI/CD Integration

### GitHub Actions / Jenkins
```bash
# CI test suite (excludes slow tests)
make ci-test

# Security validation for CI
make ci-security

# Performance benchmarking
make ci-performance
```

### Test Reports
- **JUnit XML**: `reports/junit.xml`
- **Coverage XML**: `coverage.xml`
- **HTML Report**: `reports/pytest_report.html`
- **JSON Report**: `reports/pytest_report.json`
- **Benchmark JSON**: `reports/benchmark.json`

## Security Testing

### Attack Simulation
The test suite simulates real-world attacks:
- Path traversal attempts (`../../../etc/passwd`)
- SQL injection (`'; DROP TABLE users; --`)
- XSS attempts (`<script>alert('xss')</script>`)
- JWT manipulation (signature tampering)
- Rate limiting bypass attempts
- Healthcare-specific threats

### Security Validation
- Generic error messages (no information leakage)
- Fail-closed behavior on all error conditions
- Comprehensive audit logging
- CloudWatch metrics integration
- Zero-trust security model validation

## Performance Requirements

### Latency Requirements
- **Individual Requests**: <50ms
- **JWT Validation**: <10ms
- **Host Normalization**: <5ms
- **Path Validation**: <20ms (even with large allowed lists)

### Load Testing
- **Concurrent Users**: 50+ simultaneous requests
- **High Volume**: 1000+ requests with consistent performance
- **Memory Usage**: <100MB increase under load
- **Cold Start**: <100ms for first request

## Healthcare Compliance

### HIPAA Requirements
- Comprehensive audit logging with timestamps
- Source IP tracking and user identification
- PHI protection (no sensitive data in logs/errors)
- Secure session management (15-minute token expiry)
- Access control granularity validation

### Audit Trail
- All tenant inference attempts logged
- Security incidents tracked with unique IDs
- CloudWatch metrics for monitoring
- Structured JSON audit logs for analysis
- Retention metadata for compliance

## Debugging and Development

### Debug Mode
```bash
# Run tests with debugger
make debug

# Watch for file changes (requires pytest-watch)
make watch
```

### Verbose Output
```bash
# Detailed test output
pytest -v -s

# Show slowest tests
pytest --durations=10
```

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure the parent directory is in Python path
   ```bash
   export PYTHONPATH="${PYTHONPATH}:../lambda-review"
   ```

2. **AWS Mock Failures**: Check that `moto` is properly mocking AWS services

3. **Performance Test Failures**: May indicate system under load, run individually

4. **Coverage Below Threshold**: Check for untested edge cases or error conditions

### Test Environment
- **Python**: 3.8+
- **OS**: Linux/macOS (Windows with WSL)
- **Memory**: 4GB+ recommended for full test suite
- **CPU**: Multi-core recommended for parallel execution

## Contributing

### Adding New Tests
1. Follow the existing test structure and naming conventions
2. Use appropriate pytest markers
3. Include both positive and negative test cases
4. Add realistic healthcare scenarios to fixtures
5. Ensure security implications are tested
6. Update coverage requirements if adding critical functions

### Test Quality Standards
- **Deterministic**: Tests must be reproducible
- **Independent**: Tests should not depend on each other
- **Fast**: Individual tests should complete quickly
- **Comprehensive**: Cover both happy path and error conditions
- **Realistic**: Use healthcare-relevant test data

## Reports and Documentation

### Generated Reports
- `reports/test_summary.txt` - Overall test results
- `htmlcov/index.html` - Interactive coverage report
- `reports/pytest_report.html` - Detailed test results
- `reports/security_report.json` - Security analysis results

### Cleanup
```bash
# Remove generated files
make clean
```

## Healthcare Environment Deployment

Before deploying to a healthcare environment:

1. **Run Complete Validation**:
   ```bash
   make validate-production
   ```

2. **Verify Coverage**: Ensure 90%+ test coverage
3. **Security Review**: All security tests must pass
4. **Performance Validation**: <50ms inference requirement met
5. **Compliance Check**: HIPAA audit logging verified
6. **Documentation**: All test reports generated

The system is production-ready for healthcare environments when all validation targets pass successfully.