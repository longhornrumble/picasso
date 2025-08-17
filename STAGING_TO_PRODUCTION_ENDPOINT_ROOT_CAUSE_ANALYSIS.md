# CRITICAL ROOT CAUSE ANALYSIS: Staging Tests Hitting Production Endpoints

**Investigation Date:** August 14, 2025  
**Analyst:** QA Automation Specialist  
**Priority:** CRITICAL - Blocking Phase 1 JWT Validation  
**Issue ID:** PICASSO-ENV-001  

## Executive Summary

**CRITICAL FINDING:** Staging builds are incorrectly calling production endpoints instead of staging endpoints, preventing validation of Phase 1 JWT token fixes, session ID consistency, and conversation continuity. This environment confusion is a systematic build process failure that must be resolved before any production deployment.

## Root Cause Analysis

### 1. Primary Root Cause: Inconsistent Environment Detection Logic

**Location:** `/src/config/environment.js` lines 35-100  
**Issue:** Environment detection relies on multiple conflicting signals that can be overridden inappropriately.

```javascript
// PROBLEMATIC: Multiple detection methods can conflict
const getEnvironment = () => {
  // URL param override (can be manipulated)
  if (envOverride && ['development', 'staging', 'production'].includes(envOverride)) {
    return envOverride;
  }
  
  // Hostname detection (unreliable for staging)
  if (hostname.includes('staging') || hostname.includes('dev')) {
    return 'staging';
  }
  
  // Defaults to production (dangerous fallback)
  return 'production';
};
```

**Impact:** Staging deployments can inadvertently be detected as production, causing staging widgets to call production endpoints.

### 2. Secondary Root Cause: Build-Time vs Runtime Environment Resolution

**Location:** `vite.config.js` lines 126-129  
**Issue:** Environment variables are not properly injected during build time for staging deployments.

```javascript
define: {
  'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
  __PICASSO_VERSION__: JSON.stringify(process.env.npm_package_version || '2.0.0'),
},
```

**Impact:** Staging builds use the same `NODE_ENV=production` as production builds, causing identical endpoint configuration.

### 3. Tertiary Root Cause: Widget Script Path Detection Inconsistency

**Location:** `current-widget.js` lines 181-220  
**Issue:** Widget script detection logic for staging is fragile and can fail silently.

```javascript
// FRAGILE: Relies on script src containing '/staging/'
const isStaging = currentScriptSrc.includes('/staging/') || !!stagingScript;
```

**Impact:** If staging script detection fails, widgets default to production mode even in staging environment.

### 4. Configuration Endpoint Hardcoding

**Location:** `/src/config/environment.js` lines 128-141  
**Issue:** Staging configuration attempts to use separate staging endpoints but environment detection failure causes fallback to production.

```javascript
staging: {
  // SECURITY: Staging-only endpoints - NEVER touch production
  CONFIG_ENDPOINT: 'https://staging-api.myrecruiter.ai/Master_Function?action=get_config',
  CHAT_ENDPOINT: 'https://staging-api.myrecruiter.ai/Master_Function?action=chat',
}
```

**Impact:** When environment detection fails, staging widgets use production endpoints, contaminating production with test data.

## Evidence of Environment Confusion

### 1. Build Process Analysis

**File:** `deploy-staging.sh` lines 24-32  
**Finding:** Staging deployment runs `npm run build:production` which sets `NODE_ENV=production`, causing staging and production builds to be identical.

```bash
echo -e "${YELLOW}📦 Step 1: Building production bundle...${NC}"
npm run build:production  # PROBLEM: Uses production mode for staging
```

### 2. Asset Path Confusion

**File:** `fix-staging-paths.js` lines 14-16  
**Finding:** Staging asset paths are fixed post-build rather than being environment-aware during build.

```javascript
// POST-BUILD FIX: Should be handled during build
html = html.replace(/src="\/assets\//g, 'src="/staging/assets/');
```

### 3. Iframe Loading Inconsistency

**File:** `widget-frame.html` line 156  
**Finding:** Iframe loads from generic path that doesn't guarantee staging vs production isolation.

```html
<!-- Vite will replace this with the built assets -->
<script type="module" src="/src/iframe-main.jsx"></script>
```

## Critical Failures Identified

