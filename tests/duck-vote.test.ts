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

import { duckVoteTool } from '../src/tools/duck-vote';
import { ProviderManager } from '../src/providers/manager';
import { ConfigManager } from '../src/config/config';

describe('duckVoteTool', () => {
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

  it('should throw error when question is missing', async () => {
    await expect(
      duckVoteTool(mockProviderManager, { options: ['A', 'B'] })
    ).rejects.toThrow('Question is required');
  });

  it('should throw error when options are missing', async () => {
    await expect(
      duckVoteTool(mockProviderManager, { question: 'Test?' })
    ).rejects.toThrow('At least 2 options are required');
  });

  it('should throw error when less than 2 options', async () => {
    await expect(
      duckVoteTool(mockProviderManager, { question: 'Test?', options: ['A'] })
    ).rejects.toThrow('At least 2 options are required');
  });

  it('should throw error when more than 10 options', async () => {
    const options = Array.from({ length: 11 }, (_, i) => `Option ${i + 1}`);
    await expect(
      duckVoteTool(mockProviderManager, { question: 'Test?', options })
    ).rejects.toThrow('Maximum 10 options allowed');
  });

  it('should conduct vote with all providers', async () => {
    // Mock responses with valid JSON votes
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: { content: '{"choice": "Option A", "confidence": 85, "reasoning": "Best for performance"}' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{
          message: { content: '{"choice": "Option A", "confidence": 75, "reasoning": "Scalable solution"}' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      });

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Best approach?',
      options: ['Option A', 'Option B'],
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('Vote Results');
    expect(text).toContain('Best approach?');
    expect(text).toContain('Option A');
    expect(text).toContain('Winner');
    expect(text).toContain('unanimous');
  });

  it('should handle split votes', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: { content: '{"choice": "Option A", "confidence": 60, "reasoning": "Good choice"}' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{
          message: { content: '{"choice": "Option B", "confidence": 90, "reasoning": "Better choice"}' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      });

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Which option?',
      options: ['Option A', 'Option B'],
    });

    const text = result.content[0].text;
    expect(text).toContain('split');
    expect(text).toContain('tie-breaker');
    expect(text).toContain('Option B'); // Higher confidence wins
  });

  it('should use specific voters when provided', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: '{"choice": "Option A", "confidence": 80, "reasoning": "Only choice"}' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      model: 'gpt-4',
    });

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Test?',
      options: ['Option A', 'Option B'],
      voters: ['openai'],
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain('1/1 valid votes');
  });

  it('should handle invalid JSON responses gracefully', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: { content: 'I think Option A is clearly the best because of its simplicity.' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{
          message: { content: '{"choice": "Option B", "confidence": 70}' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      });

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Test?',
      options: ['Option A', 'Option B'],
    });

    // Should still work - fallback parsing should find "Option A"
    const text = result.content[0].text;
    expect(text).toContain('2/2 valid votes');
  });

  it('should handle provider errors gracefully', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{
          message: { content: '{"choice": "Option A", "confidence": 85}' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockRejectedValueOnce(new Error('API Error'));

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Test?',
      options: ['Option A', 'Option B'],
    });

    // One valid vote, one error
    const text = result.content[0].text;
    expect(text).toContain('Option A');
    expect(text).toContain('Invalid vote'); // Error response should be marked invalid
  });

  it('should work without reasoning requirement', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: '{"choice": "Option A", "confidence": 80}' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      model: 'gpt-4',
    });

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Test?',
      options: ['Option A', 'Option B'],
      voters: ['openai'],
      require_reasoning: false,
    });

    expect(result.content[0].text).toContain('Option A');
  });
});
