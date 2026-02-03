import { describe, it, expect } from '@jest/globals';
import { resolvePreset } from '../src/providers/cli/presets';
import { CLIProviderConfig } from '../src/config/types';

describe('resolvePreset', () => {
  it('should resolve claude preset with correct defaults', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'claude',
      nickname: 'Claude',
    };
    const resolved = resolvePreset(config);

    expect(resolved.cli_command).toBe('claude');
    expect(resolved.prompt_delivery).toBe('flag');
    expect(resolved.prompt_flag).toBe('-p');
    expect(resolved.output_format).toBe('json');
    expect(resolved.cli_args).toEqual(['--output-format', 'json', '--max-turns', '3']);
    expect(resolved.process_timeout).toBe(300000);
    expect(resolved.nickname).toBe('Claude');
  });

  it('should resolve codex preset with correct defaults', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'codex',
      nickname: 'Codex',
    };
    const resolved = resolvePreset(config);

    expect(resolved.cli_command).toBe('codex');
    expect(resolved.prompt_delivery).toBe('positional');
    expect(resolved.output_format).toBe('jsonl');
    expect(resolved.cli_args).toContain('exec');
    expect(resolved.cli_args).toContain('--json');
  });

  it('should resolve gemini preset with correct defaults', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'gemini',
      nickname: 'Gemini',
    };
    const resolved = resolvePreset(config);

    expect(resolved.cli_command).toBe('gemini');
    expect(resolved.prompt_delivery).toBe('flag');
    expect(resolved.prompt_flag).toBe('-p');
    expect(resolved.output_format).toBe('json');
    expect(resolved.cli_args).toContain('--yolo');
  });

  it('should resolve grok preset with correct defaults', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'grok',
      nickname: 'Grok',
    };
    const resolved = resolvePreset(config);

    expect(resolved.cli_command).toBe('grok');
    expect(resolved.prompt_delivery).toBe('flag');
    expect(resolved.prompt_flag).toBe('-p');
    expect(resolved.output_format).toBe('text');
    expect(resolved.process_timeout).toBe(120000);
  });

  it('should resolve aider preset with correct defaults', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'aider',
      nickname: 'Aider',
    };
    const resolved = resolvePreset(config);

    expect(resolved.cli_command).toBe('aider');
    expect(resolved.prompt_delivery).toBe('flag');
    expect(resolved.prompt_flag).toBe('--message');
    expect(resolved.output_format).toBe('text');
    expect(resolved.cli_args).toContain('--yes');
  });

  it('should allow user overrides to take precedence over preset defaults', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'claude',
      nickname: 'My Claude',
      cli_command: '/custom/path/claude',
      prompt_delivery: 'stdin',
      output_format: 'text',
      cli_args: ['--custom-flag'],
      process_timeout: 60000,
    };
    const resolved = resolvePreset(config);

    expect(resolved.cli_command).toBe('/custom/path/claude');
    expect(resolved.prompt_delivery).toBe('stdin');
    expect(resolved.output_format).toBe('text');
    expect(resolved.cli_args).toEqual(['--custom-flag']);
    expect(resolved.process_timeout).toBe(60000);
  });

  it('should require cli_command for custom type', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'custom',
      nickname: 'Custom Tool',
    };
    expect(() => resolvePreset(config)).toThrow('cli_command is required for custom CLI providers');
  });

  it('should resolve custom type with all fields', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'custom',
      cli_command: '/usr/bin/mytool',
      prompt_delivery: 'positional',
      output_format: 'json',
      response_json_path: '$.answer',
      nickname: 'My Tool',
      default_model: 'v1',
      working_directory: '/tmp',
      env_vars: { MY_VAR: 'value' },
    };
    const resolved = resolvePreset(config);

    expect(resolved.cli_command).toBe('/usr/bin/mytool');
    expect(resolved.prompt_delivery).toBe('positional');
    expect(resolved.output_format).toBe('json');
    expect(resolved.response_json_path).toBe('$.answer');
    expect(resolved.working_directory).toBe('/tmp');
    expect(resolved.env_vars).toEqual({ MY_VAR: 'value' });
  });

  it('should pass through optional fields from config', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'claude',
      nickname: 'Claude',
      default_model: 'claude-opus-4-5-20251101',
      models: ['claude-opus-4-5-20251101', 'claude-sonnet-4-20250514'],
      system_prompt: 'You are helpful.',
    };
    const resolved = resolvePreset(config);

    expect(resolved.default_model).toBe('claude-opus-4-5-20251101');
    expect(resolved.models).toEqual(['claude-opus-4-5-20251101', 'claude-sonnet-4-20250514']);
    expect(resolved.system_prompt).toBe('You are helpful.');
  });

  it('should throw for unknown CLI preset', () => {
    const config: CLIProviderConfig = {
      type: 'cli',
      cli_type: 'unknown-preset' as 'claude', // Type cast to bypass TS check
      nickname: 'Unknown',
    };
    expect(() => resolvePreset(config)).toThrow('Unknown CLI preset: unknown-preset');
  });
});
