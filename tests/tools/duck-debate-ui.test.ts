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

import { duckDebateTool } from '../../src/tools/duck-debate';
import { ProviderManager } from '../../src/providers/manager';
import { ConfigManager } from '../../src/config/config';

describe('duckDebateTool structured JSON', () => {
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
    // 1 round, 2 participants + synthesis = 3 calls
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Pro argument' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Con argument' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'Test topic',
      format: 'oxford',
      rounds: 1,
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect(result.content[1].type).toBe('text');
  });

  it('should include debate structure in JSON', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Pro argument' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Con argument' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Final synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'Microservices vs monolith',
      format: 'oxford',
      rounds: 1,
    });

    const data = JSON.parse(result.content[1].text) as {
      topic: string;
      format: string;
      totalRounds: number;
      participants: { provider: string; nickname: string; position: string }[];
      rounds: { round: number; provider: string; nickname: string; position: string; content: string }[][];
      synthesis: string;
      synthesizer: string;
    };

    expect(data.topic).toBe('Microservices vs monolith');
    expect(data.format).toBe('oxford');
    expect(data.totalRounds).toBe(1);
    expect(data.participants).toHaveLength(2);
    expect(data.participants[0].position).toBe('pro');
    expect(data.participants[1].position).toBe('con');
    expect(data.rounds).toHaveLength(1);
    expect(data.rounds[0]).toHaveLength(2);
    expect(data.rounds[0][0].content).toBe('Pro argument');
    expect(data.rounds[0][1].content).toBe('Con argument');
    expect(data.synthesis).toBe('Final synthesis');
    expect(data.synthesizer).toBe('openai');
  });

  it('should assign adversarial positions correctly in JSON', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Defense' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Attack' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'Is AI dangerous?',
      format: 'adversarial',
      rounds: 1,
    });

    const data = JSON.parse(result.content[1].text) as {
      format: string;
      participants: { position: string }[];
    };

    expect(data.format).toBe('adversarial');
    // First participant defends (pro), rest challenge (con)
    expect(data.participants[0].position).toBe('pro');
    expect(data.participants[1].position).toBe('con');
  });

  it('should preserve text content alongside JSON', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Pro argument' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Con argument' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Final synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'Test topic',
      format: 'oxford',
      rounds: 1,
    });

    expect(result.content[0].text).toContain('Oxford Debate');
    expect(result.content[0].text).toContain('Test topic');
    expect(result.content[0].text).toContain('Synthesis');
    expect(result.content[0].text).toContain('ROUND 1');
  });

  it('should assign socratic positions correctly in JSON', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Question 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Response 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'What is truth?',
      format: 'socratic',
      rounds: 1,
    });

    const data = JSON.parse(result.content[1].text) as {
      format: string;
      participants: { position: string }[];
    };

    expect(data.format).toBe('socratic');
    expect(data.participants[0].position).toBe('neutral');
    expect(data.participants[1].position).toBe('neutral');
  });
});
