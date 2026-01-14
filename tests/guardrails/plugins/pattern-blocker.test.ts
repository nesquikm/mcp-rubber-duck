import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PatternBlockerPlugin } from '../../../src/guardrails/plugins/pattern-blocker';
import { createGuardrailContext } from '../../../src/guardrails/context';

// Mock logger to avoid console noise during tests
jest.mock('../../../src/utils/logger');

describe('PatternBlockerPlugin', () => {
  let plugin: PatternBlockerPlugin;

  beforeEach(async () => {
    plugin = new PatternBlockerPlugin();
  });

  describe('initialization', () => {
    it('should initialize with default values', async () => {
      await plugin.initialize({ enabled: true });

      expect(plugin.enabled).toBe(true);
      expect(plugin.name).toBe('pattern_blocker');
      expect(plugin.phases).toContain('pre_request');
      expect(plugin.phases).toContain('pre_tool_input');
    });

    it('should initialize with custom patterns', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['password', 'secret'],
        blocked_patterns_regex: ['api[_-]?key'],
      });

      const patterns = plugin.getPatterns();
      expect(patterns.simple).toEqual(['password', 'secret']);
      expect(patterns.regex).toEqual(['api[_-]?key']);
    });
  });

  describe('simple pattern matching', () => {
    it('should block prompts containing blocked patterns', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['password', 'secret'],
        action_on_match: 'block',
      });

      const context = createGuardrailContext({
        prompt: 'My password is hunter2',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('block');
      expect(result.blockedBy).toBe('pattern_blocker');
    });

    it('should allow prompts without blocked patterns', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['password', 'secret'],
        action_on_match: 'block',
      });

      const context = createGuardrailContext({
        prompt: 'Hello world, how are you?',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('allow');
    });

    it('should be case insensitive by default', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['password'],
        case_sensitive: false,
        action_on_match: 'block',
      });

      const context = createGuardrailContext({
        prompt: 'My PASSWORD is hunter2',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('block');
    });

    it('should respect case sensitivity when configured', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['password'],
        case_sensitive: true,
        action_on_match: 'block',
      });

      // Lowercase should match
      const context1 = createGuardrailContext({
        prompt: 'My password is hunter2',
      });
      const result1 = await plugin.execute('pre_request', context1);
      expect(result1.action).toBe('block');

      // Uppercase should NOT match
      const context2 = createGuardrailContext({
        prompt: 'My PASSWORD is hunter2',
      });
      const result2 = await plugin.execute('pre_request', context2);
      expect(result2.action).toBe('allow');
    });
  });

  describe('regex pattern matching', () => {
    it('should match regex patterns', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns_regex: ['api[_-]?key[_-]?[a-z0-9]{8,}'],
        action_on_match: 'block',
      });

      const context = createGuardrailContext({
        prompt: 'My api_key_abc12345678 is sensitive',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('block');
    });

    it('should handle invalid regex gracefully', async () => {
      // Invalid regex should be skipped during initialization
      await plugin.initialize({
        enabled: true,
        blocked_patterns_regex: ['[invalid(regex'],
        action_on_match: 'block',
      });

      const patterns = plugin.getPatterns();
      expect(patterns.regex).toEqual([]); // Invalid regex should be skipped

      const context = createGuardrailContext({
        prompt: 'This should be allowed',
      });
      const result = await plugin.execute('pre_request', context);
      expect(result.action).toBe('allow');
    });
  });

  describe('action modes', () => {
    it('should block when action is block', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['secret'],
        action_on_match: 'block',
      });

      const context = createGuardrailContext({
        prompt: 'This is a secret message',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('block');
      expect(context.violations.some((v) => v.severity === 'error')).toBe(true);
    });

    it('should warn but allow when action is warn', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['secret'],
        action_on_match: 'warn',
      });

      const context = createGuardrailContext({
        prompt: 'This is a secret message',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('allow');
      expect(context.violations.some((v) => v.severity === 'warning')).toBe(true);
    });

    it('should redact when action is redact', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['secret'],
        action_on_match: 'redact',
      });

      const context = createGuardrailContext({
        prompt: 'This is a secret message',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('modify');
      expect(context.prompt).toContain('[REDACTED]');
      expect(context.prompt).not.toContain('secret');
    });
  });

  describe('tool input checking', () => {
    it('should check tool arguments', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['password'],
        action_on_match: 'block',
      });

      const context = createGuardrailContext({
        toolName: 'some_tool',
        toolArgs: { user: 'admin', password: 'hunter2' },
      });
      const result = await plugin.execute('pre_tool_input', context);

      expect(result.action).toBe('block');
    });
  });

  describe('violations', () => {
    it('should add violation with pattern details', async () => {
      await plugin.initialize({
        enabled: true,
        blocked_patterns: ['password'],
        action_on_match: 'block',
      });

      const context = createGuardrailContext({
        prompt: 'My password is secret',
      });
      await plugin.execute('pre_request', context);

      expect(context.violations.length).toBeGreaterThan(0);
      expect(context.violations[0].rule).toBe('blocked_pattern');
      expect(context.violations[0].details?.matches).toBeDefined();
    });
  });
});
