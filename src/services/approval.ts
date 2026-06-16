import { logger } from '../utils/logger.js';
import { SafeLogger } from '../utils/safe-logger.js';
import { randomUUID, createHash } from 'crypto';
import { canonicalJSONStringify } from '../utils/canonical-json.js';

export interface ApprovalRequest {
  id: string;
  timestamp: number;
  duckName: string;
  mcpServer: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';
  approvedBy?: string;
  deniedReason?: string;
  expiresAt: number;
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';

export class ApprovalService {
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalTimeout: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  // Maps a session approval key -> expiresAt (epoch ms). The key is scoped by
  // principal (provider name) + server + tool + normalized-args-hash.
  private approvedToolsForSession: Map<string, number> = new Map();

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
    SafeLogger.debug(`Approval request details:`, {
      id,
      duckName,
      mcpServer,
      toolName,
      safeMessage,
    });

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

    // Mark tool as approved for this session, scoped by principal + server +
    // tool + args-hash and carrying a TTL derived from the approval timeout.
    const sessionKey = this.createSessionKey(
      request.duckName,
      request.mcpServer,
      request.toolName,
      request.arguments
    );
    this.approvedToolsForSession.set(sessionKey, Date.now() + this.approvalTimeout);

    logger.info(
      `Approval request ${id} approved by ${approvedBy} - tool ${sessionKey} now approved for session`
    );
    return true;
  }

  /**
   * Consume an approved request, transitioning it to the terminal `consumed`
   * status. Single-use: returns true only on a valid approved→consumed
   * transition; returns false if the request is missing or not in the
   * `approved` state (e.g. already consumed).
   */
  consumeApproval(id: string): boolean {
    const request = this.getApprovalRequest(id);

    if (!request) {
      logger.warn(`Approval request ${id} not found`);
      return false;
    }

    if (request.status !== 'approved') {
      logger.warn(`Approval request ${id} is not approved (status: ${request.status})`);
      return false;
    }

    request.status = 'consumed';
    logger.info(`Approval request ${id} consumed (single-use)`);
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

    return Array.from(this.pendingApprovals.values()).filter(
      (request) => request.status === 'pending'
    );
  }

  getAllApprovals(): ApprovalRequest[] {
    // Clean up expired requests first
    this.cleanupExpired();

    return Array.from(this.pendingApprovals.values());
  }

  getApprovalsByDuck(duckName: string): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (request) => request.duckName === duckName
    );
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
  //
  // The session key is scoped by the principal (provider name), the MCP server,
  // the tool name, and a hash of the normalized (canonical, key-sorted) args.
  // This ensures: (1) two providers sharing a human nickname cannot
  // cross-authorize (the principal is the stable provider name), and (2) an
  // approval for one set of arguments does not auto-approve a materially
  // different set.
  private createSessionKey(
    principal: string,
    mcpServer: string,
    toolName: string,
    args: Record<string, unknown>
  ): string {
    const argsHash = createHash('sha256').update(canonicalJSONStringify(args)).digest('hex');
    return `${principal}:${mcpServer}:${toolName}:${argsHash}`;
  }

  isToolApprovedForSession(
    principal: string,
    mcpServer: string,
    toolName: string,
    args: Record<string, unknown>
  ): boolean {
    const sessionKey = this.createSessionKey(principal, mcpServer, toolName, args);
    const expiresAt = this.approvedToolsForSession.get(sessionKey);

    if (expiresAt === undefined) {
      return false;
    }

    // Expired approvals are evicted and treated as not approved, forcing a
    // fresh approval prompt.
    if (Date.now() >= expiresAt) {
      this.approvedToolsForSession.delete(sessionKey);
      return false;
    }

    return true;
  }

  markToolAsApprovedForSession(
    principal: string,
    mcpServer: string,
    toolName: string,
    args: Record<string, unknown>
  ): void {
    const sessionKey = this.createSessionKey(principal, mcpServer, toolName, args);
    this.approvedToolsForSession.set(sessionKey, Date.now() + this.approvalTimeout);
    logger.info(`Tool ${sessionKey} marked as approved for session`);
  }

  clearSessionApprovals(): void {
    const count = this.approvedToolsForSession.size;
    this.approvedToolsForSession.clear();
    logger.info(`Cleared ${count} session approvals`);
  }

  getSessionApprovals(): string[] {
    return Array.from(this.approvedToolsForSession.keys());
  }

  // For debugging/admin purposes
  getStats(): {
    total: number;
    pending: number;
    approved: number;
    denied: number;
    expired: number;
    consumed: number;
  } {
    this.cleanupExpired();

    const all = Array.from(this.pendingApprovals.values());

    return {
      total: all.length,
      pending: all.filter((r) => r.status === 'pending').length,
      approved: all.filter((r) => r.status === 'approved').length,
      denied: all.filter((r) => r.status === 'denied').length,
      expired: all.filter((r) => r.status === 'expired').length,
      consumed: all.filter((r) => r.status === 'consumed').length,
    };
  }
}
