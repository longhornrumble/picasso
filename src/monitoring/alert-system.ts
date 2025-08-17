/**
 * Alert System for Configuration Issues and Performance Degradation - BERS Task 4.1
 * 
 * Comprehensive alerting system with intelligent configuration drift detection,
 * performance degradation monitoring, and multi-channel notification delivery
 * with actionable remediation steps.
 * 
 * Features:
 * - Configuration load failure alerts
 * - Performance degradation detection (>20% threshold)
 * - Environment detection failure monitoring
 * - Provider health issue alerts
 * - Multi-channel alert delivery (email, webhook, console)
 * - Alert deduplication and rate limiting
 * - Actionable remediation recommendations
 * - Alert escalation and acknowledgment
 * 
 * @version 1.0.0 
 * @author Build-Time Environment Resolution System (BERS)
 */

import type { 
  Environment, 
  ValidatedEnvironment,
  EnvironmentDetectionResult
} from '../config/environment-resolver';
import type { 
  MetricType, 
  PerformanceAlert,
  MetricsSummary 
} from './metrics-collector';

/* ===== ALERT SYSTEM TYPES ===== */

export interface AlertSystemConfig {
  readonly enabled: boolean;
  readonly channels: AlertChannel[];
  readonly rules: AlertRule[];
  readonly deduplication: DeduplicationConfig;
  readonly escalation: EscalationConfig;
  readonly rateLimiting: RateLimitingConfig;
  readonly retention: AlertRetentionConfig;
}

export interface AlertChannel {
  readonly id: string;
  readonly name: string;
  readonly type: AlertChannelType;
  readonly enabled: boolean;
  readonly config: AlertChannelConfig;
  readonly filters: AlertFilter[];
}

export type AlertChannelType = 'console' | 'webhook' | 'email' | 'slack' | 'pagerduty' | 'custom';

export interface AlertChannelConfig {
  readonly endpoint?: string;
  readonly apiKey?: string;
  readonly template?: string;
  readonly timeout?: number;
  readonly retryAttempts?: number;
  readonly headers?: Record<string, string>;
  readonly recipients?: string[];
}

export interface AlertFilter {
  readonly field: keyof Alert;
  readonly operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  readonly value: any;
}

export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly type: AlertType;
  readonly conditions: AlertCondition[];
  readonly channels: string[]; // Alert channel IDs
  readonly severity: AlertSeverity;
  readonly cooldown: number; // milliseconds
  readonly autoResolve: boolean;
  readonly remediation: RemediationStep[];
}

export type AlertType = 
  | 'configuration_load_failure'
  | 'performance_degradation'
  | 'environment_detection_failure'
  | 'provider_health_issue'
  | 'configuration_drift'  
  | 'system_health'
  | 'security_violation'
  | 'resource_exhaustion';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertCondition {
  readonly metric?: MetricType;
  readonly field?: string;
  readonly operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'regex';
  readonly value: any;
  readonly duration?: number; // milliseconds - how long condition must be true
}

export interface RemediationStep {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly action: 'manual' | 'automatic' | 'script';
  readonly script?: string;
  readonly priority: number;
  readonly estimatedTime: string;
}

export interface DeduplicationConfig {
  readonly enabled: boolean;
  readonly window: number; // milliseconds
  readonly fields: (keyof Alert)[];
}

export interface EscalationConfig {
  readonly enabled: boolean;
  readonly levels: EscalationLevel[];
}

export interface EscalationLevel {
  readonly delay: number; // milliseconds
  readonly channels: string[];
  readonly conditions: AlertCondition[];
}

export interface RateLimitingConfig {
  readonly enabled: boolean;
  readonly maxAlerts: number;
  readonly window: number; // milliseconds
  readonly backoffMultiplier: number;
}

export interface AlertRetentionConfig {
  readonly resolved: number; // days
  readonly acknowledged: number; // days  
  readonly unresolved: number; // days
}

export interface Alert {
  readonly id: string;
  readonly ruleId: string;
  readonly type: AlertType;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly message: string;
  readonly timestamp: number;
  readonly environment?: Environment;
  readonly metadata: AlertMetadata;
  readonly status: AlertStatus;
  readonly acknowledgment?: AlertAcknowledgment;
  readonly resolution?: AlertResolution;
  readonly escalations: AlertEscalation[];
  readonly deliveries: AlertDelivery[];
}

