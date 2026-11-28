import { describe, it, expect, jest, beforeAll, afterAll, afterEach } from '@jest/globals';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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

/**
 * AC-R2JF69.10: drive the tasks extension (AC.2–AC.4) end-to-end against the
 * BUILT server (dist/index.js) over stdio with raw newline-delimited JSON-RPC,
 * because the v2 SDK client rejects `resultType: 'task'` from tools/call. The
 * providers are the local mock OpenAI-compatible server. Run `npm run build`
 * first; this suite builds nothing.
 */
jest.setTimeout(60000);

const DIST_INDEX = join(process.cwd(), 'dist', 'index.js');
const ITERATE_ARGS = {
  prompt: 'e2e task',
  providers: ['mocka', 'mockb'],
  mode: 'refine',
  iterations: 1,
};

let mock: MockOpenAI;
let sandbox: string;
let child: ChildProcessWithoutNullStreams;
let rpc: RawJsonRpc;
let discover: JsonRpcResponse;

beforeAll(async () => {
  if (!existsSync(DIST_INDEX)) {
    throw new Error(`Missing ${DIST_INDEX}: run \`npm run build\` before \`npm run test:e2e\`.`);
  }
  mock = await startMockOpenAI();
  sandbox = mkdtempSync(join(tmpdir(), 'duck-e2e-tasks-'));
  child = spawn(process.execPath, [DIST_INDEX], {
    cwd: sandbox,
    env: { ...mockProviderEnv(mock.baseUrl), HOME: sandbox, PATH: process.env.PATH ?? '' },
    stdio: ['pipe', 'pipe', 'ignore'],
  }) as unknown as ChildProcessWithoutNullStreams;
  rpc = new RawJsonRpc((message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }, modernMeta({ tasks: true }));
  let buffer = '';
  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        rpc.receive(JSON.parse(line));
      } catch {
        // Not a JSON-RPC frame; stdout must stay framed, but ignore noise here.
      }
    }
  });
  discover = await rpc.request('server/discover');
  if (discover.error) {
    throw new Error(`server/discover failed: ${JSON.stringify(discover.error)}`);
  }
});

afterEach(() => {
  mock.release();
  mock.setMode('reply');
});

afterAll(async () => {
  mock?.release();
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    await exited;
  }
  await mock?.close();
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

const isTerminalResponse = (r: JsonRpcResponse) =>
  r.error !== undefined || (r.result?.status !== 'working' && r.result?.status !== undefined);

async function createIterateTask(): Promise<Record<string, unknown>> {
  const response = await rpc.request(
    'tools/call',
    { name: 'duck_iterate', arguments: ITERATE_ARGS },
    5000
  );
  if (response.error) {
    throw new Error(`tools/call errored: ${JSON.stringify(response.error)}`);
  }
  return response.result ?? {};
}

describe('AC-R2JF69.10: tasks over stdio with raw JSON-RPC (built server)', () => {
  it('AC.2: tools/call with the extension declared returns a working CreateTaskResult', async () => {
    mock.setMode('hold');
    const response = await rpc.request(
      'tools/call',
      { name: 'duck_iterate', arguments: ITERATE_ARGS },
      5000
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
