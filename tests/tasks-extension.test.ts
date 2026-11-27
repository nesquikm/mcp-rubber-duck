import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { readFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Ajv from 'ajv';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { RubberDuckServer } from '../src/server.js';
import {
  isolateEnv,
  mockProviderEnv,
  startMockOpenAI,
  type MockOpenAI,
} from './helpers/mock-openai.js';
import {
  ISO_TIMESTAMP,
  RawJsonRpc,
  TASKS_EXTENSION,
  ackBody,
  modernMeta,
  pollTask,
  waitUntil,
  type JsonRpcResponse,
} from './helpers/raw-jsonrpc.js';

/**
 * FR R2JF69: the hand-built io.modelcontextprotocol/tasks extension for
 * duck_iterate and duck_debate, served in-process through serveStdio(factory)
 * on an in-memory transport. The task path is driven with raw JSON-RPC because
 * the v2 SDK client rejects `resultType: 'task'` from tools/call.
 */
jest.setTimeout(30000);

const ITERATE_ARGS = {
  prompt: 'task please',
  providers: ['mocka', 'mockb'],
  mode: 'refine',
  iterations: 1,
};
const DEBATE_ARGS = { prompt: 'task please', format: 'oxford', rounds: 1 };
const TASK_TOOLS: [string, Record<string, unknown>][] = [
  ['duck_iterate', ITERATE_ARGS],
  ['duck_debate', DEBATE_ARGS],
];

interface ToolLike {
  name: string;
  outputSchema?: Record<string, unknown>;
}
const debateOutputSchema = (
  JSON.parse(
    readFileSync(join(process.cwd(), 'tests', 'fixtures', 'mcp-surface', 'tools-bridge-off.json'), 'utf-8')
  ) as ToolLike[]
).find((t) => t.name === 'duck_debate')!.outputSchema!;

type AjvClass = new (opts: { strict: boolean }) => {
  compile: (schema: object) => (data: unknown) => boolean;
};
// ajv is CommonJS; under ESM the class may sit on `.default`.
const AjvCtor = ((Ajv as unknown as { default?: AjvClass }).default ??
  (Ajv as unknown as AjvClass));
const validateDebate = new AjvCtor({ strict: false }).compile(debateOutputSchema);

/** Only `Date` is faked: real timers keep the transport and the mock HTTP server running. */
type ModernFakeConfig = Extract<Parameters<typeof jest.useFakeTimers>[0], { doNotFake?: unknown }>;
const FAKE_DATE_ONLY: ModernFakeConfig = {
  doNotFake: [
    'hrtime',
    'nextTick',
    'performance',
    'queueMicrotask',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'cancelIdleCallback',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
  ],
};

interface ModernSession {
  rpc: RawJsonRpc;
  discover: JsonRpcResponse;
  built: unknown[];
  close: () => Promise<void>;
}

/** Open a 2026-07-28 raw connection (server/discover first) with or without the extension. */
async function modernSession(server: RubberDuckServer, tasks: boolean): Promise<ModernSession> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const built: unknown[] = [];
  const handle = serveStdio(
    () => {
      const instance = server.buildMcpServer();
      built.push(instance);
      return instance;
    },
    { transport: serverTransport }
  );
  const rpc = new RawJsonRpc(
    (message) => clientTransport.send(message as never),
    modernMeta({ tasks })
  );
  clientTransport.onmessage = (message) => rpc.receive(message);
  await clientTransport.start();
  const discover = await rpc.request('server/discover');
  return {
    rpc,
    discover,
    built,
    close: async () => {
      await clientTransport.close();
      await handle.close();
    },
  };
}

/** A 2025-11-25 SDK client connection (synchronous path only). */
async function legacyClient(server: RubberDuckServer) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => server.buildMcpServer(), { transport: serverTransport });
  const client = new Client(
    { name: 'tasks-legacy-test', version: '1.0.0' },
    { supportedProtocolVersions: ['2025-11-25'] }
  );
  await client.connect(clientTransport);
  if (client.getProtocolEra() !== 'legacy') {
    throw new Error(`expected era legacy, negotiated ${client.getProtocolEra()}`);
  }
  return {
    client,
    close: async () => {
      await client.close();
      await handle.close();
    },
  };
}

const isTerminalResponse = (r: JsonRpcResponse) =>
  r.error !== undefined || (r.result?.status !== 'working' && r.result?.status !== undefined);