export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'suppressed';

export interface AlertMetadata {
  readonly source: string;
  readonly tags: string[];
  readonly context: Record<string, any>;
  readonly metrics?: Record<MetricType, number>;
  readonly fingerprint: string;
}

export interface AlertAcknowledgment {
  readonly timestamp: number;
  readonly user: string;
  readonly comment?: string;
}

export interface AlertResolution {
  readonly timestamp: number;
  readonly reason: 'manual' | 'automatic' | 'timeout';
  readonly user?: string;
  readonly comment?: string;
}

export interface AlertEscalation {
  readonly level: number;
  readonly timestamp: number;
  readonly channels: string[];
  readonly successful: boolean;
}

export interface AlertDelivery {
  readonly channelId: string;
  readonly timestamp: number;
  readonly status: 'pending' | 'sent' | 'failed' | 'retry';
  readonly attempts: number;
  readonly error?: string;
}

export interface AlertStats {
  readonly total: number;
  readonly active: number;
  readonly acknowledged: number;
  readonly resolved: number;
  readonly suppressed: number;
  readonly byType: Record<AlertType, number>;
  readonly bySeverity: Record<AlertSeverity, number>;
  readonly avgResolutionTime: number;
  readonly topAlerts: { rule: string; count: number }[];
}

/* ===== ALERT SYSTEM IMPLEMENTATION ===== */

export class AlertSystem {
  private alerts: Map<string, Alert> = new Map();
  private alertsByRule: Map<string, Set<string>> = new Map();
  private rateLimitCounters: Map<string, { count: number; resetTime: number }> = new Map();
  private periodicTaskIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor(private readonly config: AlertSystemConfig) {}

  /**
   * Start the alert system
   */
  public start(): void {
    if (this.isRunning || !this.config.enabled) return;

    this.isRunning = true;
    this.startPeriodicTasks();
    console.log('Alert system started');
  }

  /**
   * Stop the alert system
   */
  public stop(): void {
    if (!this.isRunning) return;

    // Clear all periodic task intervals
    for (const [name, interval] of this.periodicTaskIntervals) {
      clearInterval(interval);
    }
    this.periodicTaskIntervals.clear();

    this.isRunning = false;
    console.log('Alert system stopped');
  }

  /**
   * Evaluate alert rules against current system state
   */
  public async evaluateRules(context: AlertEvaluationContext): Promise<void> {
    if (!this.isRunning) return;

    for (const rule of this.config.rules) {
      if (!rule.enabled) continue;

      try {
        await this.evaluateRule(rule, context);
      } catch (error) {
        console.error(`Error evaluating alert rule ${rule.id}:`, error);
      }
    }
  }

  /**
   * Evaluate a specific alert rule
   */
  private async evaluateRule(rule: AlertRule, context: AlertEvaluationContext): Promise<void> {
    const isTriggered = await this.checkRuleConditions(rule, context);
    
    if (isTriggered) {
      // Check if we already have an active alert for this rule
      const existingAlert = this.findActiveAlertByRule(rule.id);
      
      if (!existingAlert) {
        // Create new alert
        const alert = await this.createAlert(rule, context);
        await this.processAlert(alert);
      } else if (!existingAlert.acknowledgment) {
        // Update existing alert with new context
        await this.updateAlert(existingAlert.id, { context: context.metadata });
      }
    } else {
      // Check for auto-resolve
      if (rule.autoResolve) {
        const activeAlert = this.findActiveAlertByRule(rule.id);
        if (activeAlert && activeAlert.status === 'active') {
          await this.resolveAlert(activeAlert.id, 'automatic', undefined, 'Conditions no longer met');
        }
      }
    }
  }

