import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { mcpStatusTool } from '../../src/tools/mcp-status.js';
import { MCPClientManager } from '../../src/services/mcp-client-manager.js';
import { ApprovalService } from '../../src/services/approval.js';
import { FunctionBridge } from '../../src/services/function-bridge.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/mcp-client-manager.js');
jest.mock('../../src/services/approval.js');
jest.mock('../../src/services/function-bridge.js');

describe('mcpStatusTool', () => {
  let mockMcpManager: jest.Mocked<MCPClientManager>;
  let mockApprovalService: jest.Mocked<ApprovalService>;
  let mockFunctionBridge: jest.Mocked<FunctionBridge>;

  const mockServerStatus = {
    filesystem: {
      type: 'stdio',
      status: 'connected',
    },
    database: {
      type: 'sse',
      status: 'connecting',
    },
  };

  const mockTools = [
    { name: 'read_file', serverName: 'filesystem' },
    { name: 'write_file', serverName: 'filesystem' },
    { name: 'query', serverName: 'database' },
  ];

  const mockApprovalStats = {
    total: 10,
    pending: 2,
    approved: 5,
    denied: 2,
    expired: 1,
  };

  const mockBridgeStats = {
    trustedToolCount: 5,
    totalCalls: 100,
    successfulCalls: 95,
  };

  beforeEach(() => {
    mockMcpManager = {
      getStatus: jest.fn().mockReturnValue(mockServerStatus),
      getConnectedServers: jest.fn().mockReturnValue(['filesystem', 'database']),
      listAllTools: jest.fn().mockResolvedValue(mockTools),
    } as unknown as jest.Mocked<MCPClientManager>;

    mockApprovalService = {
      getStats: jest.fn().mockReturnValue(mockApprovalStats),
      getPendingApprovals: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<ApprovalService>;

    mockFunctionBridge = {
      getStats: jest.fn().mockReturnValue(mockBridgeStats),
    } as unknown as jest.Mocked<FunctionBridge>;
  });

  describe('overview section', () => {
    it('should display MCP Bridge status header', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('MCP Bridge Status');
    });

    it('should display connected servers count', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('Connected Servers: 2');
    });

    it('should display available tools count', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('Available Tools: 3');
    });

    it('should display trusted tools count', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('Trusted Tools: 5');
    });
  });

  describe('server details section', () => {
    it('should display server status with icons', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('🟢'); // connected
      expect(result.content[0].text).toContain('🟡'); // connecting
      expect(result.content[0].text).toContain('filesystem');
      expect(result.content[0].text).toContain('database');
    });

    it('should display server type and status', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('stdio');
      expect(result.content[0].text).toContain('Status: connected');
      expect(result.content[0].text).toContain('Status: connecting');
    });

    it('should display tool count per server', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('Tools: 2'); // filesystem
      expect(result.content[0].text).toContain('Tools: 1'); // database
    });

    it('should display tool names for small tool lists', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('read_file');
      expect(result.content[0].text).toContain('write_file');
    });

    it('should truncate long tool lists with count', async () => {
      mockMcpManager.listAllTools.mockResolvedValue([
        { name: 'tool1', serverName: 'server1' },
        { name: 'tool2', serverName: 'server1' },
        { name: 'tool3', serverName: 'server1' },
        { name: 'tool4', serverName: 'server1' },
        { name: 'tool5', serverName: 'server1' },
      ]);
      mockMcpManager.getStatus.mockReturnValue({
        server1: { type: 'stdio', status: 'connected' },
      });

      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('+2 more');
    });

    it('should handle disconnected server', async () => {
      mockMcpManager.getStatus.mockReturnValue({
        broken: { type: 'stdio', status: 'disconnected' },
      });

      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('🔴');
    });

    it('should show message when no servers configured', async () => {
      mockMcpManager.getStatus.mockReturnValue({});
      mockMcpManager.listAllTools.mockResolvedValue([]);
      mockMcpManager.getConnectedServers.mockReturnValue([]);

      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('No MCP servers configured');
    });
  });

  describe('approval statistics section', () => {
    it('should display all approval statistics', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('Total Requests: 10');
      expect(result.content[0].text).toContain('Pending: 2');
      expect(result.content[0].text).toContain('Approved: 5');
      expect(result.content[0].text).toContain('Denied: 2');
      expect(result.content[0].text).toContain('Expired: 1');
    });
  });

  describe('pending approvals section', () => {
    it('should display pending approvals when they exist', async () => {
      const now = Date.now();
      mockApprovalService.getPendingApprovals.mockReturnValue([
        {
          id: 'approval-1',
          duckName: 'TestDuck',
          mcpServer: 'filesystem',
          toolName: 'read_file',
          arguments: {},
          status: 'pending' as const,
          timestamp: now - 30000,
          expiresAt: now + 30000,
        },
      ]);

      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('Pending Approvals');
      expect(result.content[0].text).toContain('TestDuck');
      expect(result.content[0].text).toContain('filesystem:read_file');
      expect(result.content[0].text).toMatch(/\d+s ago/);
    });

    it('should not display pending section when no pending approvals', async () => {
      mockApprovalService.getStats.mockReturnValue({
        ...mockApprovalStats,
        pending: 0,
      });

      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).not.toContain('Pending Approvals:');
    });
  });

  describe('commands section', () => {
    it('should display available commands', async () => {
      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.content[0].text).toContain('Commands');
      expect(result.content[0].text).toContain('get_pending_approvals');
      expect(result.content[0].text).toContain('approve_mcp_request');
      expect(result.content[0].text).toContain('ask_duck');
    });
  });

  describe('error handling', () => {
    it('should handle exceptions gracefully', async () => {
      mockMcpManager.getStatus.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get MCP status');
      expect(result.content[0].text).toContain('Connection failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockMcpManager.getStatus.mockImplementation(() => {
        throw 'Unknown failure';
      });

      const result = await mcpStatusTool(
        mockMcpManager,
        mockApprovalService,
        mockFunctionBridge,
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown failure');
    });
  });
});
