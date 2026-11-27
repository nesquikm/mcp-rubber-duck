import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { PassThrough } from 'stream';

import { RubberDuckServer } from '../src/server.js';
import { ConfigManager } from '../src/config/config.js';
import { ProviderManager } from '../src/providers/manager.js';
import { MCPClientManager } from '../src/services/mcp-client-manager.js';
import { isolateEnv, waitFor } from './helpers/mock-openai.js';

/**
 * AC-K1F5Q5.8: config loading, provider construction and MCP Bridge connection
 * run once per process. The session drives the real start() path over stdio
 * (process.stdin/stdout swapped for in-memory streams while the transport is
 * created) and sends a modern `server/discover` probe followed by a legacy
 * `initialize`, which makes serveStdio discard the probe instance and call the
 * factory again.
 */
const ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'factory-once-test', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

interface Rpc {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: unknown;
}

describe.each([
  ['bridge-off', false],
  ['bridge-on', true],
])('AC-K1F5Q5.8: services built once per process (%s)', (_variant, bridge) => {
  const saved = { ...process.env };
  const replies: Rpc[] = [];
  let server: RubberDuckServer;
  let stdin: PassThrough;
  let loadConfig: ReturnType<typeof jest.spyOn>;
  let initializeProviders: ReturnType<typeof jest.spyOn>;
  let bridgeConnect: ReturnType<typeof jest.spyOn>;
  let factory: ReturnType<typeof jest.spyOn>;
  let providersAfterConstruction = 0;

  beforeAll(async () => {
    isolateEnv({ OPENAI_API_KEY: 'test-key', ...(bridge ? { MCP_BRIDGE_ENABLED: 'true' } : {}) });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadConfig = jest.spyOn(ConfigManager.prototype as any, 'loadConfig');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initializeProviders = jest.spyOn(ProviderManager.prototype as any, 'initializeProviders');
    bridgeConnect = jest.spyOn(MCPClientManager.prototype, 'initialize');
    factory = jest.spyOn(RubberDuckServer.prototype, 'buildMcpServer');

    server = new RubberDuckServer();
    providersAfterConstruction = initializeProviders.mock.calls.length;

    stdin = new PassThrough();
    const stdout = new PassThrough();
    let buffered = '';
    stdout.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf-8');
      let newline: number;
      while ((newline = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (!line) continue;
        try {
          replies.push(JSON.parse(line) as Rpc);
        } catch {
          /* not ours: anything else written to stdout while it was swapped */
        }
      }
    });

    const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin')!;
    const realStdout = Object.getOwnPropertyDescriptor(process, 'stdout')!;
    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true, enumerable: true });
    Object.defineProperty(process, 'stdout', {
      value: stdout,
      configurable: true,
      enumerable: true,
    });
    try {
      await server.start();
    } finally {
      Object.defineProperty(process, 'stdin', realStdin);
      Object.defineProperty(process, 'stdout', realStdout);
    }

    stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'server/discover',
        params: { _meta: ENVELOPE },
      }) + '\n'
    );
    await waitFor(() => replies.some((r) => r.id === 1), 'the server/discover reply (id 1)');

    stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'factory-once-test', version: '1.0.0' },
        },
      }) + '\n'
    );
    await waitFor(() => replies.some((r) => r.id === 2), 'the legacy initialize reply (id 2)');
  }, 30000);

  afterAll(async () => {
    await server?.stop();
    stdin?.end();
    jest.restoreAllMocks();
    process.env = { ...saved };
  });

  it('answered the server/discover probe with a result', () => {
    expect(replies.find((r) => r.id === 1)?.result).toEqual(
      expect.objectContaining({ supportedVersions: expect.arrayContaining(['2026-07-28']) })
    );
  });

  it('answered the legacy initialize with protocolVersion 2025-11-25', () => {
    expect(replies.find((r) => r.id === 2)?.result).toEqual(
      expect.objectContaining({ protocolVersion: '2025-11-25' })
    );
  });

  it('built an MCP server for the probe and again for the legacy fallback', () => {
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('loaded config exactly once', () => {
    expect(loadConfig).toHaveBeenCalledTimes(1);
  });

  if (!bridge) {
    it('constructed providers exactly once', () => {
      expect(initializeProviders).toHaveBeenCalledTimes(1);
    });
  } else {
    it('constructed no providers in the per-connection factory', () => {
      expect(providersAfterConstruction).toBeGreaterThan(0);
      expect(initializeProviders).toHaveBeenCalledTimes(providersAfterConstruction);
    });

    it('connected the MCP Bridge exactly once', () => {
      expect(bridgeConnect).toHaveBeenCalledTimes(1);
    });
  }
});
