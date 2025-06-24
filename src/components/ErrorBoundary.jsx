import React from 'react';
import { errorLogger, performanceMonitor } from '../utils/errorHandling';
import { config as environmentConfig } from '../config/environment';

/**
 * ErrorBoundary component for Picasso Widget
 * Catches React errors and provides recovery UI
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      lastErrorTime: null
    };
    
    // Track mount time for performance monitoring
    this.mountTime = performance.now();
  }

  static getDerivedStateFromError(_error) {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      lastErrorTime: Date.now()
    };
  }

  componentDidCatch(error, errorInfo) {
    const errorCount = this.state.errorCount + 1;
    
    // Log error to our error handling system
    const errorEntry = errorLogger.logError(error, {
      context: 'ErrorBoundary',
      errorInfo,
      errorCount,
      componentStack: errorInfo.componentStack,
      tenantHash: window.PicassoConfig?.tenant || 'unknown',
      widgetLoadTime: performance.now() - this.mountTime,
      iframeMode: document.body.getAttribute('data-iframe') === 'true'
    });

    // Update state with error details
    this.setState({
      error,
      errorInfo,
      errorCount
    });

    // Send error to Lambda endpoint (fire-and-forget)
    this.reportErrorToLambda(error, errorInfo, errorEntry);

    // Performance tracking - log slow widget loads
    const loadTime = performance.now() - this.mountTime;
    if (loadTime > 1000) {
      performanceMonitor.measure('slow_widget_load', () => {
        errorLogger.logWarning('Slow widget load detected', {
          loadTime,
          threshold: 1000,
          tenantHash: window.PicassoConfig?.tenant || 'unknown'
        });
      });
    }
  }

  reportErrorToLambda = async (error, errorInfo, errorEntry) => {
    try {
      // Get the error reporting endpoint from config
      const errorEndpoint = environmentConfig.ERROR_REPORTING_ENDPOINT || 
                           `${environmentConfig.API_BASE_URL}/Master_Function?action=log_error`;
      
      const tenantHash = window.PicassoConfig?.tenant || 
                        window.PicassoConfig?.tenant_id || 
                        'unknown';

      const payload = {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          componentStack: errorInfo.componentStack
        },
        metadata: {
          errorId: errorEntry.errorId,
          timestamp: new Date().toISOString(),
          tenantHash,
          environment: environmentConfig.ENVIRONMENT,
          version: window.PICASSO_VERSION || 'unknown',
          userAgent: navigator.userAgent,
          url: window.location.href,
          errorCount: this.state.errorCount,
          widgetLoadTime: performance.now() - this.mountTime,
          iframeMode: document.body.getAttribute('data-iframe') === 'true'
        },
        classification: errorEntry.classification
      };

      // Fire-and-forget approach - don't await or block on error reporting
      fetch(errorEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantHash
        },
        body: JSON.stringify(payload),
        credentials: 'omit'
      }).catch(err => {
        // Silently fail - don't let error reporting failures crash the widget
        console.warn('Failed to report error to Lambda:', err);
      });
    } catch (err) {
      // Silently fail - don't let error reporting failures crash the widget
      console.warn('Error in reportErrorToLambda:', err);
    }
  };

  handleReload = () => {
    // Track reload attempts
    errorLogger.logInfo('User initiated error recovery reload', {
      errorCount: this.state.errorCount,
      tenantHash: window.PicassoConfig?.tenant || 'unknown'
    });

    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    // If in iframe, notify parent to reload
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PICASSO_EVENT',
        event: 'ERROR_RECOVERY_RELOAD',
        payload: {
          errorCount: this.state.errorCount
        }
      }, '*');
    }

    // Reload the page
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI - simple and always works
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '20px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#f9fafb',
          color: '#374151',
          textAlign: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            maxWidth: '400px',
            width: '100%'
          }}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                margin: '0 auto 16px',
                color: '#ef4444'
              }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            
            <h2 style={{
              fontSize: '18px',
              fontWeight: '600',
              margin: '0 0 8px 0',
              color: '#111827'
            }}>
              Something went wrong
            </h2>
            
            <p style={{
              fontSize: '14px',
              margin: '0 0 20px 0',
              color: '#6b7280',
              lineHeight: '1.5'
            }}>
              We're sorry, but the chat widget encountered an error. 
              Please try reloading to continue.
            </p>
            
            <button
              onClick={this.handleReload}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                width: '100%',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#2563eb'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
            >
              Reload Chat
            </button>
            
            {environmentConfig.isDevelopment() && this.state.error && (
              <details style={{
                marginTop: '20px',
                fontSize: '12px',
                textAlign: 'left',
                color: '#6b7280'
              }}>
                <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
                  Error Details (Development Only)
                </summary>
                <pre style={{
                  backgroundColor: '#f3f4f6',
                  padding: '8px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;