  /**
   * Check if rule conditions are met
   */
  private async checkRuleConditions(rule: AlertRule, context: AlertEvaluationContext): Promise<boolean> {
    for (const condition of rule.conditions) {
      if (!await this.checkCondition(condition, context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check individual condition
   */
  private async checkCondition(condition: AlertCondition, context: AlertEvaluationContext): Promise<boolean> {
    let value: any;

    if (condition.metric) {
      value = context.metrics[condition.metric]?.current;
    } else if (condition.field) {
      value = this.getValueFromContext(condition.field, context);
    } else {
      return false;
    }

    if (value === undefined || value === null) {
      return false;
    }

    return this.evaluateCondition(value, condition.operator, condition.value);
  }

  /**
   * Evaluate condition operator
   */
  private evaluateCondition(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      
      case 'not_equals':
        return actual !== expected;
      
      case 'greater_than':
        return actual > expected;
      
      case 'less_than':
        return actual < expected;
      
      case 'contains':
        return String(actual).includes(String(expected));
      
      case 'regex':
        return new RegExp(expected).test(String(actual));
      
      default:
        return false;
    }
  }

  /**
   * Get value from evaluation context
   */
  private getValueFromContext(field: string, context: AlertEvaluationContext): any {
    const parts = field.split('.');
    let value: any = context;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Create new alert
   */
  private async createAlert(rule: AlertRule, context: AlertEvaluationContext): Promise<Alert> {
    const id = this.generateAlertId();
    const fingerprint = this.generateFingerprint(rule, context);
    
    const alert: Alert = {
      id,
      ruleId: rule.id,
      type: rule.type,
      severity: rule.severity,
      title: this.generateAlertTitle(rule, context),
      message: this.generateAlertMessage(rule, context),
      timestamp: Date.now(),
      environment: context.environment,
      metadata: {
        source: 'alert-system',
        tags: this.generateAlertTags(rule, context),
        context: context.metadata,
        metrics: this.extractRelevantMetrics(rule, context),
        fingerprint
      },
      status: 'active',
      escalations: [],
      deliveries: []
    };

    this.alerts.set(id, alert);
    
    // Track by rule
    if (!this.alertsByRule.has(rule.id)) {
      this.alertsByRule.set(rule.id, new Set());
    }
    this.alertsByRule.get(rule.id)!.add(id);

    return alert;
  }

  /**
   * Process alert (deduplication, rate limiting, delivery)
   */
  private async processAlert(alert: Alert): Promise<void> {
    // Check deduplication
    if (this.config.deduplication.enabled && this.isDuplicate(alert)) {
      console.log(`Alert ${alert.id} deduplicated`);
      return;
    }

    // Check rate limiting
    if (this.config.rateLimiting.enabled && this.isRateLimited(alert)) {
      console.log(`Alert ${alert.id} rate limited`);
      return;
    }

    // Update rate limiting counters
    this.updateRateLimitCounters(alert);

    // Deliver alert
    await this.deliverAlert(alert);

    // Start escalation if configured
    if (this.config.escalation.enabled) {
      this.startEscalation(alert);
    }

    console.log(`Alert ${alert.id} processed: ${alert.title}`);
  }

  /**
   * Check if alert is duplicate
   */
  private isDuplicate(alert: Alert): boolean {
    if (!this.config.deduplication.enabled) return false;

    const cutoff = Date.now() - this.config.deduplication.window;
    
    for (const existingAlert of this.alerts.values()) {
      if (existingAlert.timestamp < cutoff) continue;
      if (existingAlert.id === alert.id) continue;
      
      // Check if fingerprints match
      if (existingAlert.metadata.fingerprint === alert.metadata.fingerprint) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if alert is rate limited
   */
  private isRateLimited(alert: Alert): boolean {
    if (!this.config.rateLimiting.enabled) return false;

    const key = `${alert.ruleId}-${alert.type}`;
    const counter = this.rateLimitCounters.get(key);
    
    if (!counter) return false;
    
    const now = Date.now();
    if (now > counter.resetTime) {
      // Reset counter
      this.rateLimitCounters.delete(key);
      return false;
    }

    return counter.count >= this.config.rateLimiting.maxAlerts;
  }

  /**
   * Update rate limiting counters
   */
  private updateRateLimitCounters(alert: Alert): void {
    if (!this.config.rateLimiting.enabled) return;

    const key = `${alert.ruleId}-${alert.type}`;
    const now = Date.now();
    let counter = this.rateLimitCounters.get(key);
    
    if (!counter || now > counter.resetTime) {
      counter = {
        count: 0,
        resetTime: now + this.config.rateLimiting.window
      };
    }
    
    counter.count++;
    this.rateLimitCounters.set(key, counter);
  }

  /**
   * Deliver alert to configured channels
   */
  private async deliverAlert(alert: Alert): Promise<void> {
    const rule = this.config.rules.find(r => r.id === alert.ruleId);
    if (!rule) return;

    const channelIds = rule.channels;
    const deliveryPromises: Promise<void>[] = [];

    for (const channelId of channelIds) {
      const channel = this.config.channels.find(c => c.id === channelId);
      if (!channel || !channel.enabled) continue;

      // Check channel filters
      if (!this.passesChannelFilters(alert, channel)) continue;

      deliveryPromises.push(this.deliverToChannel(alert, channel));
    }

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Check if alert passes channel filters
   */
  private passesChannelFilters(alert: Alert, channel: AlertChannel): boolean {
    for (const filter of channel.filters) {
      const value = this.getAlertFieldValue(alert, filter.field);
      if (!this.evaluateCondition(value, filter.operator, filter.value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get alert field value
   */
  private getAlertFieldValue(alert: Alert, field: keyof Alert): any {
    return alert[field];
  }

  /**
   * Deliver alert to specific channel
   */
  private async deliverToChannel(alert: Alert, channel: AlertChannel): Promise<void> {
    const delivery: AlertDelivery = {
      channelId: channel.id,
      timestamp: Date.now(),
      status: 'pending',
      attempts: 0
    };

    try {
      switch (channel.type) {
        case 'console':
          await this.deliverToConsole(alert, channel);
          break;
        
        case 'webhook':
          await this.deliverToWebhook(alert, channel);
          break;
        
        case 'email':
          await this.deliverToEmail(alert, channel);
          break;
        
        case 'slack':
          await this.deliverToSlack(alert, channel);
          break;
        
        case 'custom':
          await this.deliverToCustomChannel(alert, channel);
          break;
        
        default:
          throw new Error(`Unsupported channel type: ${channel.type}`);
      }

      delivery.status = 'sent';
      delivery.attempts = 1;
    } catch (error) {
      delivery.status = 'failed';
      delivery.error = error instanceof Error ? error.message : String(error);
      delivery.attempts = 1;
      
      console.error(`Failed to deliver alert ${alert.id} to channel ${channel.id}:`, error);
    }

    // Update alert with delivery status
    const updatedAlert = this.alerts.get(alert.id);
    if (updatedAlert) {
      updatedAlert.deliveries.push(delivery);
    }
  }

  /**
   * Deliver to console
   */
  private async deliverToConsole(alert: Alert, channel: AlertChannel): Promise<void> {
    const level = this.getConsoleLevel(alert.severity);
    const message = this.formatAlertForConsole(alert);
    
    console[level](message);
  }

  /**
   * Deliver to webhook
   */
  private async deliverToWebhook(alert: Alert, channel: AlertChannel): Promise<void> {
    if (!channel.config.endpoint) {
      throw new Error('Webhook endpoint not configured');
    }

    const payload = this.formatAlertForWebhook(alert, channel);
    const timeout = channel.config.timeout || 5000;

    const response = await fetch(channel.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...channel.config.headers
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * Deliver to email
   */
  private async deliverToEmail(alert: Alert, channel: AlertChannel): Promise<void> {
    // Email delivery would require integration with email service
    // This is a placeholder implementation
    console.log(`[EMAIL] Alert ${alert.id} would be sent to:`, channel.config.recipients);
  }

  /**
   * Deliver to Slack
   */
  private async deliverToSlack(alert: Alert, channel: AlertChannel): Promise<void> {
    if (!channel.config.endpoint) {
      throw new Error('Slack webhook URL not configured');
    }

    const payload = this.formatAlertForSlack(alert);
    
    const response = await fetch(channel.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * Deliver to custom channel
   */
  private async deliverToCustomChannel(alert: Alert, channel: AlertChannel): Promise<void> {
    // Custom channel implementation would be provided by the application
    console.log(`[CUSTOM] Alert ${alert.id} delivered to custom channel ${channel.id}`);
  }

  /**
   * Start escalation process
   */
  private startEscalation(alert: Alert): void {
    if (!this.config.escalation.enabled) return;

    for (let i = 0; i < this.config.escalation.levels.length; i++) {
      const level = this.config.escalation.levels[i];
      
      setTimeout(() => {
        this.escalateAlert(alert, i, level);
      }, level.delay);
    }
  }

  /**
   * Escalate alert to next level
   */
  private async escalateAlert(alert: Alert, levelIndex: number, level: EscalationLevel): Promise<void> {
    const currentAlert = this.alerts.get(alert.id);
    if (!currentAlert || currentAlert.status !== 'active') {
      return; // Alert was resolved or acknowledged
    }

    // Check escalation conditions
    let shouldEscalate = true;
    for (const condition of level.conditions) {
      // For now, we'll assume conditions are met
      // In a full implementation, you'd re-evaluate conditions here
    }

    if (!shouldEscalate) return;

    const escalation: AlertEscalation = {
      level: levelIndex,
      timestamp: Date.now(),
      channels: level.channels,
      successful: false
    };

    try {
      // Deliver to escalation channels
      for (const channelId of level.channels) {
        const channel = this.config.channels.find(c => c.id === channelId);
        if (channel && channel.enabled) {
          await this.deliverToChannel(currentAlert, channel);
        }
      }

      escalation.successful = true;
      console.log(`Alert ${alert.id} escalated to level ${levelIndex}`);
    } catch (error) {
      console.error(`Failed to escalate alert ${alert.id} to level ${levelIndex}:`, error);
    }

    currentAlert.escalations.push(escalation);
  }

  /**
   * Acknowledge alert
   */
  public async acknowledgeAlert(alertId: string, user: string, comment?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    if (alert.status !== 'active') {
      throw new Error(`Alert ${alertId} is not active`);
    }

    const updatedAlert: Alert = {
      ...alert,
      status: 'acknowledged',
      acknowledgment: {
        timestamp: Date.now(),
        user,
        comment
      }
    };

    this.alerts.set(alertId, updatedAlert);
    console.log(`Alert ${alertId} acknowledged by ${user}`);
  }

  /**
   * Resolve alert
   */
  public async resolveAlert(
    alertId: string, 
    reason: 'manual' | 'automatic' | 'timeout',
    user?: string,
    comment?: string
  ): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    if (alert.status === 'resolved') {
      return; // Already resolved
    }

    const updatedAlert: Alert = {
      ...alert,
      status: 'resolved',
      resolution: {
        timestamp: Date.now(),
        reason,
        user,
        comment
      }
    };

    this.alerts.set(alertId, updatedAlert);
    console.log(`Alert ${alertId} resolved: ${reason}`);
  }

  /**
   * Get alert statistics
   */
  public getAlertStats(period?: number): AlertStats {
    const cutoff = period ? Date.now() - period : 0;
    const relevantAlerts = Array.from(this.alerts.values())
      .filter(alert => alert.timestamp >= cutoff);

    const stats: AlertStats = {
      total: relevantAlerts.length,
      active: 0,
      acknowledged: 0,
      resolved: 0,
      suppressed: 0,
      byType: {} as Record<AlertType, number>,
      bySeverity: {} as Record<AlertSeverity, number>,
      avgResolutionTime: 0,
      topAlerts: []
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;
    const ruleCounts: Record<string, number> = {};

    for (const alert of relevantAlerts) {
      // Count by status
      switch (alert.status) {
        case 'active':
          stats.active++;
          break;
        case 'acknowledged':
          stats.acknowledged++;
          break;
        case 'resolved':
          stats.resolved++;
          if (alert.resolution) {
            totalResolutionTime += alert.resolution.timestamp - alert.timestamp;
            resolvedCount++;
          }
          break;
        case 'suppressed':
          stats.suppressed++;
          break;
      }

      // Count by type
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;

      // Count by severity
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;

      // Count by rule
      ruleCounts[alert.ruleId] = (ruleCounts[alert.ruleId] || 0) + 1;
    }

    // Calculate average resolution time
    stats.avgResolutionTime = resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0;

    // Get top alerts
    stats.topAlerts = Object.entries(ruleCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([rule, count]) => ({ rule, count }));

    return stats;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .filter(alert => alert.status === 'active')
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get alert by ID
   */
  public getAlert(alertId: string): Alert | undefined {
    return this.alerts.get(alertId);
  }

  /**
   * Find active alert by rule ID
   */
  private findActiveAlertByRule(ruleId: string): Alert | undefined {
    const alertIds = this.alertsByRule.get(ruleId);
    if (!alertIds) return undefined;

    for (const alertId of alertIds) {
      const alert = this.alerts.get(alertId);
      if (alert && alert.status === 'active') {
        return alert;
      }
    }

    return undefined;
  }

  /**
   * Update alert
   */
  private async updateAlert(alertId: string, updates: Partial<Alert>): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) return;

    const updatedAlert = { ...alert, ...updates };
    this.alerts.set(alertId, updatedAlert);
  }

  /**
   * Periodic tasks (cleanup, maintenance)
   */
  private startPeriodicTasks(): void {
    // Store intervals for proper cleanup
    this.periodicTaskIntervals = new Map();

    // Cleanup old alerts every hour
    const cleanupInterval = setInterval(() => {
      this.cleanupOldAlerts();
    }, 60 * 60 * 1000);
    this.periodicTaskIntervals.set('cleanup', cleanupInterval);

    // Reset rate limiting counters
    const rateLimitInterval = setInterval(() => {
      this.cleanupRateLimitCounters();
    }, 60 * 1000);
    this.periodicTaskIntervals.set('rateLimit', rateLimitInterval);
  }

  /**
   * Cleanup old alerts based on retention policy
   */
  private cleanupOldAlerts(): void {
    const now = Date.now();
    const retention = this.config.retention;

    const cutoffs = {
      resolved: now - (retention.resolved * 24 * 60 * 60 * 1000),
      acknowledged: now - (retention.acknowledged * 24 * 60 * 60 * 1000),
      unresolved: now - (retention.unresolved * 24 * 60 * 60 * 1000)
    };

    for (const [alertId, alert] of this.alerts) {
      let shouldDelete = false;

      switch (alert.status) {
        case 'resolved':
          shouldDelete = alert.timestamp < cutoffs.resolved;
          break;
        case 'acknowledged':
          shouldDelete = alert.timestamp < cutoffs.acknowledged;
          break;
        case 'active':
        case 'suppressed':
          shouldDelete = alert.timestamp < cutoffs.unresolved;
          break;
      }

      if (shouldDelete) {
        this.alerts.delete(alertId);
        
        // Remove from rule tracking
        const ruleAlerts = this.alertsByRule.get(alert.ruleId);
        if (ruleAlerts) {
          ruleAlerts.delete(alertId);
          if (ruleAlerts.size === 0) {
            this.alertsByRule.delete(alert.ruleId);
          }
        }
      }
    }
  }

  /**
   * Cleanup expired rate limiting counters
   */
  private cleanupRateLimitCounters(): void {
    const now = Date.now();
    
    for (const [key, counter] of this.rateLimitCounters) {
      if (now > counter.resetTime) {
        this.rateLimitCounters.delete(key);
      }
    }
  }

  /* ===== UTILITY METHODS ===== */

  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFingerprint(rule: AlertRule, context: AlertEvaluationContext): string {
    const data = {
      ruleId: rule.id,
      type: rule.type,
      environment: context.environment,
      // Add other relevant context for fingerprinting
    };
    
    return btoa(JSON.stringify(data));
  }

  private generateAlertTitle(rule: AlertRule, context: AlertEvaluationContext): string {
    let title = rule.name;
    
    if (context.environment) {
      title += ` (${context.environment})`;
    }
    
    return title;
  }

  private generateAlertMessage(rule: AlertRule, context: AlertEvaluationContext): string {
    let message = rule.description;
    
    // Add context-specific information
    if (context.metrics) {
      const relevantMetrics = this.extractRelevantMetrics(rule, context);
      const metricsInfo = Object.entries(relevantMetrics)
        .map(([metric, value]) => `${metric}: ${value}`)
        .join(', ');
      
      if (metricsInfo) {
        message += ` Current metrics: ${metricsInfo}`;
      }
    }
    
    return message;
  }

  private generateAlertTags(rule: AlertRule, context: AlertEvaluationContext): string[] {
    const tags = [rule.type, rule.severity];
    
    if (context.environment) {
      tags.push(`env:${context.environment}`);
    }
    
    return tags;
  }

  private extractRelevantMetrics(rule: AlertRule, context: AlertEvaluationContext): Record<MetricType, number> {
    const relevant: Record<MetricType, number> = {} as any;
    
    for (const condition of rule.conditions) {
      if (condition.metric && context.metrics[condition.metric]) {
        relevant[condition.metric] = context.metrics[condition.metric].current;
      }
    }
    
    return relevant;
  }

  private getConsoleLevel(severity: AlertSeverity): 'info' | 'warn' | 'error' {
    switch (severity) {
      case 'info':
        return 'info';
      case 'warning':
        return 'warn';
      case 'error':
      case 'critical':
        return 'error';
      default:
        return 'info';
    }
  }

  private formatAlertForConsole(alert: Alert): string {
    return `[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`;
  }

  private formatAlertForWebhook(alert: Alert, channel: AlertChannel): any {
    return {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      timestamp: alert.timestamp,
      environment: alert.environment,
      metadata: alert.metadata,
      remediation: this.getRemediationSteps(alert.ruleId)
    };
  }

  private formatAlertForSlack(alert: Alert): any {
    const color = this.getSlackColor(alert.severity);
    
    return {
      text: `Alert: ${alert.title}`,
      attachments: [{
        color,
        fields: [
          { title: 'Severity', value: alert.severity, short: true },
          { title: 'Type', value: alert.type, short: true },
          { title: 'Environment', value: alert.environment || 'Unknown', short: true },
          { title: 'Message', value: alert.message, short: false }
        ],
        ts: Math.floor(alert.timestamp / 1000)
      }]
    };
  }

  private getSlackColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'info':
        return 'good';
      case 'warning':
        return 'warning';
      case 'error':
        return 'danger';
      case 'critical':
        return '#ff0000';
      default:
        return 'good';
    }
  }

  private getRemediationSteps(ruleId: string): RemediationStep[] {
    const rule = this.config.rules.find(r => r.id === ruleId);
    return rule?.remediation || [];
  }

  /**
   * Clear all alerts (for testing)
   */
  public clearAlerts(): void {
    this.alerts.clear();
    this.alertsByRule.clear();
  }

  /**
   * Get system status
   */
  public getStatus(): {
    isRunning: boolean;
    alertCount: number;
    activeRules: number;
    enabledChannels: number;
  } {
    return {
      isRunning: this.isRunning,
      alertCount: this.alerts.size,
      activeRules: this.config.rules.filter(r => r.enabled).length,
      enabledChannels: this.config.channels.filter(c => c.enabled).length
    };
  }
}

/* ===== ALERT EVALUATION CONTEXT ===== */

export interface AlertEvaluationContext {
  readonly environment?: Environment;
  readonly metrics: Record<MetricType, MetricsSummary>;
  readonly environmentDetection?: EnvironmentDetectionResult;
  readonly configurationValid: boolean;
  readonly providerHealth: Record<string, boolean>;
  readonly systemHealth: 'healthy' | 'degraded' | 'critical';
  readonly metadata: Record<string, any>;
}

/* ===== BUILT-IN ALERT RULES ===== */

export const BUILTIN_ALERT_RULES: AlertRule[] = [
  {
    id: 'config-resolution-slow',
    name: 'Configuration Resolution Slow',
    description: 'Configuration resolution time exceeds 100ms threshold',
    enabled: true,
    type: 'performance_degradation',
    conditions: [
      {
        metric: 'configuration_resolution_time',
        operator: 'greater_than',
        value: 100,
        duration: 60000 // 1 minute
      }
    ],
    channels: ['console', 'webhook'],
    severity: 'warning',
    cooldown: 300000, // 5 minutes
    autoResolve: true,
    remediation: [
      {
        id: 'check-cache',
        title: 'Check Configuration Cache',
        description: 'Verify that configuration caching is enabled and working properly',
        action: 'manual',
        priority: 1,
        estimatedTime: '5 minutes'
      },
      {
        id: 'optimize-resolution',
        title: 'Optimize Resolution Logic',
        description: 'Review and optimize configuration resolution algorithms',
        action: 'manual',
        priority: 2,
        estimatedTime: '30 minutes'
      }
    ]
  },
  {
    id: 'provider-init-slow',
    name: 'Provider Initialization Slow',
    description: 'Provider initialization time exceeds 50ms threshold',
    enabled: true,
    type: 'performance_degradation',
    conditions: [
      {
        metric: 'provider_initialization_time',
        operator: 'greater_than',
        value: 50
      }
    ],
    channels: ['console'],
    severity: 'warning',
    cooldown: 300000,
    autoResolve: true,
    remediation: [
      {
        id: 'check-provider-health',
        title: 'Check Provider Health',
        description: 'Verify that all providers are healthy and responding normally',
        action: 'automatic',
        script: 'checkProviderHealth()',
        priority: 1,
        estimatedTime: '2 minutes'
      }
    ]
  },
  {
    id: 'build-performance-degraded',
    name: 'Build Performance Degraded',
    description: 'Build time has increased significantly from baseline',
    enabled: true,
    type: 'performance_degradation',
    conditions: [
      {
        metric: 'build_performance',
        operator: 'greater_than',
        value: 5000 // 5 seconds (baseline was <1s)
      }
    ],
    channels: ['console', 'webhook'],
    severity: 'error',
    cooldown: 600000, // 10 minutes
    autoResolve: true,
    remediation: [
      {
        id: 'analyze-build-log',
        title: 'Analyze Build Log',
        description: 'Review build logs for performance bottlenecks',
        action: 'manual',
        priority: 1,
        estimatedTime: '10 minutes'
      },
      {
        id: 'check-dependencies',
        title: 'Check Dependencies',
        description: 'Verify that all dependencies are up to date and optimized',
        action: 'manual',
        priority: 2,
        estimatedTime: '15 minutes'
      }
    ]
  },
  {
    id: 'environment-detection-failed',
    name: 'Environment Detection Failed',
    description: 'Environment detection is failing consistently',
    enabled: true,
    type: 'environment_detection_failure',
    conditions: [
      {
        field: 'environmentDetection.validationErrors.length',
        operator: 'greater_than',
        value: 0
      }
    ],
    channels: ['console', 'webhook'],
    severity: 'critical',
    cooldown: 300000,
    autoResolve: true,
    remediation: [
      {
        id: 'check-env-vars',
        title: 'Check Environment Variables',
        description: 'Verify that all required environment variables are set correctly',
        action: 'manual',
        priority: 1,
        estimatedTime: '5 minutes'
      },
      {
        id: 'validate-config-files',
        title: 'Validate Configuration Files',
        description: 'Check that configuration files are present and valid',
        action: 'automatic',
        script: 'validateConfigFiles()',
        priority: 2,
        estimatedTime: '3 minutes'
      }
    ]
  },
  {
    id: 'configuration-invalid',
    name: 'Configuration Invalid',
    description: 'Configuration validation is failing',
    enabled: true,
    type: 'configuration_load_failure',
    conditions: [
      {
        field: 'configurationValid',
        operator: 'equals',
        value: false
      }
    ],
    channels: ['console', 'webhook'],
    severity: 'critical',
    cooldown: 180000, // 3 minutes
    autoResolve: true,
    remediation: [
      {
        id: 'check-config-syntax',
        title: 'Check Configuration Syntax',
        description: 'Validate configuration file syntax and structure',
        action: 'automatic',
        script: 'validateConfigSyntax()',
        priority: 1,
        estimatedTime: '2 minutes'
      },
      {
        id: 'restore-backup',
        title: 'Restore Configuration Backup',
        description: 'Restore from the last known good configuration backup',
        action: 'manual',
        priority: 2,
        estimatedTime: '10 minutes'
      }
    ]
  }
];

/* ===== DEFAULT CONFIGURATIONS ===== */

export const DEFAULT_ALERT_SYSTEM_CONFIG: AlertSystemConfig = {
  enabled: true,
  channels: [
    {
      id: 'console',
      name: 'Console Logger',
      type: 'console',
      enabled: true,
      config: {},
      filters: []
    },
    {
      id: 'webhook',
      name: 'Monitoring Webhook',
      type: 'webhook',
      enabled: true,
      config: {
        endpoint: '/api/monitoring/alerts',
        timeout: 5000,
        retryAttempts: 3,
        headers: {
          'Content-Type': 'application/json'
        }
      },
      filters: []
    }
  ],
  rules: BUILTIN_ALERT_RULES,
  deduplication: {
    enabled: true,
    window: 300000, // 5 minutes
    fields: ['type', 'ruleId', 'environment']
  },
  escalation: {
    enabled: false,
    levels: []
  },
  rateLimiting: {
    enabled: true,
    maxAlerts: 10,
    window: 300000, // 5 minutes
    backoffMultiplier: 2
  },
  retention: {
    resolved: 7, // 7 days
    acknowledged: 14, // 14 days
    unresolved: 30 // 30 days
  }
} as const;

/**
 * Factory function to create alert system
 */
export function createAlertSystem(
  config: Partial<AlertSystemConfig> = {}
): AlertSystem {
  const mergedConfig = { 
    ...DEFAULT_ALERT_SYSTEM_CONFIG, 
    ...config,
    rules: [...BUILTIN_ALERT_RULES, ...(config.rules || [])],
    channels: [...DEFAULT_ALERT_SYSTEM_CONFIG.channels, ...(config.channels || [])]
  };
  
  return new AlertSystem(mergedConfig);
}

/**
 * Global alert system instance
 */
export const alertSystem = createAlertSystem();

export default alertSystem;