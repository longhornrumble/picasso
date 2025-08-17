# BERS Automated Validation Framework

This directory contains the comprehensive automated validation framework for the Build-Time Environment Resolution System (BERS) Task 3.2.

## Quick Start

Run the complete validation framework:
```bash
npm run validate:all
```

## Validation Components

### 1. End-to-End BERS Validation
**File:** `e2e-bers-validation.test.ts`
**Command:** `npm run validate:e2e`

Validates complete BERS functionality including:
- Environment detection with <100ms performance
- Configuration management and S3 integration
- Tenant configuration caching
- Runtime configuration resolution
- Error handling and resilience

### 2. Cross-Environment Compatibility
**File:** `cross-environment-compatibility.test.ts`  
**Command:** `npm run validate:cross-env`

Ensures zero configuration drift between environments:
- Development, staging, production environment detection
- Configuration consistency validation
- Security settings per environment
- API endpoint consistency
- Feature flag structure validation

### 3. Performance Regression Detection
**File:** `performance-regression-detection.test.ts`
**Command:** `npm run validate:performance`

Monitors performance against Task 3.1 baselines:
- Build time regression detection (<30s, achieved: 300ms)
- Cache performance monitoring (83% reduction achieved)
- Environment detection speed (<100ms)
- Bundle size regression tracking
- Memory usage pattern validation

### 4. Configuration Compliance & Security
**File:** `configuration-compliance-security.test.ts`
**Command:** `npm run validate:security`

Comprehensive security and compliance scanning:
- Sensitive data detection (passwords, API keys)
- Insecure protocol validation (HTTP/HTTPS)
- Configuration schema compliance
- Hot-reload functionality validation
- Environment-specific security requirements

### 5. Test Coverage Validation
**File:** `test-coverage-validation.test.ts`
**Command:** `npm run validate:coverage`

Ensures 95%+ test coverage requirements:
- Overall coverage validation (95% minimum)
- Critical module coverage (98% for environment-resolver)
- Integration scenario coverage analysis
- Test quality metrics validation

## Automated Test Runner

**File:** `run-validation-suite.js`
**Command:** `npm run validate:bers`

Comprehensive validation framework execution with:
- Real-time progress reporting
- Detailed JSON and HTML report generation
- Performance metrics collection
- Issue identification and recommendations
- CI/CD pipeline integration support

## Coverage Requirements

The framework enforces strict coverage thresholds:

```
Global Minimum: 95% (statements, branches, functions, lines)
Critical Modules: 98% (environment-resolver.ts)
Build Tools: 90% (parallel-build-manager.js, etc.)
Integration Scenarios: 95% minimum coverage
```

## Success Criteria Validation

✅ **Automated testing across all environments**
✅ **Performance baseline validation** 
✅ **Configuration security scanning**
✅ **95%+ test coverage for integration scenarios**

## Performance Baselines (from Task 3.1)

- **Build Time:** <30s (achieved: 0.08-0.30s)
- **Cache Performance:** 60% reduction target (achieved: 83%)
- **Parallel Efficiency:** 100%
- **Environment Detection:** <100ms

## Integration with CI/CD

Example GitHub Actions integration:
```yaml
- name: Run BERS Validation Framework
  run: npm run validate:bers
  
- name: Check Coverage Thresholds  
  run: npm run validate:coverage
```

## Reports and Output

Validation reports are generated in:
- `coverage/validation/validation-report.json` - Detailed JSON results
- `coverage/validation/validation-report.html` - HTML dashboard
- `coverage/` - Standard coverage reports

## Troubleshooting

### Common Issues

1. **Coverage Below Threshold:**
   ```bash
   npm run test:coverage
   # Review coverage/index.html for details
   ```

2. **Performance Regression:**
   ```bash
   npm run validate:performance
   # Check console output for specific metrics
   ```

3. **Security Violations:**
   ```bash
   npm run validate:security
   # Review configuration files for flagged patterns
   ```

### Debug Mode

Run individual test suites with verbose output:
```bash
npx vitest run tests/validation/e2e-bers-validation.test.ts --reporter=verbose
```

## Contributing

When adding new validation tests:
1. Maintain 95%+ coverage requirements
2. Include performance baseline validation
3. Add security compliance checks
4. Update this README with new test descriptions

## Support

For issues with the validation framework:
1. Check the generated HTML report for detailed diagnostics
2. Review console output for specific error messages
3. Ensure all dependencies are installed: `npm install`
4. Verify Node.js version compatibility (>=16.0.0)

---

**BERS Task 3.2 - Automated Validation Framework**  
**Implementation Date:** August 2, 2025  
**QA Automation Specialist**