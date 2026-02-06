import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { askDuckTool } from '../../src/tools/ask-duck.js';
import { ProviderManager } from '../../src/providers/manager.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/providers/manager.js');

describe('askDuckTool', () => {
  let mockProviderManager: jest.Mocked<ProviderManager>;

  const mockResponse = {
    provider: 'openai',
    nickname: 'OpenAI Duck',
    content: 'This is a test response from the duck.',
    model: 'gpt-4',
    latency: 150,
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  };

  beforeEach(() => {
    mockProviderManager = {
      askDuck: jest.fn().mockResolvedValue(mockResponse),
      validateModel: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<ProviderManager>;
  });

  it('should throw error when prompt is missing', async () => {
    await expect(askDuckTool(mockProviderManager, {})).rejects.toThrow(
      'Prompt is required'
    );
  });

  it('should ask duck with basic prompt', async () => {
    const result = await askDuckTool(mockProviderManager, {
      prompt: 'What is TypeScript?',
    });

    expect(mockProviderManager.askDuck).toHaveBeenCalledWith(undefined, 'What is TypeScript?', {
      model: undefined,
      temperature: undefined,
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('OpenAI Duck');
    expect(result.content[0].text).toContain('test response');
  });

  it('should include usage info in response', async () => {
    const result = await askDuckTool(mockProviderManager, {
      prompt: 'Test prompt',
    });

    expect(result.content[0].text).toContain('Tokens used: 30');
    expect(result.content[0].text).toContain('10 prompt');
    expect(result.content[0].text).toContain('20 completion');
  });

  it('should show latency in response', async () => {
    const result = await askDuckTool(mockProviderManager, {
      prompt: 'Test prompt',
    });

    expect(result.content[0].text).toContain('150ms');
  });

  it('should pass provider option', async () => {
    await askDuckTool(mockProviderManager, {
      prompt: 'Test',
      provider: 'groq',
    });

    expect(mockProviderManager.askDuck).toHaveBeenCalledWith('groq', 'Test', expect.any(Object));
  });

  it('should pass model and temperature options', async () => {
    await askDuckTool(mockProviderManager, {
      prompt: 'Test',
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
    });

    expect(mockProviderManager.askDuck).toHaveBeenCalledWith('openai', 'Test', {
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
    });
  });

  it('should validate model when both provider and model are specified', async () => {
    await askDuckTool(mockProviderManager, {
      prompt: 'Test',
      provider: 'openai',
      model: 'gpt-4',
    });

    expect(mockProviderManager.validateModel).toHaveBeenCalledWith('openai', 'gpt-4');
  });

  it('should not validate model when provider is not specified', async () => {
    await askDuckTool(mockProviderManager, {
      prompt: 'Test',
      model: 'gpt-4',
    });

    expect(mockProviderManager.validateModel).not.toHaveBeenCalled();
  });

  it('should handle response without usage info', async () => {
    const responseWithoutUsage = { ...mockResponse, usage: undefined };
    mockProviderManager.askDuck.mockResolvedValue(responseWithoutUsage);

    const result = await askDuckTool(mockProviderManager, {
      prompt: 'Test',
    });

    expect(result.content[0].text).not.toContain('Tokens used');
  });

  it('should warn when model is not valid for provider', async () => {
    mockProviderManager.validateModel.mockReturnValue(false);

    // Should still work, just log a warning
    const result = await askDuckTool(mockProviderManager, {
      prompt: 'Test',
      provider: 'openai',
      model: 'invalid-model',
    });

    expect(mockProviderManager.validateModel).toHaveBeenCalledWith('openai', 'invalid-model');
    expect(result.content[0].text).toContain('test response');
  });
});
