# BERS API Documentation

## Build-time Environment Resolution System (BERS) v2.0.0

### Complete API Reference with Examples and Error Scenarios

This document provides comprehensive API documentation for all BERS components, including detailed examples, error scenarios, and integration patterns.

---

## Table of Contents

1. [API Overview](#api-overview)
2. [Environment Detection API](#environment-detection-api)
3. [Configuration Management API](#configuration-management-api)
4. [Monitoring API](#monitoring-api)
5. [Provider Integration API](#provider-integration-api)
6. [Security API](#security-api)
7. [Build Integration API](#build-integration-api)
8. [Error Handling](#error-handling)
9. [SDK and Client Libraries](#sdk-and-client-libraries)
10. [Integration Examples](#integration-examples)

---

## API Overview

### Base URLs

| Environment | Base URL | Port |
|-------------|----------|------|
| Development | `http://localhost:3003` | 3003 |
| Staging | `https://staging-chat.myrecruiter.ai` | 443 |
| Production | `https://chat.myrecruiter.ai` | 443 |

### Authentication

BERS APIs use different authentication methods based on the endpoint:

- **Public APIs**: No authentication required (health checks, environment detection)
- **Administrative APIs**: API key authentication
- **Internal APIs**: Service-to-service authentication

### Content Types

All APIs accept and return JSON unless otherwise specified:
```
Content-Type: application/json
Accept: application/json
```

### Rate Limiting

| API Category | Rate Limit | Window |
|--------------|------------|--------|
| Environment Detection | 1000 req/min | 1 minute |
| Configuration Loading | 500 req/min | 1 minute |
| Monitoring | 2000 req/min | 1 minute |
| Administrative | 100 req/min | 1 minute |

---

## Environment Detection API

### Detect Current Environment

Detects the current environment using multiple detection sources with fallback strategy.

**Endpoint**: `GET /api/environment/detect`

**Request**:
```bash
curl -X GET http://localhost:3003/api/environment/detect
```

**Response**:
```json
{
  "environment": "development",
  "detectionTime": 45,
  "source": "env-variable",
  "confidence": "high",
  "metadata": {
    "hostname": "localhost",
    "userAgent": "Mozilla/5.0...",
    "referrer": "",
    "configFileFound": false,
    "envVariables": {
      "NODE_ENV": "development",
      "PICASSO_ENV": "development"
    },
    "urlParameters": {},
    "buildContext": {
      "vite": {
        "dev": true,
        "prod": false,
        "mode": "development"
      }
    }
  },
  "validationErrors": []
}
```

**Response Fields**:
- `environment` (string): Detected environment (`development`, `staging`, `production`)
- `detectionTime` (number): Detection time in milliseconds
- `source` (string): Detection source used
- `confidence` (string): Confidence level (`high`, `medium`, `low`)
- `metadata` (object): Detection metadata and context
- `validationErrors` (array): Any validation errors encountered

### Validate Environment

Validates a specific environment configuration and security settings.

**Endpoint**: `POST /api/environment/validate`

**Request**:
```bash
curl -X POST http://localhost:3003/api/environment/validate \
  -H "Content-Type: application/json" \
  -d '{
    "environment": "production",
    "strictMode": true
  }'
```

**Response**:
```json
{
  "isValid": true,
  "errors": [],
  "warnings": [
    "Debug logging enabled in production"
  ],
  "validationTime": 23,
  "securityChecks": {
    "enforceHTTPS": true,
    "allowInsecure": false,
    "configurationSecurity": "valid"
  }
}
```

### Get Environment Configuration

Retrieves the complete configuration for a specific environment.

**Endpoint**: `GET /api/environment/config/{environment}`

**Request**:
```bash
curl -X GET http://localhost:3003/api/environment/config/development
```

**Response**:
```json
{
  "environment": "development",
  "version": "2.0.0",
  "buildTimestamp": 1691234567890,
  "api": {
    "baseUrl": "https://chat.myrecruiter.ai",
    "timeout": 30000,
    "retries": 3,
    "rateLimit": {
      "requests": 100,
      "window": 60000
    }
  },
  "cdn": {
    "assetsUrl": "https://chat.myrecruiter.ai/assets",
    "version": "2.0.0",
    "cacheBusting": true
  },
  "security": {
    "enforceHTTPS": false,
    "allowInsecure": true,
    "corsOrigins": ["http://localhost:5173"]
  },
  "features": {
    "streamingEnabled": true,
    "fileUploadsEnabled": true,
    "darkModeEnabled": true,
    "hotReloadEnabled": true
  }
}
```

### Performance Metrics

Get environment detection performance metrics.

**Endpoint**: `GET /api/environment/performance`

**Query Parameters**:
- `period` (string): Time period (`1h`, `24h`, `7d`, `30d`)
- `granularity` (string): Data granularity (`1m`, `5m`, `1h`)

**Request**:
```bash
curl -X GET "http://localhost:3003/api/environment/performance?period=1h&granularity=5m"
```

**Response**:
```json
{
  "period": "1h",
  "granularity": "5m",
  "averageDetectionTime": 42.5,
  "cacheHitRate": 0.95,
  "errorRate": 0.001,
  "totalDetections": 1247,
  "performanceTargets": {
    "detectionTime": 100,
    "cacheHitRate": 0.90,
    "errorRate": 0.01
  },
  "timeseries": [
    {
      "timestamp": 1691234400000,
      "detectionTime": 45,
      "cacheHitRate": 0.94,
      "errorRate": 0.0
    }
  ]
}
```

---

## Configuration Management API

### Load Configuration

Loads and validates configuration for a specific schema type and environment.

**Endpoint**: `POST /api/config/load`

**Request**:
```bash
curl -X POST http://localhost:3003/api/config/load \
  -H "Content-Type: application/json" \
  -d '{
    "schemaType": "environment",
    "environment": "development",
    "options": {
      "useCache": true,
      "validateSchema": true,
      "applyInheritance": true
    }
  }'
```

**Response**:
```json
{
  "config": {
    "environment": "development",
    "version": "2.0.0",
    "__brand": "ValidatedConfiguration",
    "validatedAt": 1691234567890,
    "schemaVersion": "2.0.0"
  },
  "loadTime": 67,
  "source": "cache",
  "validationResult": {
    "isValid": true,
    "errors": [],
    "warnings": []
  }
}
```

### Validate Configuration

Validates a configuration object against its schema.

**Endpoint**: `POST /api/config/validate`

**Request**:
```bash
curl -X POST http://localhost:3003/api/config/validate \
  -H "Content-Type: application/json" \
  -d '{
    "schemaType": "environment",
    "config": {
      "environment": "development",
      "version": "2.0.0",
      "api": {
        "baseUrl": "https://api.example.com"
      }
    },
    "context": {
      "strictMode": true,
      "allowUnknownProperties": false
    }
  }'
```

**Response**:
```json
{
  "isValid": false,
  "errors": [
    "Missing required property: api.timeout"
  ],
  "warnings": [
    "Property 'api.retries' using default value"
  ],
  "validationTime": 12
}
```

### Get Effective Configuration

Gets the final effective configuration after applying all inheritance rules and tenant overrides.

**Endpoint**: `GET /api/config/effective`

**Query Parameters**:
- `schemaType` (string, required): Configuration schema type
- `environment` (string, required): Target environment
- `tenantHash` (string, optional): Tenant identifier

**Request**:
```bash
curl -X GET "http://localhost:3003/api/config/effective?schemaType=environment&environment=development&tenantHash=demo123"
```

**Response**:
```json
{
  "config": {
    "environment": "development",
    "tenantHash": "demo123",
    "customizations": {
      "theme": {
        "primaryColor": "#007bff",
        "brandName": "Demo Company"
      }
    }
  },
  "inheritanceChain": [
    "production",
    "staging", 
    "development"
  ],
  "appliedOverrides": [
    "tenant-specific-theme",
    "development-features"
  ],
  "resolutionTime": 89
}
```

### Tenant Configuration Management

#### Load Tenant Configuration

**Endpoint**: `GET /api/config/tenant/{tenantHash}`

**Request**:
```bash
curl -X GET http://localhost:3003/api/config/tenant/demo123abc \
  -H "Authorization: Bearer <api-key>"
```

**Response**:
```json
{
  "tenantHash": "demo123abc",
  "config": {
    "widget": {
      "tenantHash": "demo123abc",
      "theme": {
        "primaryColor": "#007bff",
        "brandName": "Demo Company"
      }
    },
    "localization": {
      "defaultLanguage": "en",
      "supportedLanguages": ["en", "es"]
    }
  },
  "source": "S3",
  "loadTime": 234,
  "cached": false,
  "lastUpdated": 1691234567890
}
```

#### Update Tenant Configuration

**Endpoint**: `PUT /api/config/tenant/{tenantHash}`

**Request**:
```bash
curl -X PUT http://localhost:3003/api/config/tenant/demo123abc \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-key>" \
  -d '{
    "widget": {
      "theme": {
        "primaryColor": "#28a745",
        "brandName": "Updated Company"
      }
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "tenantHash": "demo123abc",
  "updateTime": 156,
  "validationResult": {
    "isValid": true,
    "errors": [],
    "warnings": []
  },
  "backupCreated": true,
  "version": "2.0.1"
}
```

### Schema Management

#### List Available Schemas

**Endpoint**: `GET /api/config/schemas`

**Request**:
```bash
curl -X GET http://localhost:3003/api/config/schemas
```

**Response**:
```json
{
  "schemas": [
    {
      "type": "environment",
      "version": "2.0.0",
      "title": "Environment Configuration Schema",
      "description": "Schema for environment-specific configuration"
    },
    {
      "type": "providers",
      "version": "2.0.0", 
      "title": "Providers Configuration Schema",
      "description": "Schema for provider-specific configuration"
    }
  ]
}
```

#### Get Schema Definition

**Endpoint**: `GET /api/config/schemas/{schemaType}`

**Request**:
```bash
curl -X GET http://localhost:3003/api/config/schemas/environment
```

**Response**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://chat.myrecruiter.ai/schemas/environment.schema.json",
  "title": "Environment Configuration Schema",
  "type": "object",
  "properties": {
    "environment": {
      "type": "string",
      "enum": ["development", "staging", "production"]
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "api": {
      "type": "object",
      "properties": {
        "baseUrl": {"type": "string", "format": "uri"},
        "timeout": {"type": "number", "minimum": 1000}
      },
      "required": ["baseUrl", "timeout"]
    }
  },
  "required": ["environment", "version", "api"]
}
```

---

## Monitoring API

### System Health

#### Overall System Health

**Endpoint**: `GET /api/monitoring/health`

**Request**:
```bash
curl -X GET http://localhost:3003/api/monitoring/health
```

**Response**:
```json
{
  "status": "healthy",
  "timestamp": 1691234567890,
  "uptime": 86400000,
  "version": "2.0.0",
  "environment": "development",
  "checks": [
    {
      "name": "environment-resolver",
      "status": "healthy",
      "duration": 23,
      "message": "Environment detection functioning normally"
    },
    {
      "name": "configuration-manager", 
      "status": "healthy",
      "duration": 45,
      "message": "Configuration loading and validation operational"
    }
  ],
  "overallStatus": "healthy"
}
```

#### Detailed Component Health

**Endpoint**: `GET /api/monitoring/health/detailed`

**Request**:
```bash
curl -X GET http://localhost:3003/api/monitoring/health/detailed
```

**Response**:
```json
{
  "system": {
    "status": "healthy",
    "uptime": 86400000,
    "memory": {
      "used": 157286400,
      "free": 367001600,
      "total": 524288000,
      "percentage": 30.0
    },
    "cpu": {
      "usage": 15.5,
      "load": [1.2, 1.1, 1.0]
    }
  },
  "components": {
    "environmentResolver": {
      "status": "healthy",
      "performanceMetrics": {
        "averageDetectionTime": 42.5,
        "cacheHitRate": 0.95,
        "errorRate": 0.001
      }
    },
    "configurationManager": {
      "status": "healthy",
      "performanceMetrics": {
        "averageLoadTime": 67.2,
        "cacheHits": 1247,
        "validationErrors": 0
      }
    },
    "monitoringSystem": {
      "status": "healthy",
      "performanceMetrics": {
        "metricsCollected": 15234,
        "alertsActive": 0,
        "dashboardConnections": 3
      }
    }
  }
}
```

### Metrics API

#### Get Metrics Summary

**Endpoint**: `GET /api/monitoring/metrics/summary`

**Query Parameters**:
- `period` (string): Time period (`1h`, `24h`, `7d`, `30d`)

**Request**:
```bash
curl -X GET "http://localhost:3003/api/monitoring/metrics/summary?period=24h"
```

**Response**:
```json
{
  "period": "24h",
  "summary": {
    "environmentDetectionTime": {
      "average": 42.5,
      "min": 15,
      "max": 89,
      "p95": 67,
      "count": 1247
    },
    "configurationResolutionTime": {
      "average": 67.2,
      "min": 23,
      "max": 156,
      "p95": 134,
      "count": 891
    },
    "providerInitializationTime": {
      "average": 18.7,
      "min": 8,
      "max": 34,
      "p95": 28,
      "count": 445
    }
  },
  "performanceTargets": {
    "environmentDetectionTime": 100,
    "configurationResolutionTime": 100,
    "providerInitializationTime": 50
  },
  "targetsMet": {
    "environmentDetectionTime": true,
    "configurationResolutionTime": true,
    "providerInitializationTime": true
  }
}
```

#### Get Specific Metric

**Endpoint**: `GET /api/monitoring/metrics/{metricType}`

**Query Parameters**:
- `period` (string): Time period
- `granularity` (string): Data granularity
- `tags` (string): Filter by tags (comma-separated)

**Request**:
```bash
curl -X GET "http://localhost:3003/api/monitoring/metrics/environment_detection_time?period=1h&granularity=5m&tags=environment:development"
```

**Response**:
```json
{
  "metricType": "environment_detection_time",
  "period": "1h",
  "granularity": "5m", 
  "tags": {"environment": "development"},
  "data": [
    {
      "timestamp": 1691234400000,
      "value": 45,
      "tags": {
        "environment": "development",
        "source": "env-variable",
        "confidence": "high"
      }
    }
  ],
  "summary": {
    "average": 42.5,
    "min": 32,
    "max": 67,
    "count": 12
  }
}
```

### Alerts API

#### Get Active Alerts

**Endpoint**: `GET /api/monitoring/alerts`

**Request**:
```bash
curl -X GET http://localhost:3003/api/monitoring/alerts
```

**Response**:
```json
{
  "active": [
    {
      "id": "alert-123",
      "rule": "config-resolution-critical",
      "severity": "warning",
      "status": "active",
      "triggeredAt": 1691234567890,
      "message": "Configuration resolution time above threshold",
      "details": {
        "currentValue": 156,
        "threshold": 100,
        "duration": "5 minutes"
      }
    }
  ],
  "resolved": [
    {
      "id": "alert-122",
      "rule": "environment-detection-slow",
      "severity": "info",
      "status": "resolved",
      "triggeredAt": 1691230000000,
      "resolvedAt": 1691231200000,
      "message": "Environment detection performance recovered"
    }
  ]
}
```

#### Acknowledge Alert

**Endpoint**: `POST /api/monitoring/alerts/{alertId}/acknowledge`

**Request**:
```bash
curl -X POST http://localhost:3003/api/monitoring/alerts/alert-123/acknowledge \
  -H "Content-Type: application/json" \
  -d '{
    "acknowledgedBy": "operator@company.com",
    "reason": "Investigating configuration performance issue"
  }'
```

**Response**:
```json
{
  "success": true,
  "alertId": "alert-123",
  "acknowledgedAt": 1691234567890,
  "acknowledgedBy": "operator@company.com",
  "status": "acknowledged"
}
```

### Dashboard API

#### Get Dashboard Data

**Endpoint**: `GET /api/monitoring/dashboard`

**Request**:
```bash
curl -X GET http://localhost:3003/api/monitoring/dashboard
```

**Response**:
```json
{
  "system": {
    "status": "healthy",
    "uptime": 86400000,
    "version": "2.0.0"
  },
  "performance": {
    "environmentDetection": {
      "current": 42.5,
      "target": 100,
      "trend": "stable"
    },
    "configurationResolution": {
      "current": 67.2,
      "target": 100,
      "trend": "improving"
    }
  },
  "alerts": {
    "critical": 0,
    "warning": 1,
    "info": 0
  },
  "components": {
    "healthy": 6,
    "degraded": 0,
    "failed": 0
  }
}
```

#### Real-time Metrics Stream

**Endpoint**: `GET /api/monitoring/stream` (Server-Sent Events)

**Request**:
```bash
curl -N -H "Accept: text/event-stream" http://localhost:3003/api/monitoring/stream
```

**Response** (SSE format):
```
event: metric
data: {"type":"environment_detection_time","value":45,"timestamp":1691234567890}

event: health
data: {"component":"environment-resolver","status":"healthy","timestamp":1691234567890}

event: alert
data: {"id":"alert-124","severity":"info","message":"System performance optimal"}
```

---

## Provider Integration API

### Provider Health

#### Get All Provider Status

**Endpoint**: `GET /api/providers/health`

**Request**:
```bash
curl -X GET http://localhost:3003/api/providers/health
```

**Response**:
```json
{
  "providers": [
    {
      "name": "ChatAPIProvider",
      "status": "healthy",
      "initializationTime": 18,
      "lastHealthCheck": 1691234567890,
      "configuration": {
        "environment": "development",
        "apiEndpoint": "https://api.example.com"
      }
    },
    {
      "name": "ChatStateProvider",
      "status": "healthy", 
      "initializationTime": 12,
      "lastHealthCheck": 1691234567890,
      "configuration": {
        "persistenceEnabled": true,
        "storageType": "memory"
      }
    }
  ],
  "overallStatus": "healthy",
  "totalProviders": 5,
  "healthyProviders": 5
}
```

#### Get Specific Provider Status

**Endpoint**: `GET /api/providers/{providerName}/health`

**Request**:
```bash
curl -X GET http://localhost:3003/api/providers/ChatAPIProvider/health
```

**Response**:
```json
{
  "name": "ChatAPIProvider",
  "status": "healthy",
  "initializationTime": 18,
  "lastHealthCheck": 1691234567890,
  "configuration": {
    "environment": "development",
    "apiEndpoint": "https://api.example.com",
    "timeout": 30000,
    "retries": 3
  },
  "performance": {
    "averageResponseTime": 245,
    "successRate": 0.998,
    "errorRate": 0.002
  },
  "dependencies": [
    {
      "name": "api-endpoint",
      "status": "healthy",
      "responseTime": 156
    }
  ]
}
```

### Provider Configuration

#### Inject Configuration

**Endpoint**: `POST /api/providers/{providerName}/configure`

**Request**:
```bash
curl -X POST http://localhost:3003/api/providers/ChatAPIProvider/configure \
  -H "Content-Type: application/json" \
  -d '{
    "environment": "development",
    "config": {
      "apiEndpoint": "https://dev-api.example.com",
      "timeout": 45000,
      "debug": true
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "providerName": "ChatAPIProvider",
  "configurationApplied": true,
  "restartRequired": false,
  "appliedConfig": {
    "apiEndpoint": "https://dev-api.example.com",
    "timeout": 45000,
    "debug": true,
    "environment": "development"
  },
  "configurationTime": 67
}
```

#### Get Provider Configuration

**Endpoint**: `GET /api/providers/{providerName}/config`

**Request**:
```bash
curl -X GET http://localhost:3003/api/providers/ChatAPIProvider/config
```

**Response**:
```json
{
  "providerName": "ChatAPIProvider",
  "environment": "development",
  "config": {
    "apiEndpoint": "https://dev-api.example.com",
    "timeout": 45000,
    "retries": 3,
    "debug": true,
    "rateLimit": {
      "requests": 100,
      "window": 60000
    }
  },
  "source": "environment-aware",
  "lastUpdated": 1691234567890,
  "version": "2.0.0"
}
```

### Provider Performance

#### Get Provider Performance Metrics

**Endpoint**: `GET /api/providers/performance`

**Query Parameters**:
- `provider` (string, optional): Specific provider name
- `period` (string): Time period

**Request**:
```bash
curl -X GET "http://localhost:3003/api/providers/performance?provider=ChatAPIProvider&period=1h"
```

**Response**:
```json
{
  "provider": "ChatAPIProvider",
  "period": "1h",
  "metrics": {
    "initializationTime": {
      "average": 18.7,
      "min": 12,
      "max": 28,
      "target": 50
    },
    "responseTime": {
      "average": 245,
      "min": 89,
      "max": 567,
      "p95": 445
    },
    "throughput": {
      "requestsPerMinute": 156,
      "successRate": 0.998
    },
    "errorRate": 0.002
  },
  "performanceTargets": {
    "initializationTime": 50,
    "responseTime": 1000,
    "successRate": 0.99,
    "errorRate": 0.01
  },
  "targetsMet": {
    "initializationTime": true,
    "responseTime": true,
    "successRate": true,
    "errorRate": true
  }
}
```

---

## Security API

### Security Validation

#### Validate Security Configuration

**Endpoint**: `POST /api/security/validate`

**Request**:
```bash
curl -X POST http://localhost:3003/api/security/validate \
  -H "Content-Type: application/json" \
  -d '{
    "environment": "production",
    "configuration": {
      "enforceHTTPS": true,
      "allowInsecure": false,
      "corsOrigins": ["https://myrecruiter.ai"]
    }
  }'
```

**Response**:
```json
{
  "isValid": true,
  "securityLevel": "high",
  "validationTime": 34,
  "checks": [
    {
      "check": "https-enforcement",
      "status": "pass",
      "message": "HTTPS enforcement properly configured"
    },
    {
      "check": "cors-configuration",
      "status": "pass", 
      "message": "CORS origins properly restricted"
    },
    {
      "check": "insecure-connections",
      "status": "pass",
      "message": "Insecure connections properly disabled"
    }
  ],
  "recommendations": []
}
```

#### Security Audit

**Endpoint**: `GET /api/security/audit`

**Request**:
```bash
curl -X GET http://localhost:3003/api/security/audit \
  -H "Authorization: Bearer <api-key>"
```

**Response**:
```json
{
  "auditId": "audit-20250802-001",
  "timestamp": 1691234567890,
  "environment": "production",
  "overallScore": 95,
  "categories": {
    "configuration": {
      "score": 98,
      "checks": 15,
      "passed": 15,
      "failed": 0
    },
    "authentication": {
      "score": 92,
      "checks": 8,
      "passed": 8,
      "failed": 0
    },
    "encryption": {
      "score": 95,
      "checks": 6,
      "passed": 6,
      "failed": 0
    }
  },
  "vulnerabilities": [],
  "recommendations": [
    {
      "severity": "low",
      "category": "authentication",
      "message": "Consider implementing multi-factor authentication",
      "remediation": "Enable MFA for administrative accounts"
    }
  ]
}
```

### Access Control

#### Check Access

**Endpoint**: `POST /api/security/access/check`

**Request**:
```bash
curl -X POST http://localhost:3003/api/security/access/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-key>" \
  -d '{
    "resource": "configuration",
    "action": "update",
    "environment": "production",
    "tenantHash": "demo123"
  }'
```

**Response**:
```json
{
  "allowed": true,
  "reason": "User has admin role with configuration update permissions",
  "permissions": [
    "configuration:read",
    "configuration:update",
    "configuration:delete"
  ],
  "restrictions": {
    "environments": ["development", "staging", "production"],
    "tenants": ["demo123", "tenant456"]
  },
  "auditTrail": {
    "timestamp": 1691234567890,
    "requestId": "req-abc123",
    "logged": true
  }
}
```

---

## Build Integration API

### Build Configuration

#### Get Build Configuration

**Endpoint**: `GET /api/build/config`

**Query Parameters**:
- `environment` (string): Target environment

**Request**:
```bash
curl -X GET "http://localhost:3003/api/build/config?environment=production"
```

**Response**:
```json
{
  "environment": "production",
  "buildConfiguration": {
    "optimization": {
      "minify": true,
      "treeshake": true,
      "codeSplitting": true
    },
    "bundling": {
      "target": "es2020",
      "format": "esm",
      "sourcemaps": false
    },
    "performance": {
      "maxBundleSize": 524288,
      "chunkSizeWarningLimit": 1000
    }
  },
  "environmentInjection": {
    "VITE_ENV": "production",
    "VITE_API_BASE_URL": "https://chat.myrecruiter.ai",
    "VITE_MONITORING_ENABLED": "true"
  },
  "version": "2.0.0"
}
```

#### Update Build Configuration

**Endpoint**: `PUT /api/build/config`

**Request**:
```bash
curl -X PUT http://localhost:3003/api/build/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-key>" \
  -d '{
    "environment": "development",
    "buildConfiguration": {
      "optimization": {
        "minify": false,
        "sourcemaps": true
      }
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "environment": "development",
  "configurationUpdated": true,
  "restartRequired": true,
  "updateTime": 45,
  "version": "2.0.1"
}
```

### Build Performance

#### Get Build Performance Metrics

**Endpoint**: `GET /api/build/performance`

**Query Parameters**:
- `period` (string): Time period
- `environment` (string, optional): Filter by environment

**Request**:
```bash
curl -X GET "http://localhost:3003/api/build/performance?period=24h&environment=development"
```

**Response**:
```json
{
  "period": "24h",
  "environment": "development",
  "builds": {
    "total": 156,
    "successful": 154,
    "failed": 2,
    "successRate": 0.987
  },
  "performance": {
    "averageBuildTime": 856,
    "minBuildTime": 234,
    "maxBuildTime": 1567,
    "target": 30000
  },
  "phases": {
    "dependencyResolution": {
      "average": 234,
      "target": 5000
    },
    "typeChecking": {
      "average": 445,
      "target": 10000
    },
    "bundling": {
      "average": 177,
      "target": 15000
    }
  },
  "trends": {
    "buildTime": "improving",
    "successRate": "stable",
    "bundleSize": "decreasing"
  }
}
```

---

## Error Handling

### Standard Error Response Format

All BERS APIs use a consistent error response format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Configuration validation failed",
    "details": {
      "field": "api.timeout",
      "reason": "Value must be greater than 1000"
    },
    "timestamp": 1691234567890,
    "requestId": "req-abc123"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `ENVIRONMENT_DETECTION_FAILED` | 500 | Environment detection failed |
| `CONFIGURATION_NOT_FOUND` | 404 | Configuration not found |
| `VALIDATION_ERROR` | 400 | Configuration validation failed |
| `SCHEMA_NOT_FOUND` | 404 | Schema definition not found |
| `TENANT_NOT_FOUND` | 404 | Tenant configuration not found |
| `S3_CONNECTION_ERROR` | 503 | S3 connectivity issue |
| `CACHE_ERROR` | 500 | Cache operation failed |
| `MONITORING_UNAVAILABLE` | 503 | Monitoring system unavailable |
| `PROVIDER_INITIALIZATION_FAILED` | 500 | Provider initialization failed |
| `SECURITY_VALIDATION_FAILED` | 403 | Security validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | API rate limit exceeded |
| `AUTHENTICATION_REQUIRED` | 401 | Authentication required |
| `AUTHORIZATION_FAILED` | 403 | Insufficient permissions |

### Error Scenarios and Solutions

#### Environment Detection Errors

**Error**: `ENVIRONMENT_DETECTION_FAILED`
```json
{
  "error": {
    "code": "ENVIRONMENT_DETECTION_FAILED",
    "message": "Unable to detect environment from any source",
    "details": {
      "sourcesAttempted": ["env-variable", "hostname-pattern", "build-context"],
      "fallbackUsed": true,
      "fallbackEnvironment": "production"
    }
  }
}
```

**Solution**: Check environment variables, clear cache, verify hostname patterns.

#### Configuration Loading Errors

**Error**: `S3_CONNECTION_ERROR`
```json
{
  "error": {
    "code": "S3_CONNECTION_ERROR",
    "message": "Failed to connect to S3 configuration bucket",
    "details": {
      "bucket": "myrecruiter-picasso",
      "region": "us-east-1",
      "errorType": "NetworkError",
      "retryAttempt": 3
    }
  }
}
```

**Solution**: Check AWS credentials, verify bucket permissions, check network connectivity.

#### Validation Errors

**Error**: `VALIDATION_ERROR`
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Configuration validation failed",
    "details": {
      "schemaType": "environment",
      "errors": [
        {
          "field": "api.timeout",
          "message": "must be greater than 1000",
          "value": 500
        }
      ],
      "warnings": [
        {
          "field": "api.retries",
          "message": "using default value of 3"
        }
      ]
    }
  }
}
```

**Solution**: Fix configuration values according to schema requirements.

---

## SDK and Client Libraries

### JavaScript/TypeScript SDK

#### Installation

```bash
npm install @myrecruiter/bers-sdk
```

#### Basic Usage

```typescript
import { BERSClient } from '@myrecruiter/bers-sdk';

const bers = new BERSClient({
  baseUrl: 'http://localhost:3003',
  apiKey: 'your-api-key', // Optional for public endpoints
  timeout: 10000
});

// Environment detection
const environment = await bers.environment.detect();
console.log('Environment:', environment.environment);

// Configuration loading
const config = await bers.configuration.load({
  schemaType: 'environment',
  environment: 'development'
});

// Monitoring
const health = await bers.monitoring.getHealth();
console.log('System status:', health.status);
```

#### Advanced Usage with Error Handling

```typescript
import { BERSClient, BERSError } from '@myrecruiter/bers-sdk';

const bers = new BERSClient({
  baseUrl: 'http://localhost:3003'
});

try {
  // Load tenant configuration with retry
  const tenantConfig = await bers.configuration.loadTenant('demo123', {
    retries: 3,
    timeout: 15000,
    fallbackToDefault: true
  });
  
  console.log('Tenant config loaded:', tenantConfig.config);
  
} catch (error) {
  if (error instanceof BERSError) {
    console.error('BERS Error:', error.code, error.message);
    
    // Handle specific error types
    switch (error.code) {
      case 'TENANT_NOT_FOUND':
        console.log('Using default configuration');
        break;
      case 'S3_CONNECTION_ERROR':
        console.log('Retrying with cache...');
        break;
      default:
        console.error('Unexpected error:', error);
    }
  }
}
```

### React Hooks

```typescript
import { useEnvironment, useConfiguration, useMonitoring } from '@myrecruiter/bers-react';

function App() {
  const { environment, isLoading, error } = useEnvironment();
  const { config } = useConfiguration('environment', environment);
  const { health } = useMonitoring();
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      <h1>Environment: {environment}</h1>
      <p>System Health: {health?.status}</p>
      <pre>{JSON.stringify(config, null, 2)}</pre>
    </div>
  );
}
```

### CLI Tool

```bash
# Install CLI
npm install -g @myrecruiter/bers-cli

# Environment detection
bers env detect

# Configuration management
bers config load --schema environment --env development
bers config validate --file ./config.json --schema environment

# Monitoring
bers monitor health
bers monitor metrics --period 1h

# Tenant management
bers tenant get demo123
bers tenant update demo123 --file ./tenant-config.json
```

---

## Integration Examples

### React Application Integration

```typescript
// App.tsx
import React from 'react';
import { BERSProvider } from '@myrecruiter/bers-react';
import { ChatWidget } from './components/ChatWidget';

function App() {
  return (
    <BERSProvider
      baseUrl="http://localhost:3003"
      autoDetectEnvironment={true}
      enableMonitoring={true}
    >
      <div className="app">
        <h1>Chat Application</h1>
        <ChatWidget />
      </div>
    </BERSProvider>
  );
}

// components/ChatWidget.tsx
import React from 'react';
import { useEnvironment, useConfiguration } from '@myrecruiter/bers-react';

export function ChatWidget() {
  const { environment } = useEnvironment();
  const { config, isLoading } = useConfiguration('widget', environment);
  
  if (isLoading) {
    return <div>Loading configuration...</div>;
  }
  
  return (
    <div 
      className="chat-widget"
      style={{ 
        backgroundColor: config?.theme?.primaryColor || '#007bff' 
      }}
    >
      <h2>{config?.theme?.brandName || 'Chat Widget'}</h2>
      <p>Environment: {environment}</p>
      <p>Features: {JSON.stringify(config?.features)}</p>
    </div>
  );
}
```

### Node.js Backend Integration

```typescript
// server.ts
import express from 'express';
import { BERSClient } from '@myrecruiter/bers-sdk';

const app = express();
const bers = new BERSClient({
  baseUrl: 'http://localhost:3003'
});

// Middleware for environment-aware configuration
app.use(async (req, res, next) => {
  try {
    const environment = await bers.environment.detect();
    const config = await bers.configuration.load({
      schemaType: 'api',
      environment: environment.environment
    });
    
    req.bersEnvironment = environment.environment;
    req.bersConfig = config.config;
    next();
  } catch (error) {
    console.error('BERS configuration failed:', error);
    res.status(500).json({ error: 'Configuration unavailable' });
  }
});

// API endpoint with environment-aware configuration
app.get('/api/config', async (req, res) => {
  const tenantHash = req.query.tenant as string;
  
  if (tenantHash) {
    try {
      const tenantConfig = await bers.configuration.loadTenant(tenantHash);
      res.json({
        environment: req.bersEnvironment,
        config: tenantConfig.config
      });
    } catch (error) {
      res.status(404).json({ error: 'Tenant not found' });
    }
  } else {
    res.json({
      environment: req.bersEnvironment,
      config: req.bersConfig
    });
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Build Tool Integration

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { bersPlugin } from '@myrecruiter/bers-vite-plugin';

export default defineConfig({
  plugins: [
    bersPlugin({
      configUrl: 'http://localhost:3003',
      environmentDetection: true,
      configurationInjection: true,
      performanceMonitoring: true
    })
  ],
  build: {
    rollupOptions: {
      external: (id) => {
        // Externalize BERS dependencies in production
        return process.env.NODE_ENV === 'production' && 
               id.includes('@myrecruiter/bers');
      }
    }
  }
});
```

### Monitoring Dashboard Integration

```typescript
// monitoring-dashboard.tsx
import React, { useState, useEffect } from 'react';
import { BERSClient } from '@myrecruiter/bers-sdk';

const bers = new BERSClient({
  baseUrl: 'http://localhost:3003'
});

export function MonitoringDashboard() {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  
  useEffect(() => {
    // Fetch initial data
    const fetchData = async () => {
      const [healthData, metricsData, alertsData] = await Promise.all([
        bers.monitoring.getHealth(),
        bers.monitoring.getMetricsSummary({ period: '1h' }),
        bers.monitoring.getAlerts()
      ]);
      
      setHealth(healthData);
      setMetrics(metricsData);
      setAlerts(alertsData.active);
    };
    
    fetchData();
    
    // Setup real-time updates
    const eventSource = new EventSource(
      'http://localhost:3003/api/monitoring/stream'
    );
    
    eventSource.addEventListener('health', (event) => {
      const data = JSON.parse(event.data);
      setHealth(prevHealth => ({
        ...prevHealth,
        components: {
          ...prevHealth?.components,
          [data.component]: data
        }
      }));
    });
    
    eventSource.addEventListener('alert', (event) => {
      const alert = JSON.parse(event.data);
      setAlerts(prevAlerts => [alert, ...prevAlerts]);
    });
    
    return () => {
      eventSource.close();
    };
  }, []);
  
  return (
    <div className="monitoring-dashboard">
      <h1>BERS Monitoring Dashboard</h1>
      
      <div className="health-section">
        <h2>System Health</h2>
        <div className={`status ${health?.status}`}>
          {health?.status || 'Loading...'}
        </div>
        <p>Uptime: {health?.uptime ? formatUptime(health.uptime) : 'N/A'}</p>
      </div>
      
      <div className="metrics-section">
        <h2>Performance Metrics</h2>
        {metrics && (
          <div className="metrics-grid">
            <div className="metric">
              <label>Environment Detection</label>
              <span>{metrics.summary.environmentDetectionTime?.average}ms</span>
              <div className={getTargetStatus(
                metrics.summary.environmentDetectionTime?.average,
                metrics.performanceTargets.environmentDetectionTime
              )}>
                Target: {metrics.performanceTargets.environmentDetectionTime}ms
              </div>
            </div>
            
            <div className="metric">
              <label>Configuration Resolution</label>
              <span>{metrics.summary.configurationResolutionTime?.average}ms</span>
              <div className={getTargetStatus(
                metrics.summary.configurationResolutionTime?.average,
                metrics.performanceTargets.configurationResolutionTime
              )}>
                Target: {metrics.performanceTargets.configurationResolutionTime}ms
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="alerts-section">
        <h2>Active Alerts</h2>
        {alerts.length === 0 ? (
          <p>No active alerts</p>
        ) : (
          <ul>
            {alerts.map(alert => (
              <li key={alert.id} className={`alert ${alert.severity}`}>
                <strong>{alert.message}</strong>
                <p>{alert.details?.message}</p>
                <small>{new Date(alert.triggeredAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m ${seconds % 60}s`;
}

function getTargetStatus(current: number, target: number): string {
  if (!current) return 'unknown';
  return current <= target ? 'target-met' : 'target-exceeded';
}
```

---

## Summary

This API documentation provides comprehensive coverage of all BERS APIs with practical examples and error handling guidance. Key features:

**Core APIs**:
- Environment Detection: Multi-source detection with performance monitoring
- Configuration Management: Schema validation, inheritance, tenant support
- Monitoring: Real-time metrics, health checks, alerting
- Provider Integration: Health monitoring, configuration injection
- Security: Validation, access control, audit trails

**Key Benefits**:
- Consistent REST API design
- Comprehensive error handling
- Real-time monitoring capabilities
- SDK and integration support
- Production-ready performance

**Getting Started**:
1. Use environment detection API for automatic environment identification
2. Load configurations with validation and caching
3. Monitor system health and performance
4. Integrate with existing applications using SDKs

**Support**:
- SDKs available for JavaScript/TypeScript, React
- CLI tools for operational tasks
- Integration examples for common frameworks
- Comprehensive error documentation

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-08-02  
**Next Review**: 2025-09-02  
**Owner**: BERS API Team