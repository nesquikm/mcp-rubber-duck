import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { RubberDuckServer } from '../src/server.js';
import {
  isolateEnv,
  mockProviderEnv,
  startMockOpenAI,
  type MockOpenAI,
} from './helpers/mock-openai.js';

/**
 * FR K1F5Q5: the v2 surface, served through serveStdio(factory) on an
 * in-memory transport, compared against the v1.20.15 fixture in both eras.
 *
 * Both halves of the linked pair come from @modelcontextprotocol/client; the
 * server half is handed to serveStdio, which classifies the first message and
 * pins an era per connection, exactly as it does on real stdio.
 */
type Era = 'modern' | 'legacy';
const ERAS: Era[] = ['modern', 'legacy'];

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'mcp-surface');
const loadFixture = <T>(file: string): T =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf-8')) as T;

interface ToolLike {
  name: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
  execution?: { taskSupport?: string };
  _meta?: { ui?: { resourceUri?: string } };
}
interface PromptLike {
  name: string;
  arguments?: { name: string; required?: boolean }[];
}
interface ResourceLike {
  uri: string;
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function connect(server: RubberDuckServer, era: Era) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => server.buildMcpServer(), { transport: serverTransport });
  const client = new Client(
    { name: 'v2-surface-test', version: '1.0.0' },
    era === 'modern'
      ? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
      : { supportedProtocolVersions: ['2025-11-25'] }
  );
  await client.connect(clientTransport);
  // Precondition: the connection really is in the era under test.
  if (client.getProtocolEra() !== era) {
    throw new Error(`expected era ${era}, negotiated ${client.getProtocolEra()}`);
  }
  return { client, handle };
}

/**
 * AC-K1F5Q5.3 (operator decision 2026-11-27): the JSON Schema dialect marker
 * `$schema` is excluded from the comparison — SDK v2 emits draft 2020-12 where
 * v1 emitted draft-07. Only that top-level key is dropped; every other key
 * (properties, types, required lists, descriptions, defaults) must match.
 */
const withoutDialect = (schema: unknown): unknown => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const { $schema: _dialect, ...rest } = schema as Record<string, unknown>;
  return rest;
};

const TOOL_FIELDS: [string, (t: ToolLike) => Record<string, unknown>][] = [
  [
    'input JSON Schemas',
    (t: ToolLike) => ({ name: t.name, inputSchema: withoutDialect(t.inputSchema) }),
  ],
  [
    'output JSON Schemas',
    (t: ToolLike) => ({ name: t.name, outputSchema: withoutDialect(t.outputSchema) }),
  ],
  ['annotations', (t: ToolLike) => ({ name: t.name, annotations: t.annotations })],
  [
    '_meta.ui.resourceUri values',
    (t: ToolLike) => ({ name: t.name, resourceUri: t._meta?.ui?.resourceUri }),
  ],
];

describe.each([
  ['bridge-off', false],
  ['bridge-on', true],
])('AC-K1F5Q5.3: tools/list vs the v1.20.15 fixture (%s)', (variant, bridge) => {
  const fixture = loadFixture<ToolLike[]>(`tools-${variant}.json`).sort(byName);
  const saved = { ...process.env };
  let server: RubberDuckServer;

  beforeAll(() => {
    // The fixture was captured with OPENAI_API_KEY=test-key only.
    isolateEnv({ OPENAI_API_KEY: 'test-key', ...(bridge ? { MCP_BRIDGE_ENABLED: 'true' } : {}) });
    server = new RubberDuckServer();
  });

  afterAll(async () => {
    await server.stop();
    process.env = { ...saved };
  });

  describe.each(ERAS)('%s era', (era) => {
    let tools: ToolLike[];
    let close: () => Promise<void>;

    beforeAll(async () => {
      const { client, handle } = await connect(server, era);
      tools = plain((await client.listTools()).tools as ToolLike[]).sort(byName);
      close = async () => {
        await client.close();
        await handle.close();
      };
    });

    afterAll(async () => {
      await close?.();
    });

    it('returns the same tool names', () => {
      expect(tools.map((t) => t.name)).toEqual(fixture.map((t) => t.name));
    });

    it.each(TOOL_FIELDS)('returns the same %s', (_label, project) => {
      expect(tools.map(project)).toEqual(fixture.map(project));
    });

    it('carries no execution.taskSupport on any tool', () => {
      expect(
        tools.filter((t) => t.execution?.taskSupport !== undefined).map((t) => t.name)
      ).toEqual([]);
    });
  });
});

