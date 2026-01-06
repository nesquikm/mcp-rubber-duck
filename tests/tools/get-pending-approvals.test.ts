import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getPendingApprovalsTool } from '../../src/tools/get-pending-approvals.js';
import { ApprovalService } from '../../src/services/approval.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/approval.js');

describe('getPendingApprovalsTool', () => {
  let mockApprovalService: jest.Mocked<ApprovalService>;

  const now = Date.now();
  const mockApprovals = [
    {
      id: 'approval-1',
      duckName: 'OpenAI Duck',
      mcpServer: 'filesystem',
      toolName: 'read_file',
      arguments: { path: '/tmp/test.txt' },
      status: 'pending' as const,
      timestamp: now - 30000, // 30 seconds ago
      expiresAt: now + 30000, // expires in 30 seconds
    },
    {
      id: 'approval-2',
      duckName: 'Groq Duck',
      mcpServer: 'database',
      toolName: 'query',
      arguments: { sql: 'SELECT * FROM users' },
      status: 'pending' as const,
      timestamp: now - 10000, // 10 seconds ago
      expiresAt: now + 50000, // expires in 50 seconds
    },
  ];

  beforeEach(() => {
    mockApprovalService = {
      getPendingApprovals: jest.fn(),
    } as unknown as jest.Mocked<ApprovalService>;
  });

  describe('no pending approvals', () => {
    it('should return success message when no approvals exist', () => {
      mockApprovalService.getPendingApprovals.mockReturnValue([]);

      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.content[0].text).toContain('No pending MCP tool approvals');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('with pending approvals', () => {
    beforeEach(() => {
      mockApprovalService.getPendingApprovals.mockReturnValue(mockApprovals);
    });

    it('should list all pending approvals', () => {
      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.content[0].text).toContain('2 pending MCP approvals');
      expect(result.content[0].text).toContain('OpenAI Duck');
      expect(result.content[0].text).toContain('Groq Duck');
      expect(result.content[0].text).toContain('filesystem:read_file');
      expect(result.content[0].text).toContain('database:query');
    });

    it('should display approval IDs', () => {
      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.content[0].text).toContain('approval-1');
      expect(result.content[0].text).toContain('approval-2');
    });

    it('should display arguments for small payloads', () => {
      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.content[0].text).toContain('/tmp/test.txt');
      expect(result.content[0].text).toContain('SELECT * FROM users');
    });

    it('should show parameter count for large arguments', () => {
      mockApprovalService.getPendingApprovals.mockReturnValue([
        {
          ...mockApprovals[0],
          arguments: {
            param1: 'a'.repeat(50),
            param2: 'b'.repeat(50),
            param3: 'c'.repeat(50),
          },
        },
      ]);

      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.content[0].text).toContain('3 parameters');
    });

    it('should include usage hint', () => {
      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.content[0].text).toContain('approve_mcp_request');
    });

    it('should handle singular approval text', () => {
      mockApprovalService.getPendingApprovals.mockReturnValue([mockApprovals[0]]);

      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.content[0].text).toContain('1 pending MCP approval:');
      expect(result.content[0].text).not.toContain('approvals:');
    });
  });

  describe('filtering by duck', () => {
    beforeEach(() => {
      mockApprovalService.getPendingApprovals.mockReturnValue(mockApprovals);
    });

    it('should filter approvals by duck name', () => {
      const result = getPendingApprovalsTool(mockApprovalService, {
        duck: 'OpenAI Duck',
      });

      expect(result.content[0].text).toContain('OpenAI Duck');
      expect(result.content[0].text).not.toContain('Groq Duck');
      expect(result.content[0].text).toContain('1 pending MCP approval');
    });

    it('should return no approvals when duck filter has no matches', () => {
      const result = getPendingApprovalsTool(mockApprovalService, {
        duck: 'NonexistentDuck',
      });

      expect(result.content[0].text).toContain('No pending MCP tool approvals');
    });
  });

  describe('time formatting', () => {
    it('should show time since request', () => {
      mockApprovalService.getPendingApprovals.mockReturnValue([mockApprovals[0]]);

      const result = getPendingApprovalsTool(mockApprovalService, {});

      // Approval was 30 seconds ago
      expect(result.content[0].text).toMatch(/Requested: \d+s ago/);
    });

    it('should show expiration time', () => {
      mockApprovalService.getPendingApprovals.mockReturnValue([mockApprovals[0]]);

      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.content[0].text).toMatch(/Expires: \d+s/);
    });

    it('should show expired status for expired approvals', () => {
      mockApprovalService.getPendingApprovals.mockReturnValue([
        {
          ...mockApprovals[0],
          expiresAt: now - 1000, // Already expired
        },
      ]);

      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.content[0].text).toContain('Expires: expired');
    });
  });

  describe('error handling', () => {
    it('should handle exceptions gracefully', () => {
      mockApprovalService.getPendingApprovals.mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get pending approvals');
      expect(result.content[0].text).toContain('Service unavailable');
    });

    it('should handle non-Error exceptions', () => {
      mockApprovalService.getPendingApprovals.mockImplementation(() => {
        throw 'Unknown error';
      });

      const result = getPendingApprovalsTool(mockApprovalService, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown error');
    });
  });
});
