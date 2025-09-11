import { logger } from '../utils/logger.js';
import { SafeLogger } from '../utils/safe-logger.js';
import { randomUUID } from 'crypto';

export interface ApprovalRequest {
  id: string;
  timestamp: number;
  duckName: string;
  mcpServer: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  approvedBy?: string;
  deniedReason?: string;
  expiresAt: number;
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export class ApprovalService {
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalTimeout: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private approvedToolsForSession: Set<string> = new Set();

  constructor(approvalTimeoutSeconds: number = 300) {
    this.approvalTimeout = approvalTimeoutSeconds * 1000; // Convert to milliseconds
    this.startCleanupTimer();
  }

  createApprovalRequest(
    duckName: string,
    mcpServer: string,
    toolName: string,
    args: Record<string, unknown>
  ): ApprovalRequest {
    const id = randomUUID();
    const now = Date.now();
    
    const request: ApprovalRequest = {
      id,
      timestamp: now,
      duckName,
      mcpServer,
      toolName,
      arguments: args,
      status: 'pending',
      expiresAt: now + this.approvalTimeout,
    };

    this.pendingApprovals.set(id, request);
    
    const safeMessage = SafeLogger.createApprovalMessage(duckName, mcpServer, toolName, args);
    logger.info(`Created approval request ${id} for ${duckName} to call ${mcpServer}:${toolName}`);
    SafeLogger.debug(`Approval request details:`, { id, duckName, mcpServer, toolName, safeMessage });
    
    return request;
  }

  getApprovalRequest(id: string): ApprovalRequest | undefined {
    const request = this.pendingApprovals.get(id);
    
    // Check if expired
    if (request && Date.now() > request.expiresAt && request.status === 'pending') {
      request.status = 'expired';
      logger.info(`Approval request ${id} has expired`);
    }
    
    return request;
  }

  getApprovalStatus(id: string): ApprovalStatus | undefined {
    const request = this.getApprovalRequest(id);
    return request?.status;
  }

  approveRequest(id: string, approvedBy: string = 'user'): boolean {
    const request = this.getApprovalRequest(id);
    
    if (!request) {
      logger.warn(`Approval request ${id} not found`);
      return false;
    }
    
    if (request.status !== 'pending') {
      logger.warn(`Approval request ${id} is not pending (status: ${request.status})`);
      return false;
    }
    
    if (Date.now() > request.expiresAt) {
      request.status = 'expired';
      logger.warn(`Approval request ${id} has expired`);
      return false;
    }
    
    request.status = 'approved';
    request.approvedBy = approvedBy;
    
    // Mark tool as approved for this session
    const sessionKey = this.createSessionKey(request.duckName, request.mcpServer, request.toolName);
    this.approvedToolsForSession.add(sessionKey);
    
    logger.info(`Approval request ${id} approved by ${approvedBy} - tool ${sessionKey} now approved for session`);
    return true;
  }

  denyRequest(id: string, reason?: string): boolean {
    const request = this.getApprovalRequest(id);
    
    if (!request) {
      logger.warn(`Approval request ${id} not found`);
      return false;
    }
    
    if (request.status !== 'pending') {
      logger.warn(`Approval request ${id} is not pending (status: ${request.status})`);
      return false;
    }
    
    request.status = 'denied';
    request.deniedReason = reason;
    
    logger.info(`Approval request ${id} denied${reason ? `: ${reason}` : ''}`);
    return true;
  }

  getPendingApprovals(): ApprovalRequest[] {
    // Clean up expired requests first
    this.cleanupExpired();
    
    return Array.from(this.pendingApprovals.values())
      .filter(request => request.status === 'pending');
  }

  getAllApprovals(): ApprovalRequest[] {
    // Clean up expired requests first
    this.cleanupExpired();
    
    return Array.from(this.pendingApprovals.values());
  }

  getApprovalsByDuck(duckName: string): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values())
      .filter(request => request.duckName === duckName);
  }

  cleanupExpired(): number {
    const now = Date.now();
    let cleanedUp = 0;
    
    for (const [id, request] of this.pendingApprovals.entries()) {
      if (now > request.expiresAt && request.status === 'pending') {
        request.status = 'expired';
        logger.debug(`Marked approval request ${id} as expired`);
        cleanedUp++;
      }
    }
    
    return cleanedUp;
  }

  private startCleanupTimer(): void {
    // Clean up expired requests every minute
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanupExpired();
      if (cleaned > 0) {
        logger.debug(`Cleaned up ${cleaned} expired approval requests`);
      }
    }, 60000);
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Session-based approval methods
  private createSessionKey(duckName: string, mcpServer: string, toolName: string): string {
    return `${duckName}:${mcpServer}:${toolName}`;
  }

  isToolApprovedForSession(duckName: string, mcpServer: string, toolName: string): boolean {
    const sessionKey = this.createSessionKey(duckName, mcpServer, toolName);
    return this.approvedToolsForSession.has(sessionKey);
  }

  markToolAsApprovedForSession(duckName: string, mcpServer: string, toolName: string): void {
    const sessionKey = this.createSessionKey(duckName, mcpServer, toolName);
    this.approvedToolsForSession.add(sessionKey);
    logger.info(`Tool ${sessionKey} marked as approved for session`);
  }

  clearSessionApprovals(): void {
    const count = this.approvedToolsForSession.size;
    this.approvedToolsForSession.clear();
    logger.info(`Cleared ${count} session approvals`);
  }

  getSessionApprovals(): string[] {
    return Array.from(this.approvedToolsForSession);
  }

  // For debugging/admin purposes
  getStats(): {
    total: number;
    pending: number;
    approved: number;
    denied: number;
    expired: number;
  } {
    this.cleanupExpired();
    
    const all = Array.from(this.pendingApprovals.values());
    
    return {
      total: all.length,
      pending: all.filter(r => r.status === 'pending').length,
      approved: all.filter(r => r.status === 'approved').length,
      denied: all.filter(r => r.status === 'denied').length,
      expired: all.filter(r => r.status === 'expired').length,
    };
  }
}