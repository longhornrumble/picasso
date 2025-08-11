/**
 * Streaming Endpoint Validation Utility
 * 
 * Validates streaming endpoint availability and connectivity
 * Provides detailed diagnostics for streaming configuration issues
 */

import { errorLogger } from './errorHandling';
import { config as environmentConfig } from '../config/environment';

/**
 * Test streaming endpoint connectivity
 * @param {string} streamingEndpoint - The streaming endpoint URL
 * @param {string} tenantHash - The tenant hash
 * @returns {Promise<Object>} Validation result with diagnostics
 */
export const validateStreamingEndpoint = async (streamingEndpoint, tenantHash) => {
  const validationStart = Date.now();
  const result = {
    isValid: false,
    endpoint: streamingEndpoint,
    tenantHash: tenantHash?.slice(0, 8) + '...',
    diagnostics: {
      connectionTest: null,
      responseTime: null,
      errorDetails: null,
      recommendations: []
    },
    timestamp: new Date().toISOString()
  };

  try {
    // Basic validation
    if (!streamingEndpoint) {
      result.diagnostics.errorDetails = 'No streaming endpoint provided';
      result.diagnostics.recommendations.push('Configure streaming endpoint in tenant config or environment');
      return result;
    }

    if (!tenantHash) {
      result.diagnostics.errorDetails = 'No tenant hash provided';
      result.diagnostics.recommendations.push('Ensure tenant hash is available');
      return result;
    }

    // URL validation
    try {
      new URL(streamingEndpoint);
    } catch (urlError) {
      result.diagnostics.errorDetails = `Invalid streaming endpoint URL: ${urlError.message}`;
      result.diagnostics.recommendations.push('Check streaming endpoint URL format');
      return result;
    }

    errorLogger.logInfo('🔍 Testing streaming endpoint connectivity', {
      endpoint: streamingEndpoint,
      tenantHash: result.tenantHash
    });

    // Test connection with a minimal EventSource request (using 't' parameter like Master_Function)
    const testParams = new URLSearchParams({
      t: tenantHash,
      user_input: '__CONNECTIVITY_TEST__',
      session_id: `test_${Date.now()}`
    });

    const testUrl = `${streamingEndpoint}?${testParams.toString()}`;
    
    // Create a promise that resolves/rejects based on EventSource behavior
    const connectionPromise = new Promise((resolve, reject) => {
      const eventSource = new EventSource(testUrl);
      let connectionEstablished = false;
      
      // Set a timeout for the connection test
      const timeoutId = setTimeout(() => {
        eventSource.close();
        if (!connectionEstablished) {
          reject(new Error('Connection timeout - endpoint may not be available'));
        }
      }, 10000); // 10 second timeout for validation

      eventSource.onopen = () => {
        connectionEstablished = true;
        const responseTime = Date.now() - validationStart;
        clearTimeout(timeoutId);
        eventSource.close();
        
        resolve({
          success: true,
          responseTime,
          message: 'Connection established successfully'
        });
      };

      eventSource.onerror = (error) => {
        clearTimeout(timeoutId);
        eventSource.close();
        
        const errorMessage = eventSource.readyState === EventSource.CLOSED 
          ? 'Connection was closed by server'
          : 'Connection error occurred';
          
        reject(new Error(`${errorMessage} (ReadyState: ${eventSource.readyState})`));
      };

      eventSource.onmessage = (event) => {
        // If we receive any message, the connection is working
        // Close immediately since this is just a test
        clearTimeout(timeoutId);
        eventSource.close();
        
        const responseTime = Date.now() - validationStart;
        resolve({
          success: true,
          responseTime,
          message: 'Received response from streaming endpoint',
          firstMessage: event.data?.substring(0, 100) || 'Empty message'
        });
      };
    });

    // Wait for connection result
    const connectionResult = await connectionPromise;
    
    result.isValid = true;
    result.diagnostics.connectionTest = connectionResult;
    result.diagnostics.responseTime = connectionResult.responseTime;
    
    errorLogger.logInfo('✅ Streaming endpoint validation successful', {
      endpoint: streamingEndpoint,
      tenantHash: result.tenantHash,
      responseTime: connectionResult.responseTime + 'ms'
    });

  } catch (error) {
    result.diagnostics.errorDetails = error.message;
    result.diagnostics.connectionTest = {
      success: false,
      error: error.message
    };

    // Add specific recommendations based on error type
    if (error.message.includes('timeout')) {
      result.diagnostics.recommendations.push('Check if streaming endpoint is responding');
      result.diagnostics.recommendations.push('Verify Lambda function is deployed and accessible');
    } else if (error.message.includes('Connection was closed')) {
      result.diagnostics.recommendations.push('Backend may not support streaming for this tenant');
      result.diagnostics.recommendations.push('Check tenant hash configuration in backend');
    } else if (error.message.includes('Connection error')) {
      result.diagnostics.recommendations.push('Check network connectivity');
      result.diagnostics.recommendations.push('Verify CORS configuration for streaming endpoint');
    }

    errorLogger.logError(error, {
      context: 'streaming_endpoint_validation',
      endpoint: streamingEndpoint,
      tenantHash: result.tenantHash
    });
  }

  result.diagnostics.validationDuration = Date.now() - validationStart;
  return result;
};

