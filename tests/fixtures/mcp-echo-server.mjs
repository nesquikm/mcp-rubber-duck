// Fixture MCP server for AC-K1F5Q5.7 (MCP Bridge client over stdio and Streamable HTTP).
// Run directly with `node tests/fixtures/mcp-echo-server.mjs stdio` for the stdio leg;
// the HTTP leg imports buildEchoServer() and serves it through createMcpHandler.
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

export function buildEchoServer() {
  const server = new McpServer({ name: 'echo-fixture', version: '1.0.0' });
  server.registerTool(
    'echo',
    { description: 'Echo the text back', inputSchema: z.object({ text: z.string() }) },
    async ({ text }) => ({ content: [{ type: 'text', text: `echo:${text}` }] })
  );
  return server;
}

if (process.argv[2] === 'stdio') {
  serveStdio(() => buildEchoServer());
}
