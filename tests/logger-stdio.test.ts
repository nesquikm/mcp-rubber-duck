import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// IMPORTANT: do NOT mock ../src/utils/logger here — we need the real winston transport
// to verify which OS stream (stdout vs stderr) each level is routed to.
import { logger } from '../src/utils/logger';

/**
 * AC-R5S9MH.3 (H3) — stdio logging safety.
 *
 * The server always connects over stdio, so NO log line (any level) may ever be
 * written to process.stdout — that channel carries framed JSON-RPC. All winston
 * Console output must go to stderr instead.
 */
async function flush(): Promise<void> {
  // Give winston's async transports a couple ticks to drain.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe('logger stdio safety (AC-R5S9MH.3)', () => {
  let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>;
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  function wroteSentinel(spy: jest.SpiedFunction<typeof process.stdout.write>, sentinel: string) {
    return spy.mock.calls.some((call) => {
      const chunk = call[0];
      return typeof chunk === 'string' && chunk.includes(sentinel);
    });
  }

  it('routes error logs to stderr, never stdout', async () => {
    const sentinel = 'SENTINEL_ERROR_R5S9MH';
    logger.error(sentinel);
    await flush();

    expect(wroteSentinel(stdoutSpy, sentinel)).toBe(false);
    expect(wroteSentinel(stderrSpy, sentinel)).toBe(true);
  });

  it('routes warn logs to stderr, never stdout', async () => {
    const sentinel = 'SENTINEL_WARN_R5S9MH';
    logger.warn(sentinel);
    await flush();

    expect(wroteSentinel(stdoutSpy, sentinel)).toBe(false);
    expect(wroteSentinel(stderrSpy, sentinel)).toBe(true);
  });

  it('routes info logs to stderr, never stdout', async () => {
    const sentinel = 'SENTINEL_INFO_R5S9MH';
    logger.info(sentinel);
    await flush();

    // This is the core H3 defect: winston's default Console transport sends
    // info-level records to stdout. They must go to stderr instead.
    expect(wroteSentinel(stdoutSpy, sentinel)).toBe(false);
    expect(wroteSentinel(stderrSpy, sentinel)).toBe(true);
  });
});

describe('welcome banner stdio safety (AC-R5S9MH.3)', () => {
  let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>;
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>;
  let logSpy: jest.SpiedFunction<typeof console.log>;
  let errorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('prints the welcome banner to stderr, never stdout', async () => {
    // The implementer extracts the banner into an exported helper that writes to stderr.
    const { printWelcomeBanner } = await import('../src/utils/banner');

    printWelcomeBanner();

    // The banner must not reach stdout via process.stdout.write OR console.log.
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    // It must reach the user via stderr (console.error writes to process.stderr).
    const wroteToStderr =
      stderrSpy.mock.calls.length > 0 || errorSpy.mock.calls.length > 0;
    expect(wroteToStderr).toBe(true);
  });
});
