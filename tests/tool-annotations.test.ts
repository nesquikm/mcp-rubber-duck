import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// We need to test the tool annotations from RubberDuckServer
// Using the proper MCP protocol to list tools via Client + InMemoryTransport

// Mock dependencies before importing the server
jest.mock('../src/utils/logger');
jest.mock('../src/services/mcp-client-manager.js');
jest.mock('../src/services/approval.js');
jest.mock('../src/services/function-bridge.js');

// Import after mocking
import { RubberDuckServer } from '../src/server.js';

/**
 * Tool Annotations Test Suite
 *
 * These tests verify that tool annotations correctly describe each tool's behavior
 * according to the MCP specification. The annotations are:
 *
 * - readOnlyHint: Tool does not modify server state
 * - destructiveHint: Tool performs irreversible operations
 * - idempotentHint: Calling repeatedly with same args has no additional effect
 * - openWorldHint: Tool accesses external systems (APIs, network, etc.)
 *
 * Test logic is based on analyzing what each tool actually does, not just
 * checking the code. Each test documents WHY the annotation should be set.
 */
describe('Tool Annotations', () => {
  let server: RubberDuckServer;
  let client: Client;
  let tools: Tool[];

  beforeEach(async () => {
    // Set up minimal environment for server initialization
    process.env.OPENAI_API_KEY = 'test-key';

    server = new RubberDuckServer();

    // Create in-memory client-server pair
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Connect server (access underlying McpServer)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (server as any).server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);

    // List tools via proper MCP protocol
    const result = await client.listTools();
    tools = result.tools;
  });

  afterEach(async () => {
    await client.close();
  });

  // Helper to find a tool by name
  const findTool = (name: string): Tool | undefined => {
    return tools.find((t) => t.name === name);
  };

  describe('All tools should have annotations', () => {
    it('should have annotations defined for every tool', () => {
      // Every tool should have an annotations object (even if empty would be valid,
      // we're being explicit about behavior for all tools)
      for (const tool of tools) {
        expect(tool.annotations).toBeDefined();
        expect(typeof tool.annotations).toBe('object');
      }
    });
  });

  describe('ask_duck', () => {
    /**
     * ask_duck queries an external LLM API and returns a response.
     * It does use an internal cache, but this is transparent optimization,
     * not user-facing state modification.
     *
     * - readOnlyHint: true - Does not modify user-visible state
     * - openWorldHint: true - Calls external LLM APIs
     */
    it('should be marked as read-only because it only retrieves information', () => {
      const tool = findTool('ask_duck');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world because it calls external LLM APIs', () => {
      const tool = findTool('ask_duck');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });

    it('should NOT be marked as destructive', () => {
      const tool = findTool('ask_duck');
      expect(tool?.annotations?.destructiveHint).toBeUndefined();
    });
  });

  describe('chat_with_duck', () => {
    /**
     * chat_with_duck creates/modifies conversation state (adds messages).
     * It also calls external LLM APIs.
     *
     * - readOnlyHint: NOT set - Modifies conversation state
     * - openWorldHint: true - Calls external LLM APIs
     */
    it('should NOT be marked as read-only because it modifies conversation state', () => {
      const tool = findTool('chat_with_duck');
      // readOnlyHint should be undefined or false (not true)
      expect(tool?.annotations?.readOnlyHint).not.toBe(true);
    });

    it('should be marked as open-world because it calls external LLM APIs', () => {
      const tool = findTool('chat_with_duck');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });

  describe('clear_conversations', () => {
    /**
     * clear_conversations deletes all conversation history.
     * This is an irreversible, destructive operation.
     *
     * - destructiveHint: true - Irreversibly deletes data
     * - idempotentHint: true - Clearing already-empty state has no additional effect
     * - openWorldHint: NOT set - Pure local operation
     */
    it('should be marked as destructive because it irreversibly deletes conversations', () => {
      const tool = findTool('clear_conversations');
      expect(tool?.annotations?.destructiveHint).toBe(true);
    });

    it('should be marked as idempotent because clearing twice has no additional effect', () => {
      const tool = findTool('clear_conversations');
      expect(tool?.annotations?.idempotentHint).toBe(true);
    });

    it('should be explicitly marked as NOT open-world because it is a local operation', () => {
      const tool = findTool('clear_conversations');
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });

    it('should NOT be marked as read-only because it deletes data', () => {
      const tool = findTool('clear_conversations');
      expect(tool?.annotations?.readOnlyHint).toBeUndefined();
    });
  });

  describe('list_ducks', () => {
    /**
     * list_ducks returns configured providers and optionally performs health checks.
     * Health checks make API calls to verify provider connectivity.
     *
     * - readOnlyHint: true - Only reads provider configuration
     * - openWorldHint: true - Can make health check API calls
     */
    it('should be marked as read-only because it only reads provider info', () => {
      const tool = findTool('list_ducks');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world because health checks call external APIs', () => {
      const tool = findTool('list_ducks');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });

  describe('list_models', () => {
    /**
     * list_models returns available models and can fetch from external APIs.
     *
     * - readOnlyHint: true - Only reads model information
     * - openWorldHint: true - Can fetch models from external APIs
     */
    it('should be marked as read-only because it only reads model info', () => {
      const tool = findTool('list_models');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world because it can fetch from external APIs', () => {
      const tool = findTool('list_models');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });

  describe('compare_ducks', () => {
    /**
     * compare_ducks queries multiple LLM providers simultaneously.
     *
     * - readOnlyHint: true - Does not modify state
     * - openWorldHint: true - Calls multiple external LLM APIs
     */
    it('should be marked as read-only because it only retrieves responses', () => {
      const tool = findTool('compare_ducks');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world because it calls external LLM APIs', () => {
      const tool = findTool('compare_ducks');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });

  describe('duck_council', () => {
    /**
     * duck_council queries all configured LLM providers.
     *
     * - readOnlyHint: true - Does not modify state
     * - openWorldHint: true - Calls multiple external LLM APIs
     */
    it('should be marked as read-only because it only retrieves responses', () => {
      const tool = findTool('duck_council');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world because it calls external LLM APIs', () => {
      const tool = findTool('duck_council');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });

  describe('duck_vote', () => {
    /**
     * duck_vote has multiple LLMs vote on options.
     *
     * - readOnlyHint: true - Does not modify state
     * - openWorldHint: true - Calls multiple external LLM APIs
     */
    it('should be marked as read-only because it only retrieves votes', () => {
      const tool = findTool('duck_vote');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world because it calls external LLM APIs', () => {
      const tool = findTool('duck_vote');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });

  describe('duck_judge', () => {
    /**
     * duck_judge has one LLM evaluate and rank responses.
     *
     * - readOnlyHint: true - Does not modify state
     * - openWorldHint: true - Calls external LLM API
     */
    it('should be marked as read-only because it only retrieves evaluation', () => {
      const tool = findTool('duck_judge');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world because it calls external LLM API', () => {
      const tool = findTool('duck_judge');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });

  describe('duck_iterate', () => {
    /**
     * duck_iterate performs iterative refinement between two LLMs.
     *
     * - readOnlyHint: true - Does not modify persistent state
     * - openWorldHint: true - Calls multiple external LLM APIs
     */
    it('should be marked as read-only because it only retrieves refined responses', () => {
      const tool = findTool('duck_iterate');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world because it calls external LLM APIs', () => {
      const tool = findTool('duck_iterate');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });

  describe('duck_debate', () => {
    /**
     * duck_debate runs a structured debate between multiple LLMs.
     *
     * - readOnlyHint: true - Does not modify persistent state
     * - openWorldHint: true - Calls multiple external LLM APIs
     */
    it('should be marked as read-only because it only retrieves debate content', () => {
      const tool = findTool('duck_debate');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world because it calls external LLM APIs', () => {
      const tool = findTool('duck_debate');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });

  describe('get_usage_stats', () => {
    /**
     * get_usage_stats retrieves local usage statistics.
     * It does not make any external calls.
     *
     * - readOnlyHint: true - Only reads local data
     * - openWorldHint: NOT set - Pure local operation
     */
    it('should be marked as read-only because it only reads statistics', () => {
      const tool = findTool('get_usage_stats');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be explicitly marked as NOT open-world because it only reads local data', () => {
      const tool = findTool('get_usage_stats');
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });
  });

  describe('Annotation consistency', () => {
    /**
     * These tests verify logical consistency of annotations across tools
     */

    it('tools that call LLM APIs should have openWorldHint', () => {
      const llmTools = [
        'ask_duck',
        'chat_with_duck',
        'compare_ducks',
        'duck_council',
        'duck_vote',
        'duck_judge',
        'duck_iterate',
        'duck_debate',
      ];

      for (const toolName of llmTools) {
        const tool = findTool(toolName);
        expect(tool?.annotations?.openWorldHint).toBe(true);
      }
    });

    it('tools that only read data should have readOnlyHint', () => {
      const readOnlyTools = [
        'ask_duck',
        'list_ducks',
        'list_models',
        'compare_ducks',
        'duck_council',
        'duck_vote',
        'duck_judge',
        'duck_iterate',
        'duck_debate',
        'get_usage_stats',
      ];

      for (const toolName of readOnlyTools) {
        const tool = findTool(toolName);
        expect(tool?.annotations?.readOnlyHint).toBe(true);
      }
    });

    it('only clear_conversations should be marked as destructive', () => {
      const destructiveTools = tools.filter(
        (t) => t.annotations?.destructiveHint === true
      );
      expect(destructiveTools).toHaveLength(1);
      expect(destructiveTools[0].name).toBe('clear_conversations');
    });

    it('chat_with_duck should NOT be read-only (it modifies conversation state)', () => {
      const tool = findTool('chat_with_duck');
      expect(tool?.annotations?.readOnlyHint).not.toBe(true);
    });
  });

  describe('Base tools count', () => {
    it('should have exactly 12 base tools', () => {
      expect(tools).toHaveLength(12);
    });

    it('should have all expected base tool names', () => {
      const baseToolNames = [
        'ask_duck',
        'chat_with_duck',
        'clear_conversations',
        'list_ducks',
        'list_models',
        'compare_ducks',
        'duck_council',
        'duck_vote',
        'duck_judge',
        'duck_iterate',
        'duck_debate',
        'get_usage_stats',
      ];

      for (const name of baseToolNames) {
        expect(findTool(name)).toBeDefined();
      }
    });
  });

  describe('Tool input schemas (Zod migration correctness)', () => {
    /**
     * These tests verify that the JSON Schema → Zod conversion
     * preserved required fields, property names, and types correctly.
     */

    it('ask_duck should have prompt as required and provider/model/temperature as optional', () => {
      const tool = findTool('ask_duck');
      expect(tool?.inputSchema.required).toContain('prompt');
      expect(tool?.inputSchema.required).not.toContain('provider');
      expect(tool?.inputSchema.required).not.toContain('model');
      expect(tool?.inputSchema.required).not.toContain('temperature');
      expect(tool?.inputSchema.properties).toHaveProperty('prompt');
      expect(tool?.inputSchema.properties).toHaveProperty('provider');
      expect(tool?.inputSchema.properties).toHaveProperty('model');
      expect(tool?.inputSchema.properties).toHaveProperty('temperature');
    });

    it('chat_with_duck should have conversation_id and message as required', () => {
      const tool = findTool('chat_with_duck');
      expect(tool?.inputSchema.required).toContain('conversation_id');
      expect(tool?.inputSchema.required).toContain('message');
      expect(tool?.inputSchema.required).not.toContain('provider');
      expect(tool?.inputSchema.required).not.toContain('model');
    });

    it('clear_conversations should have no required properties', () => {
      const tool = findTool('clear_conversations');
      // No inputSchema properties expected (no args tool)
      const required = tool?.inputSchema.required || [];
      expect(required).toHaveLength(0);
    });

    it('compare_ducks should have prompt as required and providers/model optional', () => {
      const tool = findTool('compare_ducks');
      expect(tool?.inputSchema.required).toContain('prompt');
      expect(tool?.inputSchema.required).not.toContain('providers');
      expect(tool?.inputSchema.properties?.providers).toHaveProperty('type', 'array');
    });

    it('duck_vote should have question and options as required', () => {
      const tool = findTool('duck_vote');
      expect(tool?.inputSchema.required).toContain('question');
      expect(tool?.inputSchema.required).toContain('options');
      expect(tool?.inputSchema.required).not.toContain('voters');
      expect(tool?.inputSchema.required).not.toContain('require_reasoning');
    });

    it('duck_judge should have responses as required with nested object schema', () => {
      const tool = findTool('duck_judge');
      expect(tool?.inputSchema.required).toContain('responses');
      expect(tool?.inputSchema.required).not.toContain('judge');
      expect(tool?.inputSchema.required).not.toContain('criteria');
      expect(tool?.inputSchema.required).not.toContain('persona');
      // responses should be an array type
      const responses = tool?.inputSchema.properties?.responses as Record<string, unknown>;
      expect(responses?.type).toBe('array');
    });

    it('duck_iterate should have prompt, providers, and mode as required', () => {
      const tool = findTool('duck_iterate');
      expect(tool?.inputSchema.required).toContain('prompt');
      expect(tool?.inputSchema.required).toContain('providers');
      expect(tool?.inputSchema.required).toContain('mode');
      expect(tool?.inputSchema.required).not.toContain('iterations');
    });

    it('duck_debate should have prompt and format as required', () => {
      const tool = findTool('duck_debate');
      expect(tool?.inputSchema.required).toContain('prompt');
      expect(tool?.inputSchema.required).toContain('format');
      expect(tool?.inputSchema.required).not.toContain('rounds');
      expect(tool?.inputSchema.required).not.toContain('providers');
      expect(tool?.inputSchema.required).not.toContain('synthesizer');
    });

    it('get_usage_stats should have no required properties (period has default)', () => {
      const tool = findTool('get_usage_stats');
      const required = tool?.inputSchema.required || [];
      expect(required).not.toContain('period');
    });

    it('all tools should have descriptions', () => {
      for (const tool of tools) {
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.description!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Prompts registration', () => {
    it('should register all 8 prompts via MCP protocol', async () => {
      const result = await client.listPrompts();
      expect(result.prompts).toHaveLength(8);
    });

    it('should register prompts with correct names', async () => {
      const result = await client.listPrompts();
      const names = result.prompts.map((p) => p.name);
      const expectedNames = [
        'perspectives',
        'assumptions',
        'blindspots',
        'tradeoffs',
        'red_team',
        'reframe',
        'architecture',
        'diverge_converge',
      ];
      for (const name of expectedNames) {
        expect(names).toContain(name);
      }
    });

    it('should register prompts with descriptions', async () => {
      const result = await client.listPrompts();
      for (const prompt of result.prompts) {
        expect(prompt.description).toBeDefined();
        expect(typeof prompt.description).toBe('string');
        expect(prompt.description!.length).toBeGreaterThan(0);
      }
    });

    it('should return prompt messages via getPrompt', async () => {
      const result = await client.getPrompt({
        name: 'reframe',
        arguments: { problem: 'Test problem' },
      });
      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0].role).toBe('user');
    });

    it('should return prompt messages containing the user input', async () => {
      const result = await client.getPrompt({
        name: 'perspectives',
        arguments: { problem: 'My test problem', perspectives: 'security, perf' },
      });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('My test problem');
      expect(text).toContain('security, perf');
    });
  });
});

describe('MCP-specific Tool Annotations', () => {
  let server: RubberDuckServer;
  let client: Client;
  let tools: Tool[];

  beforeEach(async () => {
    // Enable MCP bridge for these tests
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';

    // Need to mock MCP components for initialization
    jest.resetModules();

    server = new RubberDuckServer();

    // Create in-memory client-server pair
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Connect server (access underlying McpServer)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (server as any).server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);

    // List tools via proper MCP protocol
    const result = await client.listTools();
    tools = result.tools;
  });

  afterEach(async () => {
    delete process.env.MCP_BRIDGE_ENABLED;
    await client.close();
  });

  // Helper to find a tool by name
  const findTool = (name: string): Tool | undefined => {
    return tools.find((t) => t.name === name);
  };

  it('should register 15 tools when MCP bridge is enabled', () => {
    expect(tools).toHaveLength(15);
    expect(findTool('get_pending_approvals')).toBeDefined();
    expect(findTool('approve_mcp_request')).toBeDefined();
    expect(findTool('mcp_status')).toBeDefined();
  });

  describe('get_pending_approvals (when MCP enabled)', () => {
    /**
     * get_pending_approvals reads the list of pending approval requests.
     *
     * - readOnlyHint: true - Only reads approval state
     * - openWorldHint: NOT set - Pure local operation
     */
    it('should be marked as read-only', () => {
      const tool = findTool('get_pending_approvals');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be explicitly marked as NOT open-world', () => {
      const tool = findTool('get_pending_approvals');
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });
  });

  describe('approve_mcp_request (when MCP enabled)', () => {
    /**
     * approve_mcp_request approves or denies a pending request.
     * Approving twice has no additional effect (the request stays approved).
     *
     * - idempotentHint: true - Approving already-approved request has no effect
     * - readOnlyHint: NOT set - Modifies approval state
     * - openWorldHint: NOT set - Pure local operation
     */
    it('should be marked as idempotent', () => {
      const tool = findTool('approve_mcp_request');
      expect(tool?.annotations?.idempotentHint).toBe(true);
    });

    it('should NOT be marked as read-only', () => {
      const tool = findTool('approve_mcp_request');
      expect(tool?.annotations?.readOnlyHint).toBeUndefined();
    });

    it('should be explicitly marked as NOT open-world', () => {
      const tool = findTool('approve_mcp_request');
      expect(tool?.annotations?.openWorldHint).toBe(false);
    });
  });

  describe('mcp_status (when MCP enabled)', () => {
    /**
     * mcp_status retrieves the status of MCP servers and pending approvals.
     * It queries connected MCP servers to list available tools.
     *
     * - readOnlyHint: true - Only reads status information
     * - openWorldHint: true - Communicates with MCP servers
     */
    it('should be marked as read-only', () => {
      const tool = findTool('mcp_status');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be marked as open-world', () => {
      const tool = findTool('mcp_status');
      expect(tool?.annotations?.openWorldHint).toBe(true);
    });
  });
});
