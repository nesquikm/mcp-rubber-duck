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

import { duckIterateTool } from '../src/tools/duck-iterate';
import { ProviderManager } from '../src/providers/manager';
import { ConfigManager } from '../src/config/config';

describe('duckIterateTool', () => {
  let mockProviderManager: ProviderManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        providers: {
          openai: {
            api_key: 'key1',
            base_url: 'https://api.openai.com/v1',
            default_model: 'gpt-4',
            nickname: 'GPT-4',
            models: ['gpt-4'],
          },
          gemini: {
            api_key: 'key2',
            base_url: 'https://api.gemini.com/v1',
            default_model: 'gemini-pro',
            nickname: 'Gemini',
            models: ['gemini-pro'],
          },
        },
        default_provider: 'openai',
        cache_ttl: 300,
        enable_failover: true,
        default_temperature: 0.7,
      }),
    } as any;

    mockProviderManager = new ProviderManager(mockConfigManager);

    // Override the client method on all providers
    const provider1 = mockProviderManager.getProvider('openai');
    const provider2 = mockProviderManager.getProvider('gemini');
    provider1['client'].chat.completions.create = mockCreate;
    provider2['client'].chat.completions.create = mockCreate;
  });

  it('should throw error when prompt is missing', async () => {
    await expect(
      duckIterateTool(mockProviderManager, { providers: ['openai', 'gemini'], mode: 'refine' })
    ).rejects.toThrow('Prompt is required');
  });

  it('should throw error when providers count is not 2', async () => {
    await expect(
      duckIterateTool(mockProviderManager, { prompt: 'Test', providers: ['openai'], mode: 'refine' })
    ).rejects.toThrow('Exactly 2 providers are required');

    await expect(
      duckIterateTool(mockProviderManager, { prompt: 'Test', providers: ['openai', 'gemini', 'another'], mode: 'refine' })
    ).rejects.toThrow('Exactly 2 providers are required');
  });

  it('should throw error when mode is invalid', async () => {
    await expect(
      duckIterateTool(mockProviderManager, { prompt: 'Test', providers: ['openai', 'gemini'], mode: 'invalid' })
    ).rejects.toThrow('Mode must be either "refine" or "critique-improve"');
  });

  it('should throw error when iterations out of range', async () => {
    await expect(
      duckIterateTool(mockProviderManager, { prompt: 'Test', providers: ['openai', 'gemini'], mode: 'refine', iterations: 0 })
    ).rejects.toThrow('Iterations must be between 1 and 10');

    await expect(
      duckIterateTool(mockProviderManager, { prompt: 'Test', providers: ['openai', 'gemini'], mode: 'refine', iterations: 11 })
    ).rejects.toThrow('Iterations must be between 1 and 10');
  });

  it('should throw error when provider does not exist', async () => {
    await expect(
      duckIterateTool(mockProviderManager, { prompt: 'Test', providers: ['openai', 'nonexistent'], mode: 'refine' })
    ).rejects.toThrow('Provider "nonexistent" not found');
  });

  it('should perform refine iteration', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Initial response about sorting' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Refined response with better explanation' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Further refined with examples' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckIterateTool(mockProviderManager, {
      prompt: 'Write a sorting algorithm',
      providers: ['openai', 'gemini'],
      mode: 'refine',
      iterations: 3,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('Iterative Refinement');
    expect(text).toContain('refine');
    expect(text).toContain('Round 1');
    expect(text).toContain('Round 2');
    expect(text).toContain('Round 3');
    expect(text).toContain('Final Response');
  });

  it('should perform critique-improve iteration', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Initial implementation' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Critique: Missing edge cases, no error handling' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Improved with edge cases and error handling' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckIterateTool(mockProviderManager, {
      prompt: 'Write a function',
      providers: ['openai', 'gemini'],
      mode: 'critique-improve',
      iterations: 3,
    });

    const text = result.content[0].text;
    expect(text).toContain('critique-improve');
    expect(text).toContain('generator');
    expect(text).toContain('critic');
  });

  it('should use default iterations when not specified', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Response 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Response 2' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Response 3' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckIterateTool(mockProviderManager, {
      prompt: 'Test prompt',
      providers: ['openai', 'gemini'],
      mode: 'refine',
    });

    // Default is 3 iterations
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(result.content[0].text).toContain('3 rounds completed');
  });

  it('should detect convergence and stop early', async () => {
    // Return very similar responses to trigger convergence
    const similarResponse = 'This is the exact same response content that will be repeated to trigger convergence detection.';

    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: similarResponse }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: similarResponse }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      });

    const result = await duckIterateTool(mockProviderManager, {
      prompt: 'Test',
      providers: ['openai', 'gemini'],
      mode: 'refine',
      iterations: 5,
    });

    const text = result.content[0].text;
    expect(text).toContain('converged');
    // Should stop at 2 rounds due to convergence, not 5
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('should handle single iteration', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Single response' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      model: 'gpt-4',
    });

    const result = await duckIterateTool(mockProviderManager, {
      prompt: 'Test',
      providers: ['openai', 'gemini'],
      mode: 'refine',
      iterations: 1,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain('1 rounds completed');
  });
});
