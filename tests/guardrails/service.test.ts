import { describe, it, expect, jest } from '@jest/globals';
import { GuardrailsService, createGuardrailContext } from '../../src/guardrails';

// Mock logger to avoid console noise during tests
jest.mock('../../src/utils/logger');

describe('GuardrailsService', () => {
  describe('initialization', () => {
    it('should be disabled by default', async () => {
      const service = new GuardrailsService();
      await service.initialize();

      expect(service.isEnabled()).toBe(false);
    });

    it('should be disabled when config.enabled is false', async () => {
      const service = new GuardrailsService({ enabled: false });
      await service.initialize();

      expect(service.isEnabled()).toBe(false);
    });

    it('should have no plugins when disabled', async () => {
      const service = new GuardrailsService({ enabled: false });
      await service.initialize();

      expect(service.getPlugins()).toHaveLength(0);
    });
  });

  describe('context creation', () => {
    it('should create context with defaults', () => {
      const service = new GuardrailsService();
      const context = service.createContext({});

      expect(context.requestId).toBeDefined();
      expect(context.provider).toBe('unknown');
      expect(context.model).toBe('unknown');
      expect(context.timestamp).toBeInstanceOf(Date);
      expect(context.messages).toEqual([]);
      expect(context.metadata).toBeInstanceOf(Map);
      expect(context.violations).toEqual([]);
      expect(context.modifications).toEqual([]);
    });

    it('should create context with provided values', () => {
      const service = new GuardrailsService();
      const context = service.createContext({
        requestId: 'test-123',
        provider: 'openai',
        model: 'gpt-4',
        prompt: 'Hello world',
      });

      expect(context.requestId).toBe('test-123');
      expect(context.provider).toBe('openai');
      expect(context.model).toBe('gpt-4');
      expect(context.prompt).toBe('Hello world');
    });
  });

  describe('execute', () => {
    it('should allow requests when disabled', async () => {
      const service = new GuardrailsService({ enabled: false });
      await service.initialize();

      const context = createGuardrailContext({ prompt: 'test' });
      const result = await service.execute('pre_request', context);

      expect(result.action).toBe('allow');
    });

    it('should allow requests when no plugins match phase', async () => {
      const service = new GuardrailsService({ enabled: true });
      await service.initialize();

      const context = createGuardrailContext({ prompt: 'test' });
      const result = await service.execute('pre_request', context);

      expect(result.action).toBe('allow');
    });
  });

  describe('shutdown', () => {
    it('should disable service on shutdown', async () => {
      const service = new GuardrailsService({ enabled: true });
      await service.initialize();
      await service.shutdown();

      expect(service.isEnabled()).toBe(false);
      expect(service.getPlugins()).toHaveLength(0);
    });
  });
});

describe('createGuardrailContext', () => {
  it('should generate unique request IDs', () => {
    const context1 = createGuardrailContext({});
    const context2 = createGuardrailContext({});

    expect(context1.requestId).not.toBe(context2.requestId);
  });

  it('should use provided request ID', () => {
    const context = createGuardrailContext({ requestId: 'custom-id' });
    expect(context.requestId).toBe('custom-id');
  });

  it('should initialize empty violations and modifications', () => {
    const context = createGuardrailContext({});

    expect(context.violations).toEqual([]);
    expect(context.modifications).toEqual([]);
  });

  it('should initialize empty metadata map', () => {
    const context = createGuardrailContext({});

    expect(context.metadata).toBeInstanceOf(Map);
    expect(context.metadata.size).toBe(0);
  });
});
