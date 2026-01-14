import { randomUUID } from 'crypto';
import { GuardrailContext, CreateContextOptions } from './types.js';

/**
 * Create a new guardrail context with defaults
 */
export function createGuardrailContext(options: CreateContextOptions = {}): GuardrailContext {
  return {
    requestId: options.requestId || randomUUID(),
    provider: options.provider || 'unknown',
    model: options.model || 'unknown',
    timestamp: new Date(),
    messages: options.messages || [],
    prompt: options.prompt,
    response: options.response,
    toolName: options.toolName,
    toolArgs: options.toolArgs,
    toolResult: options.toolResult,
    metadata: new Map(),
    violations: [],
    modifications: [],
  };
}

/**
 * Clone a guardrail context (deep copy metadata but shallow copy violations/modifications)
 */
export function cloneContext(context: GuardrailContext): GuardrailContext {
  return {
    ...context,
    messages: [...context.messages],
    toolArgs: context.toolArgs ? { ...context.toolArgs } : undefined,
    metadata: new Map(context.metadata),
    violations: [...context.violations],
    modifications: [...context.modifications],
  };
}
