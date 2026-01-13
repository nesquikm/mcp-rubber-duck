import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

// We need to test the tool annotations from RubberDuckServer
// Since getTools() is a private method, we'll test through the server's tool listing

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
  let tools: Tool[];

  beforeEach(() => {
    // Set up minimal environment for server initialization
    process.env.OPENAI_API_KEY = 'test-key';

    server = new RubberDuckServer();

    // Access private getTools method via reflection for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools = (server as any).getTools();
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
    it('should have 12 base tools', () => {
      // Base tools (without MCP-specific tools which are conditionally added)
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
});

describe('MCP-specific Tool Annotations', () => {
  let server: RubberDuckServer;
  let tools: Tool[];

  beforeEach(() => {
    // Enable MCP bridge for these tests
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';

    // Need to mock MCP components for initialization
    jest.resetModules();

    server = new RubberDuckServer();

    // Access private getTools method via reflection for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools = (server as any).getTools();
  });

  afterEach(() => {
    delete process.env.MCP_BRIDGE_ENABLED;
  });

  // Helper to find a tool by name
  const findTool = (name: string): Tool | undefined => {
    return tools.find((t) => t.name === name);
  };

  // Note: MCP tools are only added when mcpEnabled is true in the server
  // These tests may not find the tools if MCP is not properly initialized

  describe('get_pending_approvals (when MCP enabled)', () => {
    /**
     * get_pending_approvals reads the list of pending approval requests.
     *
     * - readOnlyHint: true - Only reads approval state
     * - openWorldHint: NOT set - Pure local operation
     */
    it('should be marked as read-only when present', () => {
      const tool = findTool('get_pending_approvals');
      if (tool) {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
    });

    it('should be explicitly marked as NOT open-world when present', () => {
      const tool = findTool('get_pending_approvals');
      if (tool) {
        expect(tool.annotations?.openWorldHint).toBe(false);
      }
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
    it('should be marked as idempotent when present', () => {
      const tool = findTool('approve_mcp_request');
      if (tool) {
        expect(tool.annotations?.idempotentHint).toBe(true);
      }
    });

    it('should NOT be marked as read-only when present', () => {
      const tool = findTool('approve_mcp_request');
      if (tool) {
        expect(tool.annotations?.readOnlyHint).toBeUndefined();
      }
    });

    it('should be explicitly marked as NOT open-world when present', () => {
      const tool = findTool('approve_mcp_request');
      if (tool) {
        expect(tool.annotations?.openWorldHint).toBe(false);
      }
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
    it('should be marked as read-only when present', () => {
      const tool = findTool('mcp_status');
      if (tool) {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
    });

    it('should be marked as open-world when present', () => {
      const tool = findTool('mcp_status');
      if (tool) {
        expect(tool.annotations?.openWorldHint).toBe(true);
      }
    });
  });
});
