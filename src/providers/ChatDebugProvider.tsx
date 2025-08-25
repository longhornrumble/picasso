/**
 * ChatDebugProvider - Development tools and debugging utilities
 * 
 * Production-ready implementation focusing on:
 * - Development-time debugging utilities 
 * - Component state inspection and logging
 * - Error tracking and diagnostic information
 * - Performance profiling tools
 * - Only active in development mode
 */

import * as React from 'react';
const { createContext, useContext, useEffect, useRef } = React;
import type {
  Timestamp,
  Duration
} from '../types/branded';
import { createTimestamp, createDuration, extractValue } from '../types/branded';

/* ===== CORE INTERFACES ===== */

export interface DebugLogEntry {
  readonly id: string;
  readonly timestamp: Timestamp;
  readonly level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  readonly category: 'api' | 'streaming' | 'ui' | 'state' | 'performance' | 'memory' | 'network' | 'security' | 'error' | 'user_action' | 'system';
  readonly message: string;
  readonly data?: Record<string, unknown>;
  readonly stackTrace?: string;
}

export interface DebugSession {
  readonly id: string;
  readonly name: string;
  readonly startTime: Timestamp;
  readonly endTime?: Timestamp;
  readonly environment: DebugEnvironment;
  readonly version: string;
  readonly features: readonly string[];
  readonly metadata: Record<string, unknown>;
  readonly status: 'active' | 'paused' | 'completed';
}

export interface DebugEnvironment {
  readonly platform: string;
  readonly userAgent: string;
  readonly url: string;
  readonly referrer: string;
  readonly screenResolution: string;
  readonly viewport: { width: number; height: number };
  readonly language: string;
  readonly timezone: string;
}

export interface ComponentStateSnapshot {
  readonly id: string;
  readonly componentName: string;
  readonly timestamp: Timestamp;
  readonly state: Record<string, unknown>;
  readonly props: Record<string, unknown>;
  readonly renderCount: number;
  readonly lastRenderTime: Duration;
}

export interface DebugErrorInfo {
  readonly id: string;
  readonly timestamp: Timestamp;
  readonly error: Error;
  readonly context?: { 
    operation?: string;
    component?: string;
    customData?: Record<string, unknown>;
  };
  readonly stackTrace: string;
  readonly frequency: number;
  readonly resolved: boolean;
}

export interface PerformanceIssue {
  readonly type: 'slow_operation' | 'slow_render' | 'memory_leak' | 'excessive_rerenders';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
  readonly impact: string;
  readonly recommendation: string;
  readonly timestamp: Timestamp;
  readonly data: Record<string, unknown>;
}

export interface ChatDebugProvider {
  // Core state
  readonly session: DebugSession;
  readonly isDebugMode: boolean;
  readonly logs: readonly DebugLogEntry[];
  
  // Debug mode control
  enableDebugMode(): void;
  disableDebugMode(): void;
  toggleDebugMode(): boolean;
  isEnabled(): boolean;
  
  // Logging operations
  log(level: DebugLogEntry['level'], category: DebugLogEntry['category'], message: string, data?: Record<string, unknown>): void;
  logError(error: Error, context?: DebugErrorInfo['context']): string;
  logPerformance(operation: string, duration: Duration, metadata?: Record<string, unknown>): void;
  clearLogs(): number;
  
  // State inspection
  captureStateSnapshot(componentName: string, state: Record<string, unknown>, props?: Record<string, unknown>): void;
  getStateHistory(componentName: string): readonly ComponentStateSnapshot[];
  clearStateHistory(componentName?: string): number;
  inspectContext(): Record<string, unknown>;
  
  // Performance tools
  startProfiling(name: string): string;
  endProfiling(name: string): { duration: Duration; metadata: Record<string, unknown> } | null;
  measureMemory(): { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  
  // Error handling
  trackError(error: Error, context?: DebugErrorInfo['context']): string;
  getErrors(): readonly DebugErrorInfo[];
  clearErrors(): number;
  
  // Event handlers
  onDebugEvent(callback: (entry: DebugLogEntry) => void): () => void;
  onError(callback: (error: DebugErrorInfo) => void): () => void;
  onPerformanceIssue(callback: (issue: PerformanceIssue) => void): () => void;
  
  // Session management
  startSession(name?: string): string;
  endSession(): void;
  exportSession(): { logs: readonly DebugLogEntry[]; errors: readonly DebugErrorInfo[]; session: DebugSession };
}

/* ===== IMPLEMENTATION ===== */

class ChatDebugProviderImpl implements ChatDebugProvider {
  private _session: DebugSession;
  private _isDebugMode: boolean;
  private _logs: DebugLogEntry[] = [];
  private _errors: DebugErrorInfo[] = [];
  private _stateSnapshots = new Map<string, ComponentStateSnapshot[]>();
  private _activeProfiles = new Map<string, { name: string; startTime: number }>();
  
