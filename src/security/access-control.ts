/**
 * Role-Based Access Control System - BERS Security Module
 * 
 * Comprehensive RBAC implementation for multi-environment access control,
 * tenant isolation, and operation authorization in the BERS system.
 * 
 * @version 1.0.0
 * @author BERS Security Team
 */

import type { 
  Environment,
  ValidTenantHash,
  SecurityError 
} from '../types/security';

/* ===== RBAC INTERFACES ===== */

export interface Role {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly Permission[];
  readonly environment: Environment | 'all';
  readonly tenantScope: 'single' | 'multiple' | 'all';
  readonly isSystem: boolean;
}

export interface Permission {
  readonly resource: ResourceType;
  readonly action: ActionType;
  readonly conditions?: readonly AccessCondition[];
  readonly environment?: Environment | 'all';
}

export interface User {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly string[]; // Role IDs
  readonly tenantAccess: readonly ValidTenantHash[];
  readonly isActive: boolean;
  readonly lastLogin?: number;
  readonly sessionExpiry?: number;
}

export interface AccessRequest {
  readonly userId: string;
  readonly resource: ResourceType;
  readonly action: ActionType;
  readonly environment: Environment;
  readonly tenantHash?: ValidTenantHash;
  readonly context?: Record<string, any>;
}

export interface AccessResult {
  readonly granted: boolean;
  readonly reason: string;
  readonly matchedRoles: readonly string[];
  readonly requiredPermissions: readonly Permission[];
  readonly missingPermissions: readonly Permission[];
  readonly warnings: readonly string[];
}

export interface AccessCondition {
  readonly type: 'time' | 'ip' | 'environment' | 'tenant' | 'custom';
  readonly operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than';
  readonly value: any;
  readonly metadata?: Record<string, any>;
}

export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly environment: Environment;
  readonly tenantHash?: ValidTenantHash;
  readonly roles: readonly string[];
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly lastActivity: number;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/* ===== RESOURCE AND ACTION TYPES ===== */

export type ResourceType = 
  | 'configuration'
  | 'environment'
  | 'tenant'
  | 'deployment'
  | 'monitoring'
  | 'logs'
  | 'users'
  | 'roles'
  | 'system';

export type ActionType = 
  | 'read'
  | 'write'
  | 'create'
  | 'update'
  | 'delete'
  | 'deploy'
  | 'promote'
  | 'rollback'
  | 'monitor'
  | 'admin';

/* ===== PREDEFINED ROLES ===== */

