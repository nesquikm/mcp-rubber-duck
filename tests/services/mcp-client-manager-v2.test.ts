import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { join } from 'path';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { MCPClientManager, type MCPServerConfig } from '../../src/services/mcp-client-manager.js';

/**
 * AC-K1F5Q5.7: the MCP Bridge client (v2 @modelcontextprotocol/client) connects,
 * lists tools and calls a tool on a fixture MCP server over stdio and over
 * Streamable HTTP.
 */
const STDIO_FIXTURE = join(process.cwd(), 'tests', 'fixtures', 'mcp-echo-server.mjs');

function buildEchoServer(): McpServer {
  const server = new McpServer({ name: 'echo-fixture', version: '1.0.0' });
  server.registerTool(
    'echo',
    { description: 'Echo the text back', inputSchema: z.object({ text: z.string() }) },
    async ({ text }) => ({ content: [{ type: 'text' as const, text: `echo:${text}` }] })
  );
  return server;
}

/** Minimal node:http adapter onto the web-standard createMcpHandler. */
async function startHttpFixture(): Promise<{ url: string; close: () => Promise<void> }> {
  const handler = createMcpHandler(() => buildEchoServer());
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(', '));
      }
      const response = await handler.fetch(
        new Request(`http://127.0.0.1${req.url ?? '/'}`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        })
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          res.write(chunk);
        }
      }
      res.end();
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await handler.close();
    },
  };
}

describe.each(['stdio', 'http'] as const)('AC-K1F5Q5.7: MCPClientManager over %s', (type) => {
  let manager: MCPClientManager;
  let stopFixture: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    let config: MCPServerConfig;
    if (type === 'stdio') {
      config = {
        name: 'echo',
        type: 'stdio',
        command: process.execPath,
        args: [STDIO_FIXTURE, 'stdio'],
        retryAttempts: 0,
      };
    } else {
      const fixture = await startHttpFixture();
      stopFixture = fixture.close;
      config = { name: 'echo', type: 'http', url: fixture.url, retryAttempts: 0 };
    }
    manager = new MCPClientManager([config]);
    await manager.initialize();
  }, 30000);

  afterAll(async () => {
    await manager.disconnectAll();
    await stopFixture?.();
  });

  it('connects', () => {
    expect(manager.getConnectedServers()).toEqual(['echo']);
  });

  it('lists the fixture tool', async () => {
    const tools = await manager.listServerTools('echo');
    expect(tools.map((t) => ({ serverName: t.serverName, name: t.name }))).toEqual([
      { serverName: 'echo', name: 'echo' },
    ]);
  });

  it('calls the fixture tool and returns its result', async () => {
    const result = (await manager.callTool('echo', 'echo', { text: 'quack' })) as {
      content: { type: string; text: string }[];
    };
    expect(result.content).toEqual([{ type: 'text', text: 'echo:quack' }]);
  });
});
