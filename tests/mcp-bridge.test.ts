import { ApprovalService } from '../src/services/approval';
import { FunctionBridge } from '../src/services/function-bridge';
import { MCPClientManager } from '../src/services/mcp-client-manager';

describe('MCP Bridge', () => {
  let approvalService: ApprovalService;
  let mcpManager: MCPClientManager;
  let functionBridge: FunctionBridge;

  beforeEach(() => {
    approvalService = new ApprovalService(300); // 5 minutes
    mcpManager = new MCPClientManager([]); // Empty config for testing
    functionBridge = new FunctionBridge(mcpManager, approvalService, []);
  });

  afterEach(() => {
    approvalService.shutdown();
  });

  describe('ApprovalService', () => {
    it('should create approval requests', () => {
      const request = approvalService.createApprovalRequest(
        'TestDuck',
        'filesystem',
        'read_file',
        { path: '/test.txt' }
      );

      expect(request).toBeDefined();
      expect(request.duckName).toBe('TestDuck');
      expect(request.mcpServer).toBe('filesystem');
      expect(request.toolName).toBe('read_file');
      expect(request.status).toBe('pending');
    });

    it('should approve pending requests', () => {
      const request = approvalService.createApprovalRequest(
        'TestDuck',
        'filesystem',
        'read_file',
        { path: '/test.txt' }
      );

      const approved = approvalService.approveRequest(request.id);
      expect(approved).toBe(true);

      const status = approvalService.getApprovalStatus(request.id);
      expect(status).toBe('approved');
    });

    it('should deny requests', () => {
      const request = approvalService.createApprovalRequest(
        'TestDuck',
        'filesystem',
        'read_file',
        { path: '/test.txt' }
      );

      const denied = approvalService.denyRequest(request.id, 'Security concern');
      expect(denied).toBe(true);

      const status = approvalService.getApprovalStatus(request.id);
      expect(status).toBe('denied');
    });

    it('should handle non-existent requests', () => {
      const status = approvalService.getApprovalStatus('non-existent');
      expect(status).toBeUndefined();

      const approved = approvalService.approveRequest('non-existent');
      expect(approved).toBe(false);
    });

    it('should get pending approvals', () => {
      approvalService.createApprovalRequest('Duck1', 'server1', 'tool1', {});
      approvalService.createApprovalRequest('Duck2', 'server2', 'tool2', {});

      const pending = approvalService.getPendingApprovals();
      expect(pending).toHaveLength(2);
      expect(pending.every(req => req.status === 'pending')).toBe(true);
    });
  });

  describe('FunctionBridge', () => {
    it('should generate function definitions for empty MCP tools', async () => {
      const functions = await functionBridge.getFunctionDefinitions();
      expect(Array.isArray(functions)).toBe(true);
      // Should be empty since we have no MCP servers configured
      expect(functions).toHaveLength(0);
    });

    it('should handle function calls requiring approval', async () => {
      const result = await functionBridge.handleFunctionCall(
        'TestDuck',
        'mcp__filesystem__read_file',
        { path: '/test.txt', _mcp_server: 'filesystem', _mcp_tool: 'read_file' }
      );

      expect(result.success).toBe(false);
      expect(result.needsApproval).toBe(true);
      expect(result.approvalId).toBeDefined();
    });

    it('should handle invalid function names', async () => {
      const result = await functionBridge.handleFunctionCall(
        'TestDuck',
        'invalid_function',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid function name');
    });

    it('should validate tool arguments', async () => {
      // Mock a tool with schema in the functionBridge
      const mockTool = {
        serverName: 'test_server',
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            required_param: { type: 'string' }
          },
          required: ['required_param']
        }
      };

      // Add the tool schema manually for testing
      (functionBridge as any).toolSchemas.set('test_server:test_tool', mockTool.inputSchema);

      const result = await functionBridge.handleFunctionCall(
        'TestDuck',
        'mcp__test_server__test_tool',
        { 
          _mcp_server: 'test_server', 
          _mcp_tool: 'test_tool',
          // Missing required_param
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('should handle underscored tool names correctly', async () => {
      // Test that tool names with underscores are extracted correctly
      const serverName = (functionBridge as any).extractServerFromFunctionName('mcp__file_system__read_file');
      const toolName = (functionBridge as any).extractToolFromFunctionName('mcp__file_system__read_file');
      
      expect(serverName).toBe('file_system');
      expect(toolName).toBe('read_file');
    });

    it('should handle complex server and tool names', async () => {
      // Test more complex names
      const serverName = (functionBridge as any).extractServerFromFunctionName('mcp__complex_server_name__complex_tool_name');
      const toolName = (functionBridge as any).extractToolFromFunctionName('mcp__complex_server_name__complex_tool_name');
      
      expect(serverName).toBe('complex_server_name');
      expect(toolName).toBe('complex_tool_name');
    });
  });

  describe('MCPClientManager', () => {
    it('should initialize with empty config', async () => {
      expect(mcpManager.getConnectedServers()).toEqual([]);
      expect(mcpManager.getConnectionStatus('nonexistent')).toBe('unknown');
    });

    it('should handle health check with no servers', async () => {
      const health = await mcpManager.healthCheck();
      expect(health).toEqual({});
    });

    it('should get status of all servers', () => {
      const status = mcpManager.getStatus();
      expect(typeof status).toBe('object');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete approval workflow', async () => {
      // Create approval request
      const request = approvalService.createApprovalRequest(
        'TestDuck',
        'filesystem',
        'read_file',
        { path: '/test.txt' }
      );

      expect(request.status).toBe('pending');

      // Try function call without approval
      const result1 = await functionBridge.handleFunctionCall(
        'TestDuck',
        'mcp__filesystem__read_file',
        { 
          path: '/test.txt',
          _mcp_server: 'filesystem', 
          _mcp_tool: 'read_file'
        }
      );

      expect(result1.success).toBe(false);
      expect(result1.needsApproval).toBe(true);

      // Approve the request
      const approved = approvalService.approveRequest(request.id);
      expect(approved).toBe(true);

      // Try function call with approval (would still fail due to no MCP server, but approval logic works)
      const result2 = await functionBridge.handleFunctionCall(
        'TestDuck',
        'mcp__filesystem__read_file',
        { 
          path: '/test.txt',
          _mcp_server: 'filesystem', 
          _mcp_tool: 'read_file',
          _approval_id: request.id
        }
      );

      // Should pass approval but fail on MCP execution
      expect(result2.error).toContain('MCP server filesystem not connected');
    });

    it('should handle expired approvals', (done) => {
      // Create approval service with very short timeout
      const shortApprovalService = new ApprovalService(1); // 1 second
      
      const request = shortApprovalService.createApprovalRequest(
        'TestDuck',
        'filesystem',
        'read_file',
        { path: '/test.txt' }
      );

      // Wait for expiration
      setTimeout(() => {
        const status = shortApprovalService.getApprovalStatus(request.id);
        expect(status).toBe('expired');
        
        // Try to approve expired request
        const approved = shortApprovalService.approveRequest(request.id);
        expect(approved).toBe(false);
        
        shortApprovalService.shutdown();
        done();
      }, 1100);
    });

    it('should handle function definition generation', async () => {
      // Mock MCP tools
      const mockTools = [
        {
          serverName: 'filesystem',
          name: 'read_file',
          description: 'Read a file',
          inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        },
        {
          serverName: 'web',
          name: 'fetch_url',
          description: 'Fetch URL content',
          inputSchema: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url']
          }
        }
      ];

      // Mock the listAllTools method
      jest.spyOn(mcpManager, 'listAllTools').mockResolvedValue(mockTools);

      const functions = await functionBridge.getFunctionDefinitions();
      
      expect(functions).toHaveLength(2);
      expect(functions[0].name).toBe('mcp__filesystem__read_file');
      expect(functions[1].name).toBe('mcp__web__fetch_url');
      expect(functions[0].description).toBe('[filesystem] Read a file');
    });
  });
});