describe('AC-K1F5Q5.4 / AC-K1F5Q5.5: prompts, resources and capabilities', () => {
  const promptsFixture = loadFixture<PromptLike[]>('prompts.json').sort(byName);
  const resourcesFixture = loadFixture<ResourceLike[]>('resources.json').sort((a, b) =>
    a.uri.localeCompare(b.uri)
  );
  const saved = { ...process.env };
  let server: RubberDuckServer;

  beforeAll(() => {
    isolateEnv({ OPENAI_API_KEY: 'test-key' });
    server = new RubberDuckServer();
  });

  afterAll(async () => {
    await server.stop();
    process.env = { ...saved };
  });

  describe.each(ERAS)('%s era', (era) => {
    let client: Client;
    let close: () => Promise<void>;

    beforeAll(async () => {
      const connected = await connect(server, era);
      client = connected.client;
      close = async () => {
        await connected.client.close();
        await connected.handle.close();
      };
    });

    afterAll(async () => {
      await close?.();
    });

    it('prompts/list returns the 8 fixture prompts', async () => {
      const prompts = plain((await client.listPrompts()).prompts as PromptLike[]).sort(byName);
      expect(prompts).toEqual(promptsFixture);
    });

    it.each(promptsFixture.map((p) => [p.name, p] as const))(
      'prompts/get renders %s with its arguments',
      async (name, prompt) => {
        const args: Record<string, string> = {};
        for (const arg of prompt.arguments ?? []) {
          if (arg.required) args[arg.name] = `marker-${arg.name}`;
        }
        const result = await client.getPrompt({ name, arguments: args });
        expect(result.messages.length).toBeGreaterThan(0);
        const rendered = JSON.stringify(result.messages);
        expect(Object.values(args).filter((marker) => !rendered.includes(marker))).toEqual([]);
      }
    );

    it('resources/list returns the 4 fixture UI resources', async () => {
      const resources = plain((await client.listResources()).resources as ResourceLike[]).sort(
        (a, b) => a.uri.localeCompare(b.uri)
      );
      expect(resources).toEqual(resourcesFixture);
    });

    it.each(resourcesFixture.map((r) => [r.uri] as const))(
      'resources/read %s returns text/html;profile=mcp-app HTML',
      async (uri) => {
        const result = await client.readResource({ uri });
        expect(
          result.contents.map((c) => ({
            uri: c.uri,
            mimeType: c.mimeType,
            isHtml: 'text' in c && typeof c.text === 'string' && c.text.includes('<html'),
          }))
        ).toEqual([{ uri, mimeType: 'text/html;profile=mcp-app', isHtml: true }]);
      }
    );

    it('server capabilities do not include logging', () => {
      const capabilities = client.getServerCapabilities() ?? {};
      // Precondition: capabilities were actually negotiated.
      expect(Object.keys(capabilities)).toContain('tools');
      expect(Object.keys(capabilities)).not.toContain('logging');
    });
  });
});

describe('AC-K1F5Q5.6: progress notifications in both eras', () => {
  const saved = { ...process.env };
  let mock: MockOpenAI;
  let home: string;
  let server: RubberDuckServer;

  beforeAll(async () => {
    mock = await startMockOpenAI();
    // Keep usage.json writes out of the real ~/.mcp-rubber-duck.
    home = mkdtempSync(join(tmpdir(), 'duck-progress-'));
    isolateEnv({ ...mockProviderEnv(mock.baseUrl), HOME: home });
    server = new RubberDuckServer();
  });

  afterAll(async () => {
    await server.stop();
    await mock.close();
    process.env = { ...saved };
    rmSync(home, { recursive: true, force: true });
  });

  const CALLS: [string, Record<string, unknown>][] = [
    ['compare_ducks', { prompt: 'progress please' }],
    ['duck_council', { prompt: 'progress please' }],
    ['duck_vote', { question: 'Pick one', options: ['A', 'B'] }],
  ];

  describe.each(ERAS)('%s era', (era) => {
    let client: Client;
    let close: () => Promise<void>;

    beforeAll(async () => {
      const connected = await connect(server, era);
      client = connected.client;
      close = async () => {
        await connected.client.close();
        await connected.handle.close();
      };
    });

    afterAll(async () => {
      await close?.();
    });

    it.each(CALLS)(
      '%s emits strictly increasing notifications/progress before its result',
      async (name, args) => {
        const seen: number[] = [];
        const result = await client.callTool(
          { name, arguments: args },
          { onprogress: (p: { progress: number }) => seen.push(p.progress) }
        );
        const atResult = [...seen];
        expect(result.isError).not.toBe(true);
        expect(atResult.length).toBeGreaterThanOrEqual(1);
        expect(atResult.every((value, i) => i === 0 || value > atResult[i - 1])).toBe(true);
      }
    );
  });
});
