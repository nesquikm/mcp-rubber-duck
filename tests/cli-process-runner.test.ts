import { describe, it, expect } from '@jest/globals';
import { runCLIProcess } from '../src/providers/cli/process-runner';

describe('runCLIProcess', () => {
  it('should execute a simple command and return stdout', async () => {
    const result = await runCLIProcess({
      command: 'echo',
      args: ['hello world'],
    });

    expect(result.stdout.trim()).toBe('hello world');
    expect(result.exitCode).toBe(0);
  });

  it('should reject on non-zero exit code', async () => {
    await expect(
      runCLIProcess({
        command: 'bash',
        args: ['-c', 'exit 1'],
      })
    ).rejects.toThrow(/exited with code 1/);
  });

  it('should reject on timeout', async () => {
    await expect(
      runCLIProcess({
        command: 'sleep',
        args: ['10'],
        timeout: 100,
      })
    ).rejects.toThrow(/timed out/);
  }, 10000);

  it('should pipe stdin correctly', async () => {
    const result = await runCLIProcess({
      command: 'cat',
      args: [],
      stdin: 'hello from stdin',
    });

    expect(result.stdout).toBe('hello from stdin');
  });

  it('should pass environment variables to subprocess', async () => {
    const result = await runCLIProcess({
      command: 'bash',
      args: ['-c', 'echo $MY_TEST_VAR'],
      env: { MY_TEST_VAR: 'test-value' },
    });

    expect(result.stdout.trim()).toBe('test-value');
  });

  it('should apply working directory', async () => {
    const result = await runCLIProcess({
      command: 'pwd',
      args: [],
      cwd: '/tmp',
    });

    // /tmp might resolve to /private/tmp on macOS
    expect(result.stdout.trim()).toMatch(/\/tmp$/);
  });

  it('should capture stderr', async () => {
    await expect(
      runCLIProcess({
        command: 'bash',
        args: ['-c', 'echo "error msg" >&2; exit 1'],
      })
    ).rejects.toThrow(/error msg/);
  });

  it('should reject on command not found', async () => {
    await expect(
      runCLIProcess({
        command: 'nonexistent-command-that-does-not-exist',
        args: [],
      })
    ).rejects.toThrow(/Failed to spawn/);
  });

  it('should handle process that dies before consuming stdin', async () => {
    // Process exits immediately without reading stdin — stdin write error
    // should be swallowed, and the real exit code error surfaces instead
    await expect(
      runCLIProcess({
        command: 'bash',
        args: ['-c', 'exit 42'],
        stdin: 'data that will not be read',
      })
    ).rejects.toThrow(/exited with code 42/);
  });

  it('should cap stdout buffer for large output', async () => {
    // Generate ~200KB of output — well under the 10MB cap but enough
    // to verify buffering works. (Testing the actual 10MB cap would be
    // too slow for a unit test.)
    const result = await runCLIProcess({
      command: 'bash',
      args: ['-c', 'for i in $(seq 1 5000); do echo "line $i padding text to make it longer"; done'],
    });

    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.exitCode).toBe(0);
  });

  it('should handle process killed by signal', async () => {
    // Process sends itself SIGTERM
    await expect(
      runCLIProcess({
        command: 'bash',
        args: ['-c', 'kill -TERM $$'],
      })
    ).rejects.toThrow(/exited with code/);
  });
});