const SYSTEM_ROLES: readonly Role[] = [
  {
    id: 'developer',
    name: 'Developer',
    description: 'Development environment access with configuration read/write',
    environment: 'development',
    tenantScope: 'multiple',
    isSystem: true,
    permissions: [
      { resource: 'configuration', action: 'read' },
      { resource: 'configuration', action: 'write', environment: 'development' },
      { resource: 'environment', action: 'read' },
      { resource: 'tenant', action: 'read' },
      { resource: 'monitoring', action: 'read' },
      { resource: 'logs', action: 'read', environment: 'development' }
    ]
  },
  {
    id: 'tester',
    name: 'Tester',
    description: 'Staging environment access with read-only permissions',
    environment: 'staging',
    tenantScope: 'multiple',
    isSystem: true,
    permissions: [
      { resource: 'configuration', action: 'read' },
      { resource: 'environment', action: 'read' },
      { resource: 'tenant', action: 'read' },
      { resource: 'monitoring', action: 'read' },
      { resource: 'logs', action: 'read', environment: 'staging' }
    ]
  },
  {
    id: 'operator',
    name: 'Production Operator',
    description: 'Production monitoring and limited configuration access',
    environment: 'production',
    tenantScope: 'all',
    isSystem: true,
    permissions: [
      { resource: 'configuration', action: 'read', environment: 'production' },
      { resource: 'monitoring', action: 'read' },
      { resource: 'monitoring', action: 'admin' },
      { resource: 'logs', action: 'read', environment: 'production' },
      { resource: 'deployment', action: 'rollback' }
    ]
  },
  {
    id: 'deployer',
    name: 'Deployment Manager',
    description: 'Cross-environment deployment and promotion capabilities',
    environment: 'all',
    tenantScope: 'all',
    isSystem: true,
    permissions: [
      { resource: 'configuration', action: 'read' },
      { resource: 'environment', action: 'read' },
      { resource: 'deployment', action: 'deploy' },
      { resource: 'deployment', action: 'promote' },
      { resource: 'deployment', action: 'rollback' },
      { resource: 'monitoring', action: 'read' }
    ]
  },
  {
    id: 'admin',
    name: 'System Administrator',
    description: 'Full system access across all environments',
    environment: 'all',
    tenantScope: 'all',
    isSystem: true,
    permissions: [
      { resource: 'configuration', action: 'read' },
      { resource: 'configuration', action: 'write' },
      { resource: 'configuration', action: 'create' },
      { resource: 'configuration', action: 'update' },
      { resource: 'configuration', action: 'delete' },
      { resource: 'environment', action: 'read' },
      { resource: 'environment', action: 'write' },
      { resource: 'tenant', action: 'read' },
      { resource: 'tenant', action: 'write' },
      { resource: 'tenant', action: 'create' },
      { resource: 'deployment', action: 'deploy' },
      { resource: 'deployment', action: 'promote' },
      { resource: 'deployment', action: 'rollback' },
      { resource: 'monitoring', action: 'read' },
      { resource: 'monitoring', action: 'admin' },
      { resource: 'logs', action: 'read' },
      { resource: 'users', action: 'read' },
      { resource: 'users', action: 'write' },
      { resource: 'roles', action: 'read' },
      { resource: 'roles', action: 'write' },
      { resource: 'system', action: 'admin' }
    ]
  },
  {
    id: 'tenant-admin',
    name: 'Tenant Administrator',
    description: 'Tenant-specific configuration and monitoring access',
    environment: 'all',
    tenantScope: 'single',
    isSystem: true,
    permissions: [
      { 
        resource: 'configuration', 
        action: 'read',
        conditions: [{ type: 'tenant', operator: 'equals', value: '$TENANT_HASH' }]
      },
      { 
        resource: 'configuration', 
        action: 'write',
        conditions: [{ type: 'tenant', operator: 'equals', value: '$TENANT_HASH' }]
      },
      { 
        resource: 'tenant', 
        action: 'read',
        conditions: [{ type: 'tenant', operator: 'equals', value: '$TENANT_HASH' }]
      },
      { 
        resource: 'monitoring', 
        action: 'read',
        conditions: [{ type: 'tenant', operator: 'equals', value: '$TENANT_HASH' }]
      },
      { 
        resource: 'logs', 
        action: 'read',
        conditions: [{ type: 'tenant', operator: 'equals', value: '$TENANT_HASH' }]
      }
    ]
  },
  {
    id: 'readonly',
    name: 'Read-Only User',
    description: 'Basic read access for monitoring and reporting',
    environment: 'all',
    tenantScope: 'multiple',
    isSystem: true,
    permissions: [
      { resource: 'configuration', action: 'read' },
      { resource: 'environment', action: 'read' },
      { resource: 'tenant', action: 'read' },
      { resource: 'monitoring', action: 'read' },
      { resource: 'logs', action: 'read' }
    ]
  }
];

/* ===== MAIN RBAC CLASS ===== */

export class AccessControlManager {
  private roles: Map<string, Role>;
  private users: Map<string, User>;
  private sessions: Map<string, Session>;
  private auditLog: AccessAuditEntry[];

  constructor() {
    this.roles = new Map();
    this.users = new Map();
    this.sessions = new Map();
    this.auditLog = [];

    // Initialize system roles
    SYSTEM_ROLES.forEach(role => {
      this.roles.set(role.id, role);
    });
  }

  /* ===== ROLE MANAGEMENT ===== */

  /**
   * Create a new role
   */
  async createRole(role: Omit<Role, 'isSystem'>): Promise<void> {
    if (this.roles.has(role.id)) {
      throw new Error(`Role ${role.id} already exists`);
    }

    // Validate permissions
    this.validatePermissions(role.permissions);

    const newRole: Role = {
      ...role,
      isSystem: false
    };

    this.roles.set(role.id, newRole);
    this.logAccess('system', 'roles', 'create', 'all', undefined, true, `Created role: ${role.id}`);
  }

