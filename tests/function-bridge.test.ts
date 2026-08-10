import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ApprovalService } from '../src/services/approval';
import { FunctionBridge } from '../src/services/function-bridge';
import { MCPClientManager } from '../src/services/mcp-client-manager';

// Mock loggers to avoid console noise during tests
jest.mock('../src/utils/logger');
jest.mock('../src/utils/safe-logger');

/**
 * AC-R5S9MH.1 (H1) — approval-ID binding + single-use.
 *
 * When a duck supplies `_approval_id`, handleFunctionCall must reject the call
 * unless the referenced ApprovalRequest matches the current call's duckName,
 * mcpServer, toolName AND the cleaned args deep-equal the approved arguments.
 * An approval ID becomes single-use: after one successful tool execution it is
 * consumed and a replay with the same ID is rejected.
 */
describe('FunctionBridge approval-ID binding (AC-R5S9MH.1)', () => {
  let approvalService: ApprovalService;
  let mcpManager: MCPClientManager;
  let functionBridge: FunctionBridge;

  beforeEach(() => {
    approvalService = new ApprovalService(300); // 5 minutes
    mcpManager = new MCPClientManager([]);
    // 'always' approval mode: every call needs approval unless a valid _approval_id is supplied
    functionBridge = new FunctionBridge(mcpManager, approvalService, [], 'always');
  });

  afterEach(() => {
    approvalService.shutdown();
    jest.restoreAllMocks();
  });

  it('accepts a correctly-matching approval and executes the tool', async () => {
    const callToolSpy = jest
      .spyOn(mcpManager, 'callTool')
      .mockResolvedValue({ ok: true });

    // Approve for (duckA, serverA, read_file, { path: '/a.txt' })
    const request = approvalService.createApprovalRequest('duckA', 'serverA', 'read_file', {
      path: '/a.txt',
    });
    approvalService.approveRequest(request.id);

    const result = await functionBridge.handleFunctionCall('duckA', 'mcp__serverA__read_file', {
      path: '/a.txt',
      _mcp_server: 'serverA',
      _mcp_tool: 'read_file',
      _approval_id: request.id,
    });

    expect(result.success).toBe(true);
    expect(callToolSpy).toHaveBeenCalledTimes(1);
    expect(callToolSpy).toHaveBeenCalledWith('serverA', 'read_file', { path: '/a.txt' });
  });

  it('(a) rejects when an approval ID is replayed for a different server/tool', async () => {
    const callToolSpy = jest
      .spyOn(mcpManager, 'callTool')
      .mockResolvedValue({ ok: true });

    // Approve for (duckA, serverA, read_file, argsX)
    const request = approvalService.createApprovalRequest('duckA', 'serverA', 'read_file', {
      path: '/a.txt',
    });
    approvalService.approveRequest(request.id);

    // Replay the SAME id for a different server + destructive tool
    const result = await functionBridge.handleFunctionCall('duckA', 'mcp__serverB__delete_repo', {
      _mcp_server: 'serverB',
      _mcp_tool: 'delete_repo',
      _approval_id: request.id,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // The tool must NOT have executed
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  it('(b) rejects when the same approval ID is replayed with different args', async () => {
    const callToolSpy = jest
      .spyOn(mcpManager, 'callTool')
      .mockResolvedValue({ ok: true });

    // Approve for (duckA, serverA, read_file, { path: '/a.txt' })
    const request = approvalService.createApprovalRequest('duckA', 'serverA', 'read_file', {
      path: '/a.txt',
    });
    approvalService.approveRequest(request.id);

    // Same server/tool but DIFFERENT args
    const result = await functionBridge.handleFunctionCall('duckA', 'mcp__serverA__read_file', {
      path: '/etc/shadow',
      _mcp_server: 'serverA',
      _mcp_tool: 'read_file',
      _approval_id: request.id,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  it('(d) rejects a fabricated/unknown approval ID (no such request)', async () => {
    const callToolSpy = jest
      .spyOn(mcpManager, 'callTool')
      .mockResolvedValue({ ok: true });

    // A prompt-injected duck invents an approval ID that was never issued.
    const result = await functionBridge.handleFunctionCall('duckA', 'mcp__serverA__read_file', {
      path: '/a.txt',
      _mcp_server: 'serverA',
      _mcp_tool: 'read_file',
      _approval_id: 'totally-made-up-id',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  it('(c) rejects reuse: a consumed approval ID is rejected on a second call', async () => {
    const callToolSpy = jest
      .spyOn(mcpManager, 'callTool')
      .mockResolvedValue({ ok: true });

    const request = approvalService.createApprovalRequest('duckA', 'serverA', 'read_file', {
      path: '/a.txt',
    });
    approvalService.approveRequest(request.id);

    const args = {
      path: '/a.txt',
      _mcp_server: 'serverA',
      _mcp_tool: 'read_file',
      _approval_id: request.id,
    };

    // First call: succeeds and consumes the approval
    const first = await functionBridge.handleFunctionCall('duckA', 'mcp__serverA__read_file', {
      ...args,
    });
    expect(first.success).toBe(true);

    // Second call (replay/reuse): must be rejected, tool not executed again
    const second = await functionBridge.handleFunctionCall('duckA', 'mcp__serverA__read_file', {
      ...args,
    });
    expect(second.success).toBe(false);
    expect(second.error).toBeDefined();

    // callTool ran exactly once across both attempts
    expect(callToolSpy).toHaveBeenCalledTimes(1);
  });
});

/**
 * AC-R5S9MH.1 — ApprovalService.consumeApproval single-use semantics.
 */
describe('ApprovalService.consumeApproval (AC-R5S9MH.1)', () => {
  let service: ApprovalService;

  beforeEach(() => {
    service = new ApprovalService(300);
  });

  afterEach(() => {
    service.shutdown();
  });

  it('marks an approved request as consumed (terminal)', () => {
    const request = service.createApprovalRequest('duckA', 'serverA', 'read_file', {
      path: '/a.txt',
    });
    service.approveRequest(request.id);
    expect(service.getApprovalStatus(request.id)).toBe('approved');

    const consumed = service.consumeApproval(request.id);
    expect(consumed).toBe(true);
    expect(service.getApprovalStatus(request.id)).toBe('consumed');
  });

  it('refuses to consume an already-consumed request', () => {
    const request = service.createApprovalRequest('duckA', 'serverA', 'read_file', {
      path: '/a.txt',
    });
    service.approveRequest(request.id);

    expect(service.consumeApproval(request.id)).toBe(true);
    expect(service.consumeApproval(request.id)).toBe(false);
  });
});

/**
 * Tool-argument schema validation (FunctionBridge.validateToolArguments).
 *
 * Exercised through the public surface: getFunctionDefinitions() caches each
 * MCP tool's inputSchema, then handleFunctionCall() validates the cleaned args
 * against it before dispatching to the MCP server.
 *
 * This is the project's only Ajv surface, and Ajv resolves `$ref` URIs through
 * fast-uri — so these tests also pin the behaviour that the `fast-uri` override
 * in package.json governs. Approval mode is 'never' so every call reaches the
 * validation branch without an approval round-trip.
 */
describe('FunctionBridge tool-argument validation', () => {
  let approvalService: ApprovalService;
  let mcpManager: MCPClientManager;
  let functionBridge: FunctionBridge;

  const toolWithRefSchema = {
    serverName: 'files',
    name: 'read_file',
    description: 'Read a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { $ref: '#/$defs/nonEmptyString' },
        maxBytes: { type: 'integer', minimum: 1 },
      },
      required: ['path'],
      $defs: {
        nonEmptyString: { type: 'string', minLength: 1 },
      },
    },
  };

  beforeEach(async () => {
    approvalService = new ApprovalService(300);
    mcpManager = new MCPClientManager([]);
    functionBridge = new FunctionBridge(mcpManager, approvalService, [], 'never');

    jest.spyOn(mcpManager, 'listAllTools').mockResolvedValue([toolWithRefSchema]);
    // Populates the internal schema cache keyed by `${serverName}:${name}`
    await functionBridge.getFunctionDefinitions();
  });

  afterEach(() => {
    approvalService.shutdown();
    jest.restoreAllMocks();
  });

  it('compiles a $ref/$defs schema and accepts valid arguments', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });

    const result = await functionBridge.handleFunctionCall('duckA', 'mcp__files__read_file', {
      path: '/etc/hosts',
      maxBytes: 1024,
      _mcp_server: 'files',
      _mcp_tool: 'read_file',
    });

    expect(result.success).toBe(true);
    expect(callToolSpy).toHaveBeenCalledWith('files', 'read_file', {
      path: '/etc/hosts',
      maxBytes: 1024,
    });
  });

  it('rejects arguments that violate the schema and does not call the tool', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });

    // `path` resolves through $ref to { minLength: 1 } — an empty string fails
    const result = await functionBridge.handleFunctionCall('duckA', 'mcp__files__read_file', {
      path: '',
      _mcp_server: 'files',
      _mcp_tool: 'read_file',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid arguments for files:read_file');
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing required property', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });

    const result = await functionBridge.handleFunctionCall('duckA', 'mcp__files__read_file', {
      maxBytes: 10,
      _mcp_server: 'files',
      _mcp_tool: 'read_file',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid arguments for files:read_file');
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  it("strips unknown properties before dispatch (Ajv removeAdditional: 'all')", async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });

    const result = await functionBridge.handleFunctionCall('duckA', 'mcp__files__read_file', {
      path: '/etc/hosts',
      smuggled: 'should-not-reach-the-server',
      _mcp_server: 'files',
      _mcp_tool: 'read_file',
    });

    expect(result.success).toBe(true);
    expect(callToolSpy).toHaveBeenCalledWith('files', 'read_file', { path: '/etc/hosts' });
  });

  it('skips validation when no schema is cached for the tool', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });

    // `files:write_file` was never returned by listAllTools, so no schema exists
    const result = await functionBridge.handleFunctionCall('duckA', 'mcp__files__write_file', {
      anything: 123,
      _mcp_server: 'files',
      _mcp_tool: 'write_file',
    });

    expect(result.success).toBe(true);
    expect(callToolSpy).toHaveBeenCalledWith('files', 'write_file', { anything: 123 });
  });
});
