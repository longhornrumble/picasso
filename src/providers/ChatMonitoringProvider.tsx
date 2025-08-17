/**
 * ChatMonitoringProvider - Memory leak detection, performance metrics
 * 
 * Production-ready implementation focusing on:
 * - Memory usage tracking and leak detection
 * - Performance monitoring and metrics collection  
 * - Resource utilization monitoring
 * - Alert system and thresholds
 * - Enterprise-grade error handling
 */

import * as React from 'react';
const { createContext, useContext, useEffect, useRef } = React;
import type {
  Timestamp,
  Duration,
  MemorySize,
  Percentage,
  OperationId,
  AlertId
} from '../types/branded';
import { createTimestamp, createDuration, createMemorySize, createPercentage, extractValue } from '../types/branded';

/* ===== CORE INTERFACES ===== */

export interface MemoryInfo {
  readonly usedJSHeapSize: number;
  readonly totalJSHeapSize: number;
  readonly jsHeapSizeLimit: number;
  readonly sessionDurationMinutes: number;
  readonly memoryUtilization: number;
}

export interface PerformanceAlert {
  readonly id: string;
  readonly type: 'memory' | 'performance' | 'network' | 'error';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly timestamp: Timestamp;
  readonly resolved: boolean;
}

export interface MemoryLeak {
  readonly type: 'cache_overflow' | 'memory_spike' | 'listener_leak' | 'timer_leak';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
  readonly source: string;
  readonly growthRate: number;
  readonly estimatedTimeToExhaustion: Duration;
  readonly affectedComponents: readonly string[];
  readonly suggestedFixes: readonly string[];
}

export interface MonitoringConfig {
  readonly memoryThreshold: MemorySize;
  readonly memoryGrowthThreshold: number;
  readonly performanceThreshold: Duration;
  readonly alertCooldown: Duration;
  readonly maxAlerts: number;
  readonly enableMemoryMonitoring: boolean;
  readonly enablePerformanceMonitoring: boolean;
  readonly enableAlerts: boolean;
}

export interface ChatMonitoringProvider {
  // Core state
  readonly isMonitoring: boolean;
  readonly config: MonitoringConfig;
  readonly alerts: readonly PerformanceAlert[];
  
  // Memory monitoring
  getMemorySnapshot(): MemoryInfo;
  detectMemoryLeaks(): Promise<readonly MemoryLeak[]>;
  forceGarbageCollection(): Promise<{ success: boolean; memoryFreed: number }>;
  
  // Performance monitoring  
  recordMetric(name: string, value: number, metadata?: Record<string, unknown>): void;
  startPerformanceProfiling(name: string): string;
  stopPerformanceProfiling(profilingId: string): { duration: Duration; metadata: Record<string, unknown> };
  
  // Alert management
  createAlert(type: string, message: string, severity: string): string;
  resolveAlert(alertId: string): boolean;
  clearAlerts(): number;
  
  // Monitoring control
  startMonitoring(): void;
  stopMonitoring(): void;
  
  // Event handlers
  onPerformanceAlert(callback: (alert: PerformanceAlert) => void): () => void;
  onMemoryLeakDetected(callback: (leak: MemoryLeak) => void): () => void;
}

/* ===== IMPLEMENTATION ===== */

class ChatMonitoringProviderImpl implements ChatMonitoringProvider {
  private _isMonitoring: boolean = false;
  private _config: MonitoringConfig;
  private _alerts: PerformanceAlert[] = [];
  private _metrics = new Map<string, { value: number; timestamp: Timestamp; metadata?: Record<string, unknown> }>();
  private _activeProfiles = new Map<string, { name: string; startTime: number }>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private sessionStartTime: Timestamp;
  private memorySnapshots: Array<{ timestamp: Timestamp; memory: MemoryInfo }> = [];
  
  // Event listeners
  private performanceAlertListeners = new Set<(alert: PerformanceAlert) => void>();
  private memoryLeakListeners = new Set<(leak: MemoryLeak) => void>();

  constructor(config?: Partial<MonitoringConfig>) {
    this.sessionStartTime = createTimestamp(Date.now());
    this._config = {
      memoryThreshold: createMemorySize(100 * 1024 * 1024), // 100MB
      memoryGrowthThreshold: 5, // 5MB/min
      performanceThreshold: createDuration(2000), // 2 seconds
      alertCooldown: createDuration(60000), // 1 minute
      maxAlerts: 100,
      enableMemoryMonitoring: true,
      enablePerformanceMonitoring: true,
      enableAlerts: true,
      ...config
    };
  }

  // Core properties
  get isMonitoring(): boolean {
    return this._isMonitoring;
  }

  get config(): MonitoringConfig {
    return { ...this._config };
  }

  get alerts(): readonly PerformanceAlert[] {
    return [...this._alerts];
  }

