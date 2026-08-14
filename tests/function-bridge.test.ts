import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ApprovalService } from '../src/services/approval';
import { FunctionBridge } from '../src/services/function-bridge';
import { MCPClientManager } from '../src/services/mcp-client-manager';
// Real logger singleton: `jest.mock(path)` below is a no-op under this repo's
// ts-jest ESM config, so warning assertions must spy on the real object.
import { logger } from '../src/utils/logger.js';

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

/**
 * FR 8WGQ4P — trusted-tool resolution (issue #129).
 *
 * A global `'*'` is matched literally and therefore trusts nothing; that
 * fail-closed behaviour is deliberate and stays. What is missing is a loud
 * warning (AC.1/AC.2). AC.3/AC.4 pin the surrounding resolution rules — the
 * per-server list *replaces* the global one, and `always` mode ignores trust
 * entirely — so a future refactor cannot quietly loosen them.
 *
 * Every case asserts both the returned result shape and the `callTool` spy, so
 * no test can pass vacuously. Bridges are built inside each test (not in
 * `beforeEach`) because the warning fires at construction time and the
 * `logger.warn` spy has to be installed first.
 */
describe('trusted-tool resolution', () => {
  let approvalService: ApprovalService;
  let mcpManager: MCPClientManager;
  let warnSpy: ReturnType<typeof jest.spyOn>;

  // The wildcard warning must name both routes the global list can arrive by.
  const ENV_KEY = 'MCP_TRUSTED_TOOLS';
  const CONFIG_KEY = 'mcp_bridge.trusted_tools';

  /** Flattened text of every logger.warn call, for substring assertions. */
  const warnings = (): string[] =>
    warnSpy.mock.calls.map((call) => (call as unknown[]).map((arg) => String(arg)).join(' '));

  const wildcardWarnings = (): string[] =>
    warnings().filter((text) => text.includes(ENV_KEY) || text.includes(CONFIG_KEY));

  beforeEach(() => {
    approvalService = new ApprovalService(300);
    mcpManager = new MCPClientManager([]);
    // Installed before any bridge is constructed, so constructor-time warnings are captured.
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  });

  afterEach(() => {
    approvalService.shutdown();
    jest.restoreAllMocks();
  });

  // ---- AC-8WGQ4P.1: fail closed on a global wildcard, and say so -----------

  it('AC.1 refuses a call when the global list is ["*"] in trusted mode', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });
    const bridge = new FunctionBridge(mcpManager, approvalService, ['*'], 'trusted');

    const result = await bridge.handleFunctionCall('duckA', 'mcp__files__read_file', {
      path: '/a.txt',
      _mcp_server: 'files',
      _mcp_tool: 'read_file',
    });

    expect(result.success).toBe(false);
    expect(result.needsApproval).toBe(true);
    expect(result.approvalId).toBeDefined();
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  it('AC.1 warns exactly once at construction, naming MCP_TRUSTED_TOOLS and mcp_bridge.trusted_tools', () => {
    new FunctionBridge(mcpManager, approvalService, ['*'], 'trusted');

    const matched = wildcardWarnings();
    expect(matched).toHaveLength(1);
    expect(matched[0]).toContain(ENV_KEY);
    expect(matched[0]).toContain(CONFIG_KEY);
    // No other warning noise from construction.
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('AC.1 emits no wildcard warning for a non-wildcard global list', () => {
    new FunctionBridge(mcpManager, approvalService, ['read_file', 'files:write_file'], 'trusted');

    expect(wildcardWarnings()).toHaveLength(0);
  });

  // ---- AC-8WGQ4P.2: the warning is mode-aware and not constructor-only -----

  it('AC.2 suppresses the wildcard warning in never mode', () => {
    new FunctionBridge(mcpManager, approvalService, ['*'], 'never');

    expect(wildcardWarnings()).toHaveLength(0);
  });

  it('AC.2 warns when updateTrustedTools swaps in a global wildcard at runtime', () => {
    const bridge = new FunctionBridge(mcpManager, approvalService, ['read_file'], 'trusted');
    expect(wildcardWarnings()).toHaveLength(0);

    bridge.updateTrustedTools(['*']);

    const matched = wildcardWarnings();
    expect(matched).toHaveLength(1);
    expect(matched[0]).toContain(ENV_KEY);
    expect(matched[0]).toContain(CONFIG_KEY);
  });

  // In 'always' mode the per-server remedy is inert on its own (AC.4 pins that
  // trusted lists are ignored there), so the warning must lead with the mode switch.
  it('AC.2 tells an always-mode user to switch mode before recommending a per-server list', () => {
    new FunctionBridge(mcpManager, approvalService, ['*'], 'always');

    const matched = wildcardWarnings();
    expect(matched).toHaveLength(1);
    expect(matched[0]).toContain('MCP_APPROVAL_MODE=trusted');
    expect(matched[0]).toContain('ignores trusted tools entirely');
  });

  // ---- AC-8WGQ4P.3: per-server resolution shadows the global list ----------

  it('AC.3 per-server ["*"] auto-approves any tool on that server', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });
    const bridge = new FunctionBridge(mcpManager, approvalService, [], 'trusted', {
      files: ['*'],
    });

    const result = await bridge.handleFunctionCall('duckA', 'mcp__files__delete_file', {
      path: '/a.txt',
      _mcp_server: 'files',
      _mcp_tool: 'delete_file',
    });

    expect(result.success).toBe(true);
    expect(result.needsApproval).toBeUndefined();
    expect(callToolSpy).toHaveBeenCalledTimes(1);
    expect(callToolSpy).toHaveBeenCalledWith('files', 'delete_file', { path: '/a.txt' });
  });

  it('AC.3 per-server list naming the tool exactly auto-approves it', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });
    const bridge = new FunctionBridge(mcpManager, approvalService, [], 'trusted', {
      files: ['read_file'],
    });

    const result = await bridge.handleFunctionCall('duckA', 'mcp__files__read_file', {
      path: '/a.txt',
      _mcp_server: 'files',
      _mcp_tool: 'read_file',
    });

    expect(result.success).toBe(true);
    expect(callToolSpy).toHaveBeenCalledWith('files', 'read_file', { path: '/a.txt' });
  });

  it('AC.3 per-server list that omits the tool requires approval', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });
    const bridge = new FunctionBridge(mcpManager, approvalService, [], 'trusted', {
      files: ['read_file'],
    });

    const result = await bridge.handleFunctionCall('duckA', 'mcp__files__write_file', {
      path: '/a.txt',
      _mcp_server: 'files',
      _mcp_tool: 'write_file',
    });

    expect(result.success).toBe(false);
    expect(result.needsApproval).toBe(true);
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  it('AC.3 a per-server list replaces the global list rather than extending it', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });
    // `write_file` is globally trusted, but `files` has its own (narrower) list.
    const bridge = new FunctionBridge(mcpManager, approvalService, ['write_file'], 'trusted', {
      files: ['read_file'],
    });

    const result = await bridge.handleFunctionCall('duckA', 'mcp__files__write_file', {
      path: '/a.txt',
      _mcp_server: 'files',
      _mcp_tool: 'write_file',
    });

    expect(result.success).toBe(false);
    expect(result.needsApproval).toBe(true);
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  // ---- AC-8WGQ4P.4: global key forms, and `always` ignores trust -----------

  it('AC.4 global list auto-approves a bare tool name', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });
    const bridge = new FunctionBridge(mcpManager, approvalService, ['read_file'], 'trusted');

    const result = await bridge.handleFunctionCall('duckA', 'mcp__files__read_file', {
      path: '/a.txt',
      _mcp_server: 'files',
      _mcp_tool: 'read_file',
    });

    expect(result.success).toBe(true);
    expect(result.needsApproval).toBeUndefined();
    expect(callToolSpy).toHaveBeenCalledWith('files', 'read_file', { path: '/a.txt' });
  });

  it('AC.4 global list auto-approves a server:tool composite key', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });
    const bridge = new FunctionBridge(mcpManager, approvalService, ['files:read_file'], 'trusted');

    const result = await bridge.handleFunctionCall('duckA', 'mcp__files__read_file', {
      path: '/a.txt',
      _mcp_server: 'files',
      _mcp_tool: 'read_file',
    });

    expect(result.success).toBe(true);
    expect(callToolSpy).toHaveBeenCalledWith('files', 'read_file', { path: '/a.txt' });
  });

  it('AC.4 always mode ignores trusted lists even with a per-server wildcard', async () => {
    const callToolSpy = jest.spyOn(mcpManager, 'callTool').mockResolvedValue({ ok: true });
    const bridge = new FunctionBridge(mcpManager, approvalService, ['*'], 'always', {
      files: ['*'],
    });

    const result = await bridge.handleFunctionCall('duckA', 'mcp__files__read_file', {
      path: '/a.txt',
      _mcp_server: 'files',
      _mcp_tool: 'read_file',
    });

    expect(result.success).toBe(false);
    expect(result.needsApproval).toBe(true);
    expect(result.approvalId).toBeDefined();
    expect(callToolSpy).not.toHaveBeenCalled();
  });
});
