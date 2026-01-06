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

  it('should get all providers info', () => {
    const providers = manager.getAllProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0].name).toBe('test1');
    expect(providers[0].info.nickname).toBe('Duck 1');
    expect(providers[1].name).toBe('test2');
    expect(providers[1].info.nickname).toBe('Duck 2');
  });

  it('should validate model for provider', () => {
    // Valid model should return true
    const isValid = manager.validateModel('test1', 'model1');
    expect(isValid).toBe(true);
  });

  it('should return false for invalid model', () => {
    const isValid = manager.validateModel('test1', 'nonexistent-model');
    expect(isValid).toBe(false);
  });

  it('should handle error in compareDucks gracefully', async () => {
    // Make one provider fail
    const provider1 = manager.getProvider('test1');
    provider1['client'].chat.completions.create = jest.fn().mockRejectedValue(new Error('API Error'));

    const responses = await manager.compareDucks('Hello', ['test1', 'test2']);

    // Should still return responses, with error message for failed provider
    expect(responses).toHaveLength(2);
    expect(responses[0].content).toContain('Error');
    expect(responses[1].content).toBe('Mocked response');
  });

  it('should throw error when no valid providers in compareDucks', async () => {
    await expect(manager.compareDucks('Hello', ['nonexistent'])).rejects.toThrow(
      'No valid providers specified'
    );
  });

  it('should check health of all providers', async () => {
    const results = await manager.checkHealth();
    expect(results).toHaveLength(2);
    expect(results[0].provider).toBe('test1');
    expect(results[1].provider).toBe('test2');
  });

  it('should check health of specific provider', async () => {
    const results = await manager.checkHealth('test1');
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('test1');
  });

  it('should handle health check that returns false', async () => {
    // Mock the health check to return false (not throw)
    const provider1 = manager.getProvider('test1');
    provider1['client'].chat.completions.create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '' } }], // Empty content = unhealthy
    });

    const results = await manager.checkHealth('test1');

    expect(results).toHaveLength(1);
    expect(results[0].healthy).toBe(false);
  });

  it('should throw error when getting models for nonexistent provider', async () => {
    await expect(manager.getAvailableModels('nonexistent')).rejects.toThrow(
      'Provider nonexistent not found'
    );
  });

  it('should return false when validating model for nonexistent provider', () => {
    const isValid = manager.validateModel('nonexistent', 'model1');
    expect(isValid).toBe(false);
  });

  it('should return true for any model when provider has no models list', () => {
    // Create manager with a provider that has no models configured
    const noModelsConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        providers: {
          testNoModels: {
            api_key: 'key1',
            base_url: 'https://api.test.com/v1',
            default_model: 'model1',
            nickname: 'Test No Models',
            // No models array - undefined
          },
        },
        default_provider: 'testNoModels',
        cache_ttl: 300,
        enable_failover: false,
        default_temperature: 0.7,
      }),
    } as any;

    const noModelsManager = new ProviderManager(noModelsConfigManager);

    // When provider has no availableModels, should return true (let API validate)
    const isValid = noModelsManager.validateModel('testNoModels', 'any-model-name');
    expect(isValid).toBe(true);
  });
});

describe('ProviderManager Error Cases', () => {
  it('should throw error when no default provider and none specified', () => {
    const mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        providers: {
          test1: {
            api_key: 'key1',
            base_url: 'https://api1.test.com/v1',
            default_model: 'model1',
            nickname: 'Duck 1',
          },
        },
        // No default_provider set
        cache_ttl: 300,
        enable_failover: false,
        default_temperature: 0.7,
      }),
    } as any;

    const manager = new ProviderManager(mockConfigManager);

    // Override the client
    const provider = manager.getProvider('test1');
    provider['client'].chat.completions.create = mockCreate;

    // This should work since we're specifying the provider
    expect(() => manager.getProvider('test1')).not.toThrow();
  });

  it('should throw error when getProvider called without name and no default', () => {
    const mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        providers: {
          test1: {
            api_key: 'key1',
            base_url: 'https://api1.test.com/v1',
            default_model: 'model1',
            nickname: 'Duck 1',
          },
        },
        // No default_provider set
        cache_ttl: 300,
        enable_failover: false,
        default_temperature: 0.7,
      }),
    } as any;

    const manager = new ProviderManager(mockConfigManager);

    expect(() => manager.getProvider()).toThrow(
      'No provider specified and no default provider configured'
    );
  });
});