let mock: MockOpenAI;
let home: string;
let server: RubberDuckServer;
const saved = { ...process.env };
const sessions: { close: () => Promise<void> }[] = [];

async function tasksSession(): Promise<ModernSession> {
  const session = await modernSession(server, true);
  sessions.push(session);
  return session;
}

/** tools/call with the extension declared; returns the CreateTaskResult. */
async function createTask(
  rpc: RawJsonRpc,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // A CreateTaskResult comes back before the work runs, so a short bound suffices.
  const response = await rpc.request('tools/call', { name, arguments: args }, 5000);
  if (response.error) {
    throw new Error(`tools/call ${name} errored: ${JSON.stringify(response.error)}`);
  }
  return response.result ?? {};
}

beforeAll(async () => {
  mock = await startMockOpenAI();
  home = mkdtempSync(join(tmpdir(), 'duck-tasks-'));
  isolateEnv({ ...mockProviderEnv(mock.baseUrl), HOME: home });
  server = new RubberDuckServer();
});

afterAll(async () => {
  mock?.release();
  await server?.stop();
  await mock?.close();
  process.env = { ...saved };
  if (home) rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  mock.setMode('reply');
});

afterEach(async () => {
  jest.useRealTimers();
  mock.release();
  mock.setMode('reply');
  for (const session of sessions.splice(0)) await session.close();
});

describe('AC-R2JF69.1: the extension is advertised on 2026-07-28 only', () => {
  it('server/discover capabilities include extensions["io.modelcontextprotocol/tasks"]', async () => {
    const { discover } = await tasksSession();
    const capabilities = (discover.result?.capabilities ?? {}) as {
      extensions?: Record<string, unknown>;
    };
    expect(capabilities.extensions?.[TASKS_EXTENSION]).toEqual(expect.any(Object));
  });

  it('2025-11-25 initialize capabilities include no tasks key', async () => {
    const legacy = await legacyClient(server);
    sessions.push(legacy);
    const capabilities = legacy.client.getServerCapabilities() ?? {};
    // Precondition: capabilities were actually negotiated.
    expect(Object.keys(capabilities)).toContain('tools');
    expect(Object.keys(capabilities)).not.toContain('tasks');
  });
});

describe('AC-R2JF69.2: tools/call returns a CreateTaskResult when the envelope declares the extension', () => {
  it.each(TASK_TOOLS)('%s returns resultType task, status working', async (name, args) => {
    mock.setMode('hold');
    const { rpc } = await tasksSession();
    const response = await rpc.request('tools/call', { name, arguments: args }, 5000);
    expect(response.error).toBeUndefined();
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
});

describe('AC-R2JF69.3: tasks/get', () => {
  it('reports completed with the duck_iterate tool result once the work finishes', async () => {
    const { rpc } = await tasksSession();
    const task = await createTask(rpc, 'duck_iterate', ITERATE_ARGS);
    const done = await pollTask(rpc, task.taskId as string, isTerminalResponse, 'iterate terminal');
    const result = done.result?.result as { content?: { type: string; text: string }[] } | undefined;
    expect({
      status: done.result?.status,
      firstText: result?.content?.[0]?.text.includes('Iterative Refinement Results'),
    }).toEqual({ status: 'completed', firstText: true });
  });

  it('reports completed with a duck_debate result whose structuredContent fits its outputSchema', async () => {
    const { rpc } = await tasksSession();
    const task = await createTask(rpc, 'duck_debate', DEBATE_ARGS);
    const done = await pollTask(rpc, task.taskId as string, isTerminalResponse, 'debate terminal');
    const result = done.result?.result as { structuredContent?: unknown } | undefined;
    expect({
      status: done.result?.status,
      valid: validateDebate(result?.structuredContent),
    }).toEqual({ status: 'completed', valid: true });
  });

  it('reports failed with a JSON-RPC error when the work throws', async () => {
    mock.setMode('fail');
    const { rpc } = await tasksSession();
    const task = await createTask(rpc, 'duck_iterate', ITERATE_ARGS);
    const done = await pollTask(rpc, task.taskId as string, isTerminalResponse, 'failed task');
    expect(done.result).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({ code: expect.any(Number), message: expect.any(String) }),
      })
    );
  });

  it('returns -32602 for an unknown task id', async () => {
    const { rpc } = await tasksSession();
    const response = await rpc.request('tasks/get', { taskId: 'no-such-task-id' });
    expect(response.error?.code).toBe(-32602);
  });
});

