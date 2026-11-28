import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import {
  mockProviderEnv,
  startMockOpenAI,
  waitFor,
  type MockOpenAI,
} from '../helpers/mock-openai.js';

/**
 * FR K1F5Q5 end-to-end: spawn the BUILT server (dist/index.js) over stdio
 * against a local mock OpenAI-compatible server, and drive it through a real v2
 * MCP client in both eras. This suite builds nothing: `npm run build` must
 * have run first.
 */
jest.setTimeout(60000);

const DIST_INDEX = join(process.cwd(), 'dist', 'index.js');
type Era = 'modern' | 'legacy';
const ERAS: Era[] = ['modern', 'legacy'];

/** Every tool registered regardless of the MCP Bridge, with minimal valid arguments. */
const ALWAYS_REGISTERED: [string, Record<string, unknown>][] = [
  ['ask_duck', { prompt: 'e2e hello' }],
  ['chat_with_duck', { conversation_id: 'e2e', message: 'e2e hello' }],
  ['clear_conversations', {}],
  ['list_ducks', {}],
  ['list_models', {}],
  ['compare_ducks', { prompt: 'e2e hello' }],
  ['duck_council', { prompt: 'e2e hello' }],
  ['duck_vote', { question: 'Pick one', options: ['A', 'B'] }],
  [
    'duck_judge',
    {
      responses: [
        { provider: 'mocka', nickname: 'Mock A', content: 'answer one' },
        { provider: 'mockb', nickname: 'Mock B', content: 'answer two' },
      ],
    },
  ],
  [
    'duck_iterate',
    { prompt: 'e2e hello', providers: ['mocka', 'mockb'], mode: 'refine', iterations: 1 },
  ],
  ['duck_debate', { prompt: 'e2e hello', format: 'oxford', rounds: 1 }],
  ['get_usage_stats', {}],
];

let mock: MockOpenAI;
let sandbox: string;

/**
 * The only variables the server sees: the mock providers plus an isolated HOME.
 * cwd and HOME point at an empty temp dir, so no .env or config.json is found.
 */
function serverEnv(): Record<string, string> {
  return { ...mockProviderEnv(mock.baseUrl), HOME: sandbox, PATH: process.env.PATH ?? '' };
}

beforeAll(async () => {
  if (!existsSync(DIST_INDEX)) {
    throw new Error(`Missing ${DIST_INDEX}: run \`npm run build\` before \`npm run test:e2e\`.`);
  }
  mock = await startMockOpenAI();
  sandbox = mkdtempSync(join(tmpdir(), 'duck-e2e-'));
});

afterAll(async () => {
  await mock?.close();
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

async function connect(era: Era): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX],
    env: serverEnv(),
    cwd: sandbox,
    stderr: 'ignore',
  });
  const client = new Client(
    { name: 'e2e', version: '1.0.0' },
    era === 'modern'
      ? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
      : { supportedProtocolVersions: ['2025-11-25'] }
  );
  await client.connect(transport);
  return client;
}

interface Negotiation {
  version: string | undefined;
  era: string | undefined;
  refused?: string;
}

/**
 * Negotiate one era and report the outcome as data, never as a throw: a server
 * that refuses the era (legacy-only, or `legacy: 'reject'`) must turn the era
 * assertion RED at its `toEqual`, not fail earlier inside `connect()`.
 */
