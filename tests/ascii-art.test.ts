import { describe, it, expect } from '@jest/globals';
import { formatDuckResponse, getRandomDuckMessage, duckMessages } from '../src/utils/ascii-art';

describe('formatDuckResponse', () => {
  it('should format response without model', () => {
    const result = formatDuckResponse('GPT Duck', 'Hello world');
    expect(result).toBe('🦆 [GPT Duck]: Hello world');
  });

  it('should format response with model', () => {
    const result = formatDuckResponse('GPT Duck', 'Hello world', 'gpt-4o-mini');
    expect(result).toBe('🦆 [GPT Duck | gpt-4o-mini]: Hello world');
  });

  it('should handle undefined model', () => {
    const result = formatDuckResponse('GPT Duck', 'Hello world', undefined);
    expect(result).toBe('🦆 [GPT Duck]: Hello world');
  });
});

describe('getRandomDuckMessage', () => {
  it('should return a message from startup messages', () => {
    const result = getRandomDuckMessage('startup');
    expect(duckMessages.startup).toContain(result);
  });

  it('should return a message from error messages', () => {
    const result = getRandomDuckMessage('error');
    expect(duckMessages.error).toContain(result);
  });

  it('should return a message from success messages', () => {
    const result = getRandomDuckMessage('success');
    expect(duckMessages.success).toContain(result);
  });
});