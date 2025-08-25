/**
 * Configuration Monitoring Dashboard - BERS Task 4.1
 * 
 * Real-time visualization of configuration states across environments with
 * performance metrics, drift detection, and historical tracking.
 * 
 * Features:
 * - Real-time configuration state visualization
 * - Environment detection status and performance metrics
 * - Configuration drift detection and alerting
 * - Historical configuration change tracking
 * - Interactive dashboard with live updates
 * 
 * @version 1.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type { 
  Environment, 
  EnvironmentDetectionResult,
  PerformanceMetrics,
  ValidatedEnvironment
} from '../config/environment-resolver';
import type { 
  RuntimeConfig, 
  ConfigValidationResult,
  EnvironmentConfig
} from '../types/config';

/* ===== DASHBOARD TYPES ===== */

export interface DashboardConfig {
  readonly refreshInterval: number; // milliseconds
  readonly historyRetention: number; // days
  readonly alertThresholds: AlertThresholds;
  readonly displayOptions: DisplayOptions;
}

export interface AlertThresholds {
  readonly performanceDegradation: number; // percentage
  readonly configurationErrors: number; // count
  readonly detectionFailureRate: number; // percentage
  readonly responseTimeThreshold: number; // milliseconds
}

export interface DisplayOptions {
  readonly showPerformanceCharts: boolean;
  readonly showConfigurationHistory: boolean;
  readonly showEnvironmentMap: boolean;
  readonly theme: 'light' | 'dark' | 'auto';
}

export interface DashboardState {
  readonly environments: EnvironmentStatus[];
  readonly performanceMetrics: PerformanceMetrics;
  readonly configurationHistory: ConfigurationHistoryEntry[];
  readonly activeAlerts: Alert[];
  readonly systemHealth: SystemHealthStatus;
  readonly lastUpdate: number;
}

export interface EnvironmentStatus {
  readonly environment: ValidatedEnvironment;
  readonly status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  readonly detectionResult: EnvironmentDetectionResult;
  readonly configurationValid: boolean;
  readonly lastConfigUpdate: number;
  readonly activeConnections: number;
  readonly responseTime: number;
}

export interface ConfigurationHistoryEntry {
  readonly timestamp: number;
  readonly environment: Environment;
  readonly changeType: 'created' | 'updated' | 'deleted' | 'drift_detected';
  readonly configHash: string;
  readonly changes: ConfigurationDiff[];
  readonly source: string;
  readonly user?: string;
}

export interface ConfigurationDiff {
  readonly path: string;
  readonly operation: 'add' | 'remove' | 'change';
  readonly oldValue?: any;
  readonly newValue?: any;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface Alert {
  readonly id: string;
  readonly type: 'performance' | 'configuration' | 'security' | 'system';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly title: string;
  readonly message: string;
  readonly environment?: Environment;
  readonly timestamp: number;
  readonly acknowledged: boolean;
  readonly resolvedAt?: number;
  readonly metadata: Record<string, any>;
}

export interface SystemHealthStatus {
  readonly overall: 'healthy' | 'degraded' | 'critical';
  readonly components: ComponentHealth[];
  readonly uptime: number;
  readonly lastHealthCheck: number;
}

export interface ComponentHealth {
  readonly name: string;
  readonly status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  readonly responseTime?: number;
  readonly errorRate?: number;
  readonly lastCheck: number;
  readonly details?: Record<string, any>;
}

/* ===== DASHBOARD IMPLEMENTATION ===== */

export class ConfigurationMonitoringDashboard {
  private state: DashboardState;
  private eventSource: EventSource | null = null;
  private listeners: Map<string, (data: any) => void> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: DashboardConfig,
    private readonly dashboardElement: HTMLElement
  ) {
    this.state = this.initializeState();
    this.setupEventSource();
    this.render();
    this.startPeriodicRefresh();
  }

  /**
   * Initialize dashboard state
   */
  private initializeState(): DashboardState {
    return {
      environments: [],
      performanceMetrics: {
        averageDetectionTime: 0,
        cacheHitRate: 0,
        errorRate: 0,
        lastDetectionTime: 0,
        totalDetections: 0
      },
      configurationHistory: [],
      activeAlerts: [],
      systemHealth: {
        overall: 'unknown',
        components: [],
        uptime: 0,
        lastHealthCheck: 0
      },
      lastUpdate: Date.now()
    };
  }

