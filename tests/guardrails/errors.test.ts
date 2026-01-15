import { describe, it, expect } from '@jest/globals';
import {
  GuardrailBlockError,
  GuardrailInitError,
  GuardrailExecutionError,
} from '../../src/guardrails/errors.js';

describe('GuardrailBlockError', () => {
  it('should create error with plugin name and reason', () => {
    const error = new GuardrailBlockError('rate_limiter', 'Too many requests');

    expect(error.pluginName).toBe('rate_limiter');
    expect(error.reason).toBe('Too many requests');
  });

  it('should format message correctly', () => {
    const error = new GuardrailBlockError('pii_redactor', 'Sensitive data detected');

    expect(error.message).toBe(
      "Request blocked by guardrail 'pii_redactor': Sensitive data detected"
    );
  });

  it('should have correct error name', () => {
    const error = new GuardrailBlockError('test', 'reason');

    expect(error.name).toBe('GuardrailBlockError');
  });

  it('should be instanceof Error', () => {
    const error = new GuardrailBlockError('test', 'reason');

    expect(error).toBeInstanceOf(Error);
  });
});

describe('GuardrailInitError', () => {
  it('should create error with plugin name and message', () => {
    const error = new GuardrailInitError('token_limiter', 'Invalid configuration');

    expect(error.pluginName).toBe('token_limiter');
    expect(error.cause).toBeUndefined();
  });

  it('should format message correctly', () => {
    const error = new GuardrailInitError('pattern_blocker', 'Missing required field');

    expect(error.message).toBe(
      "Failed to initialize guardrail plugin 'pattern_blocker': Missing required field"
    );
  });

  it('should store cause error when provided', () => {
    const cause = new Error('Original error');
    const error = new GuardrailInitError('test_plugin', 'Init failed', cause);

    expect(error.cause).toBe(cause);
  });

  it('should have correct error name', () => {
    const error = new GuardrailInitError('test', 'message');

    expect(error.name).toBe('GuardrailInitError');
  });
});

describe('GuardrailExecutionError', () => {
  it('should create error with plugin name, phase, and message', () => {
    const error = new GuardrailExecutionError(
      'rate_limiter',
      'pre_request',
      'Execution failed'
    );

    expect(error.pluginName).toBe('rate_limiter');
    expect(error.phase).toBe('pre_request');
    expect(error.cause).toBeUndefined();
  });

  it('should format message correctly', () => {
    const error = new GuardrailExecutionError(
      'pii_redactor',
      'post_response',
      'Pattern matching failed'
    );

    expect(error.message).toBe(
      "Guardrail plugin 'pii_redactor' failed during 'post_response': Pattern matching failed"
    );
  });

  it('should store cause error when provided', () => {
    const cause = new TypeError('Cannot read property');
    const error = new GuardrailExecutionError(
      'test_plugin',
      'pre_tool_input',
      'Unexpected error',
      cause
    );

    expect(error.cause).toBe(cause);
  });

  it('should have correct error name', () => {
    const error = new GuardrailExecutionError('test', 'phase', 'message');

    expect(error.name).toBe('GuardrailExecutionError');
  });
});
