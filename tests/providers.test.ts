import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock OpenAI BEFORE importing the provider
const mockCreate = jest.fn();
jest.mock('openai', () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
  return {
    __esModule: true,
    default: MockOpenAI,
  };
});

// Mock config manager and logger
jest.mock('../src/config/config');
jest.mock('../src/utils/logger');

// NOW import the modules after setting up mocks
import { DuckProvider } from '../src/providers/provider';
import { ProviderManager } from '../src/providers/manager';
import { ConfigManager } from '../src/config/config';

describe('DuckProvider', () => {
  let provider: DuckProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock response
    mockCreate.mockResolvedValue({
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
    });
    
    provider = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'test-model',
      temperature: 0.7,
    });
    
    // Override the method on the actual instance since Jest ESM mocking isn't working
    provider['client'].chat.completions.create = mockCreate;
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
    console.log('Starting chat request test');
    console.log('Mock create has been called:', mockCreate.mock.calls.length, 'times');
    
    const response = await provider.chat({
      messages: [
        { role: 'user', content: 'Hello', timestamp: new Date() },
      ],
    });

    console.log('Chat response received:', response);
    expect(response).toBeDefined();
    expect(response.content).toBe('Mocked response');
    expect(response.usage).toBeDefined();
    expect(response.model).toBe('test-model');
  });

  it('should use correct parameters for o1 models', async () => {
    mockCreate.mockClear();

    const testProvider = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'o1',
    });

    // Override the method on the actual instance since Jest ESM mocking isn't working
    testProvider['client'].chat.completions.create = mockCreate;

    await testProvider.chat({
      messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
      model: 'o1',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const calls = (mockCreate as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const callParams = calls[0][0];
    
    // o1 models should NOT have temperature or token limits
    expect(callParams).not.toHaveProperty('temperature');
  });

  it('should use correct parameters for GPT-5 models', async () => {
    mockCreate.mockClear();

    const testProvider = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'gpt-5',
    });

    // Override the method on the actual instance since Jest ESM mocking isn't working
    testProvider['client'].chat.completions.create = mockCreate;

    await testProvider.chat({
      messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
      model: 'gpt-5',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const calls = (mockCreate as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const callParams = calls[0][0];
    
    // GPT-5 models should NOT have temperature or token limits
    expect(callParams).not.toHaveProperty('temperature');
  });

  it('should use correct parameters for non-o1 models', async () => {
    mockCreate.mockClear();

    const testProvider = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'gpt-4',
    });

    // Override the method on the actual instance since Jest ESM mocking isn't working
    testProvider['client'].chat.completions.create = mockCreate;

    await testProvider.chat({
      messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
      model: 'gpt-4',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const calls = (mockCreate as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const callParams = calls[0][0];
    
    // non-o1 models should have temperature but no token limits
    expect(callParams).toHaveProperty('temperature');
  });
});

describe('ProviderManager', () => {
  let manager: ProviderManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock response
    mockCreate.mockResolvedValue({
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
    });
    
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
      }),
    } as any;

    manager = new ProviderManager(mockConfigManager);
    
    // Override the client method on all providers in the manager
    const provider1 = manager.getProvider('test1');
    const provider2 = manager.getProvider('test2');
    provider1['client'].chat.completions.create = mockCreate;
    provider2['client'].chat.completions.create = mockCreate;
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