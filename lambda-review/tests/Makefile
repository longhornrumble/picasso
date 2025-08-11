# Makefile for PICASSO tenant inference system testing
# Healthcare-grade testing automation

.PHONY: help install test test-unit test-integration test-security test-performance test-healthcare test-all
.PHONY: coverage coverage-html coverage-report clean lint format check-security
.PHONY: test-critical test-regression test-compliance reports

# Default target
help:
	@echo "PICASSO Tenant Inference Testing System"
	@echo "======================================="
	@echo ""
	@echo "Available targets:"
	@echo "  install           - Install testing dependencies"
	@echo "  test             - Run basic test suite"
	@echo "  test-unit        - Run unit tests only"
	@echo "  test-integration - Run integration tests only"
	@echo "  test-security    - Run security tests only"
	@echo "  test-performance - Run performance tests only"
	@echo "  test-healthcare  - Run healthcare compliance tests only"
	@echo "  test-critical    - Run critical path tests only"
	@echo "  test-regression  - Run regression tests only"
	@echo "  test-compliance  - Run all compliance tests"
	@echo "  test-all         - Run complete test suite"
	@echo "  coverage         - Generate coverage report"
	@echo "  coverage-html    - Generate HTML coverage report"
	@echo "  coverage-report  - Open coverage report in browser"
	@echo "  lint             - Run code linting"
	@echo "  format           - Format code with black and isort"
	@echo "  check-security   - Run security analysis"
	@echo "  reports          - Generate all test reports"
	@echo "  clean            - Clean up generated files"
	@echo ""

# Variables
PYTHON = python3
PIP = pip3
PYTEST = pytest
COVERAGE = coverage
BLACK = black
ISORT = isort
FLAKE8 = flake8
PYLINT = pylint

# Directories
TEST_DIR = tests
SRC_DIR = ../lambda-review
REPORTS_DIR = reports
COVERAGE_DIR = htmlcov

# Create necessary directories
$(REPORTS_DIR):
	mkdir -p $(REPORTS_DIR)

$(COVERAGE_DIR):
	mkdir -p $(COVERAGE_DIR)

# Install dependencies
install:
	@echo "Installing testing dependencies..."
	$(PIP) install -r requirements.txt
	@echo "Dependencies installed successfully"

# Basic test suite (fast tests for development)
test: $(REPORTS_DIR)
	@echo "Running basic test suite..."
	$(PYTEST) -m "not slow and not performance" --maxfail=5

# Unit tests
test-unit: $(REPORTS_DIR)
	@echo "Running unit tests..."
	$(PYTEST) -m unit -v

# Integration tests
test-integration: $(REPORTS_DIR)
	@echo "Running integration tests..."
	$(PYTEST) -m integration -v

# Security tests
test-security: $(REPORTS_DIR)
	@echo "Running security tests..."
	$(PYTEST) -m security -v --tb=long

# Performance tests
test-performance: $(REPORTS_DIR)
	@echo "Running performance tests..."
	$(PYTEST) -m performance -v --benchmark-only --benchmark-sort=mean

# Healthcare compliance tests
test-healthcare: $(REPORTS_DIR)
	@echo "Running healthcare compliance tests..."
	$(PYTEST) -m healthcare -v --strict-markers

# Critical path tests (must always pass)
test-critical: $(REPORTS_DIR)
	@echo "Running critical path tests..."
	$(PYTEST) -m critical -v --maxfail=1 --tb=long

# Regression tests
test-regression: $(REPORTS_DIR)
	@echo "Running regression tests..."
	$(PYTEST) -m regression -v

# Compliance tests (HIPAA, security, audit)
test-compliance: $(REPORTS_DIR)
	@echo "Running compliance tests..."
	$(PYTEST) -m "compliance or audit or healthcare" -v --strict-markers

# Complete test suite
test-all: $(REPORTS_DIR) $(COVERAGE_DIR)
	@echo "Running complete test suite..."
	$(PYTEST) --maxfail=10 -v

# Coverage reporting
coverage: $(COVERAGE_DIR)
	@echo "Generating coverage report..."
	$(COVERAGE) run -m pytest
	$(COVERAGE) report
	$(COVERAGE) html

coverage-html: coverage
	@echo "HTML coverage report generated in $(COVERAGE_DIR)/"

coverage-report: coverage-html
	@echo "Opening coverage report..."
	@if command -v open >/dev/null 2>&1; then \
		open $(COVERAGE_DIR)/index.html; \
	elif command -v xdg-open >/dev/null 2>&1; then \
		xdg-open $(COVERAGE_DIR)/index.html; \
	else \
		echo "Please open $(COVERAGE_DIR)/index.html in your browser"; \
	fi

