/**
 * Raw JSON-RPC driver for the io.modelcontextprotocol/tasks extension tests.
 *
 * The v2 SDK client hard-rejects `resultType: 'task'` from tools/call, so the
 * task path is driven with hand-built JSON-RPC messages. The same driver works
 * over an in-memory transport (unit tests) and over a child's stdio (e2e): it
 * only needs a `write` function and to be fed every inbound message.
 */
export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
export const MODERN_VERSION = '2026-07-28';

/** The 2026-07-28 per-request envelope (`params._meta`). */
export function modernMeta(opts: { tasks: boolean }): Record<string, unknown> {
  return {
    'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
    'io.modelcontextprotocol/clientCapabilities': opts.tasks
      ? { extensions: { [TASKS_EXTENSION]: {} } }
      : {},
    'io.modelcontextprotocol/clientInfo': { name: 'raw-tasks-test', version: '1.0.0' },
  };
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: JsonRpcError;
}

export class RawJsonRpc {
  private nextId = 1;
  private readonly pending = new Map<number, (response: JsonRpcResponse) => void>();

  constructor(
    private readonly write: (message: Record<string, unknown>) => void | Promise<void>,
    private readonly meta: Record<string, unknown>
  ) {}

  /** Feed one inbound JSON-RPC message (responses resolve their request). */
  receive(message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const m = message as { id?: unknown; method?: unknown };
    if (typeof m.id !== 'number' || m.method !== undefined) return;
    const resolve = this.pending.get(m.id);
    if (!resolve) return;
    this.pending.delete(m.id);
    resolve(message as JsonRpcResponse);
  }

  /** Send a request carrying the envelope; resolves with the raw response. */
  async request(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 15000
  ): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const response = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for the ${method} response`));
      }, timeoutMs);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    await this.write({
      jsonrpc: '2.0',
      id,
      method,
      params: { ...params, _meta: { ...this.meta, ...(params._meta as object | undefined) } },
    });
    return response;
  }
}

/** A result with the protocol stamps (`_meta`, `resultType`) removed. */
export function ackBody(result: Record<string, unknown> | undefined): Record<string, unknown> {
  const { _meta: _m, resultType: _r, ...rest } = result ?? {};
  return rest;
}

/**
 * Poll `tasks/get` until `done` holds for the response. Bounded by an attempt
 * count (not a clock), so it also works while `Date` is faked.
 */
export async function pollTask(
  rpc: RawJsonRpc,
  taskId: string,
  done: (response: JsonRpcResponse) => boolean,
  what: string,
  attempts = 400,
  intervalMs = 25
): Promise<JsonRpcResponse> {
  let last: JsonRpcResponse | undefined;
  for (let i = 0; i < attempts; i++) {
    last = await rpc.request('tasks/get', { taskId });
    if (done(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Gave up after ${attempts} tasks/get polls waiting for ${what}; last: ${JSON.stringify(last)}`
  );
}

/** Wait for `predicate`, bounded by an attempt count (works under a faked `Date`). */
export async function waitUntil(
  predicate: () => boolean,
  what: string,
  attempts = 400,
  intervalMs = 25
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Gave up after ${attempts * intervalMs}ms waiting for ${what}`);
}

export const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
