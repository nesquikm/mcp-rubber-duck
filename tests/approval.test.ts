import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ApprovalService } from '../src/services/approval.js';

// Mock logger to avoid console noise during tests
jest.mock('../src/utils/logger');
jest.mock('../src/utils/safe-logger');

describe('ApprovalService', () => {
  let service: ApprovalService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new ApprovalService(60); // 60 second timeout for tests
  });

  afterEach(() => {
    service.shutdown();
    jest.useRealTimers();
  });

  describe('createApprovalRequest', () => {
    it('should create a pending approval request', () => {
      const request = service.createApprovalRequest(
        'TestDuck',
        'filesystem',
        'read_file',
        { path: '/tmp/test.txt' }
      );

      expect(request.id).toBeDefined();
      expect(request.duckName).toBe('TestDuck');
      expect(request.mcpServer).toBe('filesystem');
      expect(request.toolName).toBe('read_file');
      expect(request.status).toBe('pending');
      expect(request.arguments).toEqual({ path: '/tmp/test.txt' });
    });

    it('should set expiration time based on timeout', () => {
      const before = Date.now();
      const request = service.createApprovalRequest(
        'TestDuck',
        'filesystem',
        'read_file',
        {}
      );
      const after = Date.now();

      // 60 seconds timeout = 60000 ms
      expect(request.expiresAt).toBeGreaterThanOrEqual(before + 60000);
      expect(request.expiresAt).toBeLessThanOrEqual(after + 60000);
    });

    it('should generate unique IDs for each request', () => {
      const request1 = service.createApprovalRequest('Duck1', 'server', 'tool', {});
      const request2 = service.createApprovalRequest('Duck2', 'server', 'tool', {});

      expect(request1.id).not.toBe(request2.id);
    });
  });

  describe('getApprovalRequest', () => {
    it('should return existing request', () => {
      const created = service.createApprovalRequest('TestDuck', 'server', 'tool', {});
      const retrieved = service.getApprovalRequest(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent request', () => {
      const retrieved = service.getApprovalRequest('non-existent-id');

      expect(retrieved).toBeUndefined();
    });

    it('should mark expired requests when retrieved', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      // Advance time past expiration
      jest.advanceTimersByTime(61000);

      const retrieved = service.getApprovalRequest(request.id);

      expect(retrieved?.status).toBe('expired');
    });
  });

  describe('getApprovalStatus', () => {
    it('should return status of existing request', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      expect(service.getApprovalStatus(request.id)).toBe('pending');
    });

    it('should return undefined for non-existent request', () => {
      expect(service.getApprovalStatus('non-existent')).toBeUndefined();
    });
  });

  describe('approveRequest', () => {
    it('should approve pending request', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      const result = service.approveRequest(request.id);

      expect(result).toBe(true);
      expect(service.getApprovalStatus(request.id)).toBe('approved');
    });

    it('should set approvedBy field', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      service.approveRequest(request.id, 'admin');

      const retrieved = service.getApprovalRequest(request.id);
      expect(retrieved?.approvedBy).toBe('admin');
    });

    it('should default approvedBy to user', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      service.approveRequest(request.id);

      const retrieved = service.getApprovalRequest(request.id);
      expect(retrieved?.approvedBy).toBe('user');
    });

    it('should return false for non-existent request', () => {
      const result = service.approveRequest('non-existent');

      expect(result).toBe(false);
    });

    it('should return false for already approved request', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});
      service.approveRequest(request.id);

      const result = service.approveRequest(request.id);

      expect(result).toBe(false);
    });

    it('should return false for expired request', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      // Advance time past expiration
      jest.advanceTimersByTime(61000);

      const result = service.approveRequest(request.id);

      expect(result).toBe(false);
      expect(service.getApprovalStatus(request.id)).toBe('expired');
    });

    it('should detect expiration via Date.now check even if status is still pending', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      // Request is created with status 'pending'
      expect(request.status).toBe('pending');

      // Directly set expiresAt to be in the past (without triggering cleanup timer)
      // This simulates the case where time has passed but cleanup hasn't run
      request.expiresAt = Date.now() - 1000;

      // Status is still 'pending' because cleanup timer hasn't run
      expect(request.status).toBe('pending');

      // approveRequest should detect expiration via Date.now() check
      const result = service.approveRequest(request.id);

      expect(result).toBe(false);
      expect(request.status).toBe('expired');
    });

    it('should add tool to session approvals', () => {
      const request = service.createApprovalRequest('TestDuck', 'filesystem', 'read_file', {});

      service.approveRequest(request.id);

      expect(service.isToolApprovedForSession('TestDuck', 'filesystem', 'read_file')).toBe(true);
    });
  });

  describe('denyRequest', () => {
    it('should deny pending request', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      const result = service.denyRequest(request.id);

      expect(result).toBe(true);
      expect(service.getApprovalStatus(request.id)).toBe('denied');
    });

    it('should set denial reason when provided', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      service.denyRequest(request.id, 'Security concern');

      const retrieved = service.getApprovalRequest(request.id);
      expect(retrieved?.deniedReason).toBe('Security concern');
    });

    it('should return false for non-existent request', () => {
      const result = service.denyRequest('non-existent');

      expect(result).toBe(false);
    });

    it('should return false for already denied request', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});
      service.denyRequest(request.id);

      const result = service.denyRequest(request.id);

      expect(result).toBe(false);
    });

    it('should return false for approved request', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});
      service.approveRequest(request.id);

      const result = service.denyRequest(request.id);

      expect(result).toBe(false);
    });
  });

  describe('getPendingApprovals', () => {
    it('should return only pending requests', () => {
      service.createApprovalRequest('Duck1', 'server', 'tool', {});
      const approved = service.createApprovalRequest('Duck2', 'server', 'tool', {});
      service.approveRequest(approved.id);
      const denied = service.createApprovalRequest('Duck3', 'server', 'tool', {});
      service.denyRequest(denied.id);

      const pending = service.getPendingApprovals();

      expect(pending).toHaveLength(1);
      expect(pending[0].duckName).toBe('Duck1');
    });

    it('should return empty array when no pending requests', () => {
      const pending = service.getPendingApprovals();

      expect(pending).toHaveLength(0);
    });
  });

  describe('getAllApprovals', () => {
    it('should return all requests', () => {
      service.createApprovalRequest('Duck1', 'server', 'tool', {});
      const approved = service.createApprovalRequest('Duck2', 'server', 'tool', {});
      service.approveRequest(approved.id);
      const denied = service.createApprovalRequest('Duck3', 'server', 'tool', {});
      service.denyRequest(denied.id);

      const all = service.getAllApprovals();

      expect(all).toHaveLength(3);
    });
  });

  describe('getApprovalsByDuck', () => {
    it('should filter requests by duck name', () => {
      service.createApprovalRequest('Duck1', 'server', 'tool1', {});
      service.createApprovalRequest('Duck1', 'server', 'tool2', {});
      service.createApprovalRequest('Duck2', 'server', 'tool3', {});

      const duck1Requests = service.getApprovalsByDuck('Duck1');
      const duck2Requests = service.getApprovalsByDuck('Duck2');
      const nonExistent = service.getApprovalsByDuck('NonExistent');

      expect(duck1Requests).toHaveLength(2);
      expect(duck2Requests).toHaveLength(1);
      expect(nonExistent).toHaveLength(0);
    });
  });

  describe('cleanupExpired', () => {
    it('should mark expired pending requests as expired', () => {
      const request = service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      // Advance time past expiration
      jest.advanceTimersByTime(61000);

      const cleanedCount = service.cleanupExpired();

      expect(cleanedCount).toBe(1);
      expect(service.getApprovalStatus(request.id)).toBe('expired');
    });

    it('should not affect already approved/denied requests', () => {
      const approved = service.createApprovalRequest('Duck1', 'server', 'tool', {});
      service.approveRequest(approved.id);
      const denied = service.createApprovalRequest('Duck2', 'server', 'tool', {});
      service.denyRequest(denied.id);

      // Advance time past expiration
      jest.advanceTimersByTime(61000);

      const cleanedCount = service.cleanupExpired();

      expect(cleanedCount).toBe(0);
      expect(service.getApprovalStatus(approved.id)).toBe('approved');
      expect(service.getApprovalStatus(denied.id)).toBe('denied');
    });

    it('should be called by cleanup timer', () => {
      service.createApprovalRequest('TestDuck', 'server', 'tool', {});

      // Advance time past cleanup interval (60 seconds + expiration)
      jest.advanceTimersByTime(121000);

      const pending = service.getPendingApprovals();

      expect(pending).toHaveLength(0);
    });
  });

  describe('session approvals', () => {
    it('should track tool approvals for session', () => {
      expect(service.isToolApprovedForSession('Duck', 'server', 'tool')).toBe(false);

      service.markToolAsApprovedForSession('Duck', 'server', 'tool');

      expect(service.isToolApprovedForSession('Duck', 'server', 'tool')).toBe(true);
    });

    it('should differentiate between duck/server/tool combinations', () => {
      service.markToolAsApprovedForSession('Duck1', 'server', 'tool');

      expect(service.isToolApprovedForSession('Duck1', 'server', 'tool')).toBe(true);
      expect(service.isToolApprovedForSession('Duck2', 'server', 'tool')).toBe(false);
      expect(service.isToolApprovedForSession('Duck1', 'other', 'tool')).toBe(false);
      expect(service.isToolApprovedForSession('Duck1', 'server', 'other')).toBe(false);
    });

    it('should clear session approvals', () => {
      service.markToolAsApprovedForSession('Duck1', 'server', 'tool1');
      service.markToolAsApprovedForSession('Duck2', 'server', 'tool2');

      service.clearSessionApprovals();

      expect(service.isToolApprovedForSession('Duck1', 'server', 'tool1')).toBe(false);
      expect(service.isToolApprovedForSession('Duck2', 'server', 'tool2')).toBe(false);
    });

    it('should get all session approvals', () => {
      service.markToolAsApprovedForSession('Duck1', 'server', 'tool1');
      service.markToolAsApprovedForSession('Duck2', 'server', 'tool2');

      const approvals = service.getSessionApprovals();

      expect(approvals).toHaveLength(2);
      expect(approvals).toContain('Duck1:server:tool1');
      expect(approvals).toContain('Duck2:server:tool2');
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      service.createApprovalRequest('Duck1', 'server', 'tool', {});
      const approved = service.createApprovalRequest('Duck2', 'server', 'tool', {});
      service.approveRequest(approved.id);
      const denied = service.createApprovalRequest('Duck3', 'server', 'tool', {});
      service.denyRequest(denied.id);
      const expiring = service.createApprovalRequest('Duck4', 'server', 'tool', {});

      // Expire one request
      jest.advanceTimersByTime(61000);
      service.getApprovalRequest(expiring.id); // Trigger expiration check

      const stats = service.getStats();

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(0); // The first one also expired since time advanced
      expect(stats.approved).toBe(1);
      expect(stats.denied).toBe(1);
      expect(stats.expired).toBe(2);
    });

    it('should return zeros when no requests exist', () => {
      const stats = service.getStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.denied).toBe(0);
      expect(stats.expired).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should stop cleanup timer', () => {
      service.shutdown();

      // Should not throw when advancing timers after shutdown
      expect(() => jest.advanceTimersByTime(120000)).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      service.shutdown();
      expect(() => service.shutdown()).not.toThrow();
    });
  });

  describe('custom timeout', () => {
    it('should use custom timeout value', () => {
      const customService = new ApprovalService(30); // 30 seconds

      const request = customService.createApprovalRequest('Duck', 'server', 'tool', {});

      // After 25 seconds, should still be pending
      jest.advanceTimersByTime(25000);
      expect(customService.getApprovalStatus(request.id)).toBe('pending');

      // After 31 seconds total, should be expired
      jest.advanceTimersByTime(6000);
      expect(customService.getApprovalStatus(request.id)).toBe('expired');

      customService.shutdown();
    });

    it('should use default timeout when not specified', () => {
      const defaultService = new ApprovalService();

      const request = defaultService.createApprovalRequest('Duck', 'server', 'tool', {});

      // Default is 300 seconds (5 minutes)
      jest.advanceTimersByTime(299000);
      expect(defaultService.getApprovalStatus(request.id)).toBe('pending');

      jest.advanceTimersByTime(2000);
      expect(defaultService.getApprovalStatus(request.id)).toBe('expired');

      defaultService.shutdown();
    });
  });
});