describe('AC-R2JF69.4: tasks/cancel aborts the running work', () => {
  async function heldTask() {
    mock.setMode('hold');
    const session = await tasksSession();
    const heldBefore = mock.held();
    const task = await createTask(session.rpc, 'duck_iterate', ITERATE_ARGS);
    await waitUntil(() => mock.held() > heldBefore, 'the provider call to be in flight');
    return { rpc: session.rpc, taskId: task.taskId as string };
  }

  it('returns an empty acknowledgement', async () => {
    const { rpc, taskId } = await heldTask();
    const response = await rpc.request('tasks/cancel', { taskId });
    expect({ error: response.error, body: ackBody(response.result) }).toEqual({
      error: undefined,
      body: {},
    });
  });

  it('a following tasks/get reports cancelled', async () => {
    const { rpc, taskId } = await heldTask();
    await rpc.request('tasks/cancel', { taskId });
    const response = await rpc.request('tasks/get', { taskId });
    expect(response.result?.status).toBe('cancelled');
  });

  it('the in-flight provider call receives the abort', async () => {
    const { rpc, taskId } = await heldTask();
    const abortedBefore = mock.aborted();
    await rpc.request('tasks/cancel', { taskId });
    await waitUntil(
      () => mock.aborted() > abortedBefore,
      'the mock provider to see the held completion aborted'
    );
    expect(mock.aborted()).toBe(abortedBefore + 1);
  });
});

