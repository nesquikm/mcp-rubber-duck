import { spawn, type ChildProcess } from 'child_process';
import { request as httpRequest } from 'http';
import { createServer, connect } from 'net';
import type { AddressInfo } from 'net';
import { join } from 'path';

/**
 * Helpers for the HTTP-transport e2e suites (FR R2JF6A): spawn the BUILT
 * server with `MCP_TRANSPORT=http` on an ephemeral port, and post raw
 * JSON-RPC with full control over headers (including `Host`).
 */
export const DIST_INDEX = join(process.cwd(), 'dist', 'index.js');
export const MODERN = '2026-07-28';
export const LEGACY = '2025-11-25';

/** A TCP port that was free a moment ago (listen on 0, read it, close). */
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** Whether something accepts TCP connections on host:port right now. */
export function isListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

export interface SpawnedServer {
  child: ChildProcess;
  port: number;
  url: string;
  stderr: () => string;
  stop: () => Promise<void>;
}

export interface ExitOutcome {
  /** Exit code, or null when the process did not exit within the bound. */
  code: number | null;
  stderr: string;
}

/** Spawn the built server with `env` (stdin kept open, stderr captured). */
export function spawnServer(
  env: Record<string, string>,
  cwd: string
): {
  child: ChildProcess;
  stderr: () => string;
  exited: (timeoutMs: number) => Promise<ExitOutcome>;
  stop: () => Promise<void>;
} {
  const child = spawn(process.execPath, [DIST_INDEX], {
    env,
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr?.setEncoding('utf-8');
  child.stderr?.on('data', (chunk: string) => (stderr += chunk));
  child.stdout?.resume();
  let exitCode: number | null = null;
  let hasExited = false;
  const exitPromise = new Promise<void>((resolve) =>
    child.once('exit', (code) => {
      exitCode = code ?? 1;
      hasExited = true;
      resolve();
    })
  );
  return {
    child,
    stderr: () => stderr,
    exited: async (timeoutMs) => {
      await Promise.race([exitPromise, new Promise((r) => setTimeout(r, timeoutMs))]);
      return { code: hasExited ? exitCode : null, stderr };
    },
    stop: async () => {
      if (hasExited) return;
      child.kill('SIGTERM');
      await Promise.race([exitPromise, new Promise((r) => setTimeout(r, 5000))]);
      if (!hasExited) {
        child.kill('SIGKILL');
        await exitPromise;
      }
    },
  };
}

/**
 * Spawn the built server in HTTP mode on a fresh port and wait (bounded) until
 * the port accepts connections. Throws with the server's stderr on failure.
 */
export async function startHttpServer(
  baseEnv: Record<string, string>,
  cwd: string,
  extra: Record<string, string> = {}
): Promise<SpawnedServer> {
  const port = await freePort();
  const spawned = spawnServer(
    {
      ...baseEnv,
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PORT: String(port),
      ...extra,
    },
    cwd
  );
  const deadline = Date.now() + 20000;
  for (;;) {
    if (await isListening(port)) break;
    const early = await spawned.exited(0);
    if (early.code !== null) {
      throw new Error(`HTTP server exited with ${early.code} before listening:\n${early.stderr}`);
    }
    if (Date.now() > deadline) {
      await spawned.stop();
      throw new Error(
        `Timed out after 20000ms waiting for the HTTP server to listen on ${port}:\n${spawned.stderr()}`
      );
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    child: spawned.child,
    port,
    url: `http://127.0.0.1:${port}/mcp`,
    stderr: spawned.stderr,
    stop: spawned.stop,
  };
}

export interface RawHttpResponse {
  status: number;
  contentType: string;
  body: string;
  /** JSON-RPC messages in arrival order: the JSON body, or each SSE `data:` event. */
  messages: Record<string, unknown>[];
}

/** Parse a JSON or SSE body into JSON-RPC messages, in order. */
export function parseMessages(contentType: string, body: string): Record<string, unknown>[] {
  if (contentType.includes('text/event-stream')) {
    const out: Record<string, unknown>[] = [];
    for (const event of body.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      try {
        out.push(JSON.parse(data) as Record<string, unknown>);
      } catch {
        // keep-alive or non-JSON event
      }
    }
    return out;
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    return parsed && typeof parsed === 'object' ? [parsed as Record<string, unknown>] : [];
  } catch {
    return [];
  }
}

/**
 * POST `body` to `url` with node:http (so `Host` can be set), read the whole
 * response, and parse its JSON-RPC messages. Bounded by `timeoutMs`.
 */
export function rawPost(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 30000
): Promise<RawHttpResponse> {
  const target = new URL(url);
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'content-length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => {
          clearTimeout(timer);
          const contentType = String(res.headers['content-type'] ?? '');
          resolve({
            status: res.statusCode ?? 0,
            contentType,
            body: text,
            messages: parseMessages(contentType, text),
          });
        });
      }
    );
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for POST ${url}`));
    }, timeoutMs);
    req.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.end(payload);
  });
}

/** The 2026-07-28 modern-era HTTP routing headers for one JSON-RPC request. */
export function modernHeaders(message: {
  method: string;
  params?: Record<string, unknown>;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'mcp-protocol-version': MODERN,
    'mcp-method': message.method,
  };
  const params = message.params ?? {};
  if (message.method === 'tools/call' && typeof params.name === 'string') {
    headers['mcp-name'] = params.name;
  }
  if (message.method.startsWith('tasks/') && typeof params.taskId === 'string') {
    headers['mcp-name'] = params.taskId;
  }
  return headers;
}