  // Memory monitoring
  getMemorySnapshot(): MemoryInfo {
    const memory = (performance as any).memory;
    const sessionDuration = Math.round((Date.now() - extractValue(this.sessionStartTime)) / (1000 * 60));
    
    const memoryInfo: MemoryInfo = {
      usedJSHeapSize: memory?.usedJSHeapSize || 0,
      totalJSHeapSize: memory?.totalJSHeapSize || 0,
      jsHeapSizeLimit: memory?.jsHeapSizeLimit || 0,
      sessionDurationMinutes: sessionDuration,
      memoryUtilization: memory?.totalJSHeapSize 
        ? Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100)
        : 0
    };

    // Store snapshot for leak detection
    this.memorySnapshots.push({
      timestamp: createTimestamp(Date.now()),
      memory: memoryInfo
    });

    // Keep only last 100 snapshots
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots.shift();
    }

    return memoryInfo;
  }

  async detectMemoryLeaks(): Promise<readonly MemoryLeak[]> {
    const leaks: MemoryLeak[] = [];
    
    if (this.memorySnapshots.length < 2) {
      return leaks;
    }

    // Calculate memory growth rate over last 10 snapshots
    const recentSnapshots = this.memorySnapshots.slice(-10);
    if (recentSnapshots.length >= 2) {
      const first = recentSnapshots[0];
      const last = recentSnapshots[recentSnapshots.length - 1];
      const timeDiff = (extractValue(last.timestamp) - extractValue(first.timestamp)) / (1000 * 60); // minutes
      const memDiff = (last.memory.usedJSHeapSize - first.memory.usedJSHeapSize) / (1024 * 1024); // MB
      const growthRate = timeDiff > 0 ? memDiff / timeDiff : 0;

      if (growthRate > this._config.memoryGrowthThreshold) {
        const estimatedTime = (last.memory.jsHeapSizeLimit - last.memory.usedJSHeapSize) / (growthRate * 1024 * 1024 / 60) * 1000;
        
        leaks.push({
          type: 'cache_overflow',
          severity: growthRate > this._config.memoryGrowthThreshold * 2 ? 'critical' : 'high',
          description: `Memory growing at ${growthRate.toFixed(2)} MB/min`,
          source: 'memory_monitor',
          growthRate,
          estimatedTimeToExhaustion: createDuration(Math.max(0, estimatedTime)),
          affectedComponents: ['chat_provider'],
          suggestedFixes: [
            'Clear message history',
            'Reset content cache',
            'Force garbage collection'
          ]
        });

        // Notify listeners
        this.memoryLeakListeners.forEach(listener => {
          try {
            listener(leaks[leaks.length - 1]);
          } catch (error) {
            console.error('Memory leak listener error:', error);
          }
        });
      }
    }

    // Check memory threshold
    const current = this.getMemorySnapshot();
    if (current.usedJSHeapSize > extractValue(this._config.memoryThreshold)) {
      leaks.push({
        type: 'memory_spike',
        severity: 'medium',
        description: `Memory usage exceeds threshold: ${(current.usedJSHeapSize / (1024 * 1024)).toFixed(2)} MB`,
        source: 'memory_monitor',
        growthRate: 0,
        estimatedTimeToExhaustion: createDuration(60 * 60 * 1000), // 1 hour default
        affectedComponents: ['chat_provider'],
        suggestedFixes: ['Trigger cleanup routines']
      });
    }

    return leaks;
  }

  async forceGarbageCollection(): Promise<{ success: boolean; memoryFreed: number }> {
    const before = this.getMemorySnapshot();
    
    // Browser doesn't allow forced GC, but we can try
    if ((window as any).gc) {
      try {
        (window as any).gc();
      } catch (error) {
        console.warn('Could not force garbage collection:', error);
      }
    }
    
    // Wait a bit and measure again
    await new Promise(resolve => setTimeout(resolve, 100));
    const after = this.getMemorySnapshot();
    const memoryFreed = Math.max(0, before.usedJSHeapSize - after.usedJSHeapSize);

    return {
      success: memoryFreed > 0,
      memoryFreed
    };
  }

  // Performance monitoring
  recordMetric(name: string, value: number, metadata?: Record<string, unknown>): void {
    const timestamp = createTimestamp(Date.now());
    this._metrics.set(name, { value, timestamp, metadata });

    // Check performance thresholds
    if (name.includes('duration') || name.includes('time')) {
      if (value > extractValue(this._config.performanceThreshold)) {
        this.createAlert('performance', 
          `${name} exceeded threshold: ${value}ms`, 
          value > extractValue(this._config.performanceThreshold) * 2 ? 'critical' : 'high'
        );
      }
    }
  }

  startPerformanceProfiling(name: string): string {
    const id = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    this._activeProfiles.set(id, { name, startTime });
    
    if (process.env.NODE_ENV === 'development') {
      console.time(`[Monitoring] ${name}`);
    }
    
    return id;
  }

  stopPerformanceProfiling(profilingId: string): { duration: Duration; metadata: Record<string, unknown> } {
    const profile = this._activeProfiles.get(profilingId);
    if (!profile) {
      throw new Error(`Profiling session ${profilingId} not found`);
    }

    const endTime = Date.now();
    const duration = createDuration(endTime - profile.startTime);
    
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(`[Monitoring] ${profile.name}`);
    }

    this._activeProfiles.delete(profilingId);
    
    // Record as metric
    this.recordMetric(`profiling.${profile.name}`, extractValue(duration), { profilingId });

    return {
      duration,
      metadata: {
        name: profile.name,
        startTime: profile.startTime,
        endTime
      }
    };
  }

  // Alert management
  createAlert(type: string, message: string, severity: string): string {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const alert: PerformanceAlert = {
      id: alertId,
      type: type as any,
      severity: severity as any,
      message,
      timestamp: createTimestamp(Date.now()),
      resolved: false
    };

    this._alerts.push(alert);

    // Trim alerts if needed
    if (this._alerts.length > this._config.maxAlerts) {
      this._alerts.shift();
    }

    // Notify listeners
    this.performanceAlertListeners.forEach(listener => {
      try {
        listener(alert);
      } catch (error) {
        console.error('Performance alert listener error:', error);
      }
    });

    return alertId;
  }

  resolveAlert(alertId: string): boolean {
    const alertIndex = this._alerts.findIndex(alert => alert.id === alertId);
    if (alertIndex === -1) return false;

    this._alerts[alertIndex] = {
      ...this._alerts[alertIndex],
      resolved: true
    };

    return true;
  }

  clearAlerts(): number {
    const count = this._alerts.length;
    this._alerts = [];
    return count;
  }

  // Monitoring control
  startMonitoring(): void {
    if (this._isMonitoring) return;

    this._isMonitoring = true;
    
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000); // Every 30 seconds

    if (process.env.NODE_ENV === 'development') {
      console.log('[Monitoring] Started monitoring');
    }
  }

  stopMonitoring(): void {
    if (!this._isMonitoring) return;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this._isMonitoring = false;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[Monitoring] Stopped monitoring');
    }
  }

  // Event handlers
  onPerformanceAlert(callback: (alert: PerformanceAlert) => void): () => void {
    this.performanceAlertListeners.add(callback);
    return () => this.performanceAlertListeners.delete(callback);
  }

  onMemoryLeakDetected(callback: (leak: MemoryLeak) => void): () => void {
    this.memoryLeakListeners.add(callback);
    return () => this.memoryLeakListeners.delete(callback);
  }

  // Private methods
  private collectMetrics(): void {
    // Collect memory metrics
    const memory = this.getMemorySnapshot();
    this.recordMetric('memory.used', memory.usedJSHeapSize);
    this.recordMetric('memory.utilization', memory.memoryUtilization);

    // Check for memory leaks
    this.detectMemoryLeaks();
  }

  // Cleanup
  cleanup(): void {
    this.stopMonitoring();
    this.performanceAlertListeners.clear();
    this.memoryLeakListeners.clear();
    this._metrics.clear();
    this._activeProfiles.clear();
    this._alerts = [];
    this.memorySnapshots = [];
  }
}

