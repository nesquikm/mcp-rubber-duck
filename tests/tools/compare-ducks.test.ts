import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { compareDucksTool } from '../../src/tools/compare-ducks.js';
import { ProviderManager } from '../../src/providers/manager.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/providers/manager.js');

describe('compareDucksTool', () => {
  let mockProviderManager: jest.Mocked<ProviderManager>;

  const mockResponses = [
    {
      provider: 'openai',
      nickname: 'OpenAI Duck',
      content: 'OpenAI says: TypeScript is great!',
      model: 'gpt-4',
      latency: 150,
      cached: false,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    },
    {
      provider: 'groq',
      nickname: 'Groq Duck',
      content: 'Groq says: TypeScript rocks!',
      model: 'llama-3.1-70b',
      latency: 80,
      cached: false,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
    },
  ];

  beforeEach(() => {
    mockProviderManager = {
      compareDucks: jest.fn().mockResolvedValue(mockResponses),
    } as unknown as jest.Mocked<ProviderManager>;
  });

  it('should throw error when prompt is missing', async () => {
    await expect(compareDucksTool(mockProviderManager, {})).rejects.toThrow('Prompt is required');
  });

  it('should compare ducks with basic prompt', async () => {
    const result = await compareDucksTool(mockProviderManager, {
      prompt: 'What is TypeScript?',
    });

    expect(mockProviderManager.compareDucks).toHaveBeenCalledWith(
      'What is TypeScript?',
      undefined,
      { model: undefined }
    );
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Asked:');
    expect(result.content[0].text).toContain('What is TypeScript?');
  });

  it('should display all duck responses', async () => {
    const result = await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('OpenAI Duck');
    expect(result.content[0].text).toContain('Groq Duck');
    expect(result.content[0].text).toContain('OpenAI says');
    expect(result.content[0].text).toContain('Groq says');
  });

  it('should display model and token usage', async () => {
    const result = await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('gpt-4');
    expect(result.content[0].text).toContain('llama-3.1-70b');
    expect(result.content[0].text).toContain('Tokens: 30');
    expect(result.content[0].text).toContain('Tokens: 25');
  });

  it('should display latency info', async () => {
    const result = await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('150ms');
    expect(result.content[0].text).toContain('80ms');
  });

  it('should show cached indicator when response is cached', async () => {
    mockProviderManager.compareDucks.mockResolvedValue([
      {
        ...mockResponses[0],
        cached: true,
      },
    ]);

    const result = await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('Cached');
  });

  it('should show success count in summary', async () => {
    const result = await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('2/2 ducks responded successfully');
  });

  it('should handle error responses', async () => {
    mockProviderManager.compareDucks.mockResolvedValue([
      mockResponses[0],
      {
        provider: 'groq',
        nickname: 'Groq Duck',
        content: 'Error: API key invalid',
        model: '',
        latency: 0,
        cached: false,
      },
    ]);

    const result = await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('Error: API key invalid');
    expect(result.content[0].text).toContain('1/2 ducks responded successfully');
  });

  it('should pass specific providers when provided', async () => {
    await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
      providers: ['openai', 'groq'],
    });

    expect(mockProviderManager.compareDucks).toHaveBeenCalledWith('Test', ['openai', 'groq'], {
      model: undefined,
    });
  });

  it('should pass model option', async () => {
    await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
      model: 'gpt-3.5-turbo',
    });

    expect(mockProviderManager.compareDucks).toHaveBeenCalledWith('Test', undefined, {
      model: 'gpt-3.5-turbo',
    });
  });

  it('should handle empty response list', async () => {
    mockProviderManager.compareDucks.mockResolvedValue([]);

    const result = await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('0/0 ducks responded successfully');
  });

  it('should not show latency when zero', async () => {
    mockProviderManager.compareDucks.mockResolvedValue([
      {
        ...mockResponses[0],
        latency: 0,
      },
    ]);

    const result = await compareDucksTool(mockProviderManager, {
      prompt: 'Test',
    });

    // When latency is 0, the ms indicator should not be shown for that response
    // (the code checks latency > 0)
    expect(result.content[0].text).not.toContain('0ms');
  });
});
