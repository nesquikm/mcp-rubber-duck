import { jest } from '@jest/globals';
import { EnhancedDuckProvider } from '../src/providers/duck-provider-enhanced';
import { FunctionBridge } from '../src/services/function-bridge';
import { MCPClientManager } from '../src/services/mcp-client-manager';
import { ApprovalService } from '../src/services/approval';
import { ConfigManager } from '../src/config/config';
import { MCPBridgeConfigSchema } from '../src/config/types';

// Helper to build a mock OpenAI chat response
function mockChatResponse(opts: {
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  finish_reason?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion' as const,
    created: Date.now(),
    model: 'test-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant' as const,
          content: opts.content ?? null,
          ...(opts.tool_calls ? { tool_calls: opts.tool_calls } : {}),
        },
        finish_reason: opts.finish_reason ?? (opts.tool_calls ? 'tool_calls' : 'stop'),
        logprobs: null,
      },
    ],
    usage: opts.usage ?? { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function toolCall(id: string, name: string, args: Record<string, unknown> = {}) {
  return {
    id,
    type: 'function' as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe('Multi-Round Tool Calling', () => {
  let mcpManager: MCPClientManager;
  let approvalService: ApprovalService;
  let functionBridge: FunctionBridge;

  beforeEach(() => {
    approvalService = new ApprovalService(300);
    mcpManager = new MCPClientManager([]);
    functionBridge = new FunctionBridge(mcpManager, approvalService, [], 'never');

    // Mock getFunctionDefinitions to return some tools
    jest.spyOn(functionBridge, 'getFunctionDefinitions').mockResolvedValue([
      { name: 'mcp__fs__search', description: '[fs] Search files', parameters: { type: 'object', properties: {} } },
      { name: 'mcp__fs__read', description: '[fs] Read file', parameters: { type: 'object', properties: {} } },
    ]);
  });

  afterEach(() => {
    approvalService.shutdown();
    jest.restoreAllMocks();
  });

  function createProvider(maxToolRounds = 10) {
    return new EnhancedDuckProvider(
      'test',
      'Test Duck',
      { apiKey: 'test-key', baseURL: 'http://localhost', model: 'test-model' },
      functionBridge,
      true,
      undefined,
      maxToolRounds
    );
  }

  it('chains tool calls across multiple rounds', async () => {
    const provider = createProvider();
    const toolsCalled: string[] = [];

    // Round 1: LLM calls search
    // Round 2: LLM calls read (after seeing search results)
    // Round 3: LLM returns text
    jest
      .spyOn(provider as any, 'createChatCompletion')
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc1', 'mcp__fs__search', { query: 'config' })],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        })
      )
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc2', 'mcp__fs__read', { path: '/config.json' })],
          usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 },
        })
      )
      .mockResolvedValueOnce(
        mockChatResponse({
          content: 'The config file contains database settings.',
          usage: { prompt_tokens: 300, completion_tokens: 40, total_tokens: 340 },
        })
      );

    jest.spyOn(functionBridge, 'handleFunctionCall').mockImplementation(async (_duck, name) => {
      toolsCalled.push(name);
      if (name === 'mcp__fs__search') return { success: true, data: 'Found: /config.json' };
      if (name === 'mcp__fs__read') return { success: true, data: '{"db": "postgres"}' };
      return { success: false, error: 'Unknown tool' };
    });

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'Find and read the config', timestamp: new Date() }],
    });

    expect(result.content).toBe('The config file contains database settings.');
    expect(result.toolRoundsUsed).toBe(2);
    expect(toolsCalled).toEqual(['mcp__fs__search', 'mcp__fs__read']);
    expect(result.mcpResults).toBeDefined();
    expect(result.mcpResults!.length).toBe(2);
  });

  it('stops when the LLM produces a text response after one round', async () => {
    const provider = createProvider();

    jest
      .spyOn(provider as any, 'createChatCompletion')
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc1', 'mcp__fs__search', { query: 'test' })],
        })
      )
      .mockResolvedValueOnce(
        mockChatResponse({ content: 'Found the file you need.' })
      );

    jest.spyOn(functionBridge, 'handleFunctionCall').mockResolvedValue({
      success: true,
      data: 'results here',
    });

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'Search for test', timestamp: new Date() }],
    });

    expect(result.content).toBe('Found the file you need.');
    expect(result.toolRoundsUsed).toBe(1);
  });

  it('respects the maximum round limit', async () => {
    const provider = createProvider(2);

    const createCompletionSpy = jest
      .spyOn(provider as any, 'createChatCompletion')
      // Initial call -> tool call
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc1', 'mcp__fs__search', { query: '1' })],
        })
      )
      // Round 1 follow-up -> another tool call
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc2', 'mcp__fs__search', { query: '2' })],
        })
      )
      // Round 2 follow-up -> yet another tool call (would be round 3 if allowed)
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc3', 'mcp__fs__search', { query: '3' })],
        })
      )
      // Forced text response after max rounds
      .mockResolvedValueOnce(
        mockChatResponse({ content: 'Forced summary after max rounds.' })
      );

    const handleFnSpy = jest.spyOn(functionBridge, 'handleFunctionCall').mockResolvedValue({
      success: true,
      data: 'result',
    });

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'Keep searching', timestamp: new Date() }],
    });

    expect(result.toolRoundsUsed).toBe(2);
    expect(result.content).toBe('Forced summary after max rounds.');
    // 4 API calls: initial + round1 followup + round2 followup + forced final
    expect(createCompletionSpy).toHaveBeenCalledTimes(4);
    // Only 2 tool executions: tc1 and tc2. tc3 was never processed (loop exited).
    expect(handleFnSpy).toHaveBeenCalledTimes(2);
  });

  it('accumulates token usage across all rounds', async () => {
    const provider = createProvider();

    jest
      .spyOn(provider as any, 'createChatCompletion')
      // Initial: 100 + 20 = 120
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc1', 'mcp__fs__search', {})],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        })
      )
      // Round 1 follow-up: 200 + 30 = 230
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc2', 'mcp__fs__read', {})],
          usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 },
        })
      )
      // Round 2 follow-up (text): 300 + 40 = 340
      .mockResolvedValueOnce(
        mockChatResponse({
          content: 'Done.',
          usage: { prompt_tokens: 300, completion_tokens: 40, total_tokens: 340 },
        })
      );

    jest.spyOn(functionBridge, 'handleFunctionCall').mockResolvedValue({
      success: true,
      data: 'ok',
    });

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
    });

    // All 3 calls accumulated: initial(120) + round1(230) + round2(340)
    expect(result.usage).toEqual({
      promptTokens: 600,
      completionTokens: 90,
      totalTokens: 690,
    });
    expect(result.toolRoundsUsed).toBe(2);
  });

  it('halts the loop immediately when approval is needed', async () => {
    const provider = createProvider();

    const createCompletionSpy = jest
      .spyOn(provider as any, 'createChatCompletion')
      // Initial call -> tool call
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc1', 'mcp__fs__search', {})],
        })
      )
      // Round 1 follow-up -> another tool call
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc2', 'mcp__dangerous__delete', {})],
        })
      );

    let callCount = 0;
    jest.spyOn(functionBridge, 'handleFunctionCall').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { success: true, data: 'search results' };
      }
      // Second tool call needs approval
      return {
        success: false,
        needsApproval: true,
        approvalId: 'approval-123',
        message: 'Approval needed for delete',
      };
    });

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'search and delete', timestamp: new Date() }],
    });

    expect(result.pendingApprovals).toBeDefined();
    expect(result.pendingApprovals!.length).toBe(1);
    expect(result.pendingApprovals![0].id).toBe('approval-123');
    expect(result.finishReason).toBe('tool_calls');
    expect(result.toolRoundsUsed).toBe(2);
    // No further API calls after approval halt
    expect(createCompletionSpy).toHaveBeenCalledTimes(2);
  });

  it('continues the loop even when a tool call fails', async () => {
    const provider = createProvider();

    jest
      .spyOn(provider as any, 'createChatCompletion')
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc1', 'mcp__fs__search', {})],
        })
      )
      // After failed tool, LLM tries a different tool
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc2', 'mcp__fs__read', { path: '/fallback' })],
        })
      )
      .mockResolvedValueOnce(
        mockChatResponse({ content: 'Recovered after error.' })
      );

    let callNum = 0;
    jest.spyOn(functionBridge, 'handleFunctionCall').mockImplementation(async () => {
      callNum++;
      if (callNum === 1) return { success: false, error: 'File not found' };
      return { success: true, data: 'file contents' };
    });

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'read something', timestamp: new Date() }],
    });

    expect(result.content).toBe('Recovered after error.');
    expect(result.toolRoundsUsed).toBe(2);
    // Both tool calls are tracked in mcpResults (1 failure + 1 success)
    expect(result.mcpResults).toBeDefined();
    expect(result.mcpResults!.length).toBe(2);
    expect(result.mcpResults![0].success).toBe(false);
    expect(result.mcpResults![1].success).toBe(true);
  });

  it('handles maxToolRounds = 1 correctly', async () => {
    const provider = createProvider(1);

    const createCompletionSpy = jest
      .spyOn(provider as any, 'createChatCompletion')
      // Initial call -> tool call
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc1', 'mcp__fs__search', {})],
        })
      )
      // Round 1 follow-up -> another tool call (would be round 2 if allowed)
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc2', 'mcp__fs__read', {})],
        })
      )
      // Forced text response
      .mockResolvedValueOnce(
        mockChatResponse({ content: 'Done after 1 round.' })
      );

    const handleFnSpy = jest.spyOn(functionBridge, 'handleFunctionCall').mockResolvedValue({
      success: true,
      data: 'ok',
    });

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
    });

    expect(result.toolRoundsUsed).toBe(1);
    expect(result.content).toBe('Done after 1 round.');
    // Only tc1 executed; tc2 was in the follow-up response but never processed
    expect(handleFnSpy).toHaveBeenCalledTimes(1);
    // 3 API calls: initial + round1 followup + forced final
    expect(createCompletionSpy).toHaveBeenCalledTimes(3);
  });

  it('propagates API errors mid-loop correctly', async () => {
    const provider = createProvider();

    jest
      .spyOn(provider as any, 'createChatCompletion')
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc1', 'mcp__fs__search', {})],
        })
      )
      // Follow-up call throws (e.g., rate limit)
      .mockRejectedValueOnce(new Error('429 Too Many Requests'));

    jest.spyOn(functionBridge, 'handleFunctionCall').mockResolvedValue({
      success: true,
      data: 'ok',
    });

    await expect(
      provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
      })
    ).rejects.toThrow("couldn't respond");
  });

  it('handles tools that succeed with no data', async () => {
    const provider = createProvider();

    jest
      .spyOn(provider as any, 'createChatCompletion')
      .mockResolvedValueOnce(
        mockChatResponse({
          tool_calls: [toolCall('tc1', 'mcp__fs__delete', {})],
        })
      )
      .mockResolvedValueOnce(
        mockChatResponse({ content: 'File deleted.' })
      );

    jest.spyOn(functionBridge, 'handleFunctionCall').mockResolvedValue({
      success: true,
      data: undefined,
    });

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'delete it', timestamp: new Date() }],
    });

    expect(result.content).toBe('File deleted.');
    expect(result.toolRoundsUsed).toBe(1);
    // Tool succeeded — should be in mcpResults
    expect(result.mcpResults).toBeDefined();
    expect(result.mcpResults!.length).toBe(1);
  });

  it('returns no toolRoundsUsed when no tools are called', async () => {
    const provider = createProvider();

    jest
      .spyOn(provider as any, 'createChatCompletion')
      .mockResolvedValueOnce(
        mockChatResponse({ content: 'Just a simple answer.' })
      );

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
    });

    expect(result.content).toBe('Just a simple answer.');
    expect(result.toolRoundsUsed).toBeUndefined();
  });
});

