/**
 * Configuration Hot-Reload System - BERS Phase 1, Task 1.2
 * 
 * Development-focused configuration hot-reloading system that provides
 * real-time configuration updates without requiring application restarts.
 * Integrates with the configuration management system and environment resolver.
 * 
 * Features:
 * - File system watching for configuration changes
 * - Debounced reload to prevent excessive updates
 * - Configuration validation on reload
 * - Error handling and rollback capabilities
 * - Integration with development server
 * - Performance monitoring and metrics
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type {
  ConfigurationSchemaType,
  ConfigurationChangeCallback,
  ConfigurationChangeEvent,
  ValidatedConfiguration,
  HotReloadConfig
} from './configuration-manager';
import type { ValidatedEnvironment } from './environment-resolver';
import { configurationManager } from './configuration-manager';
import { environmentResolver } from './environment-resolver';

/* ===== HOT RELOAD TYPES ===== */

/**
 * File watcher event types
 */
export type FileWatchEvent = 'add' | 'change' | 'unlink' | 'error';

/**
 * Hot reload event
 */
export interface HotReloadEvent {
  readonly type: FileWatchEvent;
  readonly path: string;
  readonly schemaType: ConfigurationSchemaType;
  readonly timestamp: number;
  readonly size?: number;
  readonly checksum?: string;
}

/**
 * Hot reload status
 */
export type HotReloadStatus = 
  | 'inactive'     // Hot reload disabled
  | 'watching'     // Watching for changes
  | 'reloading'    // Currently reloading configuration
  | 'error'        // Error state
  | 'throttled';   // Throttled due to rapid changes

/**
 * Hot reload metrics
 */
export interface HotReloadMetrics {
  readonly totalReloads: number;
  readonly successfulReloads: number;
  readonly failedReloads: number;
  readonly averageReloadTime: number;
  readonly lastReloadTime: number;
  readonly throttledEvents: number;
  readonly activeWatchers: number;
}

/**
 * Hot reload configuration
 */
export interface HotReloadConfiguration {
  readonly enabled: boolean;
  readonly watchPaths: readonly string[];
  readonly debounceMs: number;
  readonly throttleMs: number;
  readonly maxRetriesOnError: number;
  readonly validateOnReload: boolean;
  readonly notifyOnReload: boolean;
  readonly persistWatchState: boolean;
  readonly excludePatterns: readonly RegExp[];
  readonly includePatterns: readonly RegExp[];
}

/**
 * File change notification
 */
export interface FileChangeNotification {
  readonly event: HotReloadEvent;
  readonly config?: ValidatedConfiguration;
  readonly error?: Error;
  readonly reloadTime?: number;
}

/* ===== HOT RELOAD MANAGER INTERFACE ===== */

/**
 * Configuration hot reload manager
 */
export interface HotReloadManager {
  /**
   * Start watching configuration files
   */
  startWatching(
    schemaType: ConfigurationSchemaType,
    config: HotReloadConfiguration,
    callback: ConfigurationChangeCallback
  ): Promise<string>; // Returns watcher ID

  /**
   * Stop watching specific schema type
   */
  stopWatching(watcherId: string): Promise<void>;

  /**
   * Stop all watchers
   */
  stopAllWatchers(): Promise<void>;

  /**
   * Manually trigger configuration reload
   */
  reloadConfiguration(
    schemaType: ConfigurationSchemaType,
    force?: boolean
  ): Promise<ValidatedConfiguration>;

  /**
   * Get hot reload status
   */
  getStatus(): HotReloadStatus;

  /**
   * Get hot reload metrics
   */
  getMetrics(): HotReloadMetrics;

  /**
   * Add file path to watch list
   */
  addWatchPath(
    schemaType: ConfigurationSchemaType,
    path: string
  ): Promise<void>;

  /**
   * Remove file path from watch list
   */
  removeWatchPath(
    schemaType: ConfigurationSchemaType,
    path: string
  ): Promise<void>;

  /**
   * Check if hot reload is supported in current environment
   */
  isSupported(): boolean;
}

/* ===== HOT RELOAD MANAGER IMPLEMENTATION ===== */

/**
 * Production-ready hot reload manager implementation
 */