/**
 * Quick streaming endpoint health check
 * @param {string} tenantHash - The tenant hash
 * @returns {Promise<boolean>} True if streaming is likely available
 */
export const quickStreamingHealthCheck = async (tenantHash) => {
  try {
    const streamingEndpoint = environmentConfig.getStreamingUrl(tenantHash);
    const result = await validateStreamingEndpoint(streamingEndpoint, tenantHash);
    return result.isValid;
  } catch (error) {
    errorLogger.logWarning('Quick streaming health check failed', {
      error: error.message,
      tenantHash: tenantHash?.slice(0, 8) + '...'
    });
    return false;
  }
};

/**
 * Generate streaming configuration diagnostics report
 * @param {Object} tenantConfig - The tenant configuration
 * @param {string} tenantHash - The tenant hash
 * @returns {Object} Comprehensive diagnostics report
 */
export const generateStreamingDiagnostics = async (tenantConfig, tenantHash) => {
  const report = {
    timestamp: new Date().toISOString(),
    tenantHash: tenantHash?.slice(0, 8) + '...',
    configuration: {
      hasConfig: !!tenantConfig,
      streamingFeature: tenantConfig?.features?.streaming_enabled || tenantConfig?.features?.streaming,
      configuredEndpoint: tenantConfig?.endpoints?.streaming,
      environmentEndpoint: null,
      fallbackEndpoint: null
    },
    validation: {
      configEndpoint: null,
      environmentEndpoint: null,
      fallbackEndpoint: null
    },
    recommendations: []
  };

  try {
    // Test environment endpoint
    report.configuration.environmentEndpoint = environmentConfig.getStreamingUrl(tenantHash);
    report.validation.environmentEndpoint = await validateStreamingEndpoint(
      report.configuration.environmentEndpoint, 
      tenantHash
    );

    // Test configured endpoint if available
    if (tenantConfig?.endpoints?.streaming) {
      report.validation.configEndpoint = await validateStreamingEndpoint(
        tenantConfig.endpoints.streaming,
        tenantHash
      );
    }

    // Generate recommendations
    if (!report.validation.environmentEndpoint?.isValid && !report.validation.configEndpoint?.isValid) {
      report.recommendations.push('❌ No valid streaming endpoints found');
      report.recommendations.push('🔧 Check backend deployment and streaming Lambda function');
      report.recommendations.push('🔧 Verify tenant hash is configured in backend');
    } else if (report.validation.environmentEndpoint?.isValid) {
      report.recommendations.push('✅ Environment streaming endpoint is working');
      report.recommendations.push('💡 Consider enabling streaming in tenant configuration');
    }

    if (report.validation.configEndpoint?.isValid) {
      report.recommendations.push('✅ Configured streaming endpoint is working');
    }

    // Performance recommendations
    const envResponseTime = report.validation.environmentEndpoint?.diagnostics?.responseTime;
    if (envResponseTime > 2000) {
      report.recommendations.push(`⚠️ Slow streaming response time: ${envResponseTime}ms (target: <2000ms)`);
      report.recommendations.push('🔧 Consider optimizing backend streaming performance');
    }

  } catch (error) {
    report.error = error.message;
    report.recommendations.push('❌ Failed to complete diagnostics');
    report.recommendations.push('🔧 Check network connectivity and endpoint availability');
  }

  return report;
};

// Development utilities
if (typeof window !== 'undefined' && environmentConfig.isDevelopment()) {
  window.validateStreamingEndpoint = validateStreamingEndpoint;
  window.quickStreamingHealthCheck = quickStreamingHealthCheck;
  window.generateStreamingDiagnostics = generateStreamingDiagnostics;
  
  console.log('🔧 STREAMING VALIDATION UTILITIES AVAILABLE:');
  console.log('- validateStreamingEndpoint(endpoint, tenantHash)');
  console.log('- quickStreamingHealthCheck(tenantHash)');
  console.log('- generateStreamingDiagnostics(config, tenantHash)');
}