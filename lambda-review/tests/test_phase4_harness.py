"""
Phase 4 Comprehensive Test Execution Harness

This module provides a comprehensive test execution harness that validates all
Phase 4 functional testing requirements and generates detailed reports for
staging deployment readiness.

Test Categories Orchestrated:
1. Phase 1: JWT Authentication Roundtrip Testing
2. Phase 2: Environment Configuration Validation
3. Phase 3: Performance Regression Testing
4. Phase 4: Comprehensive Integration Testing
5. Original Failure Scenario Validation
6. End-to-End User Journey Testing

Reporting Features:
- Comprehensive test execution summary
- Performance metrics and regression analysis
- Test coverage analysis (target >95%)
- Success/failure analysis with detailed diagnostics
- Staging deployment readiness assessment
- Automated report generation for stakeholders

Success Criteria:
- All Phase 1-4 tests pass (100% success rate)
- Original conversation memory failure fixed
- Performance targets met (<200ms response times)
- Test coverage >95% for critical functionality
- End-to-end user journeys successful
- Zero critical test failures
"""

import pytest
import json
import time
import os
import sys
import subprocess
import statistics
from datetime import datetime
from pathlib import Path
import importlib.util

# Test markers
pytestmark = [
    pytest.mark.harness,
    pytest.mark.integration,
    pytest.mark.phase4,
    pytest.mark.critical
]