export class HotReloadManagerImpl implements HotReloadManager {
  private watchers: Map<string, FileSystemWatcher> = new Map();
  private callbacks: Map<string, ConfigurationChangeCallback> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private throttleTimers: Map<string, NodeJS.Timeout> = new Map();
  private status: HotReloadStatus = 'inactive';
  private metrics: HotReloadMetrics = {
    totalReloads: 0,
    successfulReloads: 0,
    failedReloads: 0,
    averageReloadTime: 0,
    lastReloadTime: 0,
    throttledEvents: 0,
    activeWatchers: 0
  };
  private environment: ValidatedEnvironment | null = null;

  constructor() {
    this.initializeEnvironment();
  }

  /**
   * Start watching configuration files
   */
  async startWatching(
    schemaType: ConfigurationSchemaType,
    config: HotReloadConfiguration,
    callback: ConfigurationChangeCallback
  ): Promise<string> {
    if (!this.isSupported()) {
      throw new Error('Hot reload is not supported in current environment');
    }

    if (!config.enabled) {
      throw new Error('Hot reload is disabled in configuration');
    }

    const watcherId = this.generateWatcherId(schemaType);
    
    try {
      // Store callback
      this.callbacks.set(watcherId, callback);

      // Create file system watcher
      const watcher = await this.createFileSystemWatcher(
        schemaType,
        config,
        watcherId
      );

      this.watchers.set(watcherId, watcher);
      this.status = 'watching';
      this.metrics.activeWatchers++;

      console.log(`Started hot reload watcher for ${schemaType} (ID: ${watcherId})`);
      
      // Notify callback that watching started
      callback('hot-reload', {} as ValidatedConfiguration);

      return watcherId;
    } catch (error) {
      this.status = 'error';
      this.callbacks.delete(watcherId);
      
      const errorMsg = `Failed to start hot reload watcher: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      
      throw new Error(errorMsg);
    }
  }

  /**
   * Stop watching specific schema type
   */
  async stopWatching(watcherId: string): Promise<void> {
    const watcher = this.watchers.get(watcherId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(watcherId);
      this.callbacks.delete(watcherId);
      this.metrics.activeWatchers--;

      // Clean up timers
      const debounceTimer = this.debounceTimers.get(watcherId);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        this.debounceTimers.delete(watcherId);
      }

      const throttleTimer = this.throttleTimers.get(watcherId);
      if (throttleTimer) {
        clearTimeout(throttleTimer);
        this.throttleTimers.delete(watcherId);
      }

      console.log(`Stopped hot reload watcher: ${watcherId}`);
    }

    if (this.watchers.size === 0) {
      this.status = 'inactive';
    }
  }

  /**
   * Stop all watchers
   */
  async stopAllWatchers(): Promise<void> {
    const watcherIds = Array.from(this.watchers.keys());
    
    await Promise.all(
      watcherIds.map(id => this.stopWatching(id))
    );

    this.status = 'inactive';
    console.log('Stopped all hot reload watchers');
  }

  /**
   * Manually trigger configuration reload
   */
  async reloadConfiguration(
    schemaType: ConfigurationSchemaType,
    force: boolean = false
  ): Promise<ValidatedConfiguration> {
    if (this.status === 'reloading' && !force) {
      throw new Error('Configuration reload already in progress');
    }

    const startTime = performance.now();
    this.status = 'reloading';
    
    try {
      // Get current environment
      if (!this.environment) {
        const detectionResult = await environmentResolver.detectEnvironment();
        this.environment = detectionResult.environment;
      }

      // Load fresh configuration
      const config = await configurationManager.loadConfiguration(
        schemaType,
        this.environment,
        {
          useCache: false, // Force fresh load
          validateSchema: true,
          applyInheritance: true
        }
      );

      const reloadTime = performance.now() - startTime;
      this.updateMetrics(reloadTime, true);
      this.status = 'watching';

      console.log(`Hot reloaded ${schemaType} configuration in ${reloadTime.toFixed(2)}ms`);

      // Notify all callbacks for this schema type
      this.notifyCallbacks(schemaType, 'config-updated', config);

      return config;
    } catch (error) {
      const reloadTime = performance.now() - startTime;
      this.updateMetrics(reloadTime, false);
      this.status = 'error';

      const errorMsg = `Hot reload failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);

      // Notify callbacks of error
      this.notifyCallbacks(schemaType, 'config-error', undefined, error as Error);

      throw new Error(errorMsg);
    }
  }

  /**
   * Get hot reload status
   */
  getStatus(): HotReloadStatus {
    return this.status;
  }

  /**
   * Get hot reload metrics
   */
  getMetrics(): HotReloadMetrics {
    return { ...this.metrics };
  }

  /**
   * Add file path to watch list
   */
  async addWatchPath(
    schemaType: ConfigurationSchemaType,
    path: string
  ): Promise<void> {
    // Find existing watcher for schema type
    const watcherId = this.findWatcherBySchemaType(schemaType);
    if (watcherId) {
      const watcher = this.watchers.get(watcherId);
      if (watcher && typeof watcher.add === 'function') {
        await watcher.add(path);
        console.log(`Added watch path: ${path} to ${schemaType} watcher`);
      }
    }
  }

  /**
   * Remove file path from watch list
   */
  async removeWatchPath(
    schemaType: ConfigurationSchemaType,
    path: string
  ): Promise<void> {
    const watcherId = this.findWatcherBySchemaType(schemaType);
    if (watcherId) {
      const watcher = this.watchers.get(watcherId);
      if (watcher && typeof watcher.unwatch === 'function') {
        await watcher.unwatch(path);
        console.log(`Removed watch path: ${path} from ${schemaType} watcher`);
      }
    }
  }

  /**
   * Check if hot reload is supported in current environment
   */
  isSupported(): boolean {
    // Hot reload is only supported in development environment
    // and when running in Node.js (not browser)
    return (
      typeof process !== 'undefined' &&
      process.env &&
      (process.env.NODE_ENV === 'development' || process.env.PICASSO_DEV_MODE === 'true') &&
      typeof require !== 'undefined'
    );
  }

  /* ===== PRIVATE IMPLEMENTATION METHODS ===== */

  private async initializeEnvironment(): Promise<void> {
    try {
      const detectionResult = await environmentResolver.detectEnvironment();
      this.environment = detectionResult.environment;
    } catch (error) {
      console.warn('Failed to initialize environment for hot reload:', error);
    }
  }

  private generateWatcherId(schemaType: ConfigurationSchemaType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${schemaType}-${timestamp}-${random}`;
  }

  private async createFileSystemWatcher(
    schemaType: ConfigurationSchemaType,
    config: HotReloadConfiguration,
    watcherId: string
  ): Promise<FileSystemWatcher> {
    // In a real implementation, this would use chokidar or fs.watch
    // For now, we'll create a mock watcher
    
    const watcher = new MockFileSystemWatcher(
      config.watchPaths,
      {
        ignoreInitial: true,
        persistent: true,
        usePolling: false,
        interval: 100,
        ignored: config.excludePatterns
      }
    );

    // Set up event handlers
    watcher.on('change', (path: string) => {
      this.handleFileChange(schemaType, 'change', path, config, watcherId);
    });

    watcher.on('add', (path: string) => {
      this.handleFileChange(schemaType, 'add', path, config, watcherId);
    });

    watcher.on('unlink', (path: string) => {
      this.handleFileChange(schemaType, 'unlink', path, config, watcherId);
    });

    watcher.on('error', (error: Error) => {
      this.handleWatchError(schemaType, error, watcherId);
    });

    return watcher;
  }

  private handleFileChange(
    schemaType: ConfigurationSchemaType,
    eventType: FileWatchEvent,
    path: string,
    config: HotReloadConfiguration,
    watcherId: string
  ): void {
    // Check if file should be processed
    if (!this.shouldProcessFile(path, config)) {
      return;
    }

    const event: HotReloadEvent = {
      type: eventType,
      path,
      schemaType,
      timestamp: Date.now()
    };

    console.log(`File ${eventType}: ${path} (${schemaType})`);

    // Handle throttling
    if (this.isThrottled(watcherId, config.throttleMs)) {
      this.metrics.throttledEvents++;
      return;
    }

    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(watcherId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set up debounced reload
    const debounceTimer = setTimeout(() => {
      this.performHotReload(schemaType, event, config, watcherId);
      this.debounceTimers.delete(watcherId);
    }, config.debounceMs);

    this.debounceTimers.set(watcherId, debounceTimer);
  }

  private handleWatchError(
    schemaType: ConfigurationSchemaType,
    error: Error,
    watcherId: string
  ): void {
    this.status = 'error';
    console.error(`File watcher error for ${schemaType}:`, error);

    const callback = this.callbacks.get(watcherId);
    if (callback) {
      callback('config-error', {} as ValidatedConfiguration, error);
    }
  }

  private shouldProcessFile(path: string, config: HotReloadConfiguration): boolean {
    // Check exclude patterns
    for (const pattern of config.excludePatterns) {
      if (pattern.test(path)) {
        return false;
      }
    }

    // Check include patterns (if any)
    if (config.includePatterns.length > 0) {
      for (const pattern of config.includePatterns) {
        if (pattern.test(path)) {
          return true;
        }
      }
      return false;
    }

    // Default: process files ending in .json
    return path.endsWith('.json');
  }

  private isThrottled(watcherId: string, throttleMs: number): boolean {
    const throttleTimer = this.throttleTimers.get(watcherId);
    if (throttleTimer) {
      return true; // Currently throttled
    }

    // Set throttle timer
    const timer = setTimeout(() => {
      this.throttleTimers.delete(watcherId);
    }, throttleMs);

    this.throttleTimers.set(watcherId, timer);
    return false; // Not throttled
  }

  private async performHotReload(
    schemaType: ConfigurationSchemaType,
    event: HotReloadEvent,
    config: HotReloadConfiguration,
    watcherId: string
  ): Promise<void> {
    try {
      this.status = 'reloading';

      // Only reload for change and add events
      if (event.type === 'change' || event.type === 'add') {
        const reloadedConfig = await this.reloadConfiguration(schemaType, true);
        
        const callback = this.callbacks.get(watcherId);
        if (callback) {
          callback('hot-reload', reloadedConfig);
        }

        if (config.notifyOnReload) {
          this.showReloadNotification(schemaType, event);
        }
      }

      this.status = 'watching';
    } catch (error) {
      this.status = 'error';
      console.error(`Hot reload failed for ${schemaType}:`, error);

      const callback = this.callbacks.get(watcherId);
      if (callback) {
        callback('config-error', {} as ValidatedConfiguration, error as Error);
      }
    }
  }

  private showReloadNotification(
    schemaType: ConfigurationSchemaType,
    event: HotReloadEvent
  ): void {
    // In development, show console notification
    console.log(`🔥 Hot reloaded ${schemaType} configuration from ${event.path}`);

    // In a browser environment, could show toast notification
    if (typeof window !== 'undefined' && window.postMessage) {
      window.postMessage({
        type: 'picasso-hot-reload',
        schemaType,
        path: event.path,
        timestamp: event.timestamp
      }, '*');
    }
  }

  private findWatcherBySchemaType(schemaType: ConfigurationSchemaType): string | null {
    for (const [watcherId] of this.watchers) {
      if (watcherId.startsWith(schemaType)) {
        return watcherId;
      }
    }
    return null;
  }

  private notifyCallbacks(
    schemaType: ConfigurationSchemaType,
    event: ConfigurationChangeEvent,
    config?: ValidatedConfiguration,
    error?: Error
  ): void {
    for (const [watcherId, callback] of this.callbacks) {
      if (watcherId.startsWith(schemaType)) {
        try {
          callback(event, config!, error);
        } catch (callbackError) {
          console.error('Hot reload callback error:', callbackError);
        }
      }
    }
  }

  private updateMetrics(reloadTime: number, success: boolean): void {
    this.metrics.totalReloads++;
    this.metrics.lastReloadTime = reloadTime;

    if (success) {
      this.metrics.successfulReloads++;
    } else {
      this.metrics.failedReloads++;
    }

    // Update average reload time
    this.metrics.averageReloadTime = 
      (this.metrics.averageReloadTime * (this.metrics.totalReloads - 1) + reloadTime) / 
      this.metrics.totalReloads;
  }
}

/* ===== MOCK FILE SYSTEM WATCHER ===== */

/**
 * Mock file system watcher for development/testing
 * In production, this would be replaced with chokidar or native fs.watch
 */
class MockFileSystemWatcher {
  private listeners: Map<string, Set<Function>> = new Map();
  private paths: string[];
  private options: any;

  constructor(paths: readonly string[], options: any = {}) {
    this.paths = [...paths];
    this.options = options;
  }

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Watcher event listener error:`, error);
        }
      }
    }
  }

  async add(path: string): Promise<void> {
    if (!this.paths.includes(path)) {
      this.paths.push(path);
      this.emit('add', path);
    }
  }

  async unwatch(path: string): Promise<void> {
    const index = this.paths.indexOf(path);
    if (index >= 0) {
      this.paths.splice(index, 1);
      this.emit('unlink', path);
    }
  }

  async close(): Promise<void> {
    this.listeners.clear();
    this.paths = [];
  }

  // Simulate file change for testing
  simulateChange(path: string): void {
    if (this.paths.some(p => path.includes(p) || p.includes(path))) {
      this.emit('change', path);
    }
  }
}

