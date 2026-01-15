import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TokenLimiterPlugin } from '../../../src/guardrails/plugins/token-limiter';
import { createGuardrailContext } from '../../../src/guardrails/context';

// Mock logger to avoid console noise during tests
jest.mock('../../../src/utils/logger');

describe('TokenLimiterPlugin', () => {
  let plugin: TokenLimiterPlugin;

  beforeEach(async () => {
    plugin = new TokenLimiterPlugin();
  });

  describe('initialization', () => {
    it('should initialize with default values', async () => {
      await plugin.initialize({ enabled: true });

      expect(plugin.enabled).toBe(true);
      expect(plugin.name).toBe('token_limiter');
      expect(plugin.phases).toContain('pre_request');
      expect(plugin.getLimits().maxInputTokens).toBe(8192);
    });

    it('should initialize with custom config', async () => {
      await plugin.initialize({
        enabled: true,
        priority: 15,
        max_input_tokens: 4096,
        max_output_tokens: 2048,
        warn_at_percentage: 90,
      });

      expect(plugin.priority).toBe(15);
      const limits = plugin.getLimits();
      expect(limits.maxInputTokens).toBe(4096);
      expect(limits.maxOutputTokens).toBe(2048);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens from text', async () => {
      await plugin.initialize({ enabled: true });

      // ~4 chars per token
      expect(plugin.estimateTokenCount('Hello')).toBeGreaterThan(0);
      expect(plugin.estimateTokenCount('Hello world')).toBeGreaterThan(plugin.estimateTokenCount('Hello'));
    });

    it('should return 0 for empty text', async () => {
      await plugin.initialize({ enabled: true });

      expect(plugin.estimateTokenCount('')).toBe(0);
    });
  });

  describe('token limiting', () => {
    it('should allow prompts under the limit', async () => {
      await plugin.initialize({
        enabled: true,
        max_input_tokens: 1000,
      });

      const shortPrompt = 'Hello world'; // ~7 tokens
      const context = createGuardrailContext({ prompt: shortPrompt });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('allow');
    });

    it('should block prompts over the limit', async () => {
      await plugin.initialize({
        enabled: true,
        max_input_tokens: 10, // Very small limit
      });

      // Create a prompt that exceeds the limit (~4 chars per token)
      const longPrompt = 'This is a longer prompt that will definitely exceed our tiny token limit';
      const context = createGuardrailContext({ prompt: longPrompt });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('block');
      expect(result.blockedBy).toBe('token_limiter');
      expect(result.blockReason).toContain('Token limit exceeded');
    });

    it('should include messages in token count', async () => {
      await plugin.initialize({
        enabled: true,
        max_input_tokens: 20,
      });

      const context = createGuardrailContext({
        prompt: 'Short',
        messages: [
          { role: 'user', content: 'This is a message with many tokens that should push us over the limit', timestamp: new Date() },
        ],
      });

      const result = await plugin.execute('pre_request', context);
      expect(result.action).toBe('block');
    });
  });

  describe('warnings', () => {
    it('should add warning when approaching limit', async () => {
      await plugin.initialize({
        enabled: true,
        max_input_tokens: 100,
        warn_at_percentage: 50, // Warn at 50%
      });

      // Create prompt that's ~60-80% of limit
      const prompt = 'A'.repeat(300); // ~75 tokens
      const context = createGuardrailContext({ prompt });
      await plugin.execute('pre_request', context);

      const warnings = context.violations.filter((v) => v.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should not warn when well under limit', async () => {
      await plugin.initialize({
        enabled: true,
        max_input_tokens: 1000,
        warn_at_percentage: 80,
      });

      const shortPrompt = 'Hello';
      const context = createGuardrailContext({ prompt: shortPrompt });
      await plugin.execute('pre_request', context);

      const warnings = context.violations.filter((v) => v.severity === 'warning');
      expect(warnings.length).toBe(0);
    });
  });

  describe('phase handling', () => {
    it('should process pre_request and post_response phases', async () => {
      await plugin.initialize({ enabled: true });

      expect(plugin.phases).toContain('pre_request');
      expect(plugin.phases).toContain('post_response');
    });

    it('should allow other phases', async () => {
      await plugin.initialize({ enabled: true });

      const context = createGuardrailContext({ prompt: 'test' });

      // pre_tool_input should pass through
      const result = await plugin.execute('pre_tool_input', context);
      expect(result.action).toBe('allow');
    });
  });

  describe('output token limiting', () => {
    it('should allow responses under the limit', async () => {
      await plugin.initialize({
        enabled: true,
        max_output_tokens: 1000,
      });

      const context = createGuardrailContext({ prompt: 'test' });
      context.response = 'Short response';
      const result = await plugin.execute('post_response', context);

      expect(result.action).toBe('allow');
    });

    it('should block responses over the limit', async () => {
      await plugin.initialize({
        enabled: true,
        max_output_tokens: 10, // Very small limit
      });

      const context = createGuardrailContext({ prompt: 'test' });
      context.response = 'This is a longer response that will definitely exceed our tiny token limit for output';
      const result = await plugin.execute('post_response', context);

      expect(result.action).toBe('block');
      expect(result.blockedBy).toBe('token_limiter');
      expect(result.blockReason).toContain('Output token limit exceeded');
    });

    it('should skip output check if no max_output_tokens configured', async () => {
      await plugin.initialize({
        enabled: true,
        // No max_output_tokens
      });

      const context = createGuardrailContext({ prompt: 'test' });
      context.response = 'A'.repeat(10000); // Very long response
      const result = await plugin.execute('post_response', context);

      expect(result.action).toBe('allow');
    });

    it('should add warning when response approaches output limit', async () => {
      await plugin.initialize({
        enabled: true,
        max_output_tokens: 100,
        warn_at_percentage: 50, // Warn at 50%
      });

      // Create response that's ~60-80% of limit
      const context = createGuardrailContext({ prompt: 'test' });
      context.response = 'A'.repeat(300); // ~75 tokens
      await plugin.execute('post_response', context);

      const warnings = context.violations.filter((v) => v.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].rule).toBe('max_output_tokens_warning');
    });
  });
});
