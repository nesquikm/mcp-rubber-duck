import { timingSafeEqual } from 'crypto';
import { createServer } from 'http';
import { isIP } from 'net';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  createMcpHandler,
  type McpHandlerRequestOptions,
  type McpServerFactory,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from '@modelcontextprotocol/server';

export interface HttpBindOptions {
  host: string;
  token?: string;
}

export interface HttpGuardOptions extends HttpBindOptions {
  port: number;
  allowed_origins: string[];
}

export type FetchHandler = (req: Request, opts?: unknown) => Promise<Response>;

const LOOPBACK_HOSTS = new Set(['localhost', '::1', '[::1]']);

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(normalized)) return true;
  return isIP(normalized) === 4 && normalized.startsWith('127.');
}

/**
 * Returns an error message when the HTTP bind must be refused, undefined when allowed.
 * A non-loopback bind requires MCP_HTTP_TOKEN.
 */
export function validateHttpBind(options: HttpBindOptions): string | undefined {
  if (isLoopbackHost(options.host) || options.token) return undefined;
  return (
    `Refusing to bind the HTTP transport to non-loopback host "${options.host}" without a token. ` +
    'Set MCP_HTTP_TOKEN or bind to a loopback host.'
  );
}

function hasValidBearer(req: Request, token: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  // timingSafeEqual throws on a length mismatch; compare against itself to keep the timing flat.
  if (given.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(given, expected);
}

export function guardHttpFetch(next: FetchHandler, options: HttpGuardOptions): FetchHandler {
  const allowedHosts = [...localhostAllowedHostnames(), options.host];
  const allowedOrigins = [...localhostAllowedOrigins(), ...options.allowed_origins];
  return async (req, opts) => {
    if (options.token && !hasValidBearer(req, options.token)) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
      });
    }
    const rejected =
      hostHeaderValidationResponse(req, allowedHosts) ??
      originValidationResponse(req, allowedOrigins);
    if (rejected) return rejected;
    return next(req, opts);
  };
}

export interface HttpServeOptions extends HttpGuardOptions {
  onerror?: (error: Error) => void;
}

export interface HttpServerHandle {
  close(): Promise<void>;
}

/**
 * Serve MCP over Streamable HTTP on `host:port`: both protocol eras (legacy
 * traffic stateless), each request behind the bearer/Host/Origin guards.
 * Refuses a non-loopback bind without a token before listening.
 */
export async function serveHttp(
  factory: McpServerFactory,
  options: HttpServeOptions
): Promise<HttpServerHandle> {
  const refusal = validateHttpBind(options);
  if (refusal) throw new Error(refusal);

  const handler = createMcpHandler(factory, {
    legacy: 'stateless',
    responseMode: 'auto',
    onerror: options.onerror,
  });
  const guarded = guardHttpFetch(
    (req, opts) => handler.fetch(req, opts as McpHandlerRequestOptions),
    options
  );
  const nodeHandler = toNodeHandler({ fetch: guarded }, { onerror: options.onerror });
  const server = createServer((req, res) => void nodeHandler(req, res));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await handler.close();
    },
  };
}