  /**
   * Update an existing role
   */
  async updateRole(roleId: string, updates: Partial<Omit<Role, 'id' | 'isSystem'>>): Promise<void> {
    const existingRole = this.roles.get(roleId);
    if (!existingRole) {
      throw new Error(`Role ${roleId} not found`);
    }

    if (existingRole.isSystem) {
      throw new Error(`Cannot modify system role: ${roleId}`);
    }

    const updatedRole: Role = {
      ...existingRole,
      ...updates
    };

    if (updates.permissions) {
      this.validatePermissions(updates.permissions);
    }

    this.roles.set(roleId, updatedRole);
    this.logAccess('system', 'roles', 'update', 'all', undefined, true, `Updated role: ${roleId}`);
  }

  /**
   * Delete a role
   */
  async deleteRole(roleId: string): Promise<void> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }

    if (role.isSystem) {
      throw new Error(`Cannot delete system role: ${roleId}`);
    }

    // Check if role is in use
    const usersWithRole = Array.from(this.users.values()).filter(user => 
      user.roles.includes(roleId)
    );

    if (usersWithRole.length > 0) {
      throw new Error(`Cannot delete role ${roleId}: still assigned to ${usersWithRole.length} users`);
    }

    this.roles.delete(roleId);
    this.logAccess('system', 'roles', 'delete', 'all', undefined, true, `Deleted role: ${roleId}`);
  }

  /**
   * Get role by ID
   */
  getRole(roleId: string): Role | undefined {
    return this.roles.get(roleId);
  }

  /**
   * List all roles
   */
  listRoles(includeSystem: boolean = true): Role[] {
    const allRoles = Array.from(this.roles.values());
    return includeSystem ? allRoles : allRoles.filter(role => !role.isSystem);
  }

  /* ===== USER MANAGEMENT ===== */

  /**
   * Create a new user
   */
  async createUser(user: User): Promise<void> {
    if (this.users.has(user.id)) {
      throw new Error(`User ${user.id} already exists`);
    }

    // Validate roles exist
    for (const roleId of user.roles) {
      if (!this.roles.has(roleId)) {
        throw new Error(`Role ${roleId} not found`);
      }
    }

    this.users.set(user.id, user);
    this.logAccess('system', 'users', 'create', 'all', undefined, true, `Created user: ${user.id}`);
  }

  /**
   * Update user
   */
  async updateUser(userId: string, updates: Partial<Omit<User, 'id'>>): Promise<void> {
    const existingUser = this.users.get(userId);
    if (!existingUser) {
      throw new Error(`User ${userId} not found`);
    }

    if (updates.roles) {
      // Validate new roles exist
      for (const roleId of updates.roles) {
        if (!this.roles.has(roleId)) {
          throw new Error(`Role ${roleId} not found`);
        }
      }
    }

    const updatedUser: User = {
      ...existingUser,
      ...updates
    };

    this.users.set(userId, updatedUser);
    this.logAccess('system', 'users', 'update', 'all', undefined, true, `Updated user: ${userId}`);
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  /* ===== ACCESS CONTROL ===== */

  /**
   * Check if user has access to perform action
   */
  async checkAccess(request: AccessRequest): Promise<AccessResult> {
    const user = this.users.get(request.userId);
    if (!user) {
      this.logAccess(request.userId, request.resource, request.action, request.environment, request.tenantHash, false, 'User not found');
      return {
        granted: false,
        reason: 'User not found',
        matchedRoles: [],
        requiredPermissions: [],
        missingPermissions: [],
        warnings: []
      };
    }

    if (!user.isActive) {
      this.logAccess(request.userId, request.resource, request.action, request.environment, request.tenantHash, false, 'User not active');
      return {
        granted: false,
        reason: 'User account not active',
        matchedRoles: [],
        requiredPermissions: [],
        missingPermissions: [],
        warnings: []
      };
    }

    // Check session validity if session exists
    const activeSession = this.getActiveSession(request.userId, request.environment);
    if (activeSession && activeSession.expiresAt < Date.now()) {
      this.logAccess(request.userId, request.resource, request.action, request.environment, request.tenantHash, false, 'Session expired');
      return {
        granted: false,
        reason: 'Session expired',
        matchedRoles: [],
        requiredPermissions: [],
        missingPermissions: [],
        warnings: []
      };
    }

    const userRoles = user.roles.map(roleId => this.roles.get(roleId)).filter(Boolean) as Role[];
    const matchedRoles: string[] = [];
    const requiredPermissions: Permission[] = [];
    const missingPermissions: Permission[] = [];
    const warnings: string[] = [];

    // Check each role for matching permissions
    for (const role of userRoles) {
      // Environment scope check
      if (role.environment !== 'all' && role.environment !== request.environment) {
        continue;
      }

      // Tenant scope check
      if (request.tenantHash && role.tenantScope === 'single') {
        if (!user.tenantAccess.includes(request.tenantHash)) {
          warnings.push(`Role ${role.id} requires tenant access to ${request.tenantHash}`);
          continue;
        }
      }

      // Check permissions
      for (const permission of role.permissions) {
        if (permission.resource === request.resource && permission.action === request.action) {
          requiredPermissions.push(permission);

          // Environment-specific permission check
          if (permission.environment && permission.environment !== 'all' && permission.environment !== request.environment) {
            missingPermissions.push(permission);
            continue;
          }

          // Condition checks
          if (permission.conditions) {
            const conditionsMet = await this.checkConditions(permission.conditions, request, user);
            if (!conditionsMet) {
              missingPermissions.push(permission);
              continue;
            }
          }

          matchedRoles.push(role.id);
        }
      }
    }

    const granted = matchedRoles.length > 0;
    const reason = granted ? 'Access granted' : 'No matching permissions found';

    this.logAccess(request.userId, request.resource, request.action, request.environment, request.tenantHash, granted, reason);

    return {
      granted,
      reason,
      matchedRoles,
      requiredPermissions,
      missingPermissions,
      warnings
    };
  }

  /**
   * Create user session
   */
  async createSession(
    userId: string, 
    environment: Environment, 
    tenantHash?: ValidTenantHash,
    sessionOptions: {
      ipAddress?: string;
      userAgent?: string;
      expirationMinutes?: number;
    } = {}
  ): Promise<Session> {
    const user = this.users.get(userId);
    if (!user || !user.isActive) {
      throw new Error('Invalid user or user not active');
    }

    const sessionId = this.generateSessionId();
    const now = Date.now();
    const expirationMinutes = sessionOptions.expirationMinutes || 480; // 8 hours default
    const expiresAt = now + (expirationMinutes * 60 * 1000);

    const session: Session = {
      id: sessionId,
      userId,
      environment,
      tenantHash,
      roles: user.roles,
      createdAt: now,
      expiresAt,
      lastActivity: now,
      ipAddress: sessionOptions.ipAddress,
      userAgent: sessionOptions.userAgent
    };

    this.sessions.set(sessionId, session);
    this.logAccess(userId, 'system', 'create', environment, tenantHash, true, 'Session created');

    return session;
  }

  /**
   * Validate session
   */
  validateSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt < Date.now()) {
      if (session) {
        this.sessions.delete(sessionId);
      }
      return null;
    }

    // Update last activity
    session.lastActivity = Date.now();
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Invalidate session
   */
  invalidateSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.logAccess(session.userId, 'system', 'delete', session.environment, session.tenantHash, true, 'Session invalidated');
    }
  }

  /**
   * Get active session for user in environment
   */
  private getActiveSession(userId: string, environment: Environment): Session | undefined {
    return Array.from(this.sessions.values()).find(session => 
      session.userId === userId && 
      session.environment === environment && 
      session.expiresAt > Date.now()
    );
  }

  /* ===== UTILITY METHODS ===== */

  /**
   * Validate permissions structure
   */
  private validatePermissions(permissions: readonly Permission[]): void {
    for (const permission of permissions) {
      if (!permission.resource || !permission.action) {
        throw new Error('Permission must have resource and action');
      }

      // Validate resource and action types
      const validResources: ResourceType[] = ['configuration', 'environment', 'tenant', 'deployment', 'monitoring', 'logs', 'users', 'roles', 'system'];
      const validActions: ActionType[] = ['read', 'write', 'create', 'update', 'delete', 'deploy', 'promote', 'rollback', 'monitor', 'admin'];

      if (!validResources.includes(permission.resource)) {
        throw new Error(`Invalid resource type: ${permission.resource}`);
      }

      if (!validActions.includes(permission.action)) {
        throw new Error(`Invalid action type: ${permission.action}`);
      }
    }
  }

  /**
   * Check access conditions
   */
  private async checkConditions(
    conditions: readonly AccessCondition[], 
    request: AccessRequest, 
    user: User
  ): Promise<boolean> {
    for (const condition of conditions) {
      switch (condition.type) {
        case 'environment':
          if (!this.checkCondition(request.environment, condition.operator, condition.value)) {
            return false;
          }
          break;

        case 'tenant':
          if (condition.value === '$TENANT_HASH') {
            // Special value for tenant-scoped permissions
            if (!request.tenantHash || !user.tenantAccess.includes(request.tenantHash)) {
              return false;
            }
          } else if (!this.checkCondition(request.tenantHash, condition.operator, condition.value)) {
            return false;
          }
          break;

        case 'time':
          const currentTime = Date.now();
          if (!this.checkCondition(currentTime, condition.operator, condition.value)) {
            return false;
          }
          break;

        case 'ip':
          // IP-based access control would be implemented here
          break;

        case 'custom':
          // Custom condition logic would be implemented here
          break;
      }
    }

    return true;
  }

  /**
   * Check individual condition
   */
  private checkCondition(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'greater_than':
        return actual > expected;
      case 'less_than':
        return actual < expected;
      default:
        return false;
    }
  }

  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Log access attempt
   */
  private logAccess(
    userId: string,
    resource: ResourceType,
    action: ActionType,
    environment: Environment,
    tenantHash: ValidTenantHash | undefined,
    granted: boolean,
    reason: string
  ): void {
    const logEntry: AccessAuditEntry = {
      timestamp: Date.now(),
      userId,
      resource,
      action,
      environment,
      tenantHash,
      granted,
      reason,
      ipAddress: undefined, // Would be populated from request context
      userAgent: undefined  // Would be populated from request context
    };

    this.auditLog.push(logEntry);

    // Keep audit log size manageable (keep last 10000 entries)
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }

    console.log(`ACCESS ${granted ? 'GRANTED' : 'DENIED'}: ${userId} ${action} ${resource} in ${environment}${tenantHash ? ` for tenant ${tenantHash}` : ''} - ${reason}`);
  }

  /**
   * Get audit log
   */
  getAuditLog(
    filters: {
      userId?: string;
      resource?: ResourceType;
      environment?: Environment;
      granted?: boolean;
      since?: number;
    } = {}
  ): AccessAuditEntry[] {
    let filtered = [...this.auditLog];

    if (filters.userId) {
      filtered = filtered.filter(entry => entry.userId === filters.userId);
    }

    if (filters.resource) {
      filtered = filtered.filter(entry => entry.resource === filters.resource);
    }

    if (filters.environment) {
      filtered = filtered.filter(entry => entry.environment === filters.environment);
    }

    if (filters.granted !== undefined) {
      filtered = filtered.filter(entry => entry.granted === filters.granted);
    }

    if (filters.since) {
      filtered = filtered.filter(entry => entry.timestamp >= filters.since);
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }
}

/* ===== AUDIT LOG INTERFACE ===== */

interface AccessAuditEntry {
  readonly timestamp: number;
  readonly userId: string;
  readonly resource: ResourceType;
  readonly action: ActionType;
  readonly environment: Environment;
  readonly tenantHash?: ValidTenantHash;
  readonly granted: boolean;
  readonly reason: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/* ===== FACTORY AND EXPORTS ===== */

export const createAccessControlManager = (): AccessControlManager => {
  return new AccessControlManager();
};

export const defaultAccessControl = createAccessControlManager();

export default AccessControlManager;