### 1. Environment Detection Failures
- **Staging detection can be bypassed** by URL parameters or hostname variations
- **Runtime detection conflicts** with build-time configuration
- **Fallback behavior defaults to production** instead of failing safely

### 2. Build Process Failures
- **Staging and production builds are identical** except for post-build path fixing
- **No build-time validation** of environment-specific endpoints
- **Asset path resolution happens after build** instead of during build

### 3. Deployment Process Failures
- **No pre-deployment validation** of endpoint configuration
- **Post-deployment verification missing** for environment isolation
- **No monitoring** for cross-environment endpoint calls

### 4. Configuration Flow Failures
- **Tenant config loading uses runtime-detected endpoints** which can be wrong
- **No validation** that staging configs only call staging endpoints
- **No circuit breaker** for cross-environment calls

## Impact Assessment

### Phase 1 Validation Blocking Issues
1. **JWT Token Validation:** Cannot test staging JWT functionality when widgets call production endpoints
2. **Session ID Consistency:** Staging session tests contaminate production session state
3. **Conversation Continuity:** Cannot validate staging conversation fixes independently

### Production Contamination Risk
1. **Test Data in Production:** Staging tests writing to production databases
2. **Performance Impact:** Staging load testing hitting production infrastructure
3. **Security Exposure:** Staging authentication tokens tested against production systems

### Development Velocity Impact
1. **Unable to validate fixes** in staging environment
2. **False positive testing** when staging accidentally works via production
3. **Deployment confidence reduced** due to unreliable staging validation

## Immediate Remediation Required

### 1. CRITICAL: Environment-Aware Build Process
**Priority:** P0 - Must fix before any deployment

```bash
# Add environment-specific build commands
"build:staging": "NODE_ENV=production VITE_ENVIRONMENT=staging vite build",
"build:production": "NODE_ENV=production VITE_ENVIRONMENT=production vite build"
```

**Implementation:**
- Update `vite.config.js` to inject `VITE_ENVIRONMENT` variable
- Modify environment detection to prioritize build-time variables
- Add build-time validation of endpoint configuration

### 2. CRITICAL: Deployment Validation Gates
**Priority:** P0 - Must implement before next deployment

```bash
# Add pre-deployment validation
validate_staging_deployment() {
  if staging_config_calls_production_endpoints; then
    echo "❌ CRITICAL: Staging calling production - BLOCKING DEPLOYMENT"
    exit 1
  fi
}
```

**Implementation:**
- Create automated validation scripts for both deploy-staging.sh and deploy-production.sh
- Add endpoint verification tests
- Implement deployment blocking for configuration violations

### 3. CRITICAL: Runtime Monitoring
**Priority:** P0 - Must implement for immediate detection

```javascript
// Add cross-environment call detection
const originalFetch = window.fetch;
window.fetch = (url, options) => {
  if (currentEnv === 'staging' && url.includes('chat.myrecruiter.ai/Master_Function')) {
    console.error('🚨 CRITICAL: Staging calling production endpoint', url);
    // Alert system integration here
  }
  return originalFetch(url, options);
};
```

## Long-term Architecture Improvements

### 1. Build-Time Environment Injection
**Timeline:** Immediate  
**Effort:** 2-4 hours

- Modify Vite configuration to inject environment-specific endpoints at build time
- Eliminate runtime environment detection where possible
- Create environment-specific build artifacts

### 2. Deployment Pipeline Hardening
**Timeline:** 1-2 days  
**Effort:** 8-16 hours

- Add comprehensive pre-deployment validation
- Implement post-deployment verification
- Create automated rollback for environment violations

### 3. Real-Time Monitoring System
**Timeline:** 1 week  
**Effort:** 20-40 hours

- Implement cross-environment call detection
- Add automated alerting for violations
- Create environment health dashboards

### 4. Configuration Management Overhaul
**Timeline:** 2 weeks  
**Effort:** 40-80 hours

- Centralize environment configuration
- Add configuration validation at multiple layers
- Implement configuration drift detection

## Test Coverage Requirements

### 1. Environment Isolation Tests (CREATED)
**File:** `tests/environment-validation/environment-isolation-test-suite.test.js`
- ✅ Validates staging never calls production endpoints
- ✅ Validates production never calls staging endpoints
- ✅ Tests environment detection accuracy
- ✅ Validates build process environment injection

