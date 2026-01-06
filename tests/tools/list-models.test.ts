import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { listModelsTool } from '../../src/tools/list-models.js';
import { ProviderManager } from '../../src/providers/manager.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/providers/manager.js');

describe('listModelsTool', () => {
  let mockProviderManager: jest.Mocked<ProviderManager>;

  const mockProviders = [
    {
      name: 'openai',
      info: {
        nickname: 'OpenAI Duck',
        model: 'gpt-4',
        baseURL: 'https://api.openai.com/v1',
        hasApiKey: true,
      },
    },
    {
      name: 'groq',
      info: {
        nickname: 'Groq Duck',
        model: 'llama-3.1-70b-versatile',
        baseURL: 'https://api.groq.com/openai/v1',
        hasApiKey: true,
      },
    },
  ];

  const mockOpenAIModels = [
    { id: 'gpt-4', description: 'Most capable model', context_window: 8192 },
    { id: 'gpt-3.5-turbo', owned_by: 'openai', context_window: 4096 },
  ];

  const mockGroqModels = [
    { id: 'llama-3.1-70b-versatile', description: 'Versatile large model' },
    { id: 'llama-3.1-8b-instant', description: 'Fast small model' },
  ];

  beforeEach(() => {
    mockProviderManager = {
      getAllProviders: jest.fn().mockReturnValue(mockProviders),
      getAvailableModels: jest.fn().mockImplementation((provider) => {
        if (provider === 'openai') return Promise.resolve(mockOpenAIModels);
        if (provider === 'groq') return Promise.resolve(mockGroqModels);
        return Promise.resolve([]);
      }),
    } as unknown as jest.Mocked<ProviderManager>;
  });

  it('should list models for all providers by default', async () => {
    const result = await listModelsTool(mockProviderManager, {});

    expect(mockProviderManager.getAllProviders).toHaveBeenCalled();
    expect(mockProviderManager.getAvailableModels).toHaveBeenCalledTimes(2);
    expect(result.content[0].text).toContain('OpenAI Duck');
    expect(result.content[0].text).toContain('Groq Duck');
  });

  it('should list models for specific provider', async () => {
    const result = await listModelsTool(mockProviderManager, {
      provider: 'openai',
    });

    expect(mockProviderManager.getAvailableModels).toHaveBeenCalledWith('openai');
    expect(mockProviderManager.getAvailableModels).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain('OpenAI Duck');
    expect(result.content[0].text).not.toContain('Groq Duck');
  });

  it('should throw error for unknown provider', async () => {
    await expect(
      listModelsTool(mockProviderManager, { provider: 'unknown' })
    ).rejects.toThrow('Provider "unknown" not found');
  });

  it('should display model details', async () => {
    const result = await listModelsTool(mockProviderManager, {
      provider: 'openai',
    });

    expect(result.content[0].text).toContain('gpt-4');
    expect(result.content[0].text).toContain('Most capable model');
    expect(result.content[0].text).toContain('8192 tokens');
  });

  it('should mark default model', async () => {
    const result = await listModelsTool(mockProviderManager, {
      provider: 'openai',
    });

    expect(result.content[0].text).toContain('gpt-4');
    expect(result.content[0].text).toContain('(default)');
  });

  it('should display owned_by when no description', async () => {
    const result = await listModelsTool(mockProviderManager, {
      provider: 'openai',
    });

    expect(result.content[0].text).toContain('by openai');
  });

  it('should handle empty models list', async () => {
    mockProviderManager.getAvailableModels.mockResolvedValue([]);

    const result = await listModelsTool(mockProviderManager, {
      provider: 'openai',
    });

    expect(result.content[0].text).toContain('No models available');
  });

  it('should handle provider errors gracefully', async () => {
    mockProviderManager.getAvailableModels.mockImplementation((provider) => {
      if (provider === 'openai') return Promise.resolve(mockOpenAIModels);
      return Promise.reject(new Error('Connection failed'));
    });

    const result = await listModelsTool(mockProviderManager, {});

    expect(result.content[0].text).toContain('OpenAI Duck');
    expect(result.content[0].text).toContain('Failed to fetch models');
  });

  it('should show cached indicator when not fetching latest', async () => {
    const result = await listModelsTool(mockProviderManager, {
      fetch_latest: false,
    });

    expect(result.content[0].text).toContain('Using cached/configured models');
  });

  it('should show fetch indicator when fetching latest', async () => {
    const result = await listModelsTool(mockProviderManager, {
      fetch_latest: true,
    });

    expect(result.content[0].text).toContain('Fetched from API');
  });

  it('should display context window when available', async () => {
    const result = await listModelsTool(mockProviderManager, {
      provider: 'openai',
    });

    expect(result.content[0].text).toContain('8192 tokens');
    expect(result.content[0].text).toContain('4096 tokens');
  });

  it('should handle models without context window', async () => {
    const result = await listModelsTool(mockProviderManager, {
      provider: 'groq',
    });

    // Groq models don't have context_window in mock
    expect(result.content[0].text).toContain('llama-3.1-70b-versatile');
    expect(result.content[0].text).not.toContain('tokens]');
  });
});
