import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { duckCouncilTool } from '../../src/tools/duck-council.js';
import { ProviderManager } from '../../src/providers/manager.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/providers/manager.js');

describe('duckCouncilTool', () => {
  let mockProviderManager: jest.Mocked<ProviderManager>;

  const mockResponses = [
    {
      provider: 'openai',
      nickname: 'OpenAI Duck',
      content: 'I think TypeScript is great for large projects.',
      model: 'gpt-4',
      latency: 150,
      usage: { prompt_tokens: 10, completion_tokens: 25, total_tokens: 35 },
    },
    {
      provider: 'groq',
      nickname: 'Groq Duck',
      content: 'TypeScript adds type safety which prevents many bugs.',
      model: 'llama-3.1-70b',
      latency: 80,
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    },
  ];

  beforeEach(() => {
    mockProviderManager = {
      getProviderNames: jest.fn().mockReturnValue(['openai', 'groq']),
      duckCouncil: jest.fn().mockResolvedValue(mockResponses),
    } as unknown as jest.Mocked<ProviderManager>;
  });

  it('should throw error when prompt is missing', async () => {
    await expect(duckCouncilTool(mockProviderManager, {})).rejects.toThrow(
      'Prompt is required for the duck council'
    );
  });

  it('should throw error when no providers available', async () => {
    mockProviderManager.getProviderNames.mockReturnValue([]);

    await expect(
      duckCouncilTool(mockProviderManager, { prompt: 'Test' })
    ).rejects.toThrow('No ducks available for the council!');
  });

  it('should convene duck council with prompt', async () => {
    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'What is TypeScript?',
    });

    expect(mockProviderManager.duckCouncil).toHaveBeenCalledWith('What is TypeScript?', {
      model: undefined,
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });

  it('should display council topic', async () => {
    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'What is TypeScript?',
    });

    expect(result.content[0].text).toContain('Duck Council Topic');
    expect(result.content[0].text).toContain('What is TypeScript?');
  });

  it('should display number of ducks in attendance', async () => {
    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('2 ducks in attendance');
  });

  it('should display each duck response with number', async () => {
    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('Duck #1: OpenAI Duck');
    expect(result.content[0].text).toContain('Duck #2: Groq Duck');
    expect(result.content[0].text).toContain('TypeScript is great');
    expect(result.content[0].text).toContain('type safety');
  });

  it('should display model and latency metadata', async () => {
    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('gpt-4');
    expect(result.content[0].text).toContain('150ms');
    expect(result.content[0].text).toContain('35 tokens');
  });

  it('should handle error responses from ducks', async () => {
    mockProviderManager.duckCouncil.mockResolvedValue([
      mockResponses[0],
      {
        provider: 'groq',
        nickname: 'Groq Duck',
        content: 'Error: API key invalid',
        model: '',
        latency: 0,
      },
    ]);

    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('Duck had to leave early');
    expect(result.content[0].text).toContain('API key invalid');
  });

  it('should show council summary with success count', async () => {
    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('Council Summary');
    expect(result.content[0].text).toContain('2/2 ducks provided their wisdom');
  });

  it('should show partial council message when some fail', async () => {
    mockProviderManager.duckCouncil.mockResolvedValue([
      mockResponses[0],
      {
        provider: 'groq',
        nickname: 'Groq Duck',
        content: 'Error: Timeout',
        model: '',
        latency: 0,
      },
    ]);

    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('1/2 ducks provided their wisdom');
    expect(result.content[0].text).toContain('Partial council');
  });

  it('should pass model option', async () => {
    await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
      model: 'gpt-3.5-turbo',
    });

    expect(mockProviderManager.duckCouncil).toHaveBeenCalledWith('Test', {
      model: 'gpt-3.5-turbo',
    });
  });

  it('should not show latency when zero', async () => {
    mockProviderManager.duckCouncil.mockResolvedValue([
      {
        ...mockResponses[0],
        latency: 0,
      },
    ]);

    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
    });

    // Should not show "0ms" in output
    expect(result.content[0].text).not.toContain('0ms');
  });

  it('should not show tokens when usage missing', async () => {
    mockProviderManager.duckCouncil.mockResolvedValue([
      {
        ...mockResponses[0],
        usage: undefined,
      },
    ]);

    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).not.toContain('tokens');
  });

  it('should use compareDucksWithProgress when progress is provided', async () => {
    mockProviderManager.compareDucksWithProgress = jest.fn().mockResolvedValue(mockResponses) as any;
    const mockProgress = {
      enabled: true,
      report: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    await duckCouncilTool(mockProviderManager, { prompt: 'Test' }, mockProgress);

    expect(mockProviderManager.compareDucksWithProgress).toHaveBeenCalled();
    expect(mockProviderManager.duckCouncil).not.toHaveBeenCalled();
  });

  it('should use duckCouncil when no progress is provided', async () => {
    await duckCouncilTool(mockProviderManager, { prompt: 'Test' });

    expect(mockProviderManager.duckCouncil).toHaveBeenCalled();
  });

  it('should show error message when all ducks fail', async () => {
    mockProviderManager.duckCouncil.mockResolvedValue([
      {
        provider: 'openai',
        nickname: 'OpenAI Duck',
        content: 'Error: Connection timeout',
        model: '',
        latency: 0,
      },
      {
        provider: 'groq',
        nickname: 'Groq Duck',
        content: 'Error: API error',
        model: '',
        latency: 0,
      },
    ]);

    const result = await duckCouncilTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).toContain('0/2 ducks provided their wisdom');
    // Should not show partial council message
    expect(result.content[0].text).not.toContain('Partial council');
  });
});
