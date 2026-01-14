import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RateLimiterPlugin } from '../../../src/guardrails/plugins/rate-limiter';
import { createGuardrailContext } from '../../../src/guardrails/context';

// Mock logger to avoid console noise during tests
jest.mock('../../../src/utils/logger');

describe('RateLimiterPlugin', () => {
  let plugin: RateLimiterPlugin;

  beforeEach(async () => {
    plugin = new RateLimiterPlugin();
    plugin.reset();
  });

  describe('initialization', () => {
    it('should initialize with default values', async () => {
      await plugin.initialize({ enabled: true });

      expect(plugin.enabled).toBe(true);
      expect(plugin.name).toBe('rate_limiter');
      expect(plugin.phases).toContain('pre_request');
    });

    it('should initialize with custom config', async () => {
      await plugin.initialize({
        enabled: true,
        priority: 5,
        requests_per_minute: 30,
        requests_per_hour: 500,
        per_provider: true,
        burst_allowance: 10,
      });

      expect(plugin.priority).toBe(5);
    });
  });

  describe('rate limiting - per minute', () => {
    it('should allow requests under the limit', async () => {
      await plugin.initialize({
        enabled: true,
        requests_per_minute: 10,
        requests_per_hour: 1000,
        burst_allowance: 0,
      });

      const context = createGuardrailContext({ provider: 'openai' });

      // Make 5 requests - all should be allowed
      for (let i = 0; i < 5; i++) {
        const result = await plugin.execute('pre_request', context);
        expect(result.action).toBe('allow');
      }

      expect(plugin.getRequestCounts().lastMinute).toBe(5);
    });

    it('should block requests over the limit', async () => {
      await plugin.initialize({
        enabled: true,
        requests_per_minute: 3,
        requests_per_hour: 1000,
        burst_allowance: 0,
      });

      const context = createGuardrailContext({ provider: 'openai' });

      // Make 3 requests - all should be allowed
      for (let i = 0; i < 3; i++) {
        const result = await plugin.execute('pre_request', context);
        expect(result.action).toBe('allow');
      }

      // 4th request should be blocked
      const result = await plugin.execute('pre_request', context);
      expect(result.action).toBe('block');
      expect(result.blockedBy).toBe('rate_limiter');
      expect(result.blockReason).toContain('Rate limit exceeded');
    });

    it('should allow burst requests within burst allowance', async () => {
      await plugin.initialize({
        enabled: true,
        requests_per_minute: 3,
        requests_per_hour: 1000,
        burst_allowance: 2,
      });

      const context = createGuardrailContext({ provider: 'openai' });

      // Make 5 requests - all should be allowed (3 + 2 burst)
      for (let i = 0; i < 5; i++) {
        const result = await plugin.execute('pre_request', context);
        expect(result.action).toBe('allow');
      }

      // 6th request should be blocked
      const result = await plugin.execute('pre_request', context);
      expect(result.action).toBe('block');
    });
  });

  describe('rate limiting - per provider', () => {
    it('should track requests globally by default', async () => {
      await plugin.initialize({
        enabled: true,
        requests_per_minute: 5,
        requests_per_hour: 1000,
        per_provider: false,
        burst_allowance: 0,
      });

      // Make requests for different providers
      for (let i = 0; i < 5; i++) {
        const provider = i % 2 === 0 ? 'openai' : 'gemini';
        const context = createGuardrailContext({ provider });
        await plugin.execute('pre_request', context);
      }

      // Global count should be 5
      expect(plugin.getRequestCounts('global').lastMinute).toBe(5);

      // Next request from any provider should be blocked
      const context = createGuardrailContext({ provider: 'openai' });
      const result = await plugin.execute('pre_request', context);
      expect(result.action).toBe('block');
    });

    it('should track requests per provider when configured', async () => {
      await plugin.initialize({
        enabled: true,
        requests_per_minute: 3,
        requests_per_hour: 1000,
        per_provider: true,
        burst_allowance: 0,
      });

      // Make 3 requests for OpenAI
      for (let i = 0; i < 3; i++) {
        const context = createGuardrailContext({ provider: 'openai' });
        const result = await plugin.execute('pre_request', context);
        expect(result.action).toBe('allow');
      }

      // OpenAI should be blocked
      const openaiContext = createGuardrailContext({ provider: 'openai' });
      const openaiResult = await plugin.execute('pre_request', openaiContext);
      expect(openaiResult.action).toBe('block');

      // But Gemini should still be allowed
      const geminiContext = createGuardrailContext({ provider: 'gemini' });
      const geminiResult = await plugin.execute('pre_request', geminiContext);
      expect(geminiResult.action).toBe('allow');

      expect(plugin.getRequestCounts('openai').lastMinute).toBe(3);
      expect(plugin.getRequestCounts('gemini').lastMinute).toBe(1);
    });
  });

  describe('violations', () => {
    it('should add violation when rate limit exceeded', async () => {
      await plugin.initialize({
        enabled: true,
        requests_per_minute: 1,
        requests_per_hour: 1000,
        burst_allowance: 0,
      });

      const context = createGuardrailContext({ provider: 'openai' });

      // First request
      await plugin.execute('pre_request', context);

      // Second request - should be blocked with violation
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('block');
      expect(context.violations.length).toBeGreaterThan(0);
      expect(context.violations[0].rule).toBe('requests_per_minute');
      expect(context.violations[0].severity).toBe('error');
    });

    it('should add warning when approaching limit', async () => {
      await plugin.initialize({
        enabled: true,
        requests_per_minute: 10,
        requests_per_hour: 1000,
        burst_allowance: 0,
      });

      const context = createGuardrailContext({ provider: 'openai' });

      // Make 9 requests - the 9th sees 8 previous requests (80% of limit)
      // Warning is added when request count before current >= 80%
      for (let i = 0; i < 9; i++) {
        await plugin.execute('pre_request', context);
      }

      // Check for warning violation
      const warnings = context.violations.filter(
        (v) => v.severity === 'warning' && v.rule === 'requests_per_minute_warning'
      );
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('phase handling', () => {
    it('should only process pre_request phase', async () => {
      await plugin.initialize({ enabled: true, requests_per_minute: 1 });

      const context = createGuardrailContext({ provider: 'openai' });

      // pre_request should be processed
      const preResult = await plugin.execute('pre_request', context);
      expect(preResult.action).toBe('allow');

      // post_response should be skipped (not in phases)
      const postResult = await plugin.execute('post_response', context);
      expect(postResult.action).toBe('allow');

      // Only 1 request counted (pre_request)
      expect(plugin.getRequestCounts().lastMinute).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear request history on reset', async () => {
      await plugin.initialize({
        enabled: true,
        requests_per_minute: 10,
        burst_allowance: 0,
      });

      const context = createGuardrailContext({ provider: 'openai' });

      // Make some requests
      for (let i = 0; i < 5; i++) {
        await plugin.execute('pre_request', context);
      }

      expect(plugin.getRequestCounts().lastMinute).toBe(5);

      // Reset
      plugin.reset();

      expect(plugin.getRequestCounts().lastMinute).toBe(0);
    });
  });
});
