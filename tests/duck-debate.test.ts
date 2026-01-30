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

import { duckDebateTool } from '../src/tools/duck-debate';
import { ProviderManager } from '../src/providers/manager';
import { ConfigManager } from '../src/config/config';

describe('duckDebateTool', () => {
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
      duckDebateTool(mockProviderManager, { format: 'oxford' })
    ).rejects.toThrow('Prompt/topic is required');
  });

  it('should throw error when format is invalid', async () => {
    await expect(
      duckDebateTool(mockProviderManager, { prompt: 'Test', format: 'invalid' })
    ).rejects.toThrow('Format must be "oxford", "socratic", or "adversarial"');
  });

  it('should throw error when rounds out of range', async () => {
    await expect(
      duckDebateTool(mockProviderManager, { prompt: 'Test', format: 'oxford', rounds: 0 })
    ).rejects.toThrow('Rounds must be between 1 and 10');

    await expect(
      duckDebateTool(mockProviderManager, { prompt: 'Test', format: 'oxford', rounds: 11 })
    ).rejects.toThrow('Rounds must be between 1 and 10');
  });

  it('should throw error when less than 2 providers specified', async () => {
    await expect(
      duckDebateTool(mockProviderManager, { prompt: 'Test', format: 'oxford', providers: ['openai'] })
    ).rejects.toThrow('At least 2 providers are required');
  });

  it('should throw error when only 1 provider available total', async () => {
    // Create manager with only 1 provider
    const singleProviderConfig = {
      getConfig: jest.fn().mockReturnValue({
        providers: {
          openai: {
            api_key: 'key1',
            base_url: 'https://api.openai.com/v1',
            default_model: 'gpt-4',
            nickname: 'GPT-4',
            models: ['gpt-4'],
          },
        },
        default_provider: 'openai',
        cache_ttl: 300,
        enable_failover: false,
        default_temperature: 0.7,
      }),
    } as any;

    const singleProviderManager = new ProviderManager(singleProviderConfig);

    await expect(
      duckDebateTool(singleProviderManager, { prompt: 'Test', format: 'oxford' })
    ).rejects.toThrow('At least 2 providers are required for a debate');
  });

  it('should throw error when provider does not exist', async () => {
    await expect(
      duckDebateTool(mockProviderManager, { prompt: 'Test', format: 'oxford', providers: ['openai', 'nonexistent'] })
    ).rejects.toThrow('Provider "nonexistent" not found');
  });

  it('should perform oxford debate', async () => {
    // Round 1: 2 participants
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'PRO argument round 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'CON argument round 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      // Round 2
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'PRO argument round 2' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'CON argument round 2' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      // Synthesis
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Debate synthesis: Both sides made valid points.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'Should we use microservices?',
      format: 'oxford',
      rounds: 2,
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[1].type).toBe('text');
    expect(() => JSON.parse(result.content[1].text)).not.toThrow();
    const text = result.content[0].text;

    expect(text).toContain('Oxford Debate');
    expect(text).toContain('microservices');
    expect(text).toContain('ROUND 1');
    expect(text).toContain('ROUND 2');
    expect(text).toContain('[PRO]');
    expect(text).toContain('[CON]');
    expect(text).toContain('Synthesis');
  });

  it('should perform socratic debate', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Philosophical question 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Philosophical response 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Synthesis of Socratic dialogue' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'What is knowledge?',
      format: 'socratic',
      rounds: 1,
    });

    const text = result.content[0].text;
    expect(text).toContain('Socratic Debate');
    expect(text).toContain('[NEUTRAL]');
  });

  it('should perform adversarial debate', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Defender argument' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Challenger attack' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Adversarial synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'AI will surpass human intelligence',
      format: 'adversarial',
      rounds: 1,
    });

    const text = result.content[0].text;
    expect(text).toContain('Adversarial Debate');
  });

  it('should use all providers when none specified', async () => {
    // 2 providers, 1 round = 2 arguments + 1 synthesis = 3 calls
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Arg 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Arg 2' }, finish_reason: 'stop' }],
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

    // Should have used both providers
    const text = result.content[0].text;
    expect(text).toContain('GPT-4');
    expect(text).toContain('Gemini');
  });

  it('should use specified synthesizer', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Arg 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Arg 2' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Gemini synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'Test',
      format: 'oxford',
      rounds: 1,
      synthesizer: 'gemini',
    });

    const text = result.content[0].text;
    expect(text).toContain('by gemini');
  });

  it('should handle default rounds', async () => {
    // Default is 3 rounds, 2 participants = 6 arguments + 1 synthesis = 7 calls
    for (let i = 0; i < 7; i++) {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: `Response ${i}` }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });
    }

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'Test',
      format: 'oxford',
    });

    const text = result.content[0].text;
    expect(text).toContain('3 rounds completed');
  });

  it('should perform multi-round socratic debate', async () => {
    // Round 1: 2 participants
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Question round 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Response round 1' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      // Round 2 - should use "Build on previous responses" prompt
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Question round 2' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Response round 2' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      // Synthesis
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Socratic synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'What is truth?',
      format: 'socratic',
      rounds: 2,
    });

    const text = result.content[0].text;
    expect(text).toContain('Socratic Debate');
    expect(text).toContain('ROUND 1');
    expect(text).toContain('ROUND 2');
    expect(text).toContain('2 rounds completed');
  });

  it('should truncate long arguments in display', async () => {
    // Create arguments longer than 800 characters
    const longArgument = 'A'.repeat(900);

    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: longArgument }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Short con argument' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    const result = await duckDebateTool(mockProviderManager, {
      prompt: 'Test',
      format: 'oxford',
      rounds: 1,
    });

    const text = result.content[0].text;
    expect(text).toContain('[truncated]');
    // Should not contain the full 900 A's
    expect(text).not.toContain('A'.repeat(900));
  });

  it('should throw when signal is already aborted before starting', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      duckDebateTool(mockProviderManager, {
        prompt: 'Test',
        format: 'oxford',
      }, undefined, controller.signal)
    ).rejects.toThrow('Task cancelled');
  });

  it('should throw when signal is aborted between rounds', async () => {
    const controller = new AbortController();
    let callCount = 0;

    // Use mockImplementation so we can abort after round 1 completes
    mockCreate.mockImplementation(async () => {
      callCount++;
      // After both participants in round 1 finish (2 calls), abort
      if (callCount === 2) {
        controller.abort();
      }
      return {
        choices: [{ message: { content: `Response ${callCount}` }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      };
    });

    await expect(
      duckDebateTool(mockProviderManager, {
        prompt: 'Test',
        format: 'oxford',
        rounds: 3,
      }, undefined, controller.signal)
    ).rejects.toThrow('Task cancelled');

    // Only round 1 calls (2 participants), round 2 was never started
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('should report progress when a ProgressReporter is provided', async () => {
    const mockProgress = {
      enabled: true,
      report: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    // 1 round, 2 participants + synthesis = 3 calls
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'PRO' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'CON' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gemini-pro',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Synthesis' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4',
      });

    await duckDebateTool(mockProviderManager, {
      prompt: 'Test',
      format: 'oxford',
      rounds: 1,
    }, mockProgress);

    // 2 participants + 1 synthesis = 3 progress reports
    expect(mockProgress.report).toHaveBeenCalledTimes(3);
    // Total steps = 1 round * 2 participants + 1 synthesis = 3
    expect(mockProgress.report).toHaveBeenNthCalledWith(1, 1, 3, expect.stringContaining('Round 1/1'));
    expect(mockProgress.report).toHaveBeenNthCalledWith(2, 2, 3, expect.stringContaining('Round 1/1'));
    expect(mockProgress.report).toHaveBeenNthCalledWith(3, 3, 3, 'Synthesis complete');
  });
});