/* ===== REACT CONTEXT ===== */

const ChatMonitoringContext = createContext<ChatMonitoringProvider | null>(null);

export interface ChatMonitoringProviderProps {
  children: React.ReactNode;
  config?: Partial<MonitoringConfig>;
  enableByDefault?: boolean;
  onAlert?: (alert: PerformanceAlert) => void;
  onMemoryLeak?: (leak: MemoryLeak) => void;
  onError?: (error: Error) => void;
}

/* ===== PROVIDER COMPONENT ===== */

export const ChatMonitoringProvider: React.FC<ChatMonitoringProviderProps> = ({
  children,
  config,
  enableByDefault = true,
  onAlert,
  onMemoryLeak,
  onError
}) => {
  const providerRef = useRef<ChatMonitoringProviderImpl | null>(null);

  // Initialize provider
  useEffect(() => {
    try {
      const provider = new ChatMonitoringProviderImpl(config);

      // Set up event handlers
      if (onAlert) {
        provider.onPerformanceAlert(onAlert);
      }

      if (onMemoryLeak) {
        provider.onMemoryLeakDetected(onMemoryLeak);
      }

      // Start monitoring if enabled
      if (enableByDefault) {
        provider.startMonitoring();
      }

      providerRef.current = provider;
    } catch (error) {
      console.error('Failed to initialize ChatMonitoringProvider:', error);
      if (onError) {
        onError(error as Error);
      }
    }

    return () => {
      if (providerRef.current) {
        providerRef.current.cleanup();
      }
    };
  }, [config, enableByDefault, onAlert, onMemoryLeak, onError]);

  return (
    <ChatMonitoringContext.Provider value={providerRef.current}>
      {children}
    </ChatMonitoringContext.Provider>
  );
};

/* ===== CUSTOM HOOK ===== */

export const useChatMonitoring = (): ChatMonitoringProvider => {
  const context = useContext(ChatMonitoringContext);
  if (!context) {
    throw new Error('useChatMonitoring must be used within a ChatMonitoringProvider');
  }
  return context;
};

/**
 * Safe version of useChatMonitoring that returns null if provider not available
 */
export const useChatMonitoringSafe = (): ChatMonitoringProvider | null => {
  const context = useContext(ChatMonitoringContext);
  return context;
};

export default ChatMonitoringProvider;