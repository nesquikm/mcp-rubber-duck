import { spawn } from 'child_process';

export interface CLIRunOptions {
  command: string;
  args: string[];
  stdin?: string;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface CLIRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// 10 MB limit per stream to prevent memory issues from runaway output
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

export function runCLIProcess(options: CLIRunOptions): Promise<CLIRunResult> {
  const { command, args, stdin, timeout = 120000, cwd, env } = options;

  return new Promise((resolve, reject) => {
    const processEnv = env
      ? { ...process.env, ...env }
      : process.env;

    const child = spawn(command, args, {
      cwd,
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let settled = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      fn();
    };

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // Give it a moment to clean up, then force kill
      forceKillTimer = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    child.stdout.on('data', (data: Buffer) => {
      if (stdout.length < MAX_BUFFER_SIZE) {
        stdout += data.toString();
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      if (stderr.length < MAX_BUFFER_SIZE) {
        stderr += data.toString();
      }
    });

    child.on('error', (error: Error) => {
      settle(() => reject(new Error(`Failed to spawn CLI process "${command}": ${error.message}`)));
    });

    child.on('close', (exitCode: number | null) => {
      if (killed) {
        settle(() => reject(new Error(`CLI process "${command}" timed out after ${timeout}ms`)));
        return;
      }

      const code = exitCode ?? 1;
      if (code !== 0) {
        settle(() =>
          reject(
            new Error(
              `CLI process "${command}" exited with code ${code}: ${stderr.trim() || stdout.trim()}`
            )
          )
        );
        return;
      }

      settle(() => resolve({ stdout, stderr, exitCode: code }));
    });

    // Pipe stdin if provided; swallow write errors since the child
    // may have exited before consuming input — the close/error
    // handlers above will report the actual failure.
    child.stdin.on('error', () => {});
    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}
