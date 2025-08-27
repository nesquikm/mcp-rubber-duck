import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DuckProvider } from '../src/providers/provider';
import { ProviderManager } from '../src/providers/manager';
import { ConfigManager } from '../src/config/config';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: { content: 'Mocked response' },
              finish_reason: 'stop',
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
            model: 'mock-model',
          }),
        },
      },
    })),
  };
});

// Mock config manager
jest.mock('../src/config/config');
jest.mock('../src/utils/logger');

describe('DuckProvider', () => {
  let provider: DuckProvider;

  beforeEach(() => {
    provider = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'test-model',
      temperature: 0.7,
      maxTokens: 1000,
    });
  });

  it('should create a provider instance', () => {
    expect(provider).toBeDefined();
    expect(provider.name).toBe('test');
    expect(provider.nickname).toBe('Test Duck');
  });

  it('should get provider info', () => {
    const info = provider.getInfo();
    expect(info).toEqual({
      name: 'test',
      nickname: 'Test Duck',
      model: 'test-model',
      baseURL: 'https://api.test.com/v1',
      hasApiKey: true,
    });
  });

  it('should send chat request', async () => {
    const response = await provider.chat({
      messages: [
        { role: 'user', content: 'Hello', timestamp: new Date() },
      ],
    });

    expect(response).toBeDefined();
    expect(response.content).toBe('Mocked response');
    expect(response.usage).toBeDefined();
    expect(response.model).toBe('mock-model');
  });
});

describe('ProviderManager', () => {
  let manager: ProviderManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  beforeEach(() => {
    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        providers: {
          test1: {
            api_key: 'key1',
            base_url: 'https://api1.test.com/v1',
            default_model: 'model1',
            nickname: 'Duck 1',
            models: ['model1'],
          },
          test2: {
            api_key: 'key2',
            base_url: 'https://api2.test.com/v1',
            default_model: 'model2',
            nickname: 'Duck 2',
            models: ['model2'],
          },
        },
        default_provider: 'test1',
        cache_ttl: 300,
        enable_failover: true,
        default_temperature: 0.7,
        default_max_tokens: 2000,
      }),
    } as any;

    manager = new ProviderManager(mockConfigManager);
  });

  it('should initialize providers from config', () => {
    const providers = manager.getProviderNames();
    expect(providers).toContain('test1');
    expect(providers).toContain('test2');
  });

  it('should get a specific provider', () => {
    const provider = manager.getProvider('test1');
    expect(provider).toBeDefined();
    expect(provider.name).toBe('test1');
  });

  it('should get default provider when no name specified', () => {
    const provider = manager.getProvider();
    expect(provider).toBeDefined();
    expect(provider.name).toBe('test1');
  });

  it('should throw error for non-existent provider', () => {
    expect(() => manager.getProvider('nonexistent')).toThrow(
      'Duck "nonexistent" not found in the pond'
    );
  });

  it('should ask a duck', async () => {
    const response = await manager.askDuck('test1', 'Hello');
    expect(response).toBeDefined();
    expect(response.provider).toBe('test1');
    expect(response.content).toBe('Mocked response');
  });

  it('should compare multiple ducks', async () => {
    const responses = await manager.compareDucks('Hello', ['test1', 'test2']);
    expect(responses).toHaveLength(2);
    expect(responses[0].provider).toBe('test1');
    expect(responses[1].provider).toBe('test2');
  });

  it('should run duck council', async () => {
    const responses = await manager.duckCouncil('Hello');
    expect(responses).toHaveLength(2);
  });
});