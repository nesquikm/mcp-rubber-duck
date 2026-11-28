import { describe, it, expect, jest, beforeAll, afterAll, afterEach } from '@jest/globals';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { mockProviderEnv, startMockOpenAI, type MockOpenAI } from '../helpers/mock-openai.js';
import {
  ISO_TIMESTAMP,
  RawJsonRpc,
  ackBody,
  modernMeta,
  pollTask,
  waitUntil,
  type JsonRpcResponse,
} from '../helpers/raw-jsonrpc.js';
import {
  DIST_INDEX,
  LEGACY,
  modernHeaders,
  rawPost,
  startHttpServer,
  type RawHttpResponse,
  type SpawnedServer,
} from '../helpers/http-server.js';

/**
 * AC-R2JF6A.7 and AC-R2JF6A.9: the task path of AC-R2JF69.10 repeated over the
 * opt-in Streamable HTTP transport of the BUILT server. Every JSON-RPC request
 * is its own HTTP POST (stateless), so a task created by one request must be
 * found by `tasks/get` in a later one carrying `Mcp-Name: <taskId>`. Modern era
 * uses raw JSON-RPC (the v2 client rejects `resultType: 'task'`); the legacy
 * era gets the synchronous result (R2JF69: 2025-11-25 clients have no task mode).
 */
jest.setTimeout(90000);

const ITERATE_ARGS = {
  prompt: 'e2e task',
  providers: ['mocka', 'mockb'],
  mode: 'refine',
  iterations: 1,
};

let mock: MockOpenAI;
let sandbox: string;
let server: SpawnedServer;
let rpc: RawJsonRpc;
/** Every raw HTTP exchange, in order, with the headers it was sent with. */
const exchanges: { headers: Record<string, string>; response: RawHttpResponse }[] = [];

beforeAll(async () => {
  if (!existsSync(DIST_INDEX)) {
    throw new Error(`Missing ${DIST_INDEX}: run \`npm run build\` before \`npm run test:e2e\`.`);
  }
  mock = await startMockOpenAI();
  sandbox = mkdtempSync(join(tmpdir(), 'duck-e2e-tasks-http-'));
  server = await startHttpServer(
    { ...mockProviderEnv(mock.baseUrl), HOME: sandbox, PATH: process.env.PATH ?? '' },
    sandbox
  );
  rpc = new RawJsonRpc(
    async (message) => {
      const headers = modernHeaders(
        message as { method: string; params?: Record<string, unknown> }
      );
      const response = await rawPost(server.url, message, headers);
      exchanges.push({ headers, response });
      if (response.messages.length === 0) {
        // Surface a non-JSON-RPC HTTP answer (401/403/400 bodies) as an error reply.
        rpc.receive({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -response.status, message: `HTTP ${response.status}: ${response.body}` },
        });
      }
      for (const m of response.messages) rpc.receive(m);
    },
    modernMeta({ tasks: true })
  );
});

afterEach(() => {
  mock.release();
  mock.setMode('reply');
});

