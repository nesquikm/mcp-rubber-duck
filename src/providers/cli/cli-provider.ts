import { IDuckProvider, ChatOptions, ChatResponse, ModelInfo } from '../types.js';
import { ResolvedCLIConfig } from './presets.js';
import { runCLIProcess } from './process-runner.js';
import { parseTextOutput, parseJsonOutput, parseJsonlOutput } from './output-parsers.js';
import { logger } from '../../utils/logger.js';

export class CLIDuckProvider implements IDuckProvider {
  public name: string;
  public nickname: string;
  private config: ResolvedCLIConfig;

  constructor(name: string, config: ResolvedCLIConfig) {
    this.name = name;
    this.nickname = config.nickname;
    this.config = config;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const prompt = this.extractPrompt(options);
    const { args, stdin } = this.buildCommandArgs(prompt, options);
    const modelToUse = options.model || this.config.default_model || 'cli';

    try {
      const result = await runCLIProcess({
        command: this.config.cli_command,
        args,
        stdin,
        timeout: this.config.process_timeout,
        cwd: this.config.working_directory,
        env: this.config.env_vars,
      });

      const parsed = this.parseOutput(result.stdout);

      return {
        content: parsed.content,
        usage: parsed.usage,
        model: modelToUse,
        finishReason: 'stop',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`CLI provider ${this.name} error:`, error);
      throw new Error(`Duck ${this.nickname} couldn't respond: ${errorMessage}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { args, stdin } = this.buildCommandArgs('Say hello', {
        messages: [{ role: 'user', content: 'Say hello', timestamp: new Date() }],
      });

      await runCLIProcess({
        command: this.config.cli_command,
        args,
        stdin,
        timeout: Math.min(this.config.process_timeout, 30000),
        cwd: this.config.working_directory,
        env: this.config.env_vars,
      });

      return true;
    } catch (error) {
      logger.warn(`Health check failed for CLI provider ${this.name}:`, error);
      return false;
    }
  }

  listModels(): Promise<ModelInfo[]> {
    if (this.config.models && this.config.models.length > 0) {
      return Promise.resolve(this.config.models.map(id => ({
        id,
        description: `Configured CLI model`,
      })));
    }

    return Promise.resolve([{
      id: this.config.default_model || 'default',
      description: `Default CLI model for ${this.config.cli_type}`,
    }]);
  }

  getInfo() {
    return {
      name: this.name,
      nickname: this.nickname,
      model: this.config.default_model || 'cli',
      type: 'cli' as const,
      availableModels: this.config.models,
      cliCommand: this.config.cli_command,
      cliType: this.config.cli_type,
    };
  }

  private extractPrompt(options: ChatOptions): string {
    // Use the last user message as the prompt
    const messages = options.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return messages[messages.length - 1]?.content || '';
  }

  private buildCommandArgs(
    prompt: string,
    options: ChatOptions
  ): { args: string[]; stdin?: string } {
    const args = [...this.config.cli_args];
    let stdin: string | undefined;

    // Add system prompt if configured
    const systemPrompt = options.systemPrompt || this.config.system_prompt;
    let systemPromptHandled = false;
    if (systemPrompt) {
      // For CLI tools that support system prompts via flags
      if (this.config.cli_type === 'claude') {
        this.removeFlag(args, '--system-prompt');
        args.push('--system-prompt', systemPrompt);
        systemPromptHandled = true;
      }
      // For other tools with non-stdin delivery, prepend to the prompt
      else if (this.config.prompt_delivery !== 'stdin') {
        prompt = `${systemPrompt}\n\n${prompt}`;
        systemPromptHandled = true;
      }
    }

    // Add model override if specified
    if (options.model) {
      const modelFlag = this.getModelFlag();
      if (modelFlag) {
        // Remove any existing model flag from cli_args to avoid duplicates
        // (e.g. grok preset includes '-m grok-code-fast-1' in cli_args)
        this.removeFlag(args, modelFlag);
        args.push(modelFlag, options.model);
      }
    }

    // Deliver the prompt
    switch (this.config.prompt_delivery) {
      case 'flag':
        if (this.config.prompt_flag) {
          args.push(this.config.prompt_flag, prompt);
        }
        break;
      case 'positional':
        args.push(prompt);
        break;
      case 'stdin':
        stdin = (systemPrompt && !systemPromptHandled) ? `${systemPrompt}\n\n${prompt}` : prompt;
        break;
    }

    return { args, stdin };
  }

  private getModelFlag(): string | undefined {
    switch (this.config.cli_type) {
      case 'claude':
      case 'codex':
      case 'gemini':
      case 'aider':
        return '--model';
      case 'grok':
        return '-m';
      default:
        return undefined;
    }
  }

  /**
   * Remove a flag and its value from an args array in-place.
   * Handles both `--flag value` and `-f value` patterns.
   */
  private removeFlag(args: string[], flag: string): void {
    let i = 0;
    while (i < args.length) {
      if (args[i] === flag) {
        // Remove the flag and its value (next element)
        args.splice(i, 2);
      } else {
        i++;
      }
    }
  }

  private parseOutput(stdout: string) {
    switch (this.config.output_format) {
      case 'json':
        return parseJsonOutput(
          stdout,
          this.config.response_json_path,
          this.config.usage_json_path
        );
      case 'jsonl':
        return parseJsonlOutput(stdout, this.config.response_json_path);
      case 'text':
      default:
        return parseTextOutput(stdout);
    }
  }
}
