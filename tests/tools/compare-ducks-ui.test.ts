import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { compareDucksTool } from '../../src/tools/compare-ducks.js';
import { ProviderManager } from '../../src/providers/manager.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/providers/manager.js');

describe('compareDucksTool structured JSON', () => {
  let mockProviderManager: jest.Mocked<ProviderManager>;

  const mockResponses = [
    {
      provider: 'openai',
      nickname: 'OpenAI Duck',
      content: 'TypeScript is great!',
      model: 'gpt-4',
      latency: 150,

      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    },
    {
      provider: 'groq',
      nickname: 'Groq Duck',
      content: 'TypeScript rocks!',
      model: 'llama-3.1-70b',
      latency: 80,

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

  it('should return two content items: text and JSON', async () => {
    const result = await compareDucksTool(mockProviderManager, { prompt: 'Test' });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect(result.content[1].type).toBe('text');
  });

  it('should have valid JSON in the second content item', async () => {
    const result = await compareDucksTool(mockProviderManager, { prompt: 'Test' });

    const data = JSON.parse(result.content[1].text) as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });

  it('should include all provider data in JSON', async () => {
    const result = await compareDucksTool(mockProviderManager, { prompt: 'Test' });

    const data = JSON.parse(result.content[1].text) as {
      provider: string;
      nickname: string;
      model: string;
      content: string;
      latency: number;
      tokens: { prompt: number; completion: number; total: number } | null;
      error?: string;
    }[];

    expect(data).toHaveLength(2);
    expect(data[0].provider).toBe('openai');
    expect(data[0].nickname).toBe('OpenAI Duck');
    expect(data[0].model).toBe('gpt-4');
    expect(data[0].content).toBe('TypeScript is great!');
    expect(data[0].latency).toBe(150);
    expect(data[0].tokens).toEqual({ prompt: 10, completion: 20, total: 30 });

    expect(data[1].provider).toBe('groq');
  });

  it('should include error info for failed responses', async () => {
    mockProviderManager.compareDucks.mockResolvedValue([
      mockResponses[0],
      {
        provider: 'groq',
        nickname: 'Groq Duck',
        content: 'Error: API key invalid',
        model: '',
        latency: 0,
  
      },
    ]);

    const result = await compareDucksTool(mockProviderManager, { prompt: 'Test' });
    const data = JSON.parse(result.content[1].text) as { error?: string }[];

    expect(data[0].error).toBeUndefined();
    expect(data[1].error).toBe('Error: API key invalid');
  });

  it('should handle null tokens when usage is missing', async () => {
    mockProviderManager.compareDucks.mockResolvedValue([
      {
        provider: 'openai',
        nickname: 'OpenAI Duck',
        content: 'Response',
        model: 'gpt-4',
        latency: 100,
  
      },
    ]);

    const result = await compareDucksTool(mockProviderManager, { prompt: 'Test' });
    const data = JSON.parse(result.content[1].text) as { tokens: unknown }[];

    expect(data[0].tokens).toBeNull();
  });

  it('should preserve text content identical to before', async () => {
    const result = await compareDucksTool(mockProviderManager, { prompt: 'Test' });

    // First item is text, should contain original format
    expect(result.content[0].text).toContain('OpenAI Duck');
    expect(result.content[0].text).toContain('Groq Duck');
    expect(result.content[0].text).toContain('2/2 ducks responded successfully');
  });
});
