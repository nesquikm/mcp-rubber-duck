import { BaseGuardrailPlugin } from './base-plugin.js';
import { GuardrailPhase, GuardrailContext, GuardrailResult } from '../types.js';
import { TokenLimiterConfig } from '../../config/types.js';

/**
 * Token limiter plugin - limits input/output token counts
 */
export class TokenLimiterPlugin extends BaseGuardrailPlugin {
  name = 'token_limiter';
  phases: GuardrailPhase[] = ['pre_request', 'post_response'];

  private maxInputTokens: number = 8192;
  private maxOutputTokens: number | undefined;
  private warnAtPercentage: number = 80;

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    const typedConfig = config as Partial<TokenLimiterConfig>;
    this.maxInputTokens = typedConfig.max_input_tokens ?? 8192;
    this.maxOutputTokens = typedConfig.max_output_tokens;
    this.warnAtPercentage = typedConfig.warn_at_percentage ?? 80;
    this.priority = typedConfig.priority ?? 20;
  }

  execute(phase: GuardrailPhase, context: GuardrailContext): Promise<GuardrailResult> {
    if (phase === 'pre_request') {
      return this.checkInputTokens(context, phase);
    } else if (phase === 'post_response') {
      return this.checkOutputTokens(context, phase);
    }
    return Promise.resolve(this.allow(context));
  }

  private checkInputTokens(
    context: GuardrailContext,
    phase: GuardrailPhase
  ): Promise<GuardrailResult> {
    // Estimate token count from prompt
    const prompt = context.prompt || '';
    const estimatedTokens = this.estimateTokenCount(prompt);

    // Also count messages if present
    let totalTokens = estimatedTokens;
    for (const msg of context.messages) {
      totalTokens += this.estimateTokenCount(msg.content);
    }

    // Check if over limit
    if (totalTokens > this.maxInputTokens) {
      this.addViolation(
        context,
        phase,
        'max_input_tokens',
        'error',
        `Token limit exceeded: estimated ${totalTokens} tokens (limit: ${this.maxInputTokens})`,
        { estimatedTokens: totalTokens, limit: this.maxInputTokens }
      );
      return Promise.resolve(
        this.block(context, `Token limit exceeded: ~${totalTokens}/${this.maxInputTokens} tokens`)
      );
    }

    // Warn if approaching limit
    const warnThreshold = this.maxInputTokens * (this.warnAtPercentage / 100);
    if (totalTokens >= warnThreshold) {
      this.addViolation(
        context,
        phase,
        'max_input_tokens_warning',
        'warning',
        `Approaching token limit: estimated ${totalTokens}/${this.maxInputTokens} tokens (${Math.round((totalTokens / this.maxInputTokens) * 100)}%)`,
        {
          estimatedTokens: totalTokens,
          limit: this.maxInputTokens,
          percentage: Math.round((totalTokens / this.maxInputTokens) * 100),
        }
      );
    }

    return Promise.resolve(this.allow(context));
  }

  private checkOutputTokens(
    context: GuardrailContext,
    phase: GuardrailPhase
  ): Promise<GuardrailResult> {
    // Skip if no output limit configured
    if (!this.maxOutputTokens) {
      return Promise.resolve(this.allow(context));
    }

    const response = context.response || '';
    const estimatedTokens = this.estimateTokenCount(response);

    // Check if over limit
    if (estimatedTokens > this.maxOutputTokens) {
      this.addViolation(
        context,
        phase,
        'max_output_tokens',
        'error',
        `Output token limit exceeded: estimated ${estimatedTokens} tokens (limit: ${this.maxOutputTokens})`,
        { estimatedTokens, limit: this.maxOutputTokens }
      );
      return Promise.resolve(
        this.block(
          context,
          `Output token limit exceeded: ~${estimatedTokens}/${this.maxOutputTokens} tokens`
        )
      );
    }

    // Warn if approaching limit
    const warnThreshold = this.maxOutputTokens * (this.warnAtPercentage / 100);
    if (estimatedTokens >= warnThreshold) {
      this.addViolation(
        context,
        phase,
        'max_output_tokens_warning',
        'warning',
        `Approaching output token limit: estimated ${estimatedTokens}/${this.maxOutputTokens} tokens (${Math.round((estimatedTokens / this.maxOutputTokens) * 100)}%)`,
        {
          estimatedTokens,
          limit: this.maxOutputTokens,
          percentage: Math.round((estimatedTokens / this.maxOutputTokens) * 100),
        }
      );
    }

    return Promise.resolve(this.allow(context));
  }

  /**
   * Estimate token count from text
   * Uses a simple heuristic: ~4 characters per token for English text
   * This is a rough approximation - for accuracy, use tiktoken
   */
  estimateTokenCount(text: string): number {
    if (!text) return 0;
    // Rough approximation: 1 token ≈ 4 characters for English
    // Add some overhead for special tokens
    return Math.ceil(text.length / 4) + 4;
  }

  /**
   * Get configured limits (for testing/monitoring)
   */
  getLimits(): { maxInputTokens: number; maxOutputTokens: number | undefined } {
    return {
      maxInputTokens: this.maxInputTokens,
      maxOutputTokens: this.maxOutputTokens,
    };
  }
}