class Phase4TestHarness:
    """
    Comprehensive test execution harness for Phase 4 functional testing
    """
    
    def __init__(self):
        self.start_time = time.perf_counter()
        self.test_results = {}
        self.performance_metrics = {}
        self.coverage_data = {}
        self.execution_log = []
        
        # Test suite configuration
        self.test_suites = {
            'phase1_jwt': {
                'file': 'test_phase1_jwt_roundtrip.py',
                'description': 'Phase 1 JWT Authentication Fixes',
                'critical': True,
                'timeout': 300
            },
            'phase2_environment': {
                'file': 'test_phase2_environment_config.py',
                'description': 'Phase 2 Environment Configuration',
                'critical': True,
                'timeout': 180
            },
            'phase3_performance': {
                'file': 'test_phase3_performance_regression.py',
                'description': 'Phase 3 Performance Optimization',
                'critical': True,
                'timeout': 600
            },
            'phase4_integration': {
                'file': 'test_phase4_functional_integration.py',
                'description': 'Phase 4 Comprehensive Integration',
                'critical': True,
                'timeout': 900
            },
            'original_failure': {
                'file': 'test_original_conversation_memory_failure.py',
                'description': 'Original Conversation Memory Failure Fix',
                'critical': True,
                'timeout': 300
            },
            'end_to_end': {
                'file': 'test_end_to_end_user_journey.py',
                'description': 'End-to-End User Journey Validation',
                'critical': True,
                'timeout': 600
            }
        }
        
        # Performance targets
        self.performance_targets = {
            'jwt_operations': 100,      # ms
            'database_operations': 150, # ms
            'overall_response': 200,    # ms
            'e2e_journey': 5000        # ms
        }
        
        # Coverage targets
        self.coverage_targets = {
            'overall': 95,     # %
            'critical': 98,    # %
            'jwt_auth': 100,   # %
            'conversation': 95 # %
        }

    def log_execution(self, message, level='INFO'):
        """Log execution messages with timestamp"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"[{timestamp}] {level}: {message}"
        self.execution_log.append(log_entry)
        print(log_entry)

    def run_test_suite(self, suite_name, suite_config):
        """Execute a single test suite and capture results"""
        self.log_execution(f"Starting {suite_config['description']}")
        
        suite_start = time.perf_counter()
        
        try:
            # Build pytest command
            cmd = [
                'python', '-m', 'pytest', 
                suite_config['file'],
                '-v',
                '--tb=short',
                '--json-report',
                f'--json-report-file=reports/{suite_name}_report.json'
            ]
            
            # Execute test suite
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=suite_config['timeout'],
                cwd=os.path.dirname(__file__)
            )
            
            suite_duration = (time.perf_counter() - suite_start) * 1000
            
            # Parse results
            test_result = {
                'suite': suite_name,
                'description': suite_config['description'],
                'duration_ms': suite_duration,
                'return_code': result.returncode,
                'stdout': result.stdout,
                'stderr': result.stderr,
                'success': result.returncode == 0,
                'critical': suite_config['critical']
            }
            
            # Load JSON report if available
            report_file = f'reports/{suite_name}_report.json'
            if os.path.exists(report_file):
                try:
                    with open(report_file, 'r') as f:
                        json_report = json.load(f)
                        test_result['json_report'] = json_report
                        test_result['tests_passed'] = json_report.get('summary', {}).get('passed', 0)
                        test_result['tests_failed'] = json_report.get('summary', {}).get('failed', 0)
                        test_result['tests_total'] = json_report.get('summary', {}).get('total', 0)
                except Exception as e:
                    self.log_execution(f"Failed to parse JSON report for {suite_name}: {e}", 'WARNING')
            
            self.test_results[suite_name] = test_result
            
            status = "PASSED" if test_result['success'] else "FAILED"
            self.log_execution(f"Completed {suite_config['description']}: {status} ({suite_duration:.1f}ms)")
            
            return test_result
            
        except subprocess.TimeoutExpired:
            suite_duration = (time.perf_counter() - suite_start) * 1000
            test_result = {
                'suite': suite_name,
                'description': suite_config['description'],
                'duration_ms': suite_duration,
                'success': False,
                'error': f"Test suite timed out after {suite_config['timeout']}s",
                'critical': suite_config['critical']
            }
            self.test_results[suite_name] = test_result
            self.log_execution(f"TIMEOUT: {suite_config['description']} exceeded {suite_config['timeout']}s", 'ERROR')
            return test_result
            
        except Exception as e:
            suite_duration = (time.perf_counter() - suite_start) * 1000
            test_result = {
                'suite': suite_name,
                'description': suite_config['description'],
                'duration_ms': suite_duration,
                'success': False,
                'error': str(e),
                'critical': suite_config['critical']
            }
            self.test_results[suite_name] = test_result
            self.log_execution(f"ERROR: {suite_config['description']} failed: {e}", 'ERROR')
            return test_result

    def analyze_performance_metrics(self):
        """Analyze performance metrics from test results"""
        self.log_execution("Analyzing performance metrics")
        
        performance_analysis = {
            'jwt_operations': [],
            'database_operations': [],
            'overall_response': [],
            'e2e_journey': []
        }
        
        # Extract performance data from test results
        for suite_name, result in self.test_results.items():
            if not result.get('success', False):
                continue
                
            json_report = result.get('json_report', {})
            
            # Analyze different performance metrics based on suite
            if suite_name == 'phase1_jwt':
                # Extract JWT performance metrics
                performance_analysis['jwt_operations'].extend(
                    self._extract_performance_from_stdout(result.get('stdout', ''), 'jwt')
                )
            elif suite_name == 'phase3_performance':
                # Extract comprehensive performance metrics
                stdout = result.get('stdout', '')
                performance_analysis['jwt_operations'].extend(
                    self._extract_performance_from_stdout(stdout, 'jwt')
                )
                performance_analysis['database_operations'].extend(
                    self._extract_performance_from_stdout(stdout, 'database')
                )
                performance_analysis['overall_response'].extend(
                    self._extract_performance_from_stdout(stdout, 'response')
                )
            elif suite_name == 'end_to_end':
                # Extract end-to-end journey metrics
                performance_analysis['e2e_journey'].extend(
                    self._extract_performance_from_stdout(result.get('stdout', ''), 'journey')
                )
        
        # Calculate performance statistics
        self.performance_metrics = {}
        for metric_type, values in performance_analysis.items():
            if values:
                self.performance_metrics[metric_type] = {
                    'values': values,
                    'count': len(values),
                    'average': statistics.mean(values),
                    'median': statistics.median(values),
                    'min': min(values),
                    'max': max(values),
                    'p95': sorted(values)[int(len(values) * 0.95)] if len(values) > 1 else values[0],
                    'target': self.performance_targets[metric_type],
                    'meets_target': statistics.mean(values) < self.performance_targets[metric_type]
                }
            else:
                self.performance_metrics[metric_type] = {
                    'values': [],
                    'count': 0,
                    'target': self.performance_targets[metric_type],
                    'meets_target': False
                }

    def _extract_performance_from_stdout(self, stdout, metric_type):
        """Extract performance metrics from test output"""
        values = []
        lines = stdout.split('\n')
        
        # Simple pattern matching for performance values
        # This is a basic implementation - could be enhanced with regex
        for line in lines:
            line_lower = line.lower()
            if metric_type in line_lower and ('ms' in line_lower or 'time' in line_lower):
                # Extract numeric values (simplified)
                import re
                numbers = re.findall(r'\d+\.?\d*', line)
                for num in numbers:
                    try:
                        value = float(num)
                        if 0 < value < 10000:  # Reasonable range for milliseconds
                            values.append(value)
                            break
                    except ValueError:
                        continue
        
        return values

    def generate_coverage_report(self):
        """Generate and analyze test coverage"""
        self.log_execution("Generating test coverage analysis")
        
        try:
            # Run coverage analysis
            coverage_cmd = [
                'python', '-m', 'coverage', 'run', 
                '-m', 'pytest', 
                'test_phase*.py', 
                'test_original_conversation_memory_failure.py',
                'test_end_to_end_user_journey.py'
            ]
            
            subprocess.run(coverage_cmd, capture_output=True, cwd=os.path.dirname(__file__))
            
            # Generate coverage report
            report_cmd = ['python', '-m', 'coverage', 'report', '--format=json']
            result = subprocess.run(report_cmd, capture_output=True, text=True, cwd=os.path.dirname(__file__))
            
            if result.returncode == 0 and result.stdout:
                try:
                    coverage_data = json.loads(result.stdout)
                    self.coverage_data = {
                        'total_coverage': coverage_data.get('totals', {}).get('percent_covered', 0),
                        'files': coverage_data.get('files', {}),
                        'meets_target': coverage_data.get('totals', {}).get('percent_covered', 0) >= self.coverage_targets['overall']
                    }
                except json.JSONDecodeError:
                    self.log_execution("Failed to parse coverage JSON", 'WARNING')
                    self.coverage_data = {'total_coverage': 0, 'meets_target': False}
            else:
                self.log_execution("Coverage report generation failed", 'WARNING')
                self.coverage_data = {'total_coverage': 0, 'meets_target': False}
                
        except Exception as e:
            self.log_execution(f"Coverage analysis failed: {e}", 'ERROR')
            self.coverage_data = {'total_coverage': 0, 'meets_target': False}

    def assess_staging_readiness(self):
        """Assess overall staging deployment readiness"""
        self.log_execution("Assessing staging deployment readiness")
        
        # Critical success criteria
        critical_suites_passed = all(
            result.get('success', False) 
            for result in self.test_results.values() 
            if result.get('critical', False)
        )
        
        performance_targets_met = all(
            metric.get('meets_target', False)
            for metric in self.performance_metrics.values()
            if metric.get('count', 0) > 0
        )
        
        coverage_target_met = self.coverage_data.get('meets_target', False)
        
        # Overall assessment
        staging_ready = (
            critical_suites_passed and
            performance_targets_met and
            coverage_target_met
        )
        
        readiness_assessment = {
            'staging_ready': staging_ready,
            'critical_tests_passed': critical_suites_passed,
            'performance_targets_met': performance_targets_met,
            'coverage_target_met': coverage_target_met,
            'total_suites': len(self.test_suites),
            'passed_suites': sum(1 for r in self.test_results.values() if r.get('success', False)),
            'failed_suites': sum(1 for r in self.test_results.values() if not r.get('success', False)),
            'total_execution_time': (time.perf_counter() - self.start_time) * 1000
        }
        
        return readiness_assessment

    def generate_comprehensive_report(self):
        """Generate comprehensive test execution report"""
        self.log_execution("Generating comprehensive test report")
        
        readiness = self.assess_staging_readiness()
        
        report = {
            'timestamp': datetime.now().isoformat(),
            'harness_version': '1.0.0',
            'execution_summary': {
                'total_duration_ms': (time.perf_counter() - self.start_time) * 1000,
                'suites_executed': len(self.test_suites),
                'suites_passed': readiness['passed_suites'],
                'suites_failed': readiness['failed_suites'],
                'critical_tests_passed': readiness['critical_tests_passed']
            },
            'test_results': self.test_results,
            'performance_metrics': self.performance_metrics,
            'coverage_data': self.coverage_data,
            'staging_readiness': readiness,
            'execution_log': self.execution_log
        }
        
        # Write detailed report
        os.makedirs('reports', exist_ok=True)
        report_file = f'reports/phase4_comprehensive_report_{int(time.time())}.json'
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        # Generate human-readable summary
        summary_file = f'reports/phase4_summary_{int(time.time())}.txt'
        with open(summary_file, 'w') as f:
            f.write("PHASE 4 FUNCTIONAL TESTING - COMPREHENSIVE REPORT\n")
            f.write("=" * 55 + "\n\n")
            f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Total Execution Time: {readiness['total_execution_time']:.1f}ms\n\n")
            
            f.write("STAGING READINESS ASSESSMENT\n")
            f.write("-" * 30 + "\n")
            if readiness['staging_ready']:
                f.write("🎉 STAGING DEPLOYMENT: READY\n\n")
            else:
                f.write("❌ STAGING DEPLOYMENT: NOT READY\n\n")
            
            f.write("TEST SUITE RESULTS\n")
            f.write("-" * 20 + "\n")
            for suite_name, result in self.test_results.items():
                status = "✅ PASSED" if result.get('success', False) else "❌ FAILED"
                f.write(f"{result['description']}: {status}\n")
                if not result.get('success', False) and 'error' in result:
                    f.write(f"  Error: {result['error']}\n")
            f.write("\n")
            
            f.write("PERFORMANCE ANALYSIS\n")
            f.write("-" * 20 + "\n")
            for metric_type, metrics in self.performance_metrics.items():
                if metrics.get('count', 0) > 0:
                    status = "✅" if metrics['meets_target'] else "❌"
                    f.write(f"{metric_type}: {status} {metrics['average']:.1f}ms (target: {metrics['target']}ms)\n")
            f.write("\n")
            
            f.write("COVERAGE ANALYSIS\n")
            f.write("-" * 17 + "\n")
            coverage_status = "✅" if self.coverage_data.get('meets_target', False) else "❌"
            f.write(f"Overall Coverage: {coverage_status} {self.coverage_data.get('total_coverage', 0):.1f}%\n")
            f.write(f"Target: {self.coverage_targets['overall']}%\n\n")
            
            if readiness['staging_ready']:
                f.write("🚀 SYSTEM IS READY FOR STAGING DEPLOYMENT 🚀\n")
                f.write("\nAll Phase 1-4 remediation fixes validated successfully:\n")
                f.write("✅ Phase 1: JWT Authentication - HTTP 403 errors fixed\n")
                f.write("✅ Phase 2: Environment Configuration - Standardized\n")
                f.write("✅ Phase 3: Performance Optimization - Targets met\n")
                f.write("✅ Phase 4: Functional Integration - Comprehensive validation\n")
                f.write("✅ Original Failure: 4-turn conversation memory fixed\n")
                f.write("✅ End-to-End: User journeys validated\n")
            else:
                f.write("⚠️  STAGING DEPLOYMENT BLOCKED - ISSUES DETECTED\n")
                f.write("\nReview failed tests and address issues before deployment.\n")
        
        self.log_execution(f"Comprehensive report generated: {report_file}")
        self.log_execution(f"Summary report generated: {summary_file}")
        
        return report_file, summary_file

    def execute_full_test_suite(self):
        """Execute the complete Phase 4 test suite"""
        self.log_execution("Starting Phase 4 Comprehensive Test Execution")
        self.log_execution(f"Test suites to execute: {len(self.test_suites)}")
        
        # Ensure reports directory exists
        os.makedirs('reports', exist_ok=True)
        
        # Execute each test suite
        for suite_name, suite_config in self.test_suites.items():
            result = self.run_test_suite(suite_name, suite_config)
            
            # Stop on critical failure if needed
            if suite_config['critical'] and not result.get('success', False):
                self.log_execution(f"Critical test suite {suite_name} failed - continuing with remaining tests", 'WARNING')
        
        # Analyze results
        self.analyze_performance_metrics()
        self.generate_coverage_report()
        
        # Generate comprehensive report
        report_file, summary_file = self.generate_comprehensive_report()
        
        # Final assessment
        readiness = self.assess_staging_readiness()
        
        if readiness['staging_ready']:
            self.log_execution("🎉 PHASE 4 VALIDATION SUCCESSFUL - STAGING READY 🎉")
        else:
            self.log_execution("❌ PHASE 4 VALIDATION FAILED - STAGING NOT READY", 'ERROR')
        
        return readiness, report_file, summary_file


# Test harness integration for pytest
class TestPhase4Harness:
    """Integration test for the Phase 4 test harness"""
    
    def test_comprehensive_phase4_validation(self):
        """
        CRITICAL: Execute comprehensive Phase 4 validation using test harness
        
        This test orchestrates all Phase 4 testing and validates staging readiness
        """
        harness = Phase4TestHarness()
        
        # Execute full test suite
        readiness, report_file, summary_file = harness.execute_full_test_suite()
        
        # Validate staging readiness
        assert readiness['staging_ready'], f"Staging deployment not ready: {readiness}"
        assert readiness['critical_tests_passed'], "Critical tests must all pass"
        assert readiness['passed_suites'] == readiness['total_suites'], "All test suites must pass"
        
        # Validate files were generated
        assert os.path.exists(report_file), "Comprehensive report must be generated"
        assert os.path.exists(summary_file), "Summary report must be generated"
        
        # Log success
        print(f"\n🎉 Phase 4 Comprehensive Validation SUCCESSFUL!")
        print(f"   Staging Ready: {readiness['staging_ready']}")
        print(f"   Test Suites Passed: {readiness['passed_suites']}/{readiness['total_suites']}")
        print(f"   Total Execution Time: {readiness['total_execution_time']:.1f}ms")
        print(f"   Report: {report_file}")
        print(f"   Summary: {summary_file}")


if __name__ == "__main__":
    # Allow direct execution of harness
    harness = Phase4TestHarness()
    readiness, report_file, summary_file = harness.execute_full_test_suite()
    
    print(f"\nPhase 4 Test Harness Execution Complete")
    print(f"Staging Ready: {readiness['staging_ready']}")
    print(f"Report: {report_file}")
    print(f"Summary: {summary_file}")
    
    # Exit with appropriate code
    exit(0 if readiness['staging_ready'] else 1)