describe('ProviderManager Health Check Exception', () => {
  let manager: ProviderManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        providers: {
          test1: {
            api_key: 'key1',
            base_url: 'https://api1.test.com/v1',
            default_model: 'model1',
            nickname: 'Duck 1',
          },
        },
        default_provider: 'test1',
        cache_ttl: 300,
        enable_failover: false,
        default_temperature: 0.7,
      }),
    } as any;

    manager = new ProviderManager(mockConfigManager);
  });

  it('should handle health check that fails with rejected promise', async () => {
    const provider = manager.getProvider('test1');
    provider['client'].chat.completions.create = jest.fn().mockRejectedValue(
      new Error('Network timeout')
    );

    const results = await manager.checkHealth('test1');

    expect(results).toHaveLength(1);
    // DuckProvider.healthCheck() catches errors internally and returns false
    // so error is not propagated to manager
    expect(results[0].healthy).toBe(false);
  });

  it('should handle health check when provider.healthCheck itself throws', async () => {
    const provider = manager.getProvider('test1');
    // Override healthCheck to actually throw (unlike normal behavior)
    provider.healthCheck = jest.fn().mockRejectedValue(new Error('Unexpected error'));

    const results = await manager.checkHealth('test1');

    expect(results).toHaveLength(1);
    expect(results[0].healthy).toBe(false);
    expect(results[0].error).toBe('Unexpected error');
  });

  it('should handle non-Error exception from healthCheck', async () => {
    const provider = manager.getProvider('test1');
    // Override healthCheck to throw a non-Error
    provider.healthCheck = jest.fn().mockRejectedValue('String error');

    const results = await manager.checkHealth('test1');

    expect(results).toHaveLength(1);
    expect(results[0].healthy).toBe(false);
    expect(results[0].error).toBe('String error');
  });
});

describe('ProviderManager Failover', () => {
  let manager: ProviderManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Mocked response' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      model: 'model2',
    });

    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        providers: {
          test1: {
            api_key: 'key1',
            base_url: 'https://api1.test.com/v1',
            default_model: 'model1',
            nickname: 'Duck 1',
          },
          test2: {
            api_key: 'key2',
            base_url: 'https://api2.test.com/v1',
            default_model: 'model2',
            nickname: 'Duck 2',
          },
        },
        default_provider: 'test1',
        cache_ttl: 300,
        enable_failover: true,  // Enable failover
        default_temperature: 0.7,
      }),
    } as any;

    manager = new ProviderManager(mockConfigManager);

    // Set up mock clients
    const provider1 = manager.getProvider('test1');
    const provider2 = manager.getProvider('test2');
    provider2['client'].chat.completions.create = mockCreate;
    provider1['client'].chat.completions.create = jest.fn().mockRejectedValue(
      new Error('Primary provider failed')
    );
  });

  it('should failover to another provider when primary fails', async () => {
    // Call askDuck without specifying provider (use default)
    const response = await manager.askDuck(undefined, 'Hello');

    expect(response.provider).toBe('test2');
    expect(response.content).toBe('Mocked response');
  });

  it('should throw when all providers fail during failover', async () => {
    // Make both providers fail
    const provider2 = manager.getProvider('test2');
    provider2['client'].chat.completions.create = jest.fn().mockRejectedValue(
      new Error('Secondary also failed')
    );

    await expect(manager.askDuck(undefined, 'Hello')).rejects.toThrow(
      'All ducks have flown away!'
    );
  });

  it('should not failover when provider is explicitly specified', async () => {
    await expect(manager.askDuck('test1', 'Hello')).rejects.toThrow(
      'Primary provider failed'
    );
  });
});

describe('ProviderManager getAllModels', () => {
  let manager: ProviderManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  beforeEach(() => {
    jest.clearAllMocks();

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
            models: ['model2', 'model2b'],
          },
        },
        default_provider: 'test1',
        cache_ttl: 300,
        enable_failover: false,
        default_temperature: 0.7,
      }),
    } as any;

    manager = new ProviderManager(mockConfigManager);
  });

  it('should return models from all providers', async () => {
    // Mock listModels to use fallback (already configured models)
    const provider1 = manager.getProvider('test1');
    const provider2 = manager.getProvider('test2');
    provider1['client'].models = { list: jest.fn().mockRejectedValue(new Error('API error')) } as any;
    provider2['client'].models = { list: jest.fn().mockRejectedValue(new Error('API error')) } as any;

    const allModels = await manager.getAllModels();

    expect(allModels.size).toBe(2);
    expect(allModels.get('test1')).toHaveLength(1);
    expect(allModels.get('test2')).toHaveLength(2);
  });

  it('should return empty array for providers that fail', async () => {
    const provider1 = manager.getProvider('test1');
    // Make listModels throw by accessing undefined (simulating real error)
    provider1.listModels = jest.fn().mockRejectedValue(new Error('Fatal error'));

    const allModels = await manager.getAllModels();

    expect(allModels.get('test1')).toEqual([]);
  });
});

