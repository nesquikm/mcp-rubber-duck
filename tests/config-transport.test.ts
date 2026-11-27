import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigManager } from '../src/config/config.js';
import { ConfigSchema } from '../src/config/types.js';

/**
 * AC-R2JF6A.8: the HTTP transport variables are parsed by ConfigManager into
 * `config.transport` and validated by the Zod ConfigSchema.
 *
 * Contract: `getConfig().transport` is
 * `{ mode: 'stdio' | 'http', host: string, port: number, token?: string,
 *    allowed_origins: string[], allowed_hosts: string[] }`
 * with defaults `mode 'stdio'`, `host '127.0.0.1'`, `port 3000`, `allowed_origins []`,
 * `allowed_hosts []` (MCP_HTTP_ALLOWED_HOSTS, operator decision 2026-11-27).
 */
const TRANSPORT_VARS = [
  'MCP_TRANSPORT',
  'MCP_HTTP_HOST',
  'MCP_HTTP_PORT',
  'MCP_HTTP_TOKEN',
  'MCP_HTTP_ALLOWED_ORIGINS',
  'MCP_HTTP_ALLOWED_HOSTS',
];

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  for (const key of TRANSPORT_VARS) delete process.env[key];
  // A fixed provider so ConfigManager never depends on the developer's keys.
  for (const key of Object.keys(process.env)) {
    if (/_API_KEY$/.test(key) || key.startsWith('CUSTOM_')) delete process.env[key];
  }
  process.env.CUSTOM_MOCKA_API_KEY = 'mock-key';
  process.env.CUSTOM_MOCKA_BASE_URL = 'http://127.0.0.1:1/v1';
  process.env.CUSTOM_MOCKA_DEFAULT_MODEL = 'mock-model';
});

afterEach(() => {
  process.env = originalEnv;
});

/** A ConfigManager that reads no config file (a path that does not exist). */
function load(): ConfigManager {
  return new ConfigManager(join(process.cwd(), 'tests', 'fixtures', 'no-such-config.json'));
}

describe('AC-R2JF6A.8: ConfigManager parses the transport variables', () => {
  it('defaults to stdio on 127.0.0.1:3000 with no token and no extra origins', () => {
    const transport = (load().getConfig() as Record<string, unknown>).transport;
    expect(transport).toEqual({
      mode: 'stdio',
      host: '127.0.0.1',
      port: 3000,
      allowed_origins: [],
      allowed_hosts: [],
    });
  });

  it('parses MCP_TRANSPORT=stdio explicitly', () => {
    process.env.MCP_TRANSPORT = 'stdio';
    const transport = (load().getConfig() as Record<string, unknown>).transport as {
      mode?: string;
    };
    expect(transport?.mode).toBe('stdio');
  });

  it('parses every HTTP variable', () => {
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    process.env.MCP_HTTP_PORT = '8123';
    process.env.MCP_HTTP_TOKEN = 's3cret-token';
    process.env.MCP_HTTP_ALLOWED_ORIGINS = ' app.example.com , tools.example.org ';
    process.env.MCP_HTTP_ALLOWED_HOSTS = 'duck.example.com';
    const transport = (load().getConfig() as Record<string, unknown>).transport;
    expect(transport).toEqual({
      mode: 'http',
      host: '0.0.0.0',
      port: 8123,
      token: 's3cret-token',
      allowed_origins: ['app.example.com', 'tools.example.org'],
      allowed_hosts: ['duck.example.com'],
    });
  });

  it('MCP_HTTP_ALLOWED_HOSTS defaults to an empty list', () => {
    const transport = (load().getConfig() as Record<string, unknown>).transport as {
      allowed_hosts?: unknown;
    };
    expect(transport?.allowed_hosts).toEqual([]);
  });

  it('MCP_HTTP_ALLOWED_HOSTS is a trimmed comma list', () => {
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_ALLOWED_HOSTS = ' duck.example.com , ducks.internal ';
    const transport = (load().getConfig() as Record<string, unknown>).transport as {
      allowed_hosts?: unknown;
    };
    expect(transport?.allowed_hosts).toEqual(['duck.example.com', 'ducks.internal']);
  });

  it('MCP_HTTP_ALLOWED_HOSTS drops empty entries', () => {
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_ALLOWED_HOSTS = 'duck.example.com,, ,ducks.internal,';
    const transport = (load().getConfig() as Record<string, unknown>).transport as {
      allowed_hosts?: unknown;
    };
    expect(transport?.allowed_hosts).toEqual(['duck.example.com', 'ducks.internal']);
  });

  it('an unknown MCP_TRANSPORT value fails startup', () => {
    process.env.MCP_TRANSPORT = 'websocket';
    expect(() => load()).toThrow(/Configuration validation failed/);
  });

  it.each(['abc', '70000', '-1', '80.5'])('MCP_HTTP_PORT=%s fails startup', (port) => {
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_PORT = port;
    expect(() => load()).toThrow(/Configuration validation failed/);
  });
});

describe('AC-R2JF6A.8: the Zod ConfigSchema validates transport', () => {
  it('rejects an unknown transport mode', () => {
    const parsed = ConfigSchema.safeParse({ providers: {}, transport: { mode: 'websocket' } });
    expect(parsed.success).toBe(false);
  });

  it('rejects a port above 65535', () => {
    const parsed = ConfigSchema.safeParse({
      providers: {},
      transport: { mode: 'http', port: 65536 },
    });
    expect(parsed.success).toBe(false);
  });

  it('keeps a valid transport block (not silently stripped) and fills defaults', () => {
    const parsed = ConfigSchema.parse({ providers: {}, transport: { mode: 'http' } }) as Record<
      string,
      unknown
    >;
    expect(parsed.transport).toEqual({
      mode: 'http',
      host: '127.0.0.1',
      port: 3000,
      allowed_origins: [],
      allowed_hosts: [],
    });
  });

  it('keeps allowed_hosts from a config block (not silently stripped)', () => {
    const parsed = ConfigSchema.parse({
      providers: {},
      transport: { mode: 'http', allowed_hosts: ['duck.example.com'] },
    }) as Record<string, unknown>;
    expect((parsed.transport as { allowed_hosts?: unknown }).allowed_hosts).toEqual([
      'duck.example.com',
    ]);
  });

  it('rejects a non-string allowed_hosts entry', () => {
    const parsed = ConfigSchema.safeParse({
      providers: {},
      transport: { mode: 'http', allowed_hosts: [42] },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('AC-R2JF6A.8: README documents the transport variables', () => {
  const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf-8');

  it.each(TRANSPORT_VARS)('README mentions %s', (name) => {
    expect(readme).toContain(name);
  });
});
