import { CLIProviderConfig } from '../../config/types.js';

export interface ResolvedCLIConfig {
  cli_command: string;
  prompt_delivery: 'flag' | 'positional' | 'stdin';
  prompt_flag?: string;
  output_format: 'text' | 'json' | 'jsonl';
  response_json_path?: string;
  usage_json_path?: string;
  cli_args: string[];
  process_timeout: number;
  working_directory?: string;
  env_vars?: Record<string, string>;
  nickname: string;
  default_model?: string;
  models?: string[];
  system_prompt?: string;
  cli_type: string;
}

interface PresetDefaults {
  cli_command: string;
  prompt_delivery: 'flag' | 'positional' | 'stdin';
  prompt_flag?: string;
  output_format: 'text' | 'json' | 'jsonl';
  response_json_path?: string;
  usage_json_path?: string;
  cli_args: string[];
  process_timeout: number;
}

const PRESETS: Record<string, PresetDefaults> = {
  claude: {
    cli_command: 'claude',
    prompt_delivery: 'flag',
    prompt_flag: '-p',
    output_format: 'json',
    response_json_path: '$.result',
    usage_json_path: '$.usage',
    cli_args: ['--output-format', 'json', '--max-turns', '3'],
    process_timeout: 300000,
  },
  codex: {
    cli_command: 'codex',
    prompt_delivery: 'positional',
    output_format: 'jsonl',
    response_json_path: '$.item.text',
    usage_json_path: '$.usage',
    cli_args: ['exec', '--json', '--skip-git-repo-check', '--full-auto'],
    process_timeout: 300000,
  },
  gemini: {
    cli_command: 'gemini',
    prompt_delivery: 'flag',
    prompt_flag: '-p',
    output_format: 'json',
    response_json_path: '$.response',
    cli_args: ['--output-format', 'json', '--yolo'],
    process_timeout: 300000,
  },
  grok: {
    cli_command: 'grok',
    prompt_delivery: 'flag',
    prompt_flag: '-p',
    output_format: 'text',
    cli_args: ['-m', 'grok-code-fast-1'],
    process_timeout: 120000,
  },
  aider: {
    cli_command: 'aider',
    prompt_delivery: 'flag',
    prompt_flag: '--message',
    output_format: 'text',
    cli_args: ['--yes'],
    process_timeout: 300000,
  },
};

export function resolvePreset(config: CLIProviderConfig): ResolvedCLIConfig {
  const { cli_type } = config;

  if (cli_type === 'custom') {
    if (!config.cli_command) {
      throw new Error('cli_command is required for custom CLI providers');
    }
    return {
      cli_command: config.cli_command,
      prompt_delivery: config.prompt_delivery || 'flag',
      prompt_flag: config.prompt_flag,
      output_format: config.output_format || 'text',
      response_json_path: config.response_json_path,
      usage_json_path: config.usage_json_path,
      cli_args: config.cli_args || [],
      process_timeout: config.process_timeout || 120000,
      working_directory: config.working_directory,
      env_vars: config.env_vars,
      nickname: config.nickname,
      default_model: config.default_model,
      models: config.models,
      system_prompt: config.system_prompt,
      cli_type: config.cli_type,
    };
  }

  const preset = PRESETS[cli_type];
  if (!preset) {
    throw new Error(`Unknown CLI preset: ${cli_type}`);
  }

  return {
    cli_command: config.cli_command || preset.cli_command,
    prompt_delivery: config.prompt_delivery || preset.prompt_delivery,
    prompt_flag: config.prompt_flag || preset.prompt_flag,
    output_format: config.output_format || preset.output_format,
    response_json_path: config.response_json_path || preset.response_json_path,
    usage_json_path: config.usage_json_path || preset.usage_json_path,
    cli_args: config.cli_args || preset.cli_args,
    process_timeout: config.process_timeout || preset.process_timeout,
    working_directory: config.working_directory,
    env_vars: config.env_vars,
    nickname: config.nickname,
    default_model: config.default_model,
    models: config.models,
    system_prompt: config.system_prompt,
    cli_type: config.cli_type,
  };
}