async function negotiate(era: Era): Promise<Negotiation> {
  let client: Client | undefined;
  try {
    client = await connect(era);
    return { version: client.getNegotiatedProtocolVersion(), era: client.getProtocolEra() };
  } catch (error) {
    return {
      version: undefined,
      era: undefined,
      refused: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client?.close().catch(() => undefined);
  }
}

describe('AC-K1F5Q5.2: one binary serves both eras over stdio', () => {
  // Guards both halves: a legacy-only server (no 2026-07-28 / server/discover)
  // reds the modern assertion; a server rejecting legacy reds the legacy one.
  it('a client pinned to 2026-07-28 negotiates 2026-07-28, era modern', async () => {
    expect(await negotiate('modern')).toEqual({ version: '2026-07-28', era: 'modern' });
  });

  it('a legacy client offering only 2025-11-25 negotiates 2025-11-25, era legacy', async () => {
    expect(await negotiate('legacy')).toEqual({ version: '2025-11-25', era: 'legacy' });
  });
});

describe.each(ERAS)('AC-K1F5Q5.9: every always-registered tool (%s era)', (era) => {
  let client: Client;

  beforeAll(async () => {
    client = await connect(era);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('sees only the mock providers', async () => {
    const tools = (await client.listTools()).tools;
    const askDuck = tools.find((t) => t.name === 'ask_duck');
    const provider = (askDuck?.inputSchema.properties as Record<string, { enum?: string[] }>)
      ?.provider;
    expect(provider?.enum?.slice().sort()).toEqual(['mocka', 'mockb']);
  });

  it.each(ALWAYS_REGISTERED)('%s returns a result with isError !== true', async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text?: string }[])
      .map((c) => c.text ?? '')
      .join('\n');
    expect({ name, isError: result.isError === true, text: result.isError ? text : '' }).toEqual({
      name,
      isError: false,
      text: '',
    });
  });
});

describe('AC-K1F5Q5.5: spawned server stdout and capabilities', () => {
  const ENVELOPE = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'e2e-raw', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };

  /** Spawn the server, write `messages` as NDJSON, collect ALL stdout until `doneIds` replied. */
  async function rawSession(messages: object[], doneIds: number[]): Promise<string> {
    const child = spawn(process.execPath, [DIST_INDEX], {
      env: serverEnv(),
      cwd: sandbox,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf-8')));
    const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));
    for (const message of messages) child.stdin.write(JSON.stringify(message) + '\n');
    const replied = (id: number) =>
      stdout.split('\n').some((line) => {
        try {
          return (JSON.parse(line) as { id?: number }).id === id;
        } catch {
          return false;
        }
      });
    try {
      await waitFor(() => doneIds.every(replied), `replies to ids ${doneIds.join(', ')}`, 30000);
    } finally {
      child.stdin.end();
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      child.kill();
    }
    return stdout;
  }

  const SESSIONS: Record<Era, { messages: object[]; doneIds: number[] }> = {
    modern: {
      messages: [
        { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: ENVELOPE } },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: ENVELOPE } },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'ask_duck', arguments: { prompt: 'raw' }, _meta: ENVELOPE },
        },
      ],
      doneIds: [1, 2, 3],
    },
    legacy: {
      messages: [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'e2e-raw', version: '1.0.0' },
          },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'ask_duck', arguments: { prompt: 'raw' } },
        },
      ],
      doneIds: [1, 2, 3],
    },
  };

  it.each(ERAS)('%s era: stdout contains only framed JSON-RPC', async (era) => {
    const { messages, doneIds } = SESSIONS[era];
    const stdout = await rawSession(messages, doneIds);
    const lines = stdout.split('\n').filter((line) => line.trim() !== '');
    // Precondition: the session produced output at all.
    expect(lines.length).toBeGreaterThanOrEqual(doneIds.length);
    const notJsonRpc = lines.filter((line) => {
      try {
        return (JSON.parse(line) as { jsonrpc?: string }).jsonrpc !== '2.0';
      } catch {
        return true;
      }
    });
    expect(notJsonRpc).toEqual([]);
  });

  it.each(ERAS)('%s era: server capabilities do not include logging', async (era) => {
    const client = await connect(era);
    try {
      const capabilities = client.getServerCapabilities() ?? {};
      expect(Object.keys(capabilities)).toContain('tools');
      expect(Object.keys(capabilities)).not.toContain('logging');
    } finally {
      await client.close();
    }
  });
});