afterAll(async () => {
  mock?.release();
  await server?.stop();
  await mock?.close();
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

const isTerminalResponse = (r: JsonRpcResponse) =>
  r.error !== undefined || (r.result?.status !== 'working' && r.result?.status !== undefined);

async function createIterateTask(): Promise<Record<string, unknown>> {
  const response = await rpc.request(
    'tools/call',
    { name: 'duck_iterate', arguments: ITERATE_ARGS },
    10000
  );
  if (response.error) {
    throw new Error(`tools/call errored: ${JSON.stringify(response.error)}`);
  }
  return response.result ?? {};
}

describe('AC-R2JF6A.7: a task outlives the HTTP request that created it', () => {
  it('tasks/get in a later HTTP request carrying Mcp-Name: <taskId> returns the task', async () => {
    mock.setMode('hold');
    const task = await createIterateTask();
    const taskId = task.taskId as string;
    const before = exchanges.length;
    const got = await rpc.request('tasks/get', { taskId });
    const sent = exchanges[before]?.headers ?? {};
    expect({
      created: task.resultType,
      mcpName: sent['mcp-name'],
      error: got.error,
      taskId: got.result?.taskId,
      status: got.result?.status,
    }).toEqual({
      created: 'task',
      mcpName: taskId,
      error: undefined,
      taskId,
      status: 'working',
    });
  });
});

describe('AC-R2JF6A.9: the AC-R2JF69.10 task path over HTTP (modern era, raw JSON-RPC)', () => {
  it('AC.2: tools/call with the extension declared returns a working CreateTaskResult', async () => {
    mock.setMode('hold');
    const response = await rpc.request(
      'tools/call',
      { name: 'duck_iterate', arguments: ITERATE_ARGS },
      10000
    );
    expect(response.result).toEqual(
      expect.objectContaining({
        resultType: 'task',
        taskId: expect.stringMatching(/.+/),
        status: 'working',
        createdAt: expect.stringMatching(ISO_TIMESTAMP),
        lastUpdatedAt: expect.stringMatching(ISO_TIMESTAMP),
        ttlMs: expect.any(Number),
        pollIntervalMs: expect.any(Number),
      })
    );
  });

  it('AC.3: tasks/get reports completed with the tool result once the work finishes', async () => {
    const task = await createIterateTask();
    const done = await pollTask(rpc, task.taskId as string, isTerminalResponse, 'iterate terminal');
    const result = done.result?.result as { content?: { text: string }[] } | undefined;
    expect({
      status: done.result?.status,
      header: result?.content?.[0]?.text.includes('Iterative Refinement Results'),
    }).toEqual({ status: 'completed', header: true });
  });

  it('AC.3: tasks/get reports failed with a JSON-RPC error when the work throws', async () => {
    mock.setMode('fail');
    const task = await createIterateTask();
    const done = await pollTask(rpc, task.taskId as string, isTerminalResponse, 'failed task');
    expect(done.result).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({ code: expect.any(Number), message: expect.any(String) }),
      })
    );
  });

  it('AC.3: tasks/get on an unknown id returns -32602', async () => {
    const response = await rpc.request('tasks/get', { taskId: 'no-such-task-id' });
    expect(response.error?.code).toBe(-32602);
  });

  it('AC.4: tasks/cancel acks, tasks/get reports cancelled, the provider call is aborted', async () => {
    mock.setMode('hold');
    const heldBefore = mock.held();
    const abortedBefore = mock.aborted();
    const task = await createIterateTask();
    await waitUntil(() => mock.held() > heldBefore, 'the provider call to be in flight');

    const cancel = await rpc.request('tasks/cancel', { taskId: task.taskId });
    const after = await rpc.request('tasks/get', { taskId: task.taskId });
    await waitUntil(
      () => mock.aborted() > abortedBefore,
      'the mock provider to see the held completion aborted'
    ).catch(() => undefined);

    expect({
      cancelError: cancel.error,
      cancelBody: ackBody(cancel.result),
      status: after.result?.status,
      providerAborted: mock.aborted() - abortedBefore,
    }).toEqual({ cancelError: undefined, cancelBody: {}, status: 'cancelled', providerAborted: 1 });
  });
});

describe('AC-R2JF6A.9: the task path over HTTP (legacy era, SDK client)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client(
      { name: 'e2e-http-legacy', version: '1.0.0' },
      { supportedProtocolVersions: [LEGACY] }
    );
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));
  });

  afterAll(async () => {
    await client?.close();
  });

  it('initialize advertises no tasks capability', () => {
    const capabilities = client.getServerCapabilities() ?? {};
    // Precondition: the legacy handshake reported capabilities at all.
    expect(Object.keys(capabilities)).toContain('tools');
    expect(Object.keys(capabilities)).not.toContain('tasks');
  });

  it('duck_iterate returns the synchronous result, not a task', async () => {
    const result = await client.callTool({ name: 'duck_iterate', arguments: ITERATE_ARGS });
    const text = (result.content as { type: string; text?: string }[])
      .map((c) => c.text ?? '')
      .join('\n');
    expect({
      isError: result.isError === true,
      header: text.includes('Iterative Refinement Results'),
    }).toEqual({ isError: false, header: true });
  });
});