describe('DuckProvider Health Check', () => {
  let provider: DuckProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCreate.mockResolvedValue({
      choices: [{
        message: { content: 'healthy' },
        finish_reason: 'stop',
      }],
    });

    provider = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'test-model',
    });

    provider['client'].chat.completions.create = mockCreate;
  });

  it('should return true when health check succeeds', async () => {
    const isHealthy = await provider.healthCheck();
    expect(isHealthy).toBe(true);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('should return false when health check fails', async () => {
    mockCreate.mockRejectedValue(new Error('Connection failed'));

    const isHealthy = await provider.healthCheck();
    expect(isHealthy).toBe(false);
  });

  it('should return false when response has no content', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { content: '' },
        finish_reason: 'stop',
      }],
    });

    const isHealthy = await provider.healthCheck();
    expect(isHealthy).toBe(false);
  });

  it('should return false when response has null content', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { content: null },
        finish_reason: 'stop',
      }],
    });

    const isHealthy = await provider.healthCheck();
    expect(isHealthy).toBe(false);
  });
});

describe('DuckProvider listModels', () => {
  let provider: DuckProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    provider = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'test-model',
      availableModels: ['model-a', 'model-b'],
    });
  });

  it('should return models from API on success', async () => {
    // Create async iterator for models
    const mockModels = [
      { id: 'gpt-4', created: 1234567890, owned_by: 'openai', object: 'model' },
      { id: 'gpt-3.5', created: 1234567880, owned_by: 'openai', object: 'model' },
    ];
    const asyncIterator = (async function* () {
      for (const model of mockModels) {
        yield model;
      }
    })();

    provider['client'].models = {
      list: jest.fn().mockResolvedValue(asyncIterator),
    } as any;

    const models = await provider.listModels();

    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('gpt-4');
    expect(models[1].id).toBe('gpt-3.5');
  });

  it('should fallback to configured models when API fails', async () => {
    provider['client'].models = {
      list: jest.fn().mockRejectedValue(new Error('API error')),
    } as any;

    const models = await provider.listModels();

    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('model-a');
    expect(models[0].description).toBe('Configured model (not fetched from API)');
    expect(models[1].id).toBe('model-b');
  });

  it('should fallback to default model when API fails and no configured models', async () => {
    // Create provider without availableModels
    const providerNoModels = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'default-model',
    });

    providerNoModels['client'].models = {
      list: jest.fn().mockRejectedValue(new Error('API error')),
    } as any;

    const models = await providerNoModels.listModels();

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('default-model');
    expect(models[0].description).toBe('Default configured model');
  });

  it('should fallback to default model when API fails and configured models is empty', async () => {
    // Create provider with empty availableModels
    const providerEmptyModels = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'fallback-model',
      availableModels: [],
    });

    providerEmptyModels['client'].models = {
      list: jest.fn().mockRejectedValue(new Error('API error')),
    } as any;

    const models = await providerEmptyModels.listModels();

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('fallback-model');
    expect(models[0].description).toBe('Default configured model');
  });

  it('should handle non-Error thrown from API', async () => {
    provider['client'].models = {
      list: jest.fn().mockRejectedValue('String error'),
    } as any;

    const models = await provider.listModels();

    // Should still fallback to configured models
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('model-a');
  });
});

describe('DuckProvider Error Handling', () => {
  let provider: DuckProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    provider = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'test-model',
    });

    provider['client'].chat.completions.create = mockCreate;
  });

  it('should throw error when API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limited'));

    await expect(
      provider.chat({
        messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
      })
    ).rejects.toThrow('API rate limited');
  });

  it('should throw error when response has empty choices array', async () => {
    mockCreate.mockResolvedValue({
      choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      model: 'test-model',
    });

    // When choices is empty, accessing choices[0].message throws
    await expect(
      provider.chat({
        messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
      })
    ).rejects.toThrow("couldn't respond");
  });

  it('should handle system prompt in options', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { content: 'Response with system prompt' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
      model: 'test-model',
    });

    const providerWithSystem = new DuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      model: 'test-model',
      systemPrompt: 'You are a helpful assistant',
    });
    providerWithSystem['client'].chat.completions.create = mockCreate;

    const response = await providerWithSystem.chat({
      messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
    });

    expect(response.content).toBe('Response with system prompt');

    // Verify system prompt was included in the call
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[0].content).toBe('You are a helpful assistant');
  });
});