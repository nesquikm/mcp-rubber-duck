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
    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Asked:');
    expect(result.content[0].text).toContain('What is TypeScript?');
    expect(result.content[1].type).toBe('text');
    expect(() => JSON.parse(result.content[1].text)).not.toThrow();
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

  it('should use compareDucksWithProgress when progress is provided', async () => {
    mockProviderManager.compareDucksWithProgress = jest.fn().mockResolvedValue(mockResponses) as any;
    const mockProgress = {
      enabled: true,
      report: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    await compareDucksTool(mockProviderManager, { prompt: 'Test' }, mockProgress);

    expect(mockProviderManager.compareDucksWithProgress).toHaveBeenCalled();
    expect(mockProviderManager.compareDucks).not.toHaveBeenCalled();
  });

  it('should use compareDucks when no progress is provided', async () => {
    await compareDucksTool(mockProviderManager, { prompt: 'Test' });

    expect(mockProviderManager.compareDucks).toHaveBeenCalled();
  });

  describe('CLI provider support', () => {
    const mockCLIResponses = [
      {
        provider: 'cli-claude',
        nickname: 'Claude Agent',
        content: 'CLI Claude response',
        model: 'cli',
        latency: 5000,
  
        usage: {
          prompt_tokens: 5,
          completion_tokens: 10,
          total_tokens: 15,
        },
      },
      {
        provider: 'cli-gemini',
        nickname: 'Gemini Agent',
        content: 'CLI Gemini response',
        model: 'cli',
        latency: 8000,
  
      },
    ];

    it('should handle CLI-only providers', async () => {
      mockProviderManager.compareDucks.mockResolvedValue(mockCLIResponses);

      const result = await compareDucksTool(mockProviderManager, {
        prompt: 'Test CLI',
        providers: ['cli-claude', 'cli-gemini'],
      });

      expect(mockProviderManager.compareDucks).toHaveBeenCalledWith(
        'Test CLI',
        ['cli-claude', 'cli-gemini'],
        { model: undefined }
      );
      expect(result.content[0].text).toContain('Claude Agent');
      expect(result.content[0].text).toContain('Gemini Agent');
      expect(result.content[0].text).toContain('cli-claude');
      expect(result.content[0].text).toContain('cli-gemini');
    });

    it('should display CLI responses with model as "cli"', async () => {
      mockProviderManager.compareDucks.mockResolvedValue(mockCLIResponses);

      const result = await compareDucksTool(mockProviderManager, {
        prompt: 'Test',
        providers: ['cli-claude'],
      });

      expect(result.content[0].text).toContain('Model: cli');
    });

    it('should handle CLI response without usage info', async () => {
      mockProviderManager.compareDucks.mockResolvedValue([
        {
          provider: 'cli-gemini',
          nickname: 'Gemini Agent',
          content: 'Response without usage',
          model: 'cli',
          latency: 8000,
    
          // no usage field
        },
      ]);

      const result = await compareDucksTool(mockProviderManager, {
        prompt: 'Test',
      });

      // Should not crash, should display response
      expect(result.content[0].text).toContain('Gemini Agent');
      expect(result.content[0].text).toContain('Response without usage');
      // Should not contain "Tokens:" since no usage
      expect(result.content[0].text).not.toMatch(/Tokens:\s*\|/);
    });

    it('should handle mixed HTTP and CLI providers', async () => {
      mockProviderManager.compareDucks.mockResolvedValue([
        {
          provider: 'openai',
          nickname: 'GPT Duck',
          content: 'HTTP response',
          model: 'gpt-4',
          latency: 500,
    
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        },
        {
          provider: 'cli-claude',
          nickname: 'Claude Agent',
          content: 'CLI response',
          model: 'cli',
          latency: 5000,
    
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        },
      ]);

      const result = await compareDucksTool(mockProviderManager, {
        prompt: 'Mixed test',
        providers: ['openai', 'cli-claude'],
      });

      expect(result.content[0].text).toContain('GPT Duck');
      expect(result.content[0].text).toContain('Claude Agent');
      expect(result.content[0].text).toContain('gpt-4');
      expect(result.content[0].text).toContain('Model: cli');
      expect(result.content[0].text).toContain('2/2 ducks responded successfully');
    });

    it('should include CLI responses in structured JSON output', async () => {
      mockProviderManager.compareDucks.mockResolvedValue(mockCLIResponses);

      const result = await compareDucksTool(mockProviderManager, {
        prompt: 'Test',
        providers: ['cli-claude', 'cli-gemini'],
      });

      const structuredData = JSON.parse(result.content[1].text);
      expect(structuredData).toHaveLength(2);
      expect(structuredData[0].provider).toBe('cli-claude');
      expect(structuredData[0].model).toBe('cli');
      expect(structuredData[1].provider).toBe('cli-gemini');
      expect(structuredData[1].tokens).toBeNull(); // gemini has no usage
    });
  });
});
