import React from 'react';
import { errorLogger, performanceMonitor } from '../utils/errorHandling';
import { config as environmentConfig } from '../config/environment';
import './ErrorBoundary.css';

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
    // TODO: Implement error reporting when Lambda endpoint is ready
    // For now, just log to console in development
    if (environmentConfig.isDevelopment()) {
      console.error('ErrorBoundary caught:', {
        error,
        errorInfo,
        errorEntry
      });
    }
    // Temporarily disabled until Lambda endpoint supports error logging
    return;
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
        <div className="error-boundary-container">
          <div className="error-boundary-panel">
            <div className="error-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h2 className="error-heading">
              Something went wrong
            </h2>

            <p className="error-message">
              We're sorry, but the chat widget encountered an error.
              <span className="error-message-subtitle">
                Please try reloading to continue.
              </span>
            </p>

            <button
              onClick={this.handleReload}
              className="error-reload-button"
            >
              Reload Chat
            </button>

            {environmentConfig.isDevelopment() && this.state.error && (
              <details className="error-details">
                <summary className="error-details-summary">
                  Error Details (Development Only)
                </summary>
                <pre className="error-details-content">
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