  // Event listeners
  private debugEventListeners = new Set<(entry: DebugLogEntry) => void>();
  private errorListeners = new Set<(error: DebugErrorInfo) => void>();
  private performanceIssueListeners = new Set<(issue: PerformanceIssue) => void>();
  
  // Configuration
  private maxLogEntries: number = 10000;
  private maxErrorEntries: number = 1000;
  private maxStateSnapshots: number = 100;

  constructor(enableByDefault: boolean = process.env.NODE_ENV === 'development') {
    this._isDebugMode = enableByDefault;
    this._session = this.createDebugSession();
    
    if (this._isDebugMode) {
      this.setupGlobalErrorHandlers();
      this.exposeDebugAPI();
    }
  }

  // Core state
  get session(): DebugSession {
    return { ...this._session };
  }

  get isDebugMode(): boolean {
    return this._isDebugMode;
  }

  get logs(): readonly DebugLogEntry[] {
    return [...this._logs];
  }

  // Debug mode control
  enableDebugMode(): void {
    if (process.env.NODE_ENV !== 'development') {
      console.warn('Debug mode can only be enabled in development environment');
      return;
    }
    this._isDebugMode = true;
    this.exposeDebugAPI();
  }

  disableDebugMode(): void {
    this._isDebugMode = false;
    this.removeDebugAPI();
  }

  toggleDebugMode(): boolean {
    if (this._isDebugMode) {
      this.disableDebugMode();
    } else {
      this.enableDebugMode();
    }
    return this._isDebugMode;
  }

  isEnabled(): boolean {
    return this._isDebugMode;
  }

  // Logging operations
  log(level: DebugLogEntry['level'], category: DebugLogEntry['category'], message: string, data?: Record<string, unknown>): void {
    if (!this._isDebugMode) return;
    
    const entry: DebugLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: createTimestamp(Date.now()),
      level,
      category,
      message,
      data,
      stackTrace: this.captureStackTrace()
    };

    this._logs.push(entry);
    
    // Trim logs if needed
    if (this._logs.length > this.maxLogEntries) {
      this._logs.shift();
    }

    // Console output in development
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = this.getConsoleMethod(level);
      consoleMethod(`[${category.toUpperCase()}] ${message}`, data || '');
    }

