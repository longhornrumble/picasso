# BERS Developer Setup Guide

## Build-time Environment Resolution System (BERS) v2.0.0

### Complete Development Environment Setup and Workflow

This guide provides step-by-step instructions for setting up a development environment for the Build-time Environment Resolution System (BERS) and covers all development workflows from initial setup to production deployment.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Environment Setup](#development-environment-setup)
3. [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
5. [Testing and Validation](#testing-and-validation)
6. [Debugging and Troubleshooting](#debugging-and-troubleshooting)
7. [Build and Deployment](#build-and-deployment)
8. [Contributing Guidelines](#contributing-guidelines)
9. [Advanced Development](#advanced-development)
10. [IDE Configuration](#ide-configuration)

---

## Prerequisites

### System Requirements

**Minimum Requirements**:
- Node.js 18.0+ (LTS recommended)
- npm 9.0+ or Yarn 3.0+
- Git 2.30+
- 4GB RAM minimum (8GB recommended)
- 10GB available disk space

**Recommended Setup**:
- Node.js 20.x LTS
- npm 10.x
- Git 2.40+
- 16GB RAM
- SSD storage with 20GB+ available

### Development Tools

**Required Tools**:
```bash
# Node.js and npm (via Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts

# Git
# macOS: git comes pre-installed or via Homebrew
brew install git

# Linux (Ubuntu/Debian)
sudo apt update && sudo apt install git

# Verify installations
node --version    # Should be 18.0+
npm --version     # Should be 9.0+
git --version     # Should be 2.30+
```

**Optional but Recommended**:
```bash
# Yarn (alternative package manager)
npm install -g yarn

# TypeScript globally (for CLI usage)
npm install -g typescript

# AWS CLI (for S3 configuration management)
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### IDE/Editor Setup

**Recommended IDEs**:
- VS Code (with extensions listed below)
- WebStorm/IntelliJ IDEA
- Vim/Neovim with appropriate plugins

**VS Code Extensions** (see [IDE Configuration](#ide-configuration) for details):
- TypeScript and JavaScript Language Features
- ESLint
- Prettier
- Vite
- Thunder Client (for API testing)
- Git Lens

---

## Development Environment Setup

### 1. Repository Setup

```bash
# Clone the repository
git clone https://github.com/company/picasso.git
cd picasso

# Verify you're in the correct directory
pwd  # Should end with /picasso
ls   # Should show package.json, src/, docs/, etc.
```

### 2. Install Dependencies

```bash
# Install all project dependencies
npm install

# Alternative with Yarn
# yarn install

# Verify installation completed successfully
npm list --depth=0
```

**Expected Output**:
```
picasso@2.0.0 /path/to/picasso
├── @babel/core@7.x.x
├── @types/react@18.x.x
├── vite@5.x.x
├── typescript@5.x.x
└── ... (other dependencies)
```

### 3. Environment Configuration

#### Development Environment Files

Create environment configuration files:

```bash
# Create .env.local for local development
cat > .env.local << 'EOF'
# BERS Development Configuration
NODE_ENV=development
PICASSO_ENV=development

# Development Features
VITE_DEV_MODE=true
VITE_DEBUG_MODE=true
VITE_HOT_RELOAD=true

# API Configuration
VITE_API_BASE_URL=http://localhost:3000
VITE_MONITORING_PORT=3003

# S3 Configuration (Development)
VITE_S3_BUCKET=myrecruiter-picasso-dev
VITE_S3_REGION=us-east-1

# Feature Flags
VITE_ENABLE_MONITORING=true
VITE_ENABLE_DEBUGGING=true
VITE_ENABLE_HOT_RELOAD=true
EOF

# Create .env.development for consistent dev environment
cp .env.local .env.development
```

#### Local Configuration Files

```bash
# Create local BERS configuration
mkdir -p config/local
cat > config/local/bers-config.json << 'EOF'
{
  "environment": "development",
  "version": "2.0.0",
  "enabledFeatures": {
    "hotReload": true,
    "debugMode": true,
    "performanceMonitoring": true,
    "urlParameterDetection": true
  },
  "monitoring": {
    "enabled": true,
    "port": 3003,
    "metricsGranularity": 1000,
    "healthCheckInterval": 10000
  },
  "caching": {
    "environmentDetection": {
      "enabled": true,
      "ttl": 60000
    },
    "configuration": {
      "enabled": true,
      "ttl": 30000
    }
  },
  "security": {
    "allowInsecure": true,
    "enforceHTTPS": false,
    "allowUrlParameterOverride": true
  }
}
EOF
```

### 4. Verify Installation

```bash
# Run installation verification script
npm run verify:installation

# Test BERS components
npm run test:bers:quick

# Check environment detection
npm run test:environment-detection

# Verify development server starts
npm run dev --dry-run
```

**Expected Output**:
```
✅ Node.js version: 20.x.x (compatible)
✅ npm version: 10.x.x (compatible)  
✅ Dependencies installed: 127 packages
✅ TypeScript compilation: successful
✅ Environment detection: working
✅ Configuration management: working
✅ Monitoring system: ready
✅ Development environment: ready to start
```

---

## Project Structure

### BERS-Specific Directory Structure

```
picasso/
├── src/
│   ├── config/                     # BERS Core Configuration
│   │   ├── environment-resolver.ts    # Environment detection engine
│   │   ├── configuration-manager.ts   # Configuration management
│   │   ├── schemas/                    # JSON schemas
│   │   └── configurations/             # Environment configs
│   ├── monitoring/                 # BERS Monitoring System
│   │   ├── metrics-collector.ts       # Performance metrics
│   │   ├── health-checks.ts           # System health monitoring
│   │   ├── alert-system.ts           # Alerting infrastructure
│   │   └── dashboard.ts               # Monitoring dashboard
│   ├── security/                   # BERS Security
│   │   ├── access-control.ts          # Access control
│   │   ├── config-encryption.ts       # Configuration encryption
│   │   └── config-sanitizer.ts        # Input sanitization
│   └── providers/                  # Enhanced Provider System
│       ├── ChatAPIProvider.tsx        # API communication
│       ├── ChatStateProvider.tsx      # State management
│       ├── ChatStreamingProvider.tsx  # Streaming capabilities
│       └── systems/                   # Provider support systems
├── tools/                          # BERS Tools & Utilities
│   ├── build/                         # Build system integration
│   ├── monitoring/                    # Production monitoring
│   ├── deployment/                    # Deployment tools
│   └── development/                   # Development utilities
├── tests/                          # BERS Test Suite
│   ├── unit/                          # Unit tests
│   ├── integration/                   # Integration tests
│   └── validation/                    # BERS validation tests
└── docs/                           # BERS Documentation
    ├── BERS_TECHNICAL_ARCHITECTURE.md
    ├── BERS_OPERATIONAL_RUNBOOK.md
    └── BERS_DEVELOPER_SETUP_GUIDE.md
```

### Key Files for Developers

| File | Purpose | When to Modify |
|------|---------|----------------|
| `src/config/environment-resolver.ts` | Environment detection logic | Adding new detection sources |
| `src/config/configuration-manager.ts` | Configuration management | Changing config loading behavior |
| `src/config/schemas/` | JSON Schema definitions | Adding new config properties |
| `src/monitoring/` | Monitoring infrastructure | Adding new metrics or alerts |
| `src/providers/` | Provider implementations | Extending provider functionality |
| `tools/build/environment-plugin.js` | Build-time integration | Modifying build behavior |
| `tests/validation/` | BERS validation tests | Adding new test scenarios |

---

## Development Workflow

### 1. Starting Development

```bash
# Start development environment
npm run dev

# Alternative: Start with monitoring dashboard
npm run dev:with-monitoring

# Start only the development server
npm run dev:server-only
```

**What happens when you run `npm run dev`**:
1. Environment detection validates current setup
2. Configuration manager loads development configs
3. Monitoring system starts on port 3003
4. Vite development server starts on port 5173
5. Hot reload system activates
6. Provider ecosystem initializes

### 2. Development Dashboard

Access the development dashboard at: http://localhost:5173/dev/

**Dashboard Features**:
- **Environment Status**: Current environment detection results
- **Configuration Inspector**: View current configuration values
- **Provider Monitor**: Real-time provider health and performance
- **Performance Metrics**: BERS component performance data
- **Cache Inspector**: Cache status and hit rates
- **Log Viewer**: Real-time log streaming

### 3. Development Commands

#### Core Development
```bash
# Start development with hot reload
npm run dev

# Start development server only (no monitoring)
npm run dev:minimal

# Start with specific environment
PICASSO_ENV=staging npm run dev

# Start with debug mode
DEBUG=bers:* npm run dev
```

#### BERS-Specific Development
```bash
# Test environment detection
npm run dev:test-environment

# Test configuration loading
npm run dev:test-config

# Test provider integration
npm run dev:test-providers

# Monitor BERS performance
npm run dev:monitor-performance
```

#### Configuration Testing
```bash
# Validate current configuration
npm run config:validate

# Test configuration inheritance
npm run config:test-inheritance

# Test schema validation
npm run config:test-schemas

# Test tenant configuration loading
npm run config:test-tenant --tenant=demo
```

### 4. Hot Reload Development

BERS supports comprehensive hot reload for development:

**Automatically Reloaded**:
- TypeScript/JavaScript source files
- Configuration files (`src/config/configurations/`)
- JSON schemas (`src/config/schemas/`)
- Provider implementations
- Monitoring configurations

**Manual Reload Required**:
- Environment variables (restart dev server)
- Build system configuration
- Package.json dependencies

**Hot Reload Testing**:
```bash
# Test configuration hot reload
echo '{"test": true}' > src/config/configurations/development/test.json

# Test provider hot reload  
# Modify any file in src/providers/ and save

# Test monitoring hot reload
# Modify src/monitoring/dashboard.ts and save
```

### 5. Environment Switching

```bash
# Switch to staging environment
export PICASSO_ENV=staging
npm run dev

# Switch via URL parameter (development only)
# Visit: http://localhost:5173?picasso-env=staging

# Switch via configuration file
echo '{"environment": "staging"}' > config/local/override.json
npm run dev

# Test environment detection
npm run test:environment-detection --environment=staging
```

---

## Testing and Validation

### 1. Test Suite Overview

BERS includes comprehensive testing at multiple levels:

```bash
# Run all tests
npm run test

# Run BERS-specific tests only
npm run test:bers

# Run tests with coverage
npm run test:coverage

# Run performance tests
npm run test:performance
```

### 2. Unit Tests

```bash
# Test environment detection
npm run test:unit:environment

# Test configuration management
npm run test:unit:config

# Test monitoring system
npm run test:unit:monitoring

# Test provider integration
npm run test:unit:providers

# Test security components
npm run test:unit:security
```

**Writing Unit Tests**:
```typescript
// Example: Testing environment detection
// tests/unit/environment-detection.test.ts

import { environmentResolver } from '../src/config/environment-resolver';

describe('Environment Detection', () => {
  test('should detect development environment', async () => {
    process.env.NODE_ENV = 'development';
    
    const result = await environmentResolver.detectEnvironment();
    
    expect(result.environment).toBe('development');
    expect(result.source).toBe('env-variable');
    expect(result.confidence).toBe('high');
    expect(result.detectionTime).toBeLessThan(100);
  });
  
  test('should fall back to default environment', async () => {
    delete process.env.NODE_ENV;
    delete process.env.PICASSO_ENV;
    
    const result = await environmentResolver.detectEnvironment();
    
    expect(result.environment).toBe('production');
    expect(result.source).toBe('default-fallback');
  });
});
```

### 3. Integration Tests

```bash
# Test full BERS integration
npm run test:integration:bers

# Test build system integration
npm run test:integration:build

# Test provider ecosystem integration
npm run test:integration:providers

# Test monitoring integration
npm run test:integration:monitoring
```

**Writing Integration Tests**:
```typescript
// Example: Testing full configuration flow
// tests/integration/configuration-flow.test.ts

import { startProductionMonitoring } from '../tools/monitoring/production-monitoring';
import { environmentResolver } from '../src/config/environment-resolver';

describe('Configuration Flow Integration', () => {
  test('should load configuration end-to-end', async () => {
    // Start monitoring system
    const monitoring = await startProductionMonitoring({
      enabled: true,
      environment: 'development'
    });
    
    try {
      // Detect environment
      const envResult = await environmentResolver.detectEnvironment();
      expect(envResult.environment).toBe('development');
      
      // Load configuration
      const config = await environmentResolver.resolveRuntimeConfiguration(
        'demo-tenant-hash'
      );
      
      expect(config).toBeDefined();
      expect(config.tenantHash).toBe('demo-tenant-hash');
      
      // Verify monitoring collected metrics
      const metrics = monitoring.getSystemStatus();
      expect(metrics.isRunning).toBe(true);
      
    } finally {
      await monitoring.stop();
    }
  });
});
```

### 4. Validation Tests

```bash
# Run BERS validation suite
npm run test:validation

# Test environment compatibility
npm run test:validation:environments

# Test performance requirements
npm run test:validation:performance

# Test security requirements
npm run test:validation:security
```

### 5. Performance Testing

```bash
# Benchmark environment detection
npm run benchmark:environment-detection

# Benchmark configuration loading
npm run benchmark:config-loading

# Benchmark provider initialization
npm run benchmark:provider-init

# Load testing
npm run test:load
```

**Performance Benchmarks**:
```typescript
// Example: Environment detection benchmark
// tests/performance/environment-detection.bench.ts

import { environmentResolver } from '../src/config/environment-resolver';

describe('Environment Detection Performance', () => {
  test('should detect environment under 100ms', async () => {
    const iterations = 100;
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await environmentResolver.detectEnvironment();
      const end = performance.now();
      times.push(end - start);
    }
    
    const avgTime = times.reduce((a, b) => a + b) / times.length;
    const maxTime = Math.max(...times);
    
    expect(avgTime).toBeLessThan(50); // Target: <50ms average
    expect(maxTime).toBeLessThan(100); // Target: <100ms max
  });
});
```

---

## Debugging and Troubleshooting

### 1. Debug Mode Setup

```bash
# Enable comprehensive debugging
export DEBUG=bers:*
npm run dev

# Enable specific component debugging
export DEBUG=bers:environment,bers:config
npm run dev

# Enable performance debugging
export DEBUG=bers:performance
npm run dev
```

### 2. BERS Development Tools

#### Environment Detection Debugging
```bash
# Test environment detection with debug info
npm run debug:environment-detection

# Test all detection sources
npm run debug:detection-sources

# Analyze detection performance
npm run debug:detection-performance
```

#### Configuration Debugging
```bash
# Debug configuration loading
npm run debug:config-loading --tenant=demo

# Debug schema validation
npm run debug:schema-validation --config=development

# Debug inheritance resolution
npm run debug:inheritance --source=staging --target=development
```

#### Provider Debugging
```bash
# Debug provider initialization
npm run debug:provider-init

# Debug provider configuration injection
npm run debug:provider-config

# Monitor provider performance
npm run debug:provider-performance
```

### 3. Common Issues and Solutions

#### Issue: Environment Detection Failing

**Symptoms**:
- Environment always defaults to production
- Detection time >100ms
- Incorrect environment detected

**Debugging**:
```bash
# Check environment variables
env | grep -E "(NODE_ENV|PICASSO_ENV)"

# Test detection sources individually
npm run debug:detection-sources

# Check detection cache
curl -s http://localhost:3003/api/monitoring/cache/environment-detection
```

**Solutions**:
```bash
# Clear detection cache
npm run cache:clear:environment-detection

# Reset environment variables
unset NODE_ENV PICASSO_ENV
export NODE_ENV=development

# Test manual detection
node -e "
const { environmentResolver } = require('./src/config/environment-resolver');
environmentResolver.detectEnvironment().then(console.log);
"
```

#### Issue: Configuration Loading Slow

**Symptoms**:
- Configuration loading >100ms
- S3 timeouts
- Cache misses

**Debugging**:
```bash
# Test S3 connectivity
aws s3 ls s3://myrecruiter-picasso-dev/tenants/

# Check configuration cache
curl -s http://localhost:3003/api/monitoring/cache/configuration

# Monitor configuration loading
npm run monitor:config-loading
```

**Solutions**:
```bash
# Clear configuration cache
npm run cache:clear:configuration

# Test local configuration loading
npm run config:test-local

# Verify S3 credentials
aws sts get-caller-identity
```

#### Issue: Provider Initialization Slow

**Symptoms**:
- Provider initialization >50ms
- Hot reload not working
- Provider health checks failing

**Debugging**:
```bash
# Check provider status
curl -s http://localhost:3003/api/monitoring/health/providers

# Test provider initialization
npm run test:provider-init

# Monitor provider performance
npm run monitor:provider-performance
```

**Solutions**:
```bash
# Restart provider system
npm run providers:restart

# Clear provider cache
npm run cache:clear:providers

# Reset development environment
npm run dev:reset
```

### 4. Performance Debugging

```bash
# Profile environment detection
npm run profile:environment-detection

# Profile configuration loading
npm run profile:config-loading

# Analyze memory usage
npm run profile:memory

# Check for memory leaks
npm run profile:memory-leaks
```

### 5. Log Analysis

**Log Locations in Development**:
```
Console Logs:    Browser developer console
Application Logs: Terminal running npm run dev
Debug Logs:      DEBUG=bers:* output
Performance Logs: http://localhost:3003/api/monitoring/logs
```

**Useful Log Commands**:
```bash
# Filter BERS logs
npm run dev 2>&1 | grep "BERS"

# Monitor performance logs
curl -s http://localhost:3003/api/monitoring/logs?level=performance

# Export logs for analysis
npm run logs:export --date=$(date +%Y-%m-%d)
```

---

## Build and Deployment

### 1. Local Build Testing

```bash
# Build for development
npm run build:dev

# Build for staging
npm run build:staging

# Build for production
npm run build:production

# Test built application
npm run preview
```

### 2. Build Validation

```bash
# Validate build configuration
npm run build:validate

# Test environment resolution in build
npm run build:test-environment

# Verify BERS integration in build
npm run build:test-bers

# Performance test built application
npm run build:test-performance
```

### 3. Deployment Preparation

```bash
# Pre-deployment validation
npm run pre-deploy:validate

# Test deployment configuration
npm run deploy:test-config

# Generate deployment artifacts
npm run deploy:prepare
```

### 4. Environment-Specific Builds

#### Development Build
```bash
# Development build with debugging
NODE_ENV=development npm run build

# Features enabled:
# - Hot reload capability
# - Debug mode
# - URL parameter detection
# - Detailed logging
```

#### Staging Build
```bash
# Staging build (production-like)
NODE_ENV=staging npm run build

# Features:
# - Production optimizations
# - Limited debugging
# - Performance monitoring
# - Security validation
```

#### Production Build
```bash
# Production build (optimized)
NODE_ENV=production npm run build

# Features:
# - Full optimizations
# - Minimal logging
# - Security hardening
# - Performance optimization
```

---

## Contributing Guidelines

### 1. Development Standards

**Code Style**:
- TypeScript for all new code
- ESLint configuration must pass
- Prettier formatting required
- JSDoc comments for public APIs

**Git Workflow**:
```bash
# Create feature branch
git checkout -b feature/bers-enhancement

# Make changes with descriptive commits
git commit -m "feat(environment): add custom environment detection source"

# Push and create pull request
git push origin feature/bers-enhancement
```

**Commit Message Format**:
```
type(scope): description

feat(environment): add new detection source
fix(config): resolve schema validation issue
docs(bers): update architecture documentation
test(monitoring): add performance benchmarks
```

### 2. Pull Request Process

**Before Creating PR**:
```bash
# Run full test suite
npm run test

# Run linting
npm run lint

# Run type checking
npm run type-check

# Test BERS components
npm run test:bers

# Build successfully
npm run build
```

**PR Requirements**:
- [ ] All tests passing
- [ ] No linting errors
- [ ] Type checking passing
- [ ] BERS validation tests passing
- [ ] Performance benchmarks within targets
- [ ] Documentation updated if needed
- [ ] Changelog entry added

### 3. Code Review Checklist

**BERS-Specific Review Points**:
- [ ] Environment detection logic is secure
- [ ] Configuration validation is comprehensive
- [ ] Performance targets are met
- [ ] Error handling is robust
- [ ] Monitoring integration is complete
- [ ] Security best practices followed

### 4. Testing Requirements

**Required Tests for BERS Changes**:
- Unit tests for new functions/classes
- Integration tests for component interactions
- Performance tests for critical paths
- Security tests for user inputs
- Validation tests for configuration changes

---

## Advanced Development

### 1. Custom Environment Detection

```typescript
// Add custom detection source
// src/config/custom-detection.ts

import type { EnvironmentDetectionSource, ValidatedEnvironment } from './environment-resolver';

export async function detectFromCustomSource(): Promise<{
  environment: ValidatedEnvironment;
  source: EnvironmentDetectionSource;
  confidence: 'high' | 'medium' | 'low';
} | null> {
  // Custom detection logic
  const customEnv = await getCustomEnvironment();
  
  if (customEnv) {
    return {
      environment: createValidatedEnvironment(customEnv),
      source: 'custom-source' as EnvironmentDetectionSource,
      confidence: 'high'
    };
  }
  
  return null;
}
```

### 2. Custom Configuration Schema

```json
// Add custom schema
// src/config/schemas/custom.schema.json

{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://chat.myrecruiter.ai/schemas/custom.schema.json",
  "title": "Custom Configuration Schema",
  "type": "object",
  "properties": {
    "customFeature": {
      "type": "object",
      "properties": {
        "enabled": {"type": "boolean"},
        "settings": {"type": "object"}
      },
      "required": ["enabled"]
    }
  },
  "required": ["customFeature"]
}
```

### 3. Custom Provider Implementation

```typescript
// Create custom provider
// src/providers/CustomProvider.tsx

import React, { createContext, useContext, ReactNode } from 'react';
import { useEnvironmentAware } from './systems/EnvironmentAwareProvider';

interface CustomProviderProps {
  children: ReactNode;
}

interface CustomContextType {
  customMethod: () => void;
}

const CustomContext = createContext<CustomContextType | null>(null);

export function CustomProvider({ children }: CustomProviderProps) {
  const { environment, config } = useEnvironmentAware();
  
  const customMethod = () => {
    // Implementation based on environment and config
    console.log(`Custom method called in ${environment}`);
  };
  
  return (
    <CustomContext.Provider value={{ customMethod }}>
      {children}
    </CustomContext.Provider>
  );
}

export function useCustom() {
  const context = useContext(CustomContext);
  if (!context) {
    throw new Error('useCustom must be used within CustomProvider');
  }
  return context;
}
```

### 4. Custom Monitoring Metrics

```typescript
// Add custom metrics
// src/monitoring/custom-metrics.ts

import { metricsCollector } from './metrics-collector';

export function recordCustomMetric(
  name: string,
  value: number,
  tags: Record<string, string> = {}
) {
  metricsCollector.recordMetric(name as any, value, {
    type: 'custom',
    ...tags
  });
}

export function trackCustomPerformance<T>(
  operationName: string,
  operation: () => Promise<T>
): Promise<T> {
  return metricsCollector.trackPerformance(operation, {
    operation: operationName,
    type: 'custom'
  });
}
```

---

## IDE Configuration

### VS Code Setup

#### Extensions Installation
```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "rangav.vscode-thunder-client",
    "eamodio.gitlens",
    "ms-vscode.vscode-jest"
  ]
}
```

#### Workspace Settings
```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "files.associations": {
    "*.json": "jsonc"
  },
  "jest.autoRun": "watch",
  "jest.showCoverageOnLoad": true
}
```

#### Tasks Configuration
```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start BERS Development",
      "type": "npm",
      "script": "dev",
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new"
      },
      "problemMatcher": ["$tsc-watch"]
    },
    {
      "label": "Test BERS Components",
      "type": "npm", 
      "script": "test:bers",
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "panel": "new"
      }
    }
  ]
}
```

#### Debug Configuration
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug BERS Environment Detection",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/scripts/debug-environment-detection.js",
      "env": {
        "DEBUG": "bers:*"
      },
      "console": "integratedTerminal"
    },
    {
      "name": "Debug BERS Configuration",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/scripts/debug-configuration.js",
      "args": ["--tenant", "demo"],
      "env": {
        "DEBUG": "bers:config"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

### WebStorm/IntelliJ Setup

#### TypeScript Configuration
- Enable TypeScript service
- Set Node.js interpreter to project's Node version
- Configure ESLint integration
- Enable Prettier integration

#### Run Configurations
Create run configurations for:
- Development server
- Test suites
- BERS validation
- Build processes

---

## Summary

This guide provides comprehensive setup and development workflows for BERS. Key takeaways:

**Quick Start**:
1. Install Node.js 18+ and npm 9+
2. Clone repository and run `npm install`
3. Create `.env.local` with development configuration
4. Run `npm run dev` to start development

**Development Workflow**:
1. Use `npm run dev` for development with hot reload
2. Access dashboard at http://localhost:5173/dev/
3. Run tests with `npm run test:bers`
4. Monitor performance at http://localhost:3003

**Key Commands**:
- `npm run dev` - Start development environment
- `npm run test:bers` - Test BERS components
- `npm run debug:environment-detection` - Debug environment detection
- `npm run build:dev` - Build for development

**Getting Help**:
- Check the monitoring dashboard for system status
- Use debug mode with `DEBUG=bers:*`
- Refer to troubleshooting section for common issues
- Contact the BERS development team for advanced issues

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-08-02  
**Next Review**: 2025-09-02  
**Owner**: BERS Development Team