describe('Multi-Round Tool Calling Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('MCPBridgeConfigSchema defaults max_tool_rounds to 10', () => {
    const result = MCPBridgeConfigSchema.parse({ enabled: true });
    expect(result.max_tool_rounds).toBe(10);
  });

  it('MCPBridgeConfigSchema validates max_tool_rounds bounds', () => {
    expect(() => MCPBridgeConfigSchema.parse({ enabled: true, max_tool_rounds: 0 })).toThrow();
    expect(() => MCPBridgeConfigSchema.parse({ enabled: true, max_tool_rounds: 51 })).toThrow();
    expect(MCPBridgeConfigSchema.parse({ enabled: true, max_tool_rounds: 1 }).max_tool_rounds).toBe(1);
    expect(MCPBridgeConfigSchema.parse({ enabled: true, max_tool_rounds: 50 }).max_tool_rounds).toBe(50);
  });

  it('MCP_MAX_TOOL_ROUNDS env var overrides config', () => {
    process.env.MCP_MAX_TOOL_ROUNDS = '5';
    process.env.MCP_BRIDGE_ENABLED = 'true';
    // Need at least one provider for ConfigManager
    process.env.OPENAI_API_KEY = 'test-key';

    const configManager = new ConfigManager();
    const config = configManager.getConfig();

    expect(config.mcp_bridge?.max_tool_rounds).toBe(5);
  });
});
