import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

jest.mock('../src/utils/logger');
jest.mock('../src/services/mcp-client-manager.js');
jest.mock('../src/services/approval.js');
jest.mock('../src/services/function-bridge.js');

import { RubberDuckServer } from '../src/server.js';

/**
 * AC-K1F5Q5.3 baseline: the v1.20.15 MCP surface fixture under
 * tests/fixtures/mcp-surface/ was captured from the unmodified v1 tree with a
 * fixed environment (OPENAI_API_KEY=test-key only). This suite proves the
 * fixture still matches the server it was captured from.
 */
const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'mcp-surface');
const loadFixture = (file: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf-8'));

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

/** Pin the provider set: dotenv may have loaded real keys from a local .env. */
function isolateProviderEnv(bridge: boolean) {
  for (const key of Object.keys(process.env)) {
    if (/_API_KEY$/.test(key) || key.startsWith('CUSTOM_') || key.startsWith('CLI_')) {
      delete process.env[key];
    }
  }
  delete process.env.DEFAULT_PROVIDER;
  process.env.OPENAI_API_KEY = 'test-key';
  if (bridge) process.env.MCP_BRIDGE_ENABLED = 'true';
  else delete process.env.MCP_BRIDGE_ENABLED;
}

describe.each([
  ['bridge-off', false],
  ['bridge-on', true],
])('v1.20.15 MCP surface fixture (%s)', (variant, bridge) => {
  let client: Client;
  let server: RubberDuckServer;
  const saved = { ...process.env };

  beforeEach(async () => {
    isolateProviderEnv(bridge);
    server = new RubberDuckServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (server as any).server.connect(serverTransport);
    client = new Client({ name: 'fixture-test', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.stop();
    process.env = { ...saved };
  });

  it('tools/list matches the captured fixture', async () => {
    const tools = (await client.listTools()).tools.sort(byName);
    expect(JSON.parse(JSON.stringify(tools))).toEqual(loadFixture(`tools-${variant}.json`));
  });

  if (!bridge) {
    it('prompts/list matches the captured fixture', async () => {
      const prompts = (await client.listPrompts()).prompts.sort(byName);
      expect(JSON.parse(JSON.stringify(prompts))).toEqual(loadFixture('prompts.json'));
    });

    it('resources/list matches the captured fixture', async () => {
      const resources = (await client.listResources()).resources.sort((a, b) =>
        a.uri.localeCompare(b.uri)
      );
      expect(JSON.parse(JSON.stringify(resources))).toEqual(loadFixture('resources.json'));
    });
  }
});