  /**
   * Setup Server-Sent Events for real-time updates
   */
  private setupEventSource(): void {
    if (typeof EventSource !== 'undefined') {
      this.eventSource = new EventSource('/api/monitoring/events');
      
      this.eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleRealtimeUpdate(data);
      };

      this.eventSource.onerror = (error) => {
        console.warn('Dashboard SSE connection error:', error);
        // Fallback to polling
        this.startPeriodicRefresh();
      };
    }
  }

  /**
   * Handle real-time updates from server
   */
  private handleRealtimeUpdate(data: any): void {
    switch (data.type) {
      case 'environment_status':
        this.updateEnvironmentStatus(data.payload);
        break;
      case 'performance_metrics':
        this.updatePerformanceMetrics(data.payload);
        break;
      case 'configuration_change':
        this.addConfigurationHistoryEntry(data.payload);
        break;
      case 'alert':
        this.addAlert(data.payload);
        break;
      case 'health_status':
        this.updateSystemHealth(data.payload);
        break;
    }
    
    this.state = { ...this.state, lastUpdate: Date.now() };
    this.render();
  }

  /**
   * Start periodic refresh as fallback
   */
  private startPeriodicRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      await this.refreshDashboardData();
    }, this.config.refreshInterval);
  }

  /**
   * Refresh all dashboard data
   */
  private async refreshDashboardData(): Promise<void> {
    try {
      const [environments, metrics, history, alerts, health] = await Promise.all([
        this.fetchEnvironmentStatuses(),
        this.fetchPerformanceMetrics(),
        this.fetchConfigurationHistory(),
        this.fetchActiveAlerts(),
        this.fetchSystemHealth()
      ]);

      this.state = {
        environments,
        performanceMetrics: metrics,
        configurationHistory: history,
        activeAlerts: alerts,
        systemHealth: health,
        lastUpdate: Date.now()
      };

      this.render();
    } catch (error) {
      console.error('Failed to refresh dashboard data:', error);
      this.addAlert({
        id: `refresh-error-${Date.now()}`,
        type: 'system',
        severity: 'medium',
        title: 'Dashboard Refresh Failed',
        message: `Failed to refresh dashboard data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        acknowledged: false,
        metadata: { error: error instanceof Error ? error.stack : String(error) }
      });
    }
  }

  /**
   * Render the complete dashboard
   */
  private render(): void {
    const dashboard = document.createElement('div');
    dashboard.className = 'monitoring-dashboard';
    dashboard.innerHTML = `
      <div class="dashboard-header">
        <h1>BERS Configuration Monitoring Dashboard</h1>
        <div class="dashboard-controls">
          <button id="refresh-btn" class="btn btn-primary">Refresh</button>
          <button id="alerts-btn" class="btn btn-secondary">
            Alerts <span class="badge">${this.state.activeAlerts.length}</span>
          </button>
          <div class="last-update">
            Last updated: ${new Date(this.state.lastUpdate).toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        ${this.renderSystemOverview()}
        ${this.renderEnvironmentStatuses()}
        ${this.renderPerformanceCharts()}
        ${this.renderConfigurationHistory()}
        ${this.renderActiveAlerts()}
      </div>
    `;

    // Replace existing content
    this.dashboardElement.innerHTML = '';
    this.dashboardElement.appendChild(dashboard);

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Render system overview section
   */
  private renderSystemOverview(): string {
    const { systemHealth, performanceMetrics } = this.state;
    const healthColor = this.getHealthColor(systemHealth.overall);
    
    return `
      <div class="dashboard-card system-overview">
        <h2>System Overview</h2>
        <div class="system-status">
          <div class="status-indicator ${healthColor}">
            <span class="status-dot"></span>
            <span class="status-text">${systemHealth.overall.toUpperCase()}</span>
          </div>
          <div class="system-metrics">
            <div class="metric">
              <span class="metric-label">Uptime</span>
              <span class="metric-value">${this.formatUptime(systemHealth.uptime)}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Avg Detection Time</span>
              <span class="metric-value">${performanceMetrics.averageDetectionTime.toFixed(2)}ms</span>
            </div>
            <div class="metric">
              <span class="metric-label">Cache Hit Rate</span>
              <span class="metric-value">${(performanceMetrics.cacheHitRate * 100).toFixed(1)}%</span>
            </div>
            <div class="metric">
              <span class="metric-label">Error Rate</span>
              <span class="metric-value">${(performanceMetrics.errorRate * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render environment statuses
   */
  private renderEnvironmentStatuses(): string {
    const { environments } = this.state;
    
    return `
      <div class="dashboard-card environment-statuses">
        <h2>Environment Status</h2>
        <div class="environment-grid">
          ${environments.map(env => `
            <div class="environment-card ${env.status}">
              <h3>${env.environment}</h3>
              <div class="environment-details">
                <div class="status-row">
                  <span class="status-label">Status:</span>
                  <span class="status-value ${env.status}">${env.status.toUpperCase()}</span>
                </div>
                <div class="status-row">
                  <span class="status-label">Response Time:</span>
                  <span class="status-value">${env.responseTime}ms</span>
                </div>
                <div class="status-row">
                  <span class="status-label">Active Connections:</span>
                  <span class="status-value">${env.activeConnections}</span>
                </div>
                <div class="status-row">
                  <span class="status-label">Config Valid:</span>
                  <span class="status-value ${env.configurationValid ? 'valid' : 'invalid'}">
                    ${env.configurationValid ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render performance charts
   */
  private renderPerformanceCharts(): string {
    if (!this.config.displayOptions.showPerformanceCharts) {
      return '';
    }

    return `
      <div class="dashboard-card performance-charts">
        <h2>Performance Metrics</h2>
        <div class="charts-container">
          <div id="response-time-chart" class="chart"></div>
          <div id="throughput-chart" class="chart"></div>
          <div id="error-rate-chart" class="chart"></div>
        </div>
      </div>
    `;
  }

  /**
   * Render configuration history
   */
  private renderConfigurationHistory(): string {
    if (!this.config.displayOptions.showConfigurationHistory) {
      return '';
    }

    const { configurationHistory } = this.state;
    const recentHistory = configurationHistory.slice(0, 10);

    return `
      <div class="dashboard-card configuration-history">
        <h2>Configuration History</h2>
        <div class="history-list">
          ${recentHistory.map(entry => `
            <div class="history-entry ${entry.changeType}">
              <div class="history-header">
                <span class="history-time">${new Date(entry.timestamp).toLocaleString()}</span>
                <span class="history-type ${entry.changeType}">${entry.changeType.replace('_', ' ')}</span>
                <span class="history-env">${entry.environment}</span>
              </div>
              <div class="history-details">
                ${entry.changes.map(change => `
                  <div class="change-item ${change.severity}">
                    <span class="change-path">${change.path}</span>
                    <span class="change-operation">${change.operation}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render active alerts
   */
  private renderActiveAlerts(): string {
    const { activeAlerts } = this.state;
    
    return `
      <div class="dashboard-card active-alerts">
        <h2>Active Alerts (${activeAlerts.length})</h2>
        <div class="alerts-list">
          ${activeAlerts.slice(0, 5).map(alert => `
            <div class="alert-item ${alert.severity}" data-alert-id="${alert.id}">
              <div class="alert-header">
                <span class="alert-title">${alert.title}</span>
                <span class="alert-time">${new Date(alert.timestamp).toLocaleTimeString()}</span>
              </div>
              <div class="alert-message">${alert.message}</div>
              <div class="alert-actions">
                <button class="btn btn-sm acknowledge-btn">Acknowledge</button>
                <button class="btn btn-sm resolve-btn">Resolve</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Setup event listeners for dashboard interactions
   */
  private setupEventListeners(): void {
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn?.addEventListener('click', () => this.refreshDashboardData());

    // Alert acknowledgment
    document.querySelectorAll('.acknowledge-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const alertId = (e.target as HTMLElement).closest('.alert-item')?.getAttribute('data-alert-id');
        if (alertId) {
          this.acknowledgeAlert(alertId);
        }
      });
    });

    // Alert resolution
    document.querySelectorAll('.resolve-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const alertId = (e.target as HTMLElement).closest('.alert-item')?.getAttribute('data-alert-id');
        if (alertId) {
          this.resolveAlert(alertId);
        }
      });
    });
  }

  /**
   * Update environment status
   */
  private updateEnvironmentStatus(envStatus: EnvironmentStatus): void {
    const index = this.state.environments.findIndex(env => env.environment === envStatus.environment);
    if (index >= 0) {
      this.state.environments[index] = envStatus;
    } else {
      this.state.environments.push(envStatus);
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(metrics: PerformanceMetrics): void {
    this.state.performanceMetrics = metrics;
  }

  /**
   * Add configuration history entry
   */
  private addConfigurationHistoryEntry(entry: ConfigurationHistoryEntry): void {
    this.state.configurationHistory.unshift(entry);
    
    // Keep only recent history based on retention policy
    const retentionTime = Date.now() - (this.config.historyRetention * 24 * 60 * 60 * 1000);
    this.state.configurationHistory = this.state.configurationHistory.filter(
      e => e.timestamp > retentionTime
    );
  }

  /**
   * Add new alert
   */
  private addAlert(alert: Alert): void {
    // Check for duplicate alerts
    const exists = this.state.activeAlerts.some(a => 
      a.type === alert.type && 
      a.title === alert.title && 
      a.environment === alert.environment
    );

    if (!exists) {
      this.state.activeAlerts.unshift(alert);
    }
  }

  /**
   * Update system health status
   */
  private updateSystemHealth(health: SystemHealthStatus): void {
    this.state.systemHealth = health;
  }

  /**
   * Acknowledge an alert
   */
  private async acknowledgeAlert(alertId: string): Promise<void> {
    try {
      await fetch(`/api/monitoring/alerts/${alertId}/acknowledge`, {
        method: 'POST'
      });

      const alert = this.state.activeAlerts.find(a => a.id === alertId);
      if (alert) {
        (alert as any).acknowledged = true;
        this.render();
      }
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  }

  /**
   * Resolve an alert
   */
  private async resolveAlert(alertId: string): Promise<void> {
    try {
      await fetch(`/api/monitoring/alerts/${alertId}/resolve`, {
        method: 'POST'
      });

      this.state.activeAlerts = this.state.activeAlerts.filter(a => a.id !== alertId);
      this.render();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  }

  /**
   * Helper methods
   */
  private getHealthColor(status: string): string {
    switch (status) {
      case 'healthy': return 'green';
      case 'degraded': return 'yellow';
      case 'critical': return 'red';
      default: return 'gray';
    }
  }

  private formatUptime(uptime: number): string {
    const days = Math.floor(uptime / (24 * 60 * 60 * 1000));
    const hours = Math.floor((uptime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));
    
    return `${days}d ${hours}h ${minutes}m`;
  }

  /* ===== API METHODS ===== */

  private async fetchEnvironmentStatuses(): Promise<EnvironmentStatus[]> {
    const response = await fetch('/api/monitoring/environments');
    return response.json();
  }

  private async fetchPerformanceMetrics(): Promise<PerformanceMetrics> {
    const response = await fetch('/api/monitoring/metrics');
    return response.json();
  }

  private async fetchConfigurationHistory(): Promise<ConfigurationHistoryEntry[]> {
    const response = await fetch('/api/monitoring/configuration/history');
    return response.json();
  }

  private async fetchActiveAlerts(): Promise<Alert[]> {
    const response = await fetch('/api/monitoring/alerts');
    return response.json();
  }

  private async fetchSystemHealth(): Promise<SystemHealthStatus> {
    const response = await fetch('/api/monitoring/health');
    return response.json();
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }
    
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.listeners.clear();
  }
}

/* ===== DEFAULT CONFIGURATIONS ===== */

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  refreshInterval: 5000, // 5 seconds
  historyRetention: 30, // 30 days
  alertThresholds: {
    performanceDegradation: 20, // 20% degradation
    configurationErrors: 5, // 5 errors
    detectionFailureRate: 10, // 10% failure rate
    responseTimeThreshold: 1000 // 1 second
  },
  displayOptions: {
    showPerformanceCharts: true,
    showConfigurationHistory: true,
    showEnvironmentMap: true,
    theme: 'auto'
  }
} as const;

/**
 * Factory function to create monitoring dashboard
 */
export function createMonitoringDashboard(
  element: HTMLElement,
  config: Partial<DashboardConfig> = {}
): ConfigurationMonitoringDashboard {
  const mergedConfig = { ...DEFAULT_DASHBOARD_CONFIG, ...config };
  return new ConfigurationMonitoringDashboard(mergedConfig, element);
}

/**
 * Initialize dashboard in a container element
 */
export function initializeDashboard(containerId: string = 'monitoring-dashboard'): ConfigurationMonitoringDashboard {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Dashboard container element not found: ${containerId}`);
  }
  
  return createMonitoringDashboard(container);
}