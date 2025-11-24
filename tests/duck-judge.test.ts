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

import { duckJudgeTool } from '../src/tools/duck-judge';
import { ProviderManager } from '../src/providers/manager';
import { ConfigManager } from '../src/config/config';
import { DuckResponse } from '../src/config/types';

describe('duckJudgeTool', () => {
  let mockProviderManager: ProviderManager;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  const mockResponses: DuckResponse[] = [
    {
      provider: 'openai',
      nickname: 'GPT-4',
      model: 'gpt-4',
      content: 'Response from GPT-4 about error handling using try-catch blocks.',
      latency: 1000,
      cached: false,
    },
    {
      provider: 'gemini',
      nickname: 'Gemini',
      model: 'gemini-pro',
      content: 'Response from Gemini about error handling using Result types.',
      latency: 1500,
      cached: false,
    },
  ];

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

  it('should throw error when responses are missing', async () => {
    await expect(
      duckJudgeTool(mockProviderManager, {})
    ).rejects.toThrow('At least one response is required');
  });

  it('should throw error when responses is empty array', async () => {
    await expect(
      duckJudgeTool(mockProviderManager, { responses: [] })
    ).rejects.toThrow('At least one response is required');
  });

  it('should throw error when only one response provided', async () => {
    await expect(
      duckJudgeTool(mockProviderManager, { responses: [mockResponses[0]] })
    ).rejects.toThrow('At least two responses are required');
  });

  it('should evaluate responses and return rankings', async () => {
    const judgeResponse = JSON.stringify({
      rankings: [
        { provider: 'gemini', score: 85, justification: 'Better type safety explanation' },
        { provider: 'openai', score: 75, justification: 'Good but less comprehensive' },
      ],
      criteria_scores: {
        gemini: { accuracy: 85, completeness: 90, clarity: 80 },
        openai: { accuracy: 75, completeness: 70, clarity: 80 },
      },
      summary: 'Gemini provided a more comprehensive response with better type safety coverage.',
    });

    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: judgeResponse },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      model: 'gpt-4',
    });

    const result = await duckJudgeTool(mockProviderManager, {
      responses: mockResponses,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('Judge Evaluation');
    expect(text).toContain('#1');
    expect(text).toContain('#2');
    expect(text).toContain('gemini');
    expect(text).toContain('85/100');
  });

  it('should use specified judge provider', async () => {
    const judgeResponse = JSON.stringify({
      rankings: [
        { provider: 'openai', score: 80, justification: 'Good response' },
        { provider: 'gemini', score: 70, justification: 'Okay response' },
      ],
      summary: 'OpenAI wins.',
    });

    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: judgeResponse },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      model: 'gemini-pro',
    });

    const result = await duckJudgeTool(mockProviderManager, {
      responses: mockResponses,
      judge: 'gemini',
    });

    const text = result.content[0].text;
    expect(text).toContain('Gemini');
  });

  it('should use custom criteria', async () => {
    const judgeResponse = JSON.stringify({
      rankings: [
        { provider: 'openai', score: 90, justification: 'Most secure' },
        { provider: 'gemini', score: 85, justification: 'Good security' },
      ],
      summary: 'Security focused evaluation.',
    });

    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: judgeResponse },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      model: 'gpt-4',
    });

    const result = await duckJudgeTool(mockProviderManager, {
      responses: mockResponses,
      criteria: ['security', 'performance', 'maintainability'],
    });

    const text = result.content[0].text;
    expect(text).toContain('security');
    expect(text).toContain('performance');
    expect(text).toContain('maintainability');
  });

  it('should handle persona parameter', async () => {
    const judgeResponse = JSON.stringify({
      rankings: [
        { provider: 'openai', score: 85, justification: 'Senior approved' },
        { provider: 'gemini', score: 80, justification: 'Good for juniors' },
      ],
      summary: 'From a senior perspective.',
    });

    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: judgeResponse },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      model: 'gpt-4',
    });

    const result = await duckJudgeTool(mockProviderManager, {
      responses: mockResponses,
      persona: 'senior engineer',
    });

    expect(result.content[0].text).toContain('Judge Evaluation');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('should handle invalid JSON gracefully with fallback', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: 'This is not valid JSON at all, just some random text.' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      model: 'gpt-4',
    });

    const result = await duckJudgeTool(mockProviderManager, {
      responses: mockResponses,
    });

    const text = result.content[0].text;
    expect(text).toContain('Judge Evaluation');
    expect(text).toContain('Unable to parse');
  });

  it('should handle JSON with extra text around it', async () => {
    const judgeResponse = `Here is my evaluation:
    {"rankings": [{"provider": "openai", "score": 90, "justification": "Best"}], "summary": "Done"}
    Hope this helps!`;

    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: judgeResponse },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      model: 'gpt-4',
    });

    const result = await duckJudgeTool(mockProviderManager, {
      responses: mockResponses,
    });

    const text = result.content[0].text;
    expect(text).toContain('90/100');
    expect(text).toContain('openai');
  });

  it('should include missing providers in rankings', async () => {
    // Judge only ranks one provider
    const judgeResponse = JSON.stringify({
      rankings: [
        { provider: 'openai', score: 85, justification: 'Good' },
      ],
      summary: 'Only evaluated one.',
    });

    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: judgeResponse },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      model: 'gpt-4',
    });

    const result = await duckJudgeTool(mockProviderManager, {
      responses: mockResponses,
    });

    const text = result.content[0].text;
    // Should include both providers even though only one was ranked
    expect(text).toContain('openai');
    expect(text).toContain('gemini');
    expect(text).toContain('Not evaluated');
  });
});
