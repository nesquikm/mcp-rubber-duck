import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock OpenAI BEFORE importing
const mockCreate = jest.fn();
jest.mock('openai', () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  return { __esModule: true, default: MockOpenAI };
});

jest.mock('../../src/config/config');
jest.mock('../../src/utils/logger');

import { duckVoteTool } from '../../src/tools/duck-vote';
import { ProviderManager } from '../../src/providers/manager';
import { ConfigManager } from '../../src/config/config';

describe('duckVoteTool structured JSON', () => {
  let mockProviderManager: ProviderManager;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockConfigManager = {
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

        enable_failover: true,
        default_temperature: 0.7,
      }),
    } as unknown as jest.Mocked<ConfigManager>;

    mockProviderManager = new ProviderManager(mockConfigManager);

    const provider1 = mockProviderManager.getProvider('openai');
    const provider2 = mockProviderManager.getProvider('gemini');
    provider1['client'].chat.completions.create = mockCreate;
    provider2['client'].chat.completions.create = mockCreate;
  });

  it('should return two content items: text and JSON', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"choice": "A", "confidence": 85, "reasoning": "Solid"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"choice": "A", "confidence": 75, "reasoning": "Good"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      });

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Best?',
      options: ['A', 'B'],
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect(result.content[1].type).toBe('text');
  });

  it('should include vote data in JSON', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"choice": "A", "confidence": 85, "reasoning": "Best"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"choice": "A", "confidence": 75, "reasoning": "Good"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      });

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Best approach?',
      options: ['A', 'B'],
    });

    const data = JSON.parse(result.content[1].text) as {
      question: string;
      options: string[];
      winner: string | null;
      isTie: boolean;
      tally: Record<string, number>;
      confidenceByOption: Record<string, number>;
      votes: { voter: string; nickname: string; choice: string; confidence: number; reasoning: string }[];
      totalVoters: number;
      validVotes: number;
      consensusLevel: string;
    };

    expect(data.question).toBe('Best approach?');
    expect(data.options).toEqual(['A', 'B']);
    expect(data.winner).toBe('A');
    expect(data.consensusLevel).toBe('unanimous');
    expect(data.tally['A']).toBe(2);
    expect(data.tally['B']).toBe(0);
    expect(data.votes).toHaveLength(2);
    expect(data.votes[0].confidence).toBe(85);
  });

  it('should reflect tie in JSON data', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"choice": "A", "confidence": 60}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"choice": "B", "confidence": 90}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      });

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Which?',
      options: ['A', 'B'],
    });

    const data = JSON.parse(result.content[1].text) as {
      isTie: boolean;
      winner: string | null;
      consensusLevel: string;
    };

    expect(data.isTie).toBe(true);
    expect(data.consensusLevel).toBe('split');
    // Tie-break by confidence: B has 90 vs A has 60
    expect(data.winner).toBe('B');
  });

  it('should not include rawResponse in JSON votes', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"choice": "A", "confidence": 80}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      model: 'gpt-4',
    });

    const result = await duckVoteTool(mockProviderManager, {
      question: 'Test?',
      options: ['A', 'B'],
      voters: ['openai'],
    });

    const data = JSON.parse(result.content[1].text) as {
      votes: Record<string, unknown>[];
    };

    // rawResponse should not be in the structured output
    expect(data.votes[0]).not.toHaveProperty('rawResponse');
  });
});
