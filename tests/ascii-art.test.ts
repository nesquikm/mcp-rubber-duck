import { describe, it, expect } from '@jest/globals';
import { formatDuckReply, formatDuckFooter, getRandomDuckMessage, duckMessages } from '../src/utils/ascii-art';

describe('formatDuckReply / formatDuckFooter', () => {
  const base = { nickname: 'GPT Duck', provider: 'openai', content: 'Hello world', latency: 42 };

  it('formats header and body', () => {
    expect(formatDuckReply(base)).toBe(
      '🦆 **GPT Duck** (openai)\n─────────────────────────────────────\nHello world'
    );
  });

  it('formats footer with model, tokens and latency', () => {
    const footer = formatDuckFooter({
      ...base,
      model: 'gpt-5.4',
      usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
    });
    expect(footer).toBe('📍 Model: gpt-5.4 | 📊 Tokens: 30 (10 prompt, 20 completion) | ⏱️ 42ms');
  });

  it('omits missing model/usage and appends extras', () => {
    expect(formatDuckFooter(base, ['🔄 MCP Enhanced'])).toBe('⏱️ 42ms | 🔄 MCP Enhanced');
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