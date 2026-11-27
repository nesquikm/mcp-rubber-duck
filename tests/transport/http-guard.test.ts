import { describe, it, expect, jest } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { guardHttpFetch, validateHttpBind } from '../../src/transport/http.js';

/**
 * FR R2JF6A unit tests for the HTTP transport's request guard and bind check,
 * driven with crafted web-standard Requests (no socket, no server).
 *
 * Contract under test (src/transport/http.ts):
 * - `validateHttpBind({ host, token? })` returns an error message (string) when
 *   the bind is refused and `undefined` when it is allowed.
 * - `guardHttpFetch(next, { host, port, token?, allowed_origins })` returns a
 *   `(req, opts?) => Promise<Response>` that runs, in order, the bearer check,
 *   Host validation and Origin validation, then calls `next(req, opts)`.
 */

const SERVED = 'served-by-next';

function makeNext() {
  return jest.fn(async (_req: Request, _opts?: unknown) => new Response(SERVED, { status: 200 }));
}

function mcpRequest(headers: Record<string, string>): Request {
  return new Request('http://127.0.0.1:3000/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
}

async function outcome(response: Response): Promise<{ status: number; body: string }> {
  return { status: response.status, body: await response.text() };
}

describe('AC-R2JF6A.3: a non-loopback bind needs MCP_HTTP_TOKEN', () => {
  it.each(['0.0.0.0', '192.168.1.5', 'duck.internal', '::'])(
    'refuses host %s without a token, naming MCP_HTTP_TOKEN',
    (host) => {
      expect(validateHttpBind({ host })).toMatch(/MCP_HTTP_TOKEN/);
    }
  );

  it.each(['127.0.0.1', 'localhost', '::1'])('allows loopback host %s without a token', (host) => {
    expect(validateHttpBind({ host })).toBeUndefined();
  });

  it('allows a non-loopback host when a token is set', () => {
    expect(validateHttpBind({ host: '0.0.0.0', token: 's3cret-token' })).toBeUndefined();
  });
});

describe('AC-R2JF6A.4: bearer token check', () => {
  const options = {
    host: '127.0.0.1',
    port: 3000,
    token: 's3cret-token',
    allowed_origins: [] as string[],
  };

  it('a request with no Authorization header gets 401 and never reaches the handler', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(next, options)(mcpRequest({ host: '127.0.0.1:3000' }));
    expect({ status: response.status, calls: next.mock.calls.length }).toEqual({
      status: 401,
      calls: 0,
    });
  });

  it('a request with a wrong bearer token gets 401 and never reaches the handler', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ host: '127.0.0.1:3000', authorization: 'Bearer wrong-token!' }));
    expect({ status: response.status, calls: next.mock.calls.length }).toEqual({
      status: 401,
      calls: 0,
    });
  });

  it('a wrong token of a different length gets 401 (no length-mismatch throw)', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ host: '127.0.0.1:3000', authorization: 'Bearer x' }));
    expect(response.status).toBe(401);
  });

  it('a non-Bearer scheme carrying the token gets 401', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ host: '127.0.0.1:3000', authorization: 'Basic s3cret-token' }));
    expect(response.status).toBe(401);
  });

  it('a request with the correct bearer token is served by the handler', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ host: '127.0.0.1:3000', authorization: 'Bearer s3cret-token' }));
    expect(await outcome(response)).toEqual({ status: 200, body: SERVED });
  });

  it('without a configured token, a request with no Authorization header is served', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(next, { ...options, token: undefined })(
      mcpRequest({ host: '127.0.0.1:3000' })
    );
    expect(await outcome(response)).toEqual({ status: 200, body: SERVED });
  });

  it('the token comparison uses crypto.timingSafeEqual', () => {
    const dir = join(process.cwd(), 'src', 'transport');
    const files = readdirSync(dir)
      .map((name) => join(dir, name))
      .filter((path) => statSync(path).isFile() && path.endsWith('.ts'));
    const usesTimingSafeEqual = files.some((path) =>
      /\btimingSafeEqual\s*\(/.test(readFileSync(path, 'utf-8'))
    );
    expect(usesTimingSafeEqual).toBe(true);
  });
});

describe('AC-R2JF6A.5: Host and Origin validation', () => {
  const options = {
    host: 'duck.internal',
    port: 3000,
    token: 's3cret-token',
    allowed_origins: ['app.example.com'],
  };
  const auth = { authorization: 'Bearer s3cret-token' };

  it('a Host outside the allowed set gets 403', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ ...auth, host: 'evil.example:3000' }));
    expect({ status: response.status, calls: next.mock.calls.length }).toEqual({
      status: 403,
      calls: 0,
    });
  });

  it('a localhost Host is served', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ ...auth, host: 'localhost:3000' }));
    expect(await outcome(response)).toEqual({ status: 200, body: SERVED });
  });

  it('the configured MCP_HTTP_HOST extends the allowed Host set', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ ...auth, host: 'duck.internal:3000' }));
    expect(await outcome(response)).toEqual({ status: 200, body: SERVED });
  });

  it('an Origin that is neither localhost nor listed gets 403', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ ...auth, host: 'localhost:3000', origin: 'http://evil.example' }));
    expect({ status: response.status, calls: next.mock.calls.length }).toEqual({
      status: 403,
      calls: 0,
    });
  });

  it('a localhost Origin is served', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ ...auth, host: 'localhost:3000', origin: 'http://localhost:5173' }));
    expect(await outcome(response)).toEqual({ status: 200, body: SERVED });
  });

  it('an Origin listed in MCP_HTTP_ALLOWED_ORIGINS is served', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ ...auth, host: 'localhost:3000', origin: 'https://app.example.com' }));
    expect(await outcome(response)).toEqual({ status: 200, body: SERVED });
  });

  it('a request with no Origin is served', async () => {
    const next = makeNext();
    const response = await guardHttpFetch(
      next,
      options
    )(mcpRequest({ ...auth, host: 'localhost:3000' }));
    expect(await outcome(response)).toEqual({ status: 200, body: SERVED });
  });

  it('forwards the request and its options to the handler unchanged', async () => {
    const next = makeNext();
    const request = mcpRequest({ ...auth, host: 'localhost:3000' });
    const opts = { parsedBody: { marker: 1 } };
    await guardHttpFetch(next, options)(request, opts);
    expect(next.mock.calls).toEqual([[request, opts]]);
  });
});
