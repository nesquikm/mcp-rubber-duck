import {
  GuardrailPlugin,
  GuardrailPhase,
  GuardrailContext,
  GuardrailResult,
} from '../types.js';

/**
 * Abstract base class for guardrail plugins
 */
export abstract class BaseGuardrailPlugin implements GuardrailPlugin {
  abstract name: string;
  abstract phases: GuardrailPhase[];

  enabled: boolean = false;
  priority: number = 100;

  protected config: Record<string, unknown> = {};

  initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config;
    this.enabled = true;
    if (typeof config.priority === 'number') {
      this.priority = config.priority;
    }
    return Promise.resolve();
  }

  abstract execute(phase: GuardrailPhase, context: GuardrailContext): Promise<GuardrailResult>;

  shutdown(): Promise<void> {
    this.enabled = false;
    return Promise.resolve();
  }

  /**
   * Helper to create an 'allow' result
   */
  protected allow(context: GuardrailContext): GuardrailResult {
    return { action: 'allow', context };
  }

  /**
   * Helper to create a 'block' result
   */
  protected block(context: GuardrailContext, reason: string): GuardrailResult {
    return {
      action: 'block',
      context,
      blockedBy: this.name,
      blockReason: reason,
    };
  }

  /**
   * Helper to create a 'modify' result
   */
  protected modify(context: GuardrailContext): GuardrailResult {
    return { action: 'modify', context };
  }

  /**
   * Helper to add a violation to context
   */
  protected addViolation(
    context: GuardrailContext,
    phase: GuardrailPhase,
    rule: string,
    severity: 'info' | 'warning' | 'error' | 'critical',
    message: string,
    details?: Record<string, unknown>
  ): void {
    context.violations.push({
      pluginName: this.name,
      phase,
      rule,
      severity,
      message,
      details,
    });
  }

  /**
   * Helper to add a modification to context
   */
  protected addModification(
    context: GuardrailContext,
    phase: GuardrailPhase,
    field: string,
    reason: string,
    originalValue?: unknown,
    newValue?: unknown
  ): void {
    context.modifications.push({
      pluginName: this.name,
      phase,
      field,
      originalValue,
      newValue,
      reason,
    });
  }
}
