/**
 * Environment Resolver Adapter - Build System Bridge
 * 
 * JavaScript adapter that provides environment resolution functionality
 * for the build system without requiring TypeScript compilation.
 * Bridges to the full TypeScript environment-resolver when needed.
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

/* ===== SIMPLIFIED ENVIRONMENT DETECTION ===== */

/**
 * Simplified environment detection for build system
 * @returns {Promise<{environment: string, source: string, confidence: string}>}
 */
export async function detectEnvironment() {
  const detectionSources = [
    () => detectFromEnvironmentVariable(),
    () => detectFromHostname(),
    () => detectFromBuildContext(),
    () => ({ environment: 'production', source: 'default-fallback', confidence: 'low' })
  ];

  for (const detector of detectionSources) {
    const result = detector();
    if (result && result.environment) {
      return {
        environment: createValidatedEnvironment(result.environment, result.source, result.confidence),
        source: result.source,
        confidence: result.confidence,
        detectionTime: 0,
        metadata: {
          envVariables: getEnvironmentVariables(),
          urlParameters: {},
          buildContext: getBuildContext()
        },
        validationErrors: []
      };
    }
  }

  // Fallback
  return {
    environment: createValidatedEnvironment('production', 'default-fallback', 'low'),
    source: 'default-fallback',
    confidence: 'low',
    detectionTime: 0,
    metadata: { envVariables: {}, urlParameters: {}, buildContext: {} },
    validationErrors: []
  };
}

/**
 * Get environment configuration for build system
 */
export async function getEnvironmentConfiguration(env) {
  const envString = env.toString ? env.toString() : env;
  
  return {
    environment: envString,
    apiUrl: getApiUrlForEnvironment(envString),
    cdnUrl: getCdnUrlForEnvironment(envString),
    enableDebugging: envString === 'development',
    enablePerformanceMonitoring: envString !== 'development',
    enableSourceMaps: envString !== 'production',
    optimizationLevel: envString === 'production' ? 'high' : envString === 'staging' ? 'medium' : 'low'
  };
}

/**
 * Validate environment for build system
 */
export async function validateEnvironment(env) {
  return {
    isValid: true,
    errors: [],
    warnings: []
  };
}

/* ===== ENVIRONMENT DETECTION HELPERS ===== */

function detectFromEnvironmentVariable() {
  const envVars = getEnvironmentVariables();
  const nodeEnv = envVars.NODE_ENV;
  const picassoEnv = envVars.PICASSO_ENV;
  
  const env = picassoEnv || nodeEnv;
  if (env && ['development', 'staging', 'production'].includes(env)) {
    return {
      environment: env,
      source: 'env-variable',
      confidence: 'high'
    };
  }
  
  return null;
}

function detectFromHostname() {
  // In build context, we don't have window, but we can check NODE_ENV
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
      return { environment: 'development', source: 'hostname-pattern', confidence: 'medium' };
    }
    
    if (hostname.includes('staging') || hostname.includes('dev')) {
      return { environment: 'staging', source: 'hostname-pattern', confidence: 'medium' };
    }
    
    if (hostname.includes('myrecruiter.ai') && !hostname.includes('staging')) {
      return { environment: 'production', source: 'hostname-pattern', confidence: 'high' };
    }
  }
  
  return null;
}

function detectFromBuildContext() {
  // Check Vite build context
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.DEV) {
      return { environment: 'development', source: 'build-context', confidence: 'low' };
    }
    if (import.meta.env.PROD) {
      return { environment: 'production', source: 'build-context', confidence: 'low' };
    }
  }
  
  return null;
}

function createValidatedEnvironment(env, source, confidence) {
  // Create a string-like object that can hold additional properties
  const validated = new String(env);
  validated.__brand = 'ValidatedEnvironment';
  validated.detectionSource = source;
  validated.detectionTimestamp = Date.now();
  validated.confidence = confidence;
  return validated;
}

function getEnvironmentVariables() {
  if (typeof process !== 'undefined' && process.env) {
    return { ...process.env };
  }
  return {};
}

function getBuildContext() {
  const context = {};
  
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    context.vite = {
      dev: import.meta.env.DEV,
      prod: import.meta.env.PROD,
      mode: import.meta.env.MODE
    };
  }
  
  return context;
}

function getApiUrlForEnvironment(env) {
  switch (env) {
    case 'development':
      return 'http://localhost:3000/api';
    case 'staging':
      return 'https://api-staging.myrecruiter.ai';
    case 'production':
    default:
      return 'https://api.myrecruiter.ai';
  }
}

function getCdnUrlForEnvironment(env) {
  switch (env) {
    case 'development':
      return '';
    case 'staging':
      return 'https://cdn-staging.myrecruiter.ai';
    case 'production':
    default:
      return 'https://cdn.myrecruiter.ai';
  }
}

/* ===== SIMPLIFIED ENVIRONMENT RESOLVER INTERFACE ===== */

/**
 * Simplified environment resolver for build system
 */
export const environmentResolver = {
  async detectEnvironment() {
    return detectEnvironment();
  },
  
  async getEnvironmentConfiguration(env) {
    return getEnvironmentConfiguration(env);
  },
  
  async validateEnvironment(env) {
    return validateEnvironment(env);
  },
  
  async loadTenantConfiguration() {
    // Simplified for build - returns minimal config
    return {
      config: { tenantHash: 'build-time', widget: {} },
      source: 'build-default',
      loadTime: 0,
      cached: false,
      validationResult: { isValid: true, errors: [], warnings: [] }
    };
  },
  
  async resolveRuntimeConfiguration() {
    return { tenantHash: 'build-time', widget: {} };
  },
  
  clearCache() {
    // No-op for build
  },
  
  getPerformanceMetrics() {
    return {
      averageDetectionTime: 0,
      cacheHitRate: 1,
      errorRate: 0,
      lastDetectionTime: 0,
      totalDetections: 1
    };
  }
};

export default environmentResolver;