# Code quality
lint:
	@echo "Running code linting..."
	$(FLAKE8) $(SRC_DIR) $(TEST_DIR) --max-line-length=88 --extend-ignore=E203,W503
	$(PYLINT) $(SRC_DIR)/tenant_inference.py --disable=C0114,C0116

format:
	@echo "Formatting code..."
	$(BLACK) $(SRC_DIR) $(TEST_DIR) --line-length=88
	$(ISORT) $(SRC_DIR) $(TEST_DIR) --profile black

# Security analysis
check-security:
	@echo "Running security analysis..."
	@if command -v bandit >/dev/null 2>&1; then \
		bandit -r $(SRC_DIR) -f json -o $(REPORTS_DIR)/security_report.json; \
		bandit -r $(SRC_DIR); \
	else \
		echo "Bandit not installed. Install with: pip install bandit"; \
	fi

# Generate all reports
reports: $(REPORTS_DIR) test-all coverage-html
	@echo "Generating comprehensive test reports..."
	
	# Test summary
	@echo "=== Test Summary ===" > $(REPORTS_DIR)/test_summary.txt
	@echo "Generated on: $$(date)" >> $(REPORTS_DIR)/test_summary.txt
	@echo "" >> $(REPORTS_DIR)/test_summary.txt
	
	# Coverage summary
	$(COVERAGE) report >> $(REPORTS_DIR)/test_summary.txt
	
	@echo "All reports generated in $(REPORTS_DIR)/"

# Healthcare-specific test targets
test-hipaa: $(REPORTS_DIR)
	@echo "Running HIPAA compliance tests..."
	$(PYTEST) -m "healthcare and compliance" -k "hipaa" -v

test-audit: $(REPORTS_DIR)
	@echo "Running audit logging tests..."
	$(PYTEST) -m audit -v --tb=long

test-fail-closed: $(REPORTS_DIR)
	@echo "Running fail-closed security tests..."
	$(PYTEST) -m fail_closed -v

test-rate-limit: $(REPORTS_DIR)
	@echo "Running rate limiting tests..."
	$(PYTEST) -m rate_limit -v

# CI/CD specific targets
ci-test: install
	@echo "Running CI/CD test suite..."
	$(PYTEST) -m "not slow" --junitxml=$(REPORTS_DIR)/junit.xml --cov-report=xml

ci-security: install check-security
	@echo "Running CI/CD security checks..."
	$(PYTEST) -m security --tb=short --maxfail=1

ci-performance: install
	@echo "Running CI/CD performance validation..."
	$(PYTEST) -m performance --benchmark-json=$(REPORTS_DIR)/benchmark.json

# Development helpers
watch:
	@echo "Watching for changes (requires pytest-watch)..."
	@if command -v ptw >/dev/null 2>&1; then \
		ptw -- -m "not slow"; \
	else \
		echo "Install pytest-watch with: pip install pytest-watch"; \
	fi

debug:
	@echo "Running tests in debug mode..."
	$(PYTEST) -v -s --pdb --pdbcls=IPython.terminal.debugger:Pdb

# Cleanup
clean:
	@echo "Cleaning up generated files..."
	rm -rf $(COVERAGE_DIR)/
	rm -rf $(REPORTS_DIR)/
	rm -rf __pycache__/
	rm -rf .pytest_cache/
	rm -rf .coverage
	rm -rf coverage.xml
	find . -name "*.pyc" -delete
	find . -name "*.pyo" -delete
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleanup completed"

# Validation targets for healthcare compliance
validate-healthcare: test-healthcare test-compliance coverage
	@echo "Healthcare validation complete"
	@echo "Checking coverage threshold..."
	$(COVERAGE) report --fail-under=90

validate-security: test-security check-security
	@echo "Security validation complete"

validate-performance: test-performance
	@echo "Performance validation complete"

# Complete validation suite for production readiness
validate-production: validate-healthcare validate-security validate-performance
	@echo "Production validation complete"
	@echo "System is ready for healthcare environment deployment"

# Help with test markers
markers:
	@echo "Available test markers:"
	@echo "  unit          - Individual function tests"
	@echo "  integration   - Full workflow tests"
	@echo "  security      - Security hardening tests"
	@echo "  performance   - Performance requirement tests"
	@echo "  healthcare    - Healthcare compliance tests"
	@echo "  compliance    - Regulatory compliance tests"
	@echo "  critical      - Critical path tests"
	@echo "  regression    - Regression tests"
	@echo "  audit         - Audit logging tests"
	@echo "  rate_limit    - Rate limiting tests"
	@echo "  fail_closed   - Fail-closed security tests"
	@echo "  slow          - Tests taking >5 seconds"
	@echo ""
	@echo "Run tests with: make test-<marker>"
	@echo "Example: make test-security"