    // Notify listeners
    this.debugEventListeners.forEach(listener => {
      try {
        listener(entry);
      } catch (error) {
        console.error('Debug event listener error:', error);
      }
    });
  }

  logError(error: Error, context?: DebugErrorInfo['context']): string {
    if (!this._isDebugMode) return '';
    
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = createTimestamp(Date.now());

    // Check if this is a recurring error
    const existingError = this._errors.find(e => 
      e.error.message === error.message && e.error.stack === error.stack
    );

    if (existingError) {
      // Update frequency
      this._errors = this._errors.map(e => 
        e.id === existingError.id 
          ? { ...e, frequency: e.frequency + 1 }
          : e
      );
      return existingError.id;
    }

    const errorInfo: DebugErrorInfo = {
      id: errorId,
      timestamp,
      error,
      context,
      stackTrace: error.stack || '',
      frequency: 1,
      resolved: false
    };

    this._errors.push(errorInfo);

    // Trim errors if needed
    if (this._errors.length > this.maxErrorEntries) {
      this._errors.shift();
    }

    // Log the error
    this.log('error', 'error', error.message, { errorId, context });

    // Notify error listeners
    this.errorListeners.forEach(listener => {
      try {
        listener(errorInfo);
      } catch (listenerError) {
        console.error('Debug error listener error:', listenerError);
      }
    });

    return errorId;
  }

  logPerformance(operation: string, duration: Duration, metadata?: Record<string, unknown>): void {
    if (!this._isDebugMode) return;
    
    this.log('info', 'performance', `Operation ${operation} took ${duration}ms`, {
      operation,
      duration,
      ...metadata
    });

    // Check for performance issues
    if (extractValue(duration) > 1000) {
      const issue: PerformanceIssue = {
        type: 'slow_operation',
        severity: extractValue(duration) > 5000 ? 'critical' : 'medium',
        description: `${operation} took ${extractValue(duration)}ms`,
        impact: 'User experience may be affected',
        recommendation: 'Consider optimizing this operation',
        timestamp: createTimestamp(Date.now()),
        data: { operation, duration, ...metadata }
      };

      this.performanceIssueListeners.forEach(listener => {
        try {
          listener(issue);
        } catch (error) {
          console.error('Performance issue listener error:', error);
        }
      });
    }
  }

  clearLogs(): number {
    const count = this._logs.length;
    this._logs = [];
    return count;
  }

  // State inspection
  captureStateSnapshot(componentName: string, state: Record<string, unknown>, props?: Record<string, unknown>): void {
    if (!this._isDebugMode) return;

    const snapshot: ComponentStateSnapshot = {
      id: `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      componentName,
      timestamp: createTimestamp(Date.now()),
      state,
      props: props || {},
      renderCount: 0, // Would be tracked by React DevTools integration
      lastRenderTime: createDuration(0)
    };

    const snapshots = this._stateSnapshots.get(componentName) || [];
    snapshots.push(snapshot);
    
    // Keep only last N snapshots
    if (snapshots.length > this.maxStateSnapshots) {
      snapshots.shift();
    }
    
    this._stateSnapshots.set(componentName, snapshots);
  }

  getStateHistory(componentName: string): readonly ComponentStateSnapshot[] {
    return this._stateSnapshots.get(componentName) || [];
  }

  clearStateHistory(componentName?: string): number {
    if (componentName) {
      const snapshots = this._stateSnapshots.get(componentName) || [];
      this._stateSnapshots.delete(componentName);
      return snapshots.length;
    } else {
      const total = Array.from(this._stateSnapshots.values()).reduce((sum, arr) => sum + arr.length, 0);
      this._stateSnapshots.clear();
      return total;
    }
  }

  inspectContext(): Record<string, unknown> {
    if (!this._isDebugMode) return {};
    
    return {
      session: this._session,
      isDebugMode: this._isDebugMode,
      logCount: this._logs.length,
      errorCount: this._errors.length,
      stateSnapshotCount: Array.from(this._stateSnapshots.values()).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  // Performance tools
  startProfiling(name: string): string {
    if (!this._isDebugMode) return '';
    
    const id = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    this._activeProfiles.set(id, { name, startTime });
    
    if (process.env.NODE_ENV === 'development') {
      console.time(`Profile: ${name}`);
    }
    
    return id;
  }

  endProfiling(name: string): { duration: Duration; metadata: Record<string, unknown> } | null {
    if (!this._isDebugMode) return null;
    
    // Find active profiling session by name
    const profile = Array.from(this._activeProfiles.entries()).find(([_, p]) => p.name === name);
    
    if (!profile) {
      return null;
    }

    const [id, profileData] = profile;
    const endTime = Date.now();
    const duration = createDuration(endTime - profileData.startTime);
    
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(`Profile: ${name}`);
    }

    this._activeProfiles.delete(id);

    return {
      duration,
      metadata: {
        name: profileData.name,
        startTime: profileData.startTime,
        endTime
      }
    };
  }

  measureMemory(): { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } {
    const memory = (performance as any).memory;
    return {
      usedJSHeapSize: memory?.usedJSHeapSize || 0,
      totalJSHeapSize: memory?.totalJSHeapSize || 0,
      jsHeapSizeLimit: memory?.jsHeapSizeLimit || 0
    };
  }

  // Error handling
  trackError(error: Error, context?: DebugErrorInfo['context']): string {
    return this.logError(error, context);
  }

  getErrors(): readonly DebugErrorInfo[] {
    return [...this._errors];
  }

  clearErrors(): number {
    const count = this._errors.length;
    this._errors = [];
    return count;
  }

  // Event handlers
  onDebugEvent(callback: (entry: DebugLogEntry) => void): () => void {
    this.debugEventListeners.add(callback);
    return () => this.debugEventListeners.delete(callback);
  }

  onError(callback: (error: DebugErrorInfo) => void): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  onPerformanceIssue(callback: (issue: PerformanceIssue) => void): () => void {
    this.performanceIssueListeners.add(callback);
    return () => this.performanceIssueListeners.delete(callback);
  }

  // Session management
  startSession(name?: string): string {
    this._session = this.createDebugSession(name);
    return this._session.id;
  }

  endSession(): void {
    this._session = {
      ...this._session,
      endTime: createTimestamp(Date.now()),
      status: 'completed'
    };
  }

  exportSession(): { logs: readonly DebugLogEntry[]; errors: readonly DebugErrorInfo[]; session: DebugSession } {
    return {
      logs: this.logs,
      errors: this.getErrors(),
      session: this.session
    };
  }

  // Private helper methods
  private createDebugSession(name?: string): DebugSession {
    return {
      id: `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name || 'Debug Session',
      startTime: createTimestamp(Date.now()),
      environment: this.getEnvironment(),
      version: '1.0.0',
      features: ['logging', 'profiling', 'error_tracking', 'state_inspection'],
      metadata: {
        userAgent: navigator.userAgent,
        url: window.location.href
      },
      status: 'active'
    };
  }

  private getEnvironment(): DebugEnvironment {
    return {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      url: window.location.href,
      referrer: document.referrer,
      screenResolution: `${screen.width}x${screen.height}`,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  private captureStackTrace(): string | undefined {
    if (process.env.NODE_ENV !== 'development') return undefined;
    
    try {
      throw new Error();
    } catch (e) {
      return (e as Error).stack?.split('\n').slice(3, 8).join('\n');
    }
  }

  private getConsoleMethod(level: DebugLogEntry['level']): (...args: any[]) => void {
    switch (level) {
      case 'trace': return console.trace;
      case 'debug': return console.debug;
      case 'info': return console.info;
      case 'warn': return console.warn;
      case 'error': return console.error;
      case 'fatal': return console.error;
      default: return console.log;
    }
  }

  private setupGlobalErrorHandlers(): void {
    if (typeof window === 'undefined') return;

    // Handle unhandled errors
    window.addEventListener('error', (event) => {
      this.logError(new Error(event.message), {
        operation: 'global_error_handler',
        customData: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('🔍 ACTUAL UNHANDLED PROMISE REJECTION:', event.reason);
      console.error('🔍 PROMISE:', event.promise);
      console.error('🔍 STACK TRACE:', event.reason?.stack);
      // Don't call logError to avoid circular error logging
    });
  }

  private exposeDebugAPI(): void {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return;

    (window as any).__PICASSO_DEBUG__ = {
      session: this._session,
      log: this.log.bind(this),
      logError: this.logError.bind(this),
      captureState: this.captureStateSnapshot.bind(this),
      exportSession: this.exportSession.bind(this),
      measureMemory: this.measureMemory.bind(this),
      toggleDebugMode: this.toggleDebugMode.bind(this)
    };

    this.log('info', 'system', 'Debug API exposed on window.__PICASSO_DEBUG__');
  }

  private removeDebugAPI(): void {
    if (typeof window !== 'undefined') {
      delete (window as any).__PICASSO_DEBUG__;
    }
  }

  // Cleanup
  cleanup(): void {
    this.debugEventListeners.clear();
    this.errorListeners.clear();
    this.performanceIssueListeners.clear();
    this._stateSnapshots.clear();
    this._activeProfiles.clear();
    this._logs = [];
    this._errors = [];
    this._session = { ...this._session, status: 'completed' };
  }
}

/* ===== REACT CONTEXT ===== */

const ChatDebugContext = createContext<ChatDebugProvider | null>(null);

export interface ChatDebugProviderProps {
  children: React.ReactNode;
  enableByDefault?: boolean;
  maxLogEntries?: number;
  enableErrorTracking?: boolean;
  enablePerformanceProfiling?: boolean;
  onError?: (error: Error) => void;
  onDebugEvent?: (entry: DebugLogEntry) => void;
  onPerformanceIssue?: (issue: PerformanceIssue) => void;
}

/* ===== PROVIDER COMPONENT ===== */

export const ChatDebugProvider: React.FC<ChatDebugProviderProps> = ({
  children,
  enableByDefault = process.env.NODE_ENV === 'development',
  maxLogEntries = 10000,
  enableErrorTracking = true,
  enablePerformanceProfiling = true,
  onError,
  onDebugEvent,
  onPerformanceIssue
}) => {
  const providerRef = useRef<ChatDebugProviderImpl | null>(null);

  // Initialize provider
  useEffect(() => {
    // Only initialize in development mode
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    try {
      const provider = new ChatDebugProviderImpl(enableByDefault);

      // Set up event handlers
      if (onDebugEvent) {
        provider.onDebugEvent(onDebugEvent);
      }

      if (onPerformanceIssue) {
        provider.onPerformanceIssue(onPerformanceIssue);
      }

      if (onError) {
        provider.onError((errorInfo) => onError(errorInfo.error));
      }

      providerRef.current = provider;
    } catch (error) {
      console.error('Failed to initialize ChatDebugProvider:', error);
      if (onError) {
        onError(error as Error);
      }
    }

    return () => {
      if (providerRef.current) {
        providerRef.current.cleanup();
      }
    };
  }, [enableByDefault, onDebugEvent, onPerformanceIssue, onError]);

  // Don't render anything in production
  if (process.env.NODE_ENV === 'production') {
    return <>{children}</>;
  }

  return (
    <ChatDebugContext.Provider value={providerRef.current}>
      {children}
    </ChatDebugContext.Provider>
  );
};

/* ===== CUSTOM HOOK ===== */

export const useChatDebug = (): ChatDebugProvider | null => {
  const context = useContext(ChatDebugContext);
  return context; // Return null if not available (e.g., in production)
};

export default ChatDebugProvider;