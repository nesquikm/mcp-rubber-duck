import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import {
  mockProviderEnv,
  startMockOpenAI,
  waitFor,
  type MockOpenAI,
} from '../helpers/mock-openai.js';
import {
  DIST_INDEX,
  LEGACY,
  MODERN,
  freePort,
  isListening,
  modernHeaders,
  rawPost,
  spawnServer,
  startHttpServer,
  type SpawnedServer,
} from '../helpers/http-server.js';

/**
 * FR R2JF6A end-to-end: the BUILT server (dist/index.js) with the opt-in
 * Streamable HTTP transport, on an ephemeral port, against the local mock
 * OpenAI-compatible server. Run `npm run build` first; this suite builds nothing.
 */
jest.setTimeout(90000);

type Era = 'modern' | 'legacy';
const ERAS: Era[] = ['modern', 'legacy'];

/** Same list as tests/e2e/stdio-eras.e2e.test.ts (AC-K1F5Q5.9), repeated over HTTP. */
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

const ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': MODERN,
  'io.modelcontextprotocol/clientInfo': { name: 'e2e-http-raw', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

let mock: MockOpenAI;
let sandbox: string;

/** Mock providers plus an isolated HOME/cwd; no .env or config.json is found. */
function baseEnv(): Record<string, string> {
  return { ...mockProviderEnv(mock.baseUrl), HOME: sandbox, PATH: process.env.PATH ?? '' };
}

beforeAll(async () => {
  if (!existsSync(DIST_INDEX)) {
    throw new Error(`Missing ${DIST_INDEX}: run \`npm run build\` before \`npm run test:e2e\`.`);
  }
  mock = await startMockOpenAI();
  sandbox = mkdtempSync(join(tmpdir(), 'duck-e2e-http-'));
});

afterAll(async () => {
  await mock?.close();
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

function eraOptions(era: Era) {
  return era === 'modern'
    ? { versionNegotiation: { mode: { pin: MODERN } } }
    : { supportedProtocolVersions: [LEGACY] };
}

async function connectHttp(url: string, era: Era, headers?: Record<string, string>) {
  const client = new Client({ name: 'e2e-http', version: '1.0.0' }, eraOptions(era));
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), headers ? { requestInit: { headers } } : {})
  );
  return client;
}

async function connectStdio(era: Era) {
  const client = new Client({ name: 'e2e-stdio', version: '1.0.0' }, eraOptions(era));
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [DIST_INDEX],
      env: baseEnv(),
      cwd: sandbox,
      stderr: 'ignore',
    })
  );
  return client;
}

function modernRequest(id: number, method: string, params: Record<string, unknown> = {}) {
  const message = {
    jsonrpc: '2.0',
    id,
    method,
    params: { ...params, _meta: { ...ENVELOPE, ...(params._meta as object | undefined) } },
  };
  return { message, headers: modernHeaders(message) };
}

describe('AC-R2JF6A.1: without MCP_TRANSPORT=http the process serves stdio only', () => {
  const HAS_LSOF = (() => {
    try {
      execFileSync('lsof', ['-v'], { stdio: 'ignore' });
      return true;
    } catch (error) {
      // `lsof -v` exits non-zero on some systems but still exists.
      return (error as NodeJS.ErrnoException).code !== 'ENOENT';
    }
  })();

  /** Spawn, prove stdio answers server/discover, then report the listen state. */
  async function stdioOnly(transportEnv: Record<string, string>) {
    const port = await freePort();
    const spawned = spawnServer(
      { ...baseEnv(), MCP_HTTP_HOST: '127.0.0.1', MCP_HTTP_PORT: String(port), ...transportEnv },
      sandbox
    );
    let stdout = '';
    spawned.child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf-8')));
    try {
      spawned.child.stdin?.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'server/discover',
          params: { _meta: ENVELOPE },
        }) + '\n'
      );
      await waitFor(
        () => stdout.split('\n').some((line) => line.includes('"id":1')),
        'the stdio server/discover reply',
        30000
      );
      const listeners = HAS_LSOF
        ? (() => {
            try {
              return execFileSync(
                'lsof',
                ['-nP', '-a', '-p', String(spawned.child.pid), '-iTCP', '-sTCP:LISTEN'],
                { encoding: 'utf-8' }
              ).trim();
            } catch {
              return ''; // lsof exits 1 when nothing matches
            }
          })()
        : '';
      return { stdioAnswered: true, configuredPortListening: await isListening(port), listeners };
    } finally {
      await spawned.stop();
    }
  }

  it('MCP_TRANSPORT unset: stdio answers and no TCP socket is listening', async () => {
    expect(await stdioOnly({})).toEqual({
      stdioAnswered: true,
      configuredPortListening: false,
      listeners: '',
    });
  });

  it('MCP_TRANSPORT=stdio: stdio answers and no TCP socket is listening', async () => {
    expect(await stdioOnly({ MCP_TRANSPORT: 'stdio' })).toEqual({
      stdioAnswered: true,
      configuredPortListening: false,
      listeners: '',
    });
  });
});