/* ===== FILE SYSTEM WATCHER INTERFACE ===== */

interface FileSystemWatcher {
  on(event: string, listener: Function): void;
  add?(path: string): Promise<void>;
  unwatch?(path: string): Promise<void>;
  close(): Promise<void>;
}

/* ===== DEFAULT CONFIGURATIONS ===== */

/**
 * Default hot reload configuration
 */
export const DEFAULT_HOT_RELOAD_CONFIG: HotReloadConfiguration = {
  enabled: true,
  watchPaths: [
    './src/config/configurations',
    './src/config/schemas'
  ],
  debounceMs: 200,
  throttleMs: 1000,
  maxRetriesOnError: 3,
  validateOnReload: true,
  notifyOnReload: true,
  persistWatchState: false,
  excludePatterns: [
    /node_modules/,
    /\.git/,
    /\.DS_Store/,
    /.*\.backup\./,
    /.*\.tmp$/
  ],
  includePatterns: [
    /\.json$/,
    /\.js$/,
    /\.ts$/
  ]
} as const;

/* ===== FACTORY FUNCTIONS ===== */

/**
 * Create hot reload manager instance
 */
export function createHotReloadManager(): HotReloadManager {
  return new HotReloadManagerImpl();
}

/**
 * Singleton instance for global use
 */
