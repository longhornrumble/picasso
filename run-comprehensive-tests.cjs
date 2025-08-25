#!/usr/bin/env node

/**
 * Master Test Execution Runner
 * Executes all test suites for the unified coordination architecture
 * and generates a unified test report validating against plan success criteria.
 * 
 * This runner validates the complete implementation against the original plan:
 * - Cross-tenant isolation validation (0% cross-tenant access)
 * - State clearing compliance (HIPAA requirements)  
 * - JWT/Function URL integration (end-to-end authentication)
 * - Mobile Safari SSE compatibility
 * - Frontend integration with JWT/Function URL
 * - Performance validation (all timing requirements)
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class TestRunner {
  constructor() {
    this.results = {
      testSuites: [],
      summary: {
        totalSuites: 0,
        passedSuites: 0,
        failedSuites: 0,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        executionTime: 0
      },
      planValidation: {
        securityValidation: {},
        performanceTargets: {},
        complianceRequirements: {},
        technicalValidation: {}
      },
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: os.platform(),
        arch: os.arch(),
        memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB'
      }
    };
    
    this.testSuites = [
      {
        name: 'Cross-Tenant Isolation Tests',
        type: 'python',
        path: 'lambda-review/tests/test_cross_tenant_isolation.py',
        description: 'Validates 0% cross-tenant access success rate',
        criticalForPlan: true,
        validatesRequirements: [
          'JWT tokens expire in ≤15 minutes',
          'Tenant inference never uses client input', 
          'Cross-tenant access blocked (0% success rate)'
        ]
      },
      {
        name: 'State Clearing Compliance Tests',
        type: 'python',
        path: 'lambda-review/tests/test_state_clearing_compliance.py',
        description: 'Validates HIPAA compliance and data purging',
        criticalForPlan: true,
        validatesRequirements: [
          '/state/clear endpoint functional',
          'Audit events for all operations',
          'No full message persistence beyond 24h'
        ]
      },
      {
        name: 'JWT/Function URL Integration Tests',
        type: 'python', 
        path: 'lambda-review/tests/test_jwt_function_url_integration.py',
        description: 'Validates end-to-end JWT authentication flow',
        criticalForPlan: true,
        validatesRequirements: [
          'Function URLs with AuthType: NONE',
          'Internal JWT validation working',
          'JWT generation: <500ms'
        ]
      },
      {
        name: 'Performance Validation Tests',
        type: 'python',
        path: 'lambda-review/tests/test_performance_validation.py', 
        description: 'Validates all performance timing requirements',
        criticalForPlan: true,
        validatesRequirements: [
          'JWT generation: <500ms',
          'Streaming first token: <1000ms',
          'State clearing: <200ms',
          'Summary retrieval: <300ms'
        ]
      },
      {
        name: 'Mobile Safari SSE Tests',
        type: 'javascript',
        path: 'src/test/mobile-safari-sse.test.js',
        description: 'Validates Safari streaming compatibility',
        criticalForPlan: true,
        validatesRequirements: [
          'Mobile Safari SSE compatibility confirmed',
          'Keep-alive heartbeats implemented'
        ]
      },
      {
        name: 'Frontend JWT Integration Tests',
        type: 'javascript',
        path: 'src/test/jwt-function-url-integration.test.js',
        description: 'Validates frontend authentication integration',
        criticalForPlan: true,
        validatesRequirements: [
          'Two-table data model operational',
          'Frontend authentication flow'
        ]
      }
    ];
  }
  
  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }
  
  async runTestSuite(suite) {
    this.log(`\n${'='.repeat(80)}`, 'cyan');
    this.log(`Running: ${suite.name}`, 'bright');
    this.log(`Description: ${suite.description}`, 'blue');
    this.log(`Path: ${suite.path}`, 'blue');
    this.log(`${'='.repeat(80)}`, 'cyan');
    
    const startTime = Date.now();
    
    try {
      let result;
      
      if (suite.type === 'python') {
        result = await this.runPythonTests(suite);
      } else if (suite.type === 'javascript') {
        result = await this.runJavaScriptTests(suite);
      } else {
        throw new Error(`Unknown test suite type: ${suite.type}`);
      }
      
      const executionTime = Date.now() - startTime;
      
      const suiteResult = {
        ...suite,
        status: result.success ? 'passed' : 'failed',
        executionTime,
        testCount: result.testCount || 0,
        passedTests: result.passedTests || 0,
        failedTests: result.failedTests || 0,
        skippedTests: result.skippedTests || 0,
        errors: result.errors || [],
        output: result.output || '',
        validationResults: this.validateSuiteRequirements(suite, result)
      };
      
      this.results.testSuites.push(suiteResult);
      
      if (result.success) {
        this.log(`✅ ${suite.name} - PASSED (${executionTime}ms)`, 'green');
        this.results.summary.passedSuites++;
      } else {
        this.log(`❌ ${suite.name} - FAILED (${executionTime}ms)`, 'red');
        this.results.summary.failedSuites++;
        
        if (result.errors && result.errors.length > 0) {
          this.log('Errors:', 'red');
          result.errors.forEach(error => {
            this.log(`  • ${error}`, 'red');
          });
        }
      }
      
      // Update summary statistics
      this.results.summary.totalTests += suiteResult.testCount;
      this.results.summary.passedTests += suiteResult.passedTests;
      this.results.summary.failedTests += suiteResult.failedTests;
      this.results.summary.skippedTests += suiteResult.skippedTests;
      
      return suiteResult;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.log(`💥 ${suite.name} - ERROR (${executionTime}ms)`, 'red');
      this.log(`Error: ${error.message}`, 'red');
      
      const suiteResult = {
        ...suite,
        status: 'error',
        executionTime,
        testCount: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        errors: [error.message],
        output: '',
        validationResults: { validated: false, reason: 'Suite execution failed' }
      };
      
      this.results.testSuites.push(suiteResult);
      this.results.summary.failedSuites++;
      
      return suiteResult;
    }
  }
  
  async runPythonTests(suite) {
    return new Promise((resolve) => {
      const pythonPath = this.findPython();
      const testPath = path.join(process.cwd(), suite.path);
      
      // Check if test file exists
      if (!fs.existsSync(testPath)) {
        resolve({
          success: false,
          errors: [`Test file not found: ${testPath}`],
          testCount: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0
        });
        return;
      }
      
      const args = ['-m', 'pytest', testPath, '-v', '--tb=short', '--json-report', '--json-report-file=/tmp/pytest-report.json'];
      const child = spawn(pythonPath, args, {
        cwd: path.dirname(testPath),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        const result = this.parsePytestOutput(stdout, stderr, code);
        resolve(result);
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          errors: [`Failed to run pytest: ${error.message}`],
          testCount: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          output: stderr
        });
      });
    });
  }
  
  async runJavaScriptTests(suite) {
    return new Promise((resolve) => {
      const testPath = path.join(process.cwd(), suite.path);
      
      // Check if test file exists
      if (!fs.existsSync(testPath)) {
        resolve({
          success: false,
          errors: [`Test file not found: ${testPath}`],
          testCount: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0
        });
        return;
      }
      
      // Try to run with vitest if available, otherwise use node
      const vitestPath = path.join(process.cwd(), 'node_modules', '.bin', 'vitest');
      
      let command, args;
      if (fs.existsSync(vitestPath)) {
        command = vitestPath;
        args = ['run', testPath, '--reporter=verbose', '--reporter=json', '--outputFile=/tmp/vitest-report.json'];
      } else {
        command = 'node';
        args = [testPath];
      }
      
      const child = spawn(command, args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        const result = this.parseVitestOutput(stdout, stderr, code);
        resolve(result);
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          errors: [`Failed to run vitest: ${error.message}`],
          testCount: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          output: stderr
        });
      });
    });
  }
  
  findPython() {
    // Try to find Python installation
    const pythonCommands = ['python3', 'python', 'py'];
    
    for (const cmd of pythonCommands) {
      try {
        execSync(`${cmd} --version`, { stdio: 'ignore' });
        return cmd;
      } catch (error) {
        // Continue to next command
      }
    }
    
    return 'python3'; // Default fallback
  }
  
  parsePytestOutput(stdout, stderr, exitCode) {
    const errors = [];
    let testCount = 0;
    let passedTests = 0;
    let failedTests = 0;
    let skippedTests = 0;
    
    // Try to parse JSON report if available
    try {
      if (fs.existsSync('/tmp/pytest-report.json')) {
        const reportData = fs.readFileSync('/tmp/pytest-report.json', 'utf8');
        const report = JSON.parse(reportData);
        
        testCount = report.summary?.total || 0;
        passedTests = report.summary?.passed || 0;
        failedTests = report.summary?.failed || 0;
        skippedTests = report.summary?.skipped || 0;
        
        if (report.tests) {
          report.tests.forEach(test => {
            if (test.outcome === 'failed') {
              errors.push(`${test.nodeid}: ${test.call?.longrepr || 'Test failed'}`);
            }
          });
        }
      }
    } catch (parseError) {
      // Fall back to text parsing
    }
    
    // If JSON parsing failed, try text parsing
    if (testCount === 0) {
      const lines = stdout.split('\n');
      
      lines.forEach(line => {
        // Look for pytest summary line
        const summaryMatch = line.match(/(\d+) passed.*?(\d+) failed.*?(\d+) skipped/);
        if (summaryMatch) {
          passedTests = parseInt(summaryMatch[1]);
          failedTests = parseInt(summaryMatch[2]);
          skippedTests = parseInt(summaryMatch[3]);
          testCount = passedTests + failedTests + skippedTests;
        }
        
        // Look for FAILED tests
        if (line.includes('FAILED')) {
          errors.push(line.trim());
        }
      });
    }
    
    // Extract errors from stderr
    if (stderr) {
      const stderrLines = stderr.split('\n').filter(line => line.trim());
      stderrLines.forEach(line => {
        if (line.includes('Error') || line.includes('FAILED')) {
          errors.push(line.trim());
        }
      });
    }
    
    return {
      success: exitCode === 0 && failedTests === 0,
      testCount,
      passedTests,
      failedTests,
      skippedTests,
      errors: errors.slice(0, 10), // Limit to first 10 errors
      output: stdout
    };
  }
  
  parseVitestOutput(stdout, stderr, exitCode) {
    const errors = [];
    let testCount = 0;
    let passedTests = 0;
    let failedTests = 0;
    let skippedTests = 0;
    
    // Try to parse JSON report if available
    try {
      if (fs.existsSync('/tmp/vitest-report.json')) {
        const reportData = fs.readFileSync('/tmp/vitest-report.json', 'utf8');
        const report = JSON.parse(reportData);
        
        if (report.testResults) {
          report.testResults.forEach(suite => {
            suite.assertionResults?.forEach(test => {
              testCount++;
              if (test.status === 'passed') {
                passedTests++;
              } else if (test.status === 'failed') {
                failedTests++;
                errors.push(`${test.title}: ${test.failureMessages?.join(', ') || 'Test failed'}`);
              } else if (test.status === 'skipped') {
                skippedTests++;
              }
            });
          });
        }
      }
    } catch (parseError) {
      // Fall back to text parsing
    }
    
    // If JSON parsing failed, try text parsing
    if (testCount === 0) {
      const lines = stdout.split('\n');
      
      lines.forEach(line => {
        // Look for vitest summary
        if (line.includes('Test Files') && line.includes('passed')) {
          const matches = line.match(/(\d+) passed/);
          if (matches) {
            passedTests = parseInt(matches[1]);
            testCount = passedTests;
          }
        }
        
        if (line.includes('FAIL')) {
          failedTests++;
          errors.push(line.trim());
        }
      });
    }
    
    return {
      success: exitCode === 0 && failedTests === 0,
      testCount: testCount || (passedTests + failedTests + skippedTests),
      passedTests,
      failedTests,
      skippedTests,
      errors: errors.slice(0, 10),
      output: stdout
    };
  }
  
  validateSuiteRequirements(suite, result) {
    if (!result.success || !suite.validatesRequirements) {
      return { validated: false, reason: 'Test suite failed or no requirements specified' };
    }
    
    // For successful test suites, mark requirements as validated
    const validatedRequirements = suite.validatesRequirements.map(req => ({
      requirement: req,
      validated: true,
      testSuite: suite.name
    }));
    
    return {
      validated: true,
      requirements: validatedRequirements
    };
  }
  
  async runAllTests() {
    this.log('\n🚀 Starting Comprehensive Test Execution', 'bright');
    this.log('Testing unified coordination architecture implementation', 'blue');
    this.log(`Timestamp: ${this.results.timestamp}`, 'blue');
    this.log(`Environment: Node.js ${this.results.environment.node} on ${this.results.environment.platform}`, 'blue');
    
    const overallStartTime = Date.now();
    
    this.results.summary.totalSuites = this.testSuites.length;
    
    // Run each test suite
    for (const suite of this.testSuites) {
      await this.runTestSuite(suite);
    }
    
    this.results.summary.executionTime = Date.now() - overallStartTime;
    
    // Validate against plan requirements
    this.validatePlanRequirements();
    
    // Generate report
    this.generateReport();
    
    // Print summary
    this.printSummary();
    
    return this.results;
  }
  
  validatePlanRequirements() {
    const validation = this.results.planValidation;
    
    // Security Validation
    validation.securityValidation = {
      'JWT tokens expire in ≤15 minutes': this.hasValidatedRequirement('JWT tokens expire in ≤15 minutes'),
      'Tenant inference never uses client input': this.hasValidatedRequirement('Tenant inference never uses client input'),
      'Cross-tenant access blocked (0% success rate)': this.hasValidatedRequirement('Cross-tenant access blocked (0% success rate)'),
      'Mobile Safari SSE compatibility confirmed': this.hasValidatedRequirement('Mobile Safari SSE compatibility confirmed')
    };
    
    // Performance Targets
    validation.performanceTargets = {
      'JWT generation: <500ms': this.hasValidatedRequirement('JWT generation: <500ms'),
      'Streaming first token: <1000ms': this.hasValidatedRequirement('Streaming first token: <1000ms'),
      'State clearing: <200ms': this.hasValidatedRequirement('State clearing: <200ms'),
      'Summary retrieval: <300ms': this.hasValidatedRequirement('Summary retrieval: <300ms')
    };
    
    // Compliance Requirements
    validation.complianceRequirements = {
      '/state/clear endpoint functional': this.hasValidatedRequirement('/state/clear endpoint functional'),
      'Audit events for all operations': this.hasValidatedRequirement('Audit events for all operations'),
      'No full message persistence beyond 24h': this.hasValidatedRequirement('No full message persistence beyond 24h'),
      'Conversation summaries ≤7 days TTL': this.hasValidatedRequirement('Conversation summaries ≤7 days TTL')
    };
    
    // Technical Validation
    validation.technicalValidation = {
      'Function URLs with AuthType: NONE': this.hasValidatedRequirement('Function URLs with AuthType: NONE'),
      'Internal JWT validation working': this.hasValidatedRequirement('Internal JWT validation working'),
      'Two-table data model operational': this.hasValidatedRequirement('Two-table data model operational'),
      'Keep-alive heartbeats implemented': this.hasValidatedRequirement('Keep-alive heartbeats implemented')
    };
  }
  
  hasValidatedRequirement(requirement) {
    return this.results.testSuites.some(suite => 
      suite.status === 'passed' && 
      suite.validationResults?.requirements?.some(req => req.requirement === requirement && req.validated)
    );
  }
  
  generateReport() {
    const reportPath = path.join(process.cwd(), 'comprehensive-test-report.json');
    
    // Add additional metadata
    this.results.metadata = {
      generatedBy: 'Unified Coordination Architecture Test Runner',
      version: '1.0.0',
      description: 'Comprehensive validation of the unified coordination architecture implementation',
      planValidation: {
        totalRequirements: 16,
        validatedRequirements: this.countValidatedRequirements(),
        validationRate: (this.countValidatedRequirements() / 16 * 100).toFixed(1) + '%'
      }
    };
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
      this.log(`\n📄 Test report generated: ${reportPath}`, 'cyan');
    } catch (error) {
      this.log(`\n❌ Failed to generate report: ${error.message}`, 'red');
    }
  }
  
  countValidatedRequirements() {
    const validation = this.results.planValidation;
    let count = 0;
    
    Object.values(validation.securityValidation).forEach(v => v && count++);
    Object.values(validation.performanceTargets).forEach(v => v && count++);
    Object.values(validation.complianceRequirements).forEach(v => v && count++);
    Object.values(validation.technicalValidation).forEach(v => v && count++);
    
    return count;
  }
  
  printSummary() {
    const summary = this.results.summary;
    const validation = this.results.planValidation;
    
    this.log('\n' + '='.repeat(80), 'cyan');
    this.log('📊 COMPREHENSIVE TEST EXECUTION SUMMARY', 'bright');
    this.log('='.repeat(80), 'cyan');
    
    // Overall Results
    this.log('\n📈 Overall Results:', 'bright');
    this.log(`  Test Suites: ${summary.passedSuites}/${summary.totalSuites} passed`, 
             summary.passedSuites === summary.totalSuites ? 'green' : 'red');
    this.log(`  Test Cases:  ${summary.passedTests}/${summary.totalTests} passed`, 
             summary.failedTests === 0 ? 'green' : 'red');
    
    if (summary.skippedTests > 0) {
      this.log(`  Skipped:     ${summary.skippedTests} tests`, 'yellow');
    }
    
    this.log(`  Duration:    ${(summary.executionTime / 1000).toFixed(2)}s`, 'blue');
    
    // Plan Validation Results
    this.log('\n🎯 Plan Requirements Validation:', 'bright');
    
    this.log('\n  Security Validation:', 'cyan');
    Object.entries(validation.securityValidation).forEach(([req, validated]) => {
      this.log(`    ${validated ? '✅' : '❌'} ${req}`, validated ? 'green' : 'red');
    });
    
    this.log('\n  Performance Targets:', 'cyan');
    Object.entries(validation.performanceTargets).forEach(([req, validated]) => {
      this.log(`    ${validated ? '✅' : '❌'} ${req}`, validated ? 'green' : 'red');
    });
    
    this.log('\n  Compliance Requirements:', 'cyan');
    Object.entries(validation.complianceRequirements).forEach(([req, validated]) => {
      this.log(`    ${validated ? '✅' : '❌'} ${req}`, validated ? 'green' : 'red');
    });
    
    this.log('\n  Technical Validation:', 'cyan');
    Object.entries(validation.technicalValidation).forEach(([req, validated]) => {
      this.log(`    ${validated ? '✅' : '❌'} ${req}`, validated ? 'green' : 'red');
    });
    
    // Final Status
    const allPassed = summary.failedSuites === 0;
    const validatedCount = this.countValidatedRequirements();
    const allRequirementsValidated = validatedCount === 16;
    
    this.log('\n' + '='.repeat(80), 'cyan');
    
    if (allPassed && allRequirementsValidated) {
      this.log('🎉 SUCCESS: All tests passed and all plan requirements validated!', 'green');
      this.log('   The unified coordination architecture is ready for deployment.', 'green');
    } else if (allPassed) {
      this.log('⚠️  PARTIAL SUCCESS: All tests passed but some requirements not validated.', 'yellow');
      this.log(`   ${validatedCount}/16 plan requirements validated.`, 'yellow');
    } else {
      this.log('❌ FAILURE: Some tests failed or requirements not met.', 'red');
      this.log(`   ${summary.failedSuites} test suite(s) failed.`, 'red');
      this.log(`   ${validatedCount}/16 plan requirements validated.`, 'red');
    }
    
    this.log('='.repeat(80), 'cyan');
    
    // Exit with appropriate code
    process.exit(allPassed && allRequirementsValidated ? 0 : 1);
  }
}

// Main execution
async function main() {
  const runner = new TestRunner();
  
  try {
    await runner.runAllTests();
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Unhandled error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = { TestRunner };