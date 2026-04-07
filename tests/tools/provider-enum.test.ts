import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Mock logger to suppress output during tests
jest.unstable_mockModule('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Dynamic Provider Enum in Tool Schemas', () => {
  // Save original env vars
  const savedEnv: Record<string, string | undefined> = {};
  const envKeysToSave = [
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'GROQ_API_KEY',
    'MCP_BRIDGE_ENABLED',
    'RUBBER_DUCK_CONFIG',
    'DEFAULT_PROVIDER',
  ];

  function saveEnv() {
    for (const key of envKeysToSave) {
      savedEnv[key] = process.env[key];
    }
    // Also save any CUSTOM_* vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CUSTOM_')) {
        savedEnv[key] = process.env[key];
      }
    }
  }

  function restoreEnv() {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  function clearProviderEnv() {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.RUBBER_DUCK_CONFIG;
    delete process.env.DEFAULT_PROVIDER;
    // Clear CUSTOM_* vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CUSTOM_')) {
        delete process.env[key];
      }
    }
  }

  /**
   * Helper: get JSON Schema for a tool's inputSchema from the registered tools map.
   */
  function getToolJsonSchema(
    tools: Record<string, { inputSchema?: unknown }>,
    toolName: string
  ): Record<string, unknown> {
    const tool = tools[toolName];
    if (!tool?.inputSchema) {
      throw new Error(`Tool "${toolName}" not found or has no inputSchema`);
    }
    return zodToJsonSchema(tool.inputSchema as Parameters<typeof zodToJsonSchema>[0]) as Record<
      string,
      unknown
    >;
  }

  /**
   * Helper: extract a property schema from JSON Schema.
   */
  function getPropertySchema(
    jsonSchema: Record<string, unknown>,
    propName: string
  ): Record<string, unknown> {
    const properties = jsonSchema.properties as Record<string, Record<string, unknown>>;
    if (!properties?.[propName]) {
      throw new Error(`Property "${propName}" not found in schema`);
    }
    return properties[propName];
  }

  describe('with configured providers [openai, google]', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tools: Record<string, any>;
    const expectedEnum = ['openai', 'google'];

    beforeAll(async () => {
      saveEnv();
      clearProviderEnv();

      // Configure exactly two providers
      process.env.OPENAI_API_KEY = 'test-key-openai';
      process.env.GEMINI_API_KEY = 'test-key-gemini';
      process.env.MCP_BRIDGE_ENABLED = 'true';

      // Dynamic import to pick up env vars
      const { RubberDuckServer } = await import('../../src/server.js');
      const server = new RubberDuckServer();
      // Access the internal McpServer's registered tools
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools = (server as any).server._registeredTools;
    });

    afterAll(() => {
      restoreEnv();
    });

    // --- T-1: Schema contains enum matching configured providers ---

    describe('T-1: single provider parameters have enum', () => {
      const singleProviderTools = [
        { tool: 'ask_duck', param: 'provider' },
        { tool: 'chat_with_duck', param: 'provider' },
        { tool: 'list_models', param: 'provider' },
        { tool: 'duck_judge', param: 'judge' },
        { tool: 'duck_debate', param: 'synthesizer' },
        { tool: 'get_pending_approvals', param: 'duck' },
      ];

      it.each(singleProviderTools)(
        '$tool.$param has enum matching configured providers',
        ({ tool, param }) => {
          const schema = getToolJsonSchema(tools, tool);
          const propSchema = getPropertySchema(schema, param);

          // Should have enum with exactly our provider names
          expect(propSchema.enum).toEqual(expectedEnum);
        }
      );
    });

    describe('T-3: array provider parameters have per-item enum', () => {
      const arrayProviderTools = [
        { tool: 'compare_ducks', param: 'providers' },
        { tool: 'duck_vote', param: 'voters' },
        { tool: 'duck_iterate', param: 'providers' },
        { tool: 'duck_debate', param: 'providers' },
      ];

      it.each(arrayProviderTools)(
        '$tool.$param items have enum matching configured providers',
        ({ tool, param }) => {
          const schema = getToolJsonSchema(tools, tool);
          const propSchema = getPropertySchema(schema, param);

          // Array type with items containing enum
          expect(propSchema.type).toBe('array');
          const items = propSchema.items as Record<string, unknown>;
          expect(items.enum).toEqual(expectedEnum);
        }
      );
    });

    // --- T-2: Optional parameters remain optional ---

    describe('T-2: optional parameters remain optional', () => {
      const optionalProviderParams = [
        { tool: 'ask_duck', param: 'provider' },
        { tool: 'chat_with_duck', param: 'provider' },
        { tool: 'list_models', param: 'provider' },
        { tool: 'duck_judge', param: 'judge' },
        { tool: 'duck_debate', param: 'synthesizer' },
        { tool: 'get_pending_approvals', param: 'duck' },
        { tool: 'compare_ducks', param: 'providers' },
        { tool: 'duck_vote', param: 'voters' },
        { tool: 'duck_debate', param: 'providers' },
      ];

      it.each(optionalProviderParams)(
        '$tool.$param is not in required array',
        ({ tool, param }) => {
          const schema = getToolJsonSchema(tools, tool);
          const required = (schema.required as string[]) || [];
          expect(required).not.toContain(param);
        }
      );

      it('duck_iterate.providers is required', () => {
        const schema = getToolJsonSchema(tools, 'duck_iterate');
        const required = (schema.required as string[]) || [];
        expect(required).toContain('providers');
      });
    });
  });

  describe('T-4: fallback when no providers configured', () => {
    // Test the providerEnum() method directly with empty provider list.
    // ESM module caching prevents re-importing with different env vars in the
    // same test file, so we test the fallback by mocking getProviderNames().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any;

    beforeAll(async () => {
      saveEnv();
      clearProviderEnv();
      process.env.OPENAI_API_KEY = 'test-key-openai';
      process.env.MCP_BRIDGE_ENABLED = 'false';

      const { RubberDuckServer } = await import('../../src/server.js');
      server = new RubberDuckServer();
    });

    afterAll(() => {
      restoreEnv();
    });

    it('providerEnum() returns z.string() when getProviderNames() is empty (AC-2.1, AC-2.2)', () => {
      // Mock getProviderNames to return empty array
      const originalFn = server.providerManager.getProviderNames;
      server.providerManager.getProviderNames = () => [];

      const schema = zodToJsonSchema(server.providerEnum()) as Record<string, unknown>;

      // Should be plain string, no enum
      expect(schema.type).toBe('string');
      expect(schema.enum).toBeUndefined();

      // Restore
      server.providerManager.getProviderNames = originalFn;
    });

    it('providerEnum() returns z.enum() when providers exist', () => {
      const schema = zodToJsonSchema(server.providerEnum()) as Record<string, unknown>;

      // Should have enum
      expect(schema.enum).toBeDefined();
    });
  });
});