### 2. Build Process Validation Tests (CREATED)
**File:** `tests/environment-validation/build-process-validation.test.js`
- ✅ Validates Vite configuration
- ✅ Tests build artifact environment specificity
- ✅ Validates deployment script behavior
- ✅ Tests asset path resolution

### 3. Regression Prevention Framework (CREATED)
**File:** `tests/environment-validation/regression-prevention-framework.test.js`
- ✅ Deployment gate validation
- ✅ Real-time monitoring framework
- ✅ Automated alerting system
- ✅ Continuous validation pipeline

## Deployment Checklist

### Pre-Deployment (MUST COMPLETE)
- [ ] Run environment isolation test suite (MUST PASS 100%)
- [ ] Validate build process creates environment-specific artifacts
- [ ] Verify staging build calls only staging endpoints
- [ ] Verify production build calls only production endpoints
- [ ] Test widget script environment detection
- [ ] Validate iframe loading matches script environment

### Post-Deployment (MUST VERIFY)
- [ ] Monitor for cross-environment endpoint calls (0 tolerance)
- [ ] Verify staging widget functionality independently
- [ ] Validate production widget unaffected
- [ ] Confirm Phase 1 JWT testing can proceed
- [ ] Test session ID consistency in staging only
- [ ] Validate conversation continuity in staging only

## Success Criteria

### Environment Isolation (NON-NEGOTIABLE)
1. **Staging builds NEVER call production endpoints** (0% tolerance)
2. **Production builds NEVER call staging endpoints** (0% tolerance)
3. **Environment detection 100% accurate** in all scenarios
4. **Build artifacts enforced environment isolation** at build time

### Phase 1 Validation Enablement
1. **JWT token fixes testable in staging** without production impact
2. **Session ID consistency validation** isolated to staging
3. **Conversation continuity testing** independent of production
4. **Real-time monitoring prevents** future environment confusion

### Operational Excellence
1. **Automated deployment gates** prevent misconfiguration
2. **Real-time monitoring** detects violations immediately  
3. **Comprehensive test coverage** prevents regression
4. **Clear deployment procedures** eliminate human error

## Risk Assessment

### High Risk Areas
1. **Environment detection logic** - Complex with multiple fallbacks
2. **Build process configuration** - Shared between staging and production
3. **Widget script loading** - Runtime path detection fragile
4. **Tenant configuration flow** - Runtime endpoint resolution

### Mitigation Strategies
1. **Simplify environment detection** to single source of truth
2. **Build-time environment injection** eliminates runtime guessing
3. **Deployment validation gates** catch misconfigurations
4. **Real-time monitoring** provides immediate feedback

## Monitoring and Alerting

### Critical Alerts (Immediate Response Required)
1. **Cross-environment endpoint calls** - Page immediately
2. **Environment detection failures** - Alert within 1 minute
3. **Deployment gate failures** - Block deployment immediately
4. **Configuration drift** - Alert within 5 minutes

### Warning Alerts (Response Within 1 Hour)
1. **Slow environment detection** - Performance degradation
2. **Asset path resolution issues** - User experience impact
3. **Widget loading failures** - Functionality impact
4. **Tenant configuration errors** - Service disruption

## Conclusion

The staging-to-production endpoint confusion is a systematic failure in the build and deployment process that has prevented proper validation of Phase 1 fixes. The root cause is multi-faceted, involving environment detection logic, build process configuration, and deployment procedures.

**IMMEDIATE ACTION REQUIRED:**
1. Implement build-time environment injection
2. Add deployment validation gates  
3. Deploy real-time monitoring
4. Run comprehensive test suite

**SUCCESS CRITERIA:**
- 100% environment isolation enforcement
- 0% tolerance for cross-environment calls
- Phase 1 validation enabled in staging
- Automated prevention of regression

This analysis provides the foundation for resolving the environment confusion and enabling proper Phase 1 validation. The created test suites must pass 100% before any deployment to prevent recurrence of this critical issue.

---

**Next Steps:**
1. Review and approve remediation plan
2. Implement immediate fixes (1-2 days)
3. Deploy comprehensive monitoring (1 week)
4. Execute Phase 1 validation in properly isolated staging environment

**Contact:** QA Automation Specialist for implementation details and test execution.