import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * Local OpenAI-compatible chat-completions server for tests. Never forwards to a
 * real LLM API. It answers every chat completion with a fixed JSON body that the
 * vote / judge parsers accept, and GET /models with one model.
 */
export const MOCK_MODEL = 'mock-model';
export const MOCK_REPLY = JSON.stringify({
  choice: 'A',
  confidence: 80,
  reasoning: 'mock reasoning',
  rankings: [],
  criteria_scores: {},
  summary: 'mock summary',
});

export interface MockOpenAI {
  /** Base URL ending in /v1, suitable for CUSTOM_<NAME>_BASE_URL. */
  baseUrl: string;
  /** Number of chat-completion requests served so far. */
  completions: () => number;
  close: () => Promise<void>;
}

export async function startMockOpenAI(): Promise<MockOpenAI> {
  let completions = 0;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = req.url ?? '';
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && url.endsWith('/models')) {
        res.end(
          JSON.stringify({
            object: 'list',
            data: [{ id: MOCK_MODEL, object: 'model', created: 0, owned_by: 'mock' }],
          })
        );
        return;
      }
      if (req.method === 'POST' && url.endsWith('/chat/completions')) {
        completions++;
        res.end(
          JSON.stringify({
            id: `chatcmpl-mock-${completions}`,
            object: 'chat.completion',
            created: 0,
            model: MOCK_MODEL,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: MOCK_REPLY },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })
        );
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: `mock: no route for ${req.method} ${url}` } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    completions: () => completions,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Env vars that configure two custom providers, `mocka` and `mockb`, on the mock server. */
export function mockProviderEnv(baseUrl: string): Record<string, string> {
  return {
    CUSTOM_MOCKA_API_KEY: 'mock-key',
    CUSTOM_MOCKA_BASE_URL: baseUrl,
    CUSTOM_MOCKA_DEFAULT_MODEL: MOCK_MODEL,
    CUSTOM_MOCKB_API_KEY: 'mock-key',
    CUSTOM_MOCKB_BASE_URL: baseUrl,
    CUSTOM_MOCKB_DEFAULT_MODEL: MOCK_MODEL,
    DEFAULT_PROVIDER: 'mocka',
  };
}

/**
 * Remove every provider / bridge variable from process.env (dotenv may have
 * loaded real keys from the repo's .env), then apply `extra`.
 */
export function isolateEnv(extra: Record<string, string>): void {
  for (const key of Object.keys(process.env)) {
    if (
      /_API_KEY$/.test(key) ||
      key.startsWith('CUSTOM_') ||
      key.startsWith('CLI_') ||
      key.startsWith('MCP_SERVER_')
    ) {
      delete process.env[key];
    }
  }
  delete process.env.DEFAULT_PROVIDER;
  delete process.env.MCP_BRIDGE_ENABLED;
  Object.assign(process.env, extra);
}

/** Wait for `predicate` to hold, polling, bounded by `timeoutMs`; throws naming `what`. */
export async function waitFor(
  predicate: () => boolean,
  what: string,
  timeoutMs = 10000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