describe('AC-R2JF6A.2 / AC-R2JF6A.9: MCP over HTTP in both eras', () => {
  let server: SpawnedServer;

  beforeAll(async () => {
    server = await startHttpServer(baseEnv(), sandbox);
  });

  afterAll(async () => {
    await server?.stop();
  });

  it('POST /mcp serves MCP on the configured port', async () => {
    const { message, headers } = modernRequest(1, 'tools/list');
    const response = await rawPost(server.url, message, headers);
    const reply = response.messages.find((m) => m.id === 1) as
      | { result?: { tools?: unknown[] } }
      | undefined;
    expect({ status: response.status, hasTools: Array.isArray(reply?.result?.tools) }).toEqual({
      status: 200,
      hasTools: true,
    });
  });

  it('a client pinned to 2026-07-28 negotiates 2026-07-28, era modern', async () => {
    const client = await connectHttp(server.url, 'modern');
    try {
      expect({
        version: client.getNegotiatedProtocolVersion(),
        era: client.getProtocolEra(),
      }).toEqual({ version: MODERN, era: 'modern' });
    } finally {
      await client.close();
    }
  });

  it('a legacy client offering 2025-11-25 negotiates 2025-11-25, era legacy', async () => {
    const client = await connectHttp(server.url, 'legacy');
    try {
      expect({
        version: client.getNegotiatedProtocolVersion(),
        era: client.getProtocolEra(),
      }).toEqual({ version: LEGACY, era: 'legacy' });
    } finally {
      await client.close();
    }
  });

  it.each(ERAS)('%s era: lists the same tools over HTTP as over stdio', async (era) => {
    const stdio = await connectStdio(era);
    let stdioNames: string[];
    try {
      stdioNames = (await stdio.listTools()).tools.map((t) => t.name).sort();
    } finally {
      await stdio.close();
    }
    const http = await connectHttp(server.url, era);
    try {
      const httpNames = (await http.listTools()).tools.map((t) => t.name).sort();
      // Precondition: stdio listed the always-registered tools at all.
      expect(stdioNames).toEqual(expect.arrayContaining(ALWAYS_REGISTERED.map(([n]) => n)));
      expect(httpNames).toEqual(stdioNames);
    } finally {
      await http.close();
    }
  });

  describe.each(ERAS)('AC-R2JF6A.9: every always-registered tool over HTTP (%s era)', (era) => {
    let client: Client;

    beforeAll(async () => {
      client = await connectHttp(server.url, era);
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

  describe('AC-R2JF6A.6: compare_ducks progress over the response SSE stream', () => {
    it('modern era: notifications/progress events arrive on the SSE stream before the result', async () => {
      const { message, headers } = modernRequest(7, 'tools/call', {
        name: 'compare_ducks',
        arguments: { prompt: 'e2e progress' },
        _meta: { progressToken: 'e2e-progress-1' },
      });
      const response = await rawPost(server.url, message, headers);
      const progressAt = response.messages.findIndex(
        (m) =>
          m.method === 'notifications/progress' &&
          (m.params as { progressToken?: unknown } | undefined)?.progressToken === 'e2e-progress-1'
      );
      const resultAt = response.messages.findIndex((m) => m.id === 7 && 'result' in m);
      expect({
        sse: response.contentType.includes('text/event-stream'),
        progressSeen: progressAt >= 0,
        resultSeen: resultAt >= 0,
        progressBeforeResult: progressAt >= 0 && resultAt >= 0 && progressAt < resultAt,
      }).toEqual({ sse: true, progressSeen: true, resultSeen: true, progressBeforeResult: true });
    });

    it('legacy era: the SDK client receives progress before callTool resolves', async () => {
      const client = await connectHttp(server.url, 'legacy');
      const events: string[] = [];
      try {
        await client.callTool(
          { name: 'compare_ducks', arguments: { prompt: 'e2e progress' } },
          { onprogress: () => events.push('progress') }
        );
        events.push('result');
        expect({
          progressSeen: events.includes('progress'),
          last: events[events.length - 1],
        }).toEqual({ progressSeen: true, last: 'result' });
      } finally {
        await client.close();
      }
    });
  });
});

describe('AC-R2JF6A.4 / AC-R2JF6A.5: bearer token, Host and Origin over the wire', () => {
  const TOKEN = 'e2e-s3cret-token';
  let server: SpawnedServer;

  beforeAll(async () => {
    server = await startHttpServer(baseEnv(), sandbox, {
      MCP_HTTP_TOKEN: TOKEN,
      MCP_HTTP_ALLOWED_ORIGINS: 'app.example.com',
    });
  });

  afterAll(async () => {
    await server?.stop();
  });

  async function listWith(headers: Record<string, string>) {
    const { message, headers: routing } = modernRequest(1, 'tools/list');
    return rawPost(server.url, message, { ...routing, ...headers });
  }

  const served = (r: { status: number; messages: Record<string, unknown>[] }) => ({
    status: r.status,
    served: r.messages.some(
      (m) => m.id === 1 && Array.isArray((m.result as { tools?: unknown } | undefined)?.tools)
    ),
  });

  it('no Authorization header gets 401', async () => {
    expect((await listWith({})).status).toBe(401);
  });

  it('a wrong bearer token gets 401', async () => {
    expect((await listWith({ authorization: 'Bearer not-the-token' })).status).toBe(401);
  });

  it('the correct bearer token is served', async () => {
    expect(served(await listWith({ authorization: `Bearer ${TOKEN}` }))).toEqual({
      status: 200,
      served: true,
    });
  });

  it('an SDK client in each era connects and lists tools with the token', async () => {
    const expected = ALWAYS_REGISTERED.map(([n]) => n).sort();
    const outcomes: Record<string, string[]> = {};
    for (const era of ERAS) {
      const client = await connectHttp(server.url, era, { authorization: `Bearer ${TOKEN}` });
      try {
        const names = new Set((await client.listTools()).tools.map((t) => t.name));
        outcomes[era] = expected.filter((n) => names.has(n));
      } finally {
        await client.close();
      }
    }
    expect(outcomes).toEqual({ modern: expected, legacy: expected });
  });

  it('a Host outside the allowed set gets 403', async () => {
    const response = await listWith({
      authorization: `Bearer ${TOKEN}`,
      host: `evil.example:${server.port}`,
    });
    expect(response.status).toBe(403);
  });

  it('an Origin that is neither localhost nor listed gets 403', async () => {
    const response = await listWith({
      authorization: `Bearer ${TOKEN}`,
      origin: 'http://evil.example',
    });
    expect(response.status).toBe(403);
  });

  it('an Origin listed in MCP_HTTP_ALLOWED_ORIGINS is served', async () => {
    const response = await listWith({
      authorization: `Bearer ${TOKEN}`,
      origin: 'https://app.example.com',
    });
    expect(served(response)).toEqual({ status: 200, served: true });
  });

  it('a localhost Origin is served', async () => {
    const response = await listWith({
      authorization: `Bearer ${TOKEN}`,
      origin: `http://localhost:${server.port}`,
    });
    expect(served(response)).toEqual({ status: 200, served: true });
  });

  it('a request with no Origin is served', async () => {
    expect(served(await listWith({ authorization: `Bearer ${TOKEN}` }))).toEqual({
      status: 200,
      served: true,
    });
  });
});

describe('AC-R2JF6A.3 / AC-R2JF6A.8: startup refusals', () => {
  async function startupOutcome(extra: Record<string, string>, port: number) {
    const spawned = spawnServer({ ...baseEnv(), MCP_HTTP_PORT: String(port), ...extra }, sandbox);
    try {
      const { code, stderr } = await spawned.exited(20000);
      return { code, stderr, listening: await isListening(port, '127.0.0.1') };
    } finally {
      await spawned.stop();
    }
  }

  it('a non-loopback MCP_HTTP_HOST without MCP_HTTP_TOKEN exits non-zero naming MCP_HTTP_TOKEN, never listening', async () => {
    const port = await freePort();
    const { code, stderr, listening } = await startupOutcome(
      { MCP_TRANSPORT: 'http', MCP_HTTP_HOST: '0.0.0.0' },
      port
    );
    expect({
      exitedNonZero: code !== null && code !== 0,
      namesToken: stderr.includes('MCP_HTTP_TOKEN'),
      listening,
    }).toEqual({ exitedNonZero: true, namesToken: true, listening: false });
  });

  it('an invalid MCP_TRANSPORT value fails startup', async () => {
    const port = await freePort();
    const { code } = await startupOutcome({ MCP_TRANSPORT: 'websocket' }, port);
    expect(code !== null && code !== 0).toBe(true);
  });

  it('an invalid MCP_HTTP_PORT value fails startup', async () => {
    const { code } = await (async () => {
      const spawned = spawnServer(
        {
          ...baseEnv(),
          MCP_TRANSPORT: 'http',
          MCP_HTTP_HOST: '127.0.0.1',
          MCP_HTTP_PORT: 'not-a-port',
        },
        sandbox
      );
      try {
        return await spawned.exited(20000);
      } finally {
        await spawned.stop();
      }
    })();
    expect(code !== null && code !== 0).toBe(true);
  });
});
