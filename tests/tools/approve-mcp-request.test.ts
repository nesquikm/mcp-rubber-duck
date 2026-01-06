import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { approveMCPRequestTool } from '../../src/tools/approve-mcp-request.js';
import { ApprovalService } from '../../src/services/approval.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/approval.js');

describe('approveMCPRequestTool', () => {
  let mockApprovalService: jest.Mocked<ApprovalService>;

  const mockRequest = {
    id: 'test-request-123',
    duckName: 'TestDuck',
    mcpServer: 'filesystem',
    toolName: 'read_file',
    arguments: { path: '/tmp/test.txt' },
    status: 'pending' as const,
    timestamp: Date.now(),
    expiresAt: Date.now() + 60000,
  };

  beforeEach(() => {
    mockApprovalService = {
      getApprovalRequest: jest.fn(),
      approveRequest: jest.fn(),
      denyRequest: jest.fn(),
      getPendingApprovals: jest.fn(),
    } as unknown as jest.Mocked<ApprovalService>;
  });

  describe('validation', () => {
    it('should return error when approval_id is missing', () => {
      const result = approveMCPRequestTool(mockApprovalService, {
        decision: 'approve',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters');
    });

    it('should return error when decision is missing', () => {
      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-123',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters');
    });

    it('should return error when decision is invalid', () => {
      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-123',
        decision: 'maybe',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be either "approve" or "deny"');
    });
  });

  describe('request lookup', () => {
    it('should return error when request not found', () => {
      mockApprovalService.getApprovalRequest.mockReturnValue(undefined);

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'nonexistent',
        decision: 'approve',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should return error when request is not pending', () => {
      mockApprovalService.getApprovalRequest.mockReturnValue({
        ...mockRequest,
        status: 'approved',
      });

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-123',
        decision: 'approve',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not pending');
      expect(result.content[0].text).toContain('approved');
    });
  });

  describe('approve decision', () => {
    beforeEach(() => {
      mockApprovalService.getApprovalRequest.mockReturnValue(mockRequest);
    });

    it('should approve request successfully', () => {
      mockApprovalService.approveRequest.mockReturnValue(true);

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-request-123',
        decision: 'approve',
      });

      expect(mockApprovalService.approveRequest).toHaveBeenCalledWith('test-request-123');
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Approved');
      expect(result.content[0].text).toContain('TestDuck');
      expect(result.content[0].text).toContain('filesystem:read_file');
    });

    it('should handle approval failure', () => {
      mockApprovalService.approveRequest.mockReturnValue(false);

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-request-123',
        decision: 'approve',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to approve');
    });

    it('should include request details in response', () => {
      mockApprovalService.approveRequest.mockReturnValue(true);

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-request-123',
        decision: 'approve',
      });

      expect(result.content[0].text).toContain('Request Details');
      expect(result.content[0].text).toContain('TestDuck');
      expect(result.content[0].text).toContain('filesystem');
      expect(result.content[0].text).toContain('read_file');
      expect(result.content[0].text).toContain('/tmp/test.txt');
    });

    it('should include next steps hint for approval', () => {
      mockApprovalService.approveRequest.mockReturnValue(true);

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-request-123',
        decision: 'approve',
      });

      expect(result.content[0].text).toContain('duck can now retry');
    });
  });

  describe('deny decision', () => {
    beforeEach(() => {
      mockApprovalService.getApprovalRequest.mockReturnValue(mockRequest);
    });

    it('should deny request successfully', () => {
      mockApprovalService.denyRequest.mockReturnValue(true);

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-request-123',
        decision: 'deny',
      });

      expect(mockApprovalService.denyRequest).toHaveBeenCalledWith('test-request-123', undefined);
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Denied');
    });

    it('should include reason when provided', () => {
      mockApprovalService.denyRequest.mockReturnValue(true);

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-request-123',
        decision: 'deny',
        reason: 'Security concern',
      });

      expect(mockApprovalService.denyRequest).toHaveBeenCalledWith(
        'test-request-123',
        'Security concern'
      );
      expect(result.content[0].text).toContain('Reason: Security concern');
    });

    it('should handle deny failure', () => {
      mockApprovalService.denyRequest.mockReturnValue(false);

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-request-123',
        decision: 'deny',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to deny');
    });

    it('should not include next steps hint for denial', () => {
      mockApprovalService.denyRequest.mockReturnValue(true);

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-request-123',
        decision: 'deny',
      });

      expect(result.content[0].text).not.toContain('retry');
    });
  });

  describe('error handling', () => {
    it('should handle exceptions gracefully', () => {
      mockApprovalService.getApprovalRequest.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-123',
        decision: 'approve',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error processing approval');
      expect(result.content[0].text).toContain('Database connection failed');
    });

    it('should handle non-Error exceptions', () => {
      mockApprovalService.getApprovalRequest.mockImplementation(() => {
        throw 'String error';
      });

      const result = approveMCPRequestTool(mockApprovalService, {
        approval_id: 'test-123',
        decision: 'approve',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('String error');
    });
  });
});