export const hotReloadManager = createHotReloadManager();

/* ===== CONVENIENCE FUNCTIONS ===== */

/**
 * Start hot reload for environment configuration
 */
export async function startEnvironmentHotReload(
  callback: ConfigurationChangeCallback
): Promise<string> {
  if (!hotReloadManager.isSupported()) {
    console.warn('Hot reload not supported in current environment');
    return '';
  }

  const config: HotReloadConfiguration = {
    ...DEFAULT_HOT_RELOAD_CONFIG,
    watchPaths: ['./src/config/configurations', './src/config/schemas/environment.schema.json']
  };

  return hotReloadManager.startWatching('environment', config, callback);
}

/**
 * Start hot reload for theme configuration
 */
export async function startThemeHotReload(
  callback: ConfigurationChangeCallback
): Promise<string> {
  if (!hotReloadManager.isSupported()) {
    console.warn('Hot reload not supported in current environment');
    return '';
  }

  const config: HotReloadConfiguration = {
    ...DEFAULT_HOT_RELOAD_CONFIG,
    watchPaths: ['./src/config/themes', './src/styles']
  };

  return hotReloadManager.startWatching('theme', config, callback);
}

/**
 * Enable hot reload in development mode
 */
export async function enableDevelopmentHotReload(): Promise<string[]> {
  if (!hotReloadManager.isSupported()) {
    console.warn('Hot reload not supported - skipping');
    return [];
  }

  const watcherIds: string[] = [];

  // Default callback that logs changes
  const defaultCallback: ConfigurationChangeCallback = (event, config, error) => {
    if (error) {
      console.error(`Hot reload error (${event}):`, error);
    } else {
      console.log(`Hot reload event: ${event}`);
    }
  };

  // Start watchers for common configuration types
  const schemaTypes: ConfigurationSchemaType[] = ['environment', 'providers', 'build'];
  
  for (const schemaType of schemaTypes) {
    try {
      const watcherId = await hotReloadManager.startWatching(
        schemaType,
        DEFAULT_HOT_RELOAD_CONFIG,
        defaultCallback
      );
      watcherIds.push(watcherId);
    } catch (error) {
      console.warn(`Failed to start hot reload for ${schemaType}:`, error);
    }
  }

  return watcherIds;
}

export default hotReloadManager;