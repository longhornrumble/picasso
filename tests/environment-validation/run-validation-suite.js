#!/usr/bin/env node

/**
 * ENVIRONMENT VALIDATION SUITE RUNNER
 * 
 * This script runs the complete environment validation test suite
 * and provides comprehensive reporting for deployment gate validation.
 * 
 * Author: QA Automation Specialist
 * Purpose: Orchestrate all environment validation tests
 * Usage: npm run test:environment-validation
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

class ValidationSuiteRunner {
  constructor() {
    this.results = {
      environmentIsolation: null,
      buildProcess: null,
      regressionPrevention: null,
      overall: null
    };
    this.startTime = Date.now();
    this.criticalIssues = [];
    this.warnings = [];
  }

  log(message, color = COLORS.RESET) {
    console.log(`${color}${message}${COLORS.RESET}`);
  }

  logSection(title) {
    this.log(`\n${'='.repeat(60)}`, COLORS.CYAN);
    this.log(`${COLORS.BOLD}${title}${COLORS.RESET}`, COLORS.CYAN);
    this.log(`${'='.repeat(60)}`, COLORS.CYAN);
  }

  logSubsection(title) {
    this.log(`\n${'-'.repeat(40)}`, COLORS.BLUE);
    this.log(title, COLORS.BLUE);
    this.log(`${'-'.repeat(40)}`, COLORS.BLUE);
  }

  addCriticalIssue(issue) {
    this.criticalIssues.push({
      ...issue,
      timestamp: new Date().toISOString()
    });
  }

  addWarning(warning) {
    this.warnings.push({
      ...warning,
      timestamp: new Date().toISOString()
    });
  }

  runTestSuite(suiteName, testFile) {
    this.logSubsection(`Running ${suiteName}`);
    
    try {
      const startTime = Date.now();
      
      // Run the test suite
      const result = execSync(`npx vitest run ${testFile} --reporter=verbose`, {
        encoding: 'utf8',
        timeout: 60000
      });
      
      const duration = Date.now() - startTime;
      
      // Parse test results (simplified - would be more robust in production)
      const passed = !result.includes('FAIL') && !result.includes('failed');
      const testCount = (result.match(/✓|×/g) || []).length;
      
      this.log(`✅ ${suiteName} completed in ${duration}ms`, COLORS.GREEN);
      this.log(`   Tests: ${testCount} | Status: ${passed ? 'PASSED' : 'FAILED'}`);
      
      return {
        name: suiteName,
        passed: passed,
        duration: duration,
        testCount: testCount,
        output: result
      };
      
    } catch (error) {
      this.log(`❌ ${suiteName} FAILED`, COLORS.RED);
      this.log(`   Error: ${error.message}`, COLORS.RED);
      
      this.addCriticalIssue({
        suite: suiteName,
        error: error.message,
        category: 'TEST_EXECUTION_FAILURE'
      });
      
      return {
        name: suiteName,
        passed: false,
        duration: 0,
        testCount: 0,
        error: error.message
      };
    }
  }

  validateEnvironmentConfiguration() {
    this.logSubsection('Pre-Test Environment Validation');
    
    const issues = [];
    
    // Check if environment.js exists and is valid
    const envConfigPath = path.join(process.cwd(), 'src', 'config', 'environment.js');
    if (!fs.existsSync(envConfigPath)) {
      issues.push('Environment configuration file missing');
    }
    
    // Check if build configuration exists
    const viteConfigPath = path.join(process.cwd(), 'vite.config.js');
    if (!fs.existsSync(viteConfigPath)) {
      issues.push('Vite configuration file missing');
    }
    
    // Check if deployment scripts exist
    const stagingDeployPath = path.join(process.cwd(), 'deploy-staging.sh');
    const prodDeployPath = path.join(process.cwd(), 'deploy-production.sh');
    
    if (!fs.existsSync(stagingDeployPath)) {
      issues.push('Staging deployment script missing');
    }
    
    if (!fs.existsSync(prodDeployPath)) {
      issues.push('Production deployment script missing');
    }
    
    if (issues.length > 0) {
      this.log('❌ Pre-test validation failed:', COLORS.RED);
      issues.forEach(issue => this.log(`   - ${issue}`, COLORS.RED));
      return false;
    }
    
    this.log('✅ Pre-test validation passed', COLORS.GREEN);
    return true;
  }

  generateDeploymentGateReport() {
    const canDeploy = this.criticalIssues.length === 0 && 
                     this.results.environmentIsolation?.passed &&
                     this.results.buildProcess?.passed &&
                     this.results.regressionPrevention?.passed;
    
    const report = {
      canDeploy: canDeploy,
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      results: this.results,
      criticalIssues: this.criticalIssues,
      warnings: this.warnings,
      recommendation: canDeploy ? 'APPROVE_DEPLOYMENT' : 'BLOCK_DEPLOYMENT',
      blockingReason: canDeploy ? null : this.generateBlockingReason()
    };
    
    return report;
  }

  generateBlockingReason() {
    const reasons = [];
    
    if (!this.results.environmentIsolation?.passed) {
      reasons.push('Environment isolation tests failed');
    }
    
    if (!this.results.buildProcess?.passed) {
      reasons.push('Build process validation failed');
    }
    
    if (!this.results.regressionPrevention?.passed) {
      reasons.push('Regression prevention tests failed');
    }
    
    if (this.criticalIssues.length > 0) {
      reasons.push(`${this.criticalIssues.length} critical issues found`);
    }
    
    return reasons.join(', ');
  }

  saveReportToFile(report) {
    const reportPath = path.join(process.cwd(), 'environment-validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Also create a human-readable summary
    const summaryPath = path.join(process.cwd(), 'environment-validation-summary.md');
    const summary = this.generateHumanReadableSummary(report);
    fs.writeFileSync(summaryPath, summary);
    
    return { reportPath, summaryPath };
  }

  generateHumanReadableSummary(report) {
    return `# Environment Validation Report

**Date:** ${report.timestamp}  
**Duration:** ${report.duration}ms  
**Deployment Status:** ${report.canDeploy ? '✅ APPROVED' : '❌ BLOCKED'}  

## Test Results Summary

| Test Suite | Status | Duration | Tests |
|------------|--------|----------|-------|
| Environment Isolation | ${report.results.environmentIsolation?.passed ? '✅ PASS' : '❌ FAIL'} | ${report.results.environmentIsolation?.duration || 0}ms | ${report.results.environmentIsolation?.testCount || 0} |
| Build Process | ${report.results.buildProcess?.passed ? '✅ PASS' : '❌ FAIL'} | ${report.results.buildProcess?.duration || 0}ms | ${report.results.buildProcess?.testCount || 0} |
| Regression Prevention | ${report.results.regressionPrevention?.passed ? '✅ PASS' : '❌ FAIL'} | ${report.results.regressionPrevention?.duration || 0}ms | ${report.results.regressionPrevention?.testCount || 0} |

## Critical Issues (${report.criticalIssues.length})

${report.criticalIssues.length === 0 ? 'None' : report.criticalIssues.map(issue => 
  `- **${issue.category}:** ${issue.error || issue.description}`
).join('\n')}

## Warnings (${report.warnings.length})

${report.warnings.length === 0 ? 'None' : report.warnings.map(warning => 
  `- **${warning.category}:** ${warning.message}`
).join('\n')}

## Deployment Recommendation

${report.canDeploy ? 
  '✅ **DEPLOYMENT APPROVED** - All environment validation tests passed' : 
  `❌ **DEPLOYMENT BLOCKED** - ${report.blockingReason}`}

## Next Steps

${report.canDeploy ? 
  '- Proceed with deployment\n- Continue monitoring post-deployment' :
  '- Fix critical issues listed above\n- Re-run validation suite\n- Do not deploy until all issues resolved'}
`;
  }

  async run() {
    console.clear();
    this.logSection('🛡️  CRITICAL ENVIRONMENT VALIDATION SUITE');
    this.log('Purpose: Prevent staging->production endpoint confusion');
    this.log('Requirement: 100% pass rate for deployment approval\n');
    
    // Pre-test validation
    if (!this.validateEnvironmentConfiguration()) {
      this.log('\n❌ VALIDATION FAILED - Environment not properly configured', COLORS.RED);
      process.exit(1);
    }
    
    // Run test suites
    this.logSection('🧪 Running Test Suites');
    
    this.results.environmentIsolation = this.runTestSuite(
      'Environment Isolation Tests',
      'tests/environment-validation/environment-isolation-test-suite.test.js'
    );
    
    this.results.buildProcess = this.runTestSuite(
      'Build Process Validation',
      'tests/environment-validation/build-process-validation.test.js'
    );
    
    this.results.regressionPrevention = this.runTestSuite(
      'Regression Prevention Framework',
      'tests/environment-validation/regression-prevention-framework.test.js'
    );
    
    // Generate final report
    this.logSection('📊 Validation Results');
    
    const report = this.generateDeploymentGateReport();
    const { reportPath, summaryPath } = this.saveReportToFile(report);
    
    // Display summary
    this.log(`\n${COLORS.BOLD}ENVIRONMENT VALIDATION SUMMARY${COLORS.RESET}`);
    this.log(`${'─'.repeat(50)}`);
    
    Object.entries(this.results).forEach(([suite, result]) => {
      if (result) {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        const color = result.passed ? COLORS.GREEN : COLORS.RED;
        this.log(`${suite}: ${status} (${result.testCount} tests, ${result.duration}ms)`, color);
      }
    });
    
    this.log(`${'─'.repeat(50)}`);
    
    if (report.canDeploy) {
      this.log(`\n🎉 DEPLOYMENT APPROVED`, COLORS.GREEN);
      this.log(`   All environment validation tests passed`, COLORS.GREEN);
      this.log(`   Safe to proceed with deployment`, COLORS.GREEN);
    } else {
      this.log(`\n🚫 DEPLOYMENT BLOCKED`, COLORS.RED);
      this.log(`   Critical issues must be resolved before deployment`, COLORS.RED);
      this.log(`   Blocking reason: ${report.blockingReason}`, COLORS.RED);
    }
    
    this.log(`\n📄 Reports saved:`, COLORS.BLUE);
    this.log(`   Detailed: ${reportPath}`, COLORS.BLUE);
    this.log(`   Summary: ${summaryPath}`, COLORS.BLUE);
    
    this.logSection('🔍 Post-Validation Checklist');
    
    if (report.canDeploy) {
      this.log('✅ Environment isolation validated', COLORS.GREEN);
      this.log('✅ Build process verified', COLORS.GREEN);
      this.log('✅ Regression prevention active', COLORS.GREEN);
      this.log('✅ Phase 1 validation can proceed in staging', COLORS.GREEN);
    } else {
      this.log('❌ Fix critical issues before deployment', COLORS.RED);
      this.log('❌ Re-run validation suite after fixes', COLORS.RED);
      this.log('❌ Do not proceed with deployment', COLORS.RED);
    }
    
    // Exit with appropriate code
    process.exit(report.canDeploy ? 0 : 1);
  }
}

// Run the validation suite
const runner = new ValidationSuiteRunner();
runner.run().catch(error => {
  console.error(`${COLORS.RED}❌ Validation suite runner failed:${COLORS.RESET}`, error);
  process.exit(1);
});

export default ValidationSuiteRunner;