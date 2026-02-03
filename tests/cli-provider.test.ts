import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ResolvedCLIConfig } from '../src/providers/cli/presets';
import type { CLIRunResult } from '../src/providers/cli/process-runner';

// ESM-compatible mock setup
const mockRunCLIProcess = jest.fn<(options: unknown) => Promise<CLIRunResult>>();

jest.unstable_mockModule('../src/providers/cli/process-runner', () => ({
  runCLIProcess: mockRunCLIProcess,
}));

jest.unstable_mockModule('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Dynamic import after mocking
const { CLIDuckProvider } = await import('../src/providers/cli/cli-provider');

function makeConfig(overrides: Partial<ResolvedCLIConfig> = {}): ResolvedCLIConfig {
  return {
    cli_command: 'test-cli',
    prompt_delivery: 'flag',
    prompt_flag: '-p',
    output_format: 'text',
    cli_args: [],
    process_timeout: 30000,
    nickname: 'Test CLI',
    cli_type: 'custom',
    ...overrides,
  };
}

describe('CLIDuckProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chat()', () => {
    it('should spawn CLI with correct flag-based prompt delivery', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'CLI response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig());
      const result = await provider.chat({
        messages: [{ role: 'user', content: 'Hello CLI', timestamp: new Date() }],
      });

      expect(mockRunCLIProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'test-cli',
          args: expect.arrayContaining(['-p', 'Hello CLI']),
        })
      );
      expect(result.content).toBe('CLI response');
      expect(result.finishReason).toBe('stop');
    });

    it('should not include prompt in args when flag delivery has no prompt_flag', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        prompt_delivery: 'flag',
        prompt_flag: undefined,
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'my prompt', timestamp: new Date() }],
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      // Prompt should NOT appear in args since there's no flag to deliver it with
      expect(callArgs.args).not.toContain('my prompt');
    });

    it('should use positional prompt delivery', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        prompt_delivery: 'positional',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'my prompt', timestamp: new Date() }],
      });

      expect(mockRunCLIProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['my prompt']),
        })
      );
    });

    it('should use stdin prompt delivery', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        prompt_delivery: 'stdin',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'stdin prompt', timestamp: new Date() }],
      });

      expect(mockRunCLIProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          stdin: 'stdin prompt',
        })
      );
    });

    it('should parse JSON output correctly', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: JSON.stringify({ result: 'json response' }),
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        output_format: 'json',
        response_json_path: '$.result',
      }));
      const result = await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
      });

      expect(result.content).toBe('json response');
    });

    it('should parse JSONL output correctly', async () => {
      const stdout = [
        JSON.stringify({ type: 'progress', message: 'working' }),
        JSON.stringify({ type: 'result', content: 'final answer' }),
      ].join('\n');

      mockRunCLIProcess.mockResolvedValue({
        stdout,
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        output_format: 'jsonl',
      }));
      const result = await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
      });

      expect(result.content).toBe('final answer');
    });

    it('should surface CLI process errors as readable messages', async () => {
      mockRunCLIProcess.mockRejectedValue(new Error('CLI process "test-cli" exited with code 1: something went wrong'));

      const provider = new CLIDuckProvider('test', makeConfig());

      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        })
      ).rejects.toThrow(/Test CLI couldn't respond/);
    });

    it('should include configured CLI args', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_args: ['--verbose', '--no-color'],
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
      });

      expect(mockRunCLIProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['--verbose', '--no-color']),
        })
      );
    });

    it('should pass timeout and working directory', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        process_timeout: 60000,
        working_directory: '/custom/dir',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
      });

      expect(mockRunCLIProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
          cwd: '/custom/dir',
        })
      );
    });

    it('should not duplicate system prompt for claude type with stdin delivery', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'claude',
        prompt_delivery: 'stdin',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'hello', timestamp: new Date() }],
        systemPrompt: 'Be helpful',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[]; stdin?: string };
      // System prompt should go via --system-prompt flag
      expect(callArgs.args).toContain('--system-prompt');
      expect(callArgs.args).toContain('Be helpful');
      // stdin should NOT contain the system prompt (only the user prompt)
      expect(callArgs.stdin).toBe('hello');
    });

    it('should remove duplicate --system-prompt from cli_args for claude type', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'claude',
        cli_args: ['--system-prompt', 'old prompt', '--verbose'],
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'hello', timestamp: new Date() }],
        systemPrompt: 'New prompt',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      // Should have the new system prompt, not the old one
      expect(callArgs.args).toContain('New prompt');
      expect(callArgs.args).not.toContain('old prompt');
      // Other args preserved
      expect(callArgs.args).toContain('--verbose');
      // Only one --system-prompt flag
      const spFlags = callArgs.args.filter(a => a === '--system-prompt');
      expect(spFlags).toHaveLength(1);
    });

    it('should prepend system prompt to stdin for non-claude type', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'custom',
        prompt_delivery: 'stdin',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'hello', timestamp: new Date() }],
        systemPrompt: 'Be helpful',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { stdin?: string };
      expect(callArgs.stdin).toBe('Be helpful\n\nhello');
    });

    it('should not add model flag for custom cli_type', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'custom',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        model: 'some-model',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      // Custom cli_type has no model flag mapping, so model should not appear in args
      expect(callArgs.args).not.toContain('--model');
      expect(callArgs.args).not.toContain('-m');
      expect(callArgs.args).not.toContain('some-model');
    });

    it('should prepend system prompt to prompt for flag delivery non-claude type', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'custom',
        prompt_delivery: 'flag',
        prompt_flag: '-p',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'hello', timestamp: new Date() }],
        systemPrompt: 'Be brief',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      // System prompt should be prepended to the prompt value
      expect(callArgs.args).toContain('-p');
      const flagIdx = callArgs.args.indexOf('-p');
      expect(callArgs.args[flagIdx + 1]).toBe('Be brief\n\nhello');
    });

    it('should use last message content when no user message exists', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig());
      await provider.chat({
        messages: [{ role: 'assistant', content: 'assistant msg', timestamp: new Date() }],
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      expect(callArgs.args).toContain('assistant msg');
    });

    it('should add --model flag for claude cli_type', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'claude',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        model: 'claude-sonnet-4-20250514',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      expect(callArgs.args).toContain('--model');
      expect(callArgs.args).toContain('claude-sonnet-4-20250514');
    });

    it('should reflect model override in response', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        default_model: 'default-model',
      }));
      const result = await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        model: 'override-model',
      });

      expect(result.model).toBe('override-model');
    });

    it('should use default model in response when no override', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        default_model: 'my-default',
      }));
      const result = await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
      });

      expect(result.model).toBe('my-default');
    });

    it('should use "cli" as model fallback when nothing configured', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig());
      const result = await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
      });

      expect(result.model).toBe('cli');
    });

    it('should add --model flag for codex cli_type', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'codex',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        model: 'codex-mini',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      expect(callArgs.args).toContain('--model');
      expect(callArgs.args).toContain('codex-mini');
    });

    it('should add --model flag for gemini cli_type', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'gemini',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        model: 'gemini-pro',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      expect(callArgs.args).toContain('--model');
      expect(callArgs.args).toContain('gemini-pro');
    });

    it('should add -m flag for grok cli_type', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'grok',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        model: 'grok-2',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      expect(callArgs.args).toContain('-m');
      expect(callArgs.args).toContain('grok-2');
    });

    it('should remove duplicate model flag from cli_args when model override is given', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      // Grok preset includes '-m grok-code-fast-1' in cli_args
      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'grok',
        cli_args: ['-m', 'grok-code-fast-1', '--verbose'],
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        model: 'grok-2',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      // Should have the override model, not the default
      expect(callArgs.args).toContain('grok-2');
      expect(callArgs.args).not.toContain('grok-code-fast-1');
      // Other args should be preserved
      expect(callArgs.args).toContain('--verbose');
      // Only one -m flag
      const mFlags = callArgs.args.filter(a => a === '-m');
      expect(mFlags).toHaveLength(1);
    });

    it('should add --model flag for aider cli_type', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        cli_type: 'aider',
      }));
      await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
        model: 'gpt-4',
      });

      const callArgs = mockRunCLIProcess.mock.calls[0][0] as { args: string[] };
      expect(callArgs.args).toContain('--model');
      expect(callArgs.args).toContain('gpt-4');
    });

    it('should return usage stats from JSON output', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: JSON.stringify({
          result: 'hello',
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig({
        output_format: 'json',
        response_json_path: '$.result',
        usage_json_path: '$.usage',
      }));
      const result = await provider.chat({
        messages: [{ role: 'user', content: 'test', timestamp: new Date() }],
      });

      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });
  });

  describe('healthCheck()', () => {
    it('should return true on successful execution', async () => {
      mockRunCLIProcess.mockResolvedValue({
        stdout: 'hello',
        stderr: '',
        exitCode: 0,
      });

      const provider = new CLIDuckProvider('test', makeConfig());
      expect(await provider.healthCheck()).toBe(true);
    });

    it('should return false on error', async () => {
      mockRunCLIProcess.mockRejectedValue(new Error('command not found'));

      const provider = new CLIDuckProvider('test', makeConfig());
      expect(await provider.healthCheck()).toBe(false);
    });
  });

  describe('listModels()', () => {
    it('should return configured models', async () => {
      const provider = new CLIDuckProvider('test', makeConfig({
        models: ['model-a', 'model-b'],
      }));
      const models = await provider.listModels();

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('model-a');
      expect(models[1].id).toBe('model-b');
    });

    it('should return default model when no models configured', async () => {
      const provider = new CLIDuckProvider('test', makeConfig({
        default_model: 'my-model',
      }));
      const models = await provider.listModels();

      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('my-model');
    });

    it('should return "default" when nothing is configured', async () => {
      const provider = new CLIDuckProvider('test', makeConfig());
      const models = await provider.listModels();

      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('default');
    });
  });

  describe('getInfo()', () => {
    it('should return type: cli with correct fields', () => {
      const provider = new CLIDuckProvider('test', makeConfig({
        default_model: 'v1',
        cli_type: 'claude',
      }));
      const info = provider.getInfo();

      expect(info.type).toBe('cli');
      expect(info.name).toBe('test');
      expect(info.nickname).toBe('Test CLI');
      expect(info.model).toBe('v1');
      expect(info.cliCommand).toBe('test-cli');
      expect(info.cliType).toBe('claude');
    });

    it('should not include HTTP-specific fields', () => {
      const provider = new CLIDuckProvider('test', makeConfig());
      const info = provider.getInfo();

      expect(info.baseURL).toBeUndefined();
      expect(info.hasApiKey).toBeUndefined();
    });
  });
});