describe('AC-R2JF69.4: tasks/cancel aborts a running duck_debate task', () => {
  async function heldDebateTask() {
    mock.setMode('hold');
    const session = await tasksSession();
    const heldBefore = mock.held();
    const task = await createTask(session.rpc, 'duck_debate', DEBATE_ARGS);
    await waitUntil(() => mock.held() > heldBefore, 'the debate provider call to be in flight');
    return { rpc: session.rpc, taskId: task.taskId as string };
  }

  it('duck_debate: returns an empty acknowledgement', async () => {
    const { rpc, taskId } = await heldDebateTask();
    const response = await rpc.request('tasks/cancel', { taskId });
    expect({ error: response.error, body: ackBody(response.result) }).toEqual({
      error: undefined,
      body: {},
    });
  });

  it('duck_debate: a following tasks/get reports cancelled', async () => {
    const { rpc, taskId } = await heldDebateTask();
    await rpc.request('tasks/cancel', { taskId });
    const response = await rpc.request('tasks/get', { taskId });
    expect(response.result?.status).toBe('cancelled');
  });

  it('duck_debate: the in-flight provider call receives the abort', async () => {
    const { rpc, taskId } = await heldDebateTask();
    const abortedBefore = mock.aborted();
    await rpc.request('tasks/cancel', { taskId });
    // Bounded wait that does not throw, so a missing abort fails at the assertion below.
    for (let i = 0; i < 200 && mock.aborted() === abortedBefore; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(mock.aborted()).toBe(abortedBefore + 1);
  });
});

describe('FR R2JF69 Technical Design: task progress surfaces through statusMessage and lastUpdatedAt', () => {
  const T0 = Date.UTC(2026, 10, 27, 12, 0, 0);
  const PROGRESS_TOKEN = 'r2jf69-progress-token';
  const TWO_ROUNDS = { ...ITERATE_ARGS, iterations: 2 };

  /**
   * A duck_iterate task whose first provider call is answered and whose second is
   * held. Date is faked and moved 5 s forward before the first answer, so any
   * update after creation carries a later timestamp.
   */
  async function progressedTask() {
    jest.useFakeTimers({ ...FAKE_DATE_ONLY, now: T0 });
    mock.setMode('hold');
    const session = await tasksSession();
    const progressAfterCreate: unknown[] = [];
    let created = false;
    const receive = session.rpc.receive.bind(session.rpc);
    session.rpc.receive = (message: unknown) => {
      const m = message as { method?: string; params?: { progressToken?: unknown } };
      if (
        created &&
        m?.method === 'notifications/progress' &&
        m.params?.progressToken === PROGRESS_TOKEN
      ) {
        progressAfterCreate.push(message);
      }
      receive(message);
    };
    const response = await session.rpc.request(
      'tools/call',
      { name: 'duck_iterate', arguments: TWO_ROUNDS, _meta: { progressToken: PROGRESS_TOKEN } },
      5000
    );
    created = true;
    if (response.error) throw new Error(`tools/call errored: ${JSON.stringify(response.error)}`);
    const task = response.result ?? {};
    const taskId = task.taskId as string;
    await waitUntil(() => mock.held() === 1, 'the round-1 provider call to be in flight');
    jest.setSystemTime(T0 + 5000);
    mock.release();
    await waitUntil(() => mock.held() === 1, 'the round-2 provider call to be in flight');
    return { rpc: session.rpc, taskId, createdAt: task.createdAt as string, progressAfterCreate };
  }

  it('statusMessage: a working task reports a non-empty statusMessage after a provider call', async () => {
    const { rpc, taskId } = await progressedTask();
    const response = await rpc.request('tasks/get', { taskId });
    expect({
      status: response.result?.status,
      statusMessage:
        typeof response.result?.statusMessage === 'string' && response.result.statusMessage.length > 0,
    }).toEqual({ status: 'working', statusMessage: true });
  });

  it('statusMessage: lastUpdatedAt moves past createdAt as the work progresses', async () => {
    const { rpc, taskId, createdAt } = await progressedTask();
    const response = await rpc.request('tasks/get', { taskId });
    // Precondition: createdAt is the faked creation instant.
    expect(createdAt).toBe(new Date(T0).toISOString());
    expect(response.result?.lastUpdatedAt).toBe(new Date(T0 + 5000).toISOString());
  });

  it('statusMessage: no notifications/progress for the request arrive after the CreateTaskResult', async () => {
    const { rpc, taskId, progressAfterCreate } = await progressedTask();
    mock.setMode('reply');
    mock.release();
    const done = await pollTask(rpc, taskId, isTerminalResponse, 'progressed task terminal');
    expect({ status: done.result?.status, progress: progressAfterCreate }).toEqual({
      status: 'completed',
      progress: [],
    });
  });
});

describe('AC-R2JF69.5: retention window (fake Date)', () => {
  const T0 = Date.UTC(2026, 10, 27, 12, 0, 0);

  it('a non-terminal task is still present after its ttlMs has elapsed', async () => {
    jest.useFakeTimers({ ...FAKE_DATE_ONLY, now: T0 });
    mock.setMode('hold');
    const { rpc } = await tasksSession();
    const task = await createTask(rpc, 'duck_iterate', ITERATE_ARGS);
    jest.setSystemTime(T0 + (task.ttlMs as number) + 60_000);
    const response = await rpc.request('tasks/get', { taskId: task.taskId });
    expect(response.result?.status).toBe('working');
  });

  async function completedTask() {
    jest.useFakeTimers({ ...FAKE_DATE_ONLY, now: T0 });
    const { rpc } = await tasksSession();
    const task = await createTask(rpc, 'duck_iterate', ITERATE_ARGS);
    const done = await pollTask(rpc, task.taskId as string, isTerminalResponse, 'task terminal');
    // Precondition: the retention window under test opens on completion.
    if (done.result?.status !== 'completed') {
      throw new Error(`expected a completed task, got ${JSON.stringify(done)}`);
    }
    return { rpc, taskId: task.taskId as string, ttlMs: task.ttlMs as number };
  }

  it('a terminal task is present at ttlMs - 1 ms after completion', async () => {
    const { rpc, taskId, ttlMs } = await completedTask();
    jest.setSystemTime(T0 + ttlMs - 1);
    const response = await rpc.request('tasks/get', { taskId });
    expect(response.result?.status).toBe('completed');
  });

  it('a terminal task returns -32602 at ttlMs + 1 ms after completion', async () => {
    const { rpc, taskId, ttlMs } = await completedTask();
    jest.setSystemTime(T0 + ttlMs + 1);
    const response = await rpc.request('tasks/get', { taskId });
    expect(response.error?.code).toBe(-32602);
  });
});

describe('AC-R2JF69.6: synchronous result without the extension', () => {
  const iterateShape = (result: Record<string, unknown> | undefined) => {
    const content = (result?.content ?? []) as { type: string; text: string }[];
    return {
      taskId: result?.taskId,
      contentTypes: content.map((c) => c.type),
      header: content[0]?.text.includes('**Mode:** refine') ?? false,
      structuredContent: result?.structuredContent,
    };
  };
  const ITERATE_SYNC = {
    taskId: undefined,
    contentTypes: ['text'],
    header: true,
    structuredContent: undefined,
  };

  const debateShape = (result: Record<string, unknown> | undefined) => {
    const content = (result?.content ?? []) as { type: string; text: string }[];
    let second: unknown;
    try {
      second = JSON.parse(content[1]?.text ?? 'null');
    } catch {
      second = 'unparseable';
    }
    return {
      taskId: result?.taskId,
      contentTypes: content.map((c) => c.type),
      secondIsStructured:
        JSON.stringify(second) === JSON.stringify(result?.structuredContent ?? null),
      valid: validateDebate(result?.structuredContent),
    };
  };
  const DEBATE_SYNC = {
    taskId: undefined,
    contentTypes: ['text', 'text'],
    secondIsStructured: true,
    valid: true,
  };

  it('2026-07-28 duck_iterate without the extension returns the synchronous shape', async () => {
    const session = await modernSession(server, false);
    sessions.push(session);
    const response = await session.rpc.request('tools/call', {
      name: 'duck_iterate',
      arguments: ITERATE_ARGS,
    });
    expect({ resultType: response.result?.resultType, ...iterateShape(response.result) }).toEqual({
      resultType: 'complete',
      ...ITERATE_SYNC,
    });
  });

  it('2026-07-28 duck_debate without the extension returns the synchronous shape', async () => {
    const session = await modernSession(server, false);
    sessions.push(session);
    const response = await session.rpc.request('tools/call', {
      name: 'duck_debate',
      arguments: DEBATE_ARGS,
    });
    expect({ resultType: response.result?.resultType, ...debateShape(response.result) }).toEqual({
      resultType: 'complete',
      ...DEBATE_SYNC,
    });
  });

  it('2025-11-25 duck_iterate returns the synchronous shape', async () => {
    const legacy = await legacyClient(server);
    sessions.push(legacy);
    const result = await legacy.client.callTool({ name: 'duck_iterate', arguments: ITERATE_ARGS });
    expect(iterateShape(result as Record<string, unknown>)).toEqual(ITERATE_SYNC);
  });

  it('2025-11-25 duck_debate returns the synchronous shape', async () => {
    const legacy = await legacyClient(server);
    sessions.push(legacy);
    const result = await legacy.client.callTool({ name: 'duck_debate', arguments: DEBATE_ARGS });
    expect(debateShape(result as Record<string, unknown>)).toEqual(DEBATE_SYNC);
  });
});

describe('AC-R2JF69.7: the task store is shared across buildMcpServer() instances', () => {
  it('a task created through one instance is returned by tasks/get on a second instance', async () => {
    mock.setMode('hold');
    const first = await tasksSession();
    const task = await createTask(first.rpc, 'duck_iterate', ITERATE_ARGS);
    const second = await tasksSession();
    // Precondition: the two connections really run on separately built instances.
    if (first.built.some((instance) => second.built.includes(instance))) {
      throw new Error('expected the second connection to build its own McpServer');
    }
    const response = await second.rpc.request('tasks/get', { taskId: task.taskId });
    expect(response.result).toEqual(
      expect.objectContaining({ taskId: task.taskId, status: 'working' })
    );
  });
});

describe('AC-R2JF69.9: tasks/update', () => {
  async function heldTask() {
    mock.setMode('hold');
    const { rpc } = await tasksSession();
    const task = await createTask(rpc, 'duck_iterate', ITERATE_ARGS);
    return { rpc, taskId: task.taskId as string };
  }
  const RESPONSES = { 'unknown-key': { action: 'accept', content: {} } };

  it('returns an empty acknowledgement for unknown inputResponses keys', async () => {
    const { rpc, taskId } = await heldTask();
    const response = await rpc.request('tasks/update', { taskId, inputResponses: RESPONSES });
    expect({ error: response.error, body: ackBody(response.result) }).toEqual({
      error: undefined,
      body: {},
    });
  });

  it('acknowledges an already-answered key again without error', async () => {
    const { rpc, taskId } = await heldTask();
    await rpc.request('tasks/update', { taskId, inputResponses: RESPONSES });
    const again = await rpc.request('tasks/update', { taskId, inputResponses: RESPONSES });
    expect({ error: again.error, body: ackBody(again.result) }).toEqual({
      error: undefined,
      body: {},
    });
  });

  it('leaves the task working after ignored inputResponses', async () => {
    const { rpc, taskId } = await heldTask();
    await rpc.request('tasks/update', { taskId, inputResponses: RESPONSES });
    const response = await rpc.request('tasks/get', { taskId });
    expect(response.result?.status).toBe('working');
  });
});
