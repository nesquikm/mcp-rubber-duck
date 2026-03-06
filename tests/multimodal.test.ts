import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getTextContent,
  hasImages,
  buildContent,
  MessageContent,
  ContentPart,
  ImageInput,
} from '../src/config/types.js';

// Mock logger for DuckProvider tests
jest.mock('../src/utils/logger');

describe('Multimodal Content Utilities', () => {
  describe('getTextContent', () => {
    it('should return string content as-is', () => {
      expect(getTextContent('hello world')).toBe('hello world');
    });

    it('should return empty string for empty string input', () => {
      expect(getTextContent('')).toBe('');
    });

    it('should extract text from ContentPart array', () => {
      const content: ContentPart[] = [
        { type: 'text', text: 'First line' },
        { type: 'text', text: 'Second line' },
      ];
      expect(getTextContent(content)).toBe('First line\nSecond line');
    });

    it('should skip image parts and only return text', () => {
      const content: ContentPart[] = [
        { type: 'text', text: 'Look at this image:' },
        { type: 'image', data: 'base64data', mimeType: 'image/png' },
      ];
      expect(getTextContent(content)).toBe('Look at this image:');
    });

    it('should return empty string when only images present', () => {
      const content: ContentPart[] = [
        { type: 'image', data: 'base64data', mimeType: 'image/png' },
      ];
      expect(getTextContent(content)).toBe('');
    });

    it('should return empty string for empty array', () => {
      expect(getTextContent([])).toBe('');
    });
  });

  describe('hasImages', () => {
    it('should return false for string content', () => {
      expect(hasImages('hello')).toBe(false);
    });

    it('should return false for text-only parts', () => {
      const content: ContentPart[] = [{ type: 'text', text: 'hello' }];
      expect(hasImages(content)).toBe(false);
    });

    it('should return true when images are present', () => {
      const content: ContentPart[] = [
        { type: 'text', text: 'hello' },
        { type: 'image', data: 'base64data', mimeType: 'image/png' },
      ];
      expect(hasImages(content)).toBe(true);
    });

    it('should return false for empty array', () => {
      expect(hasImages([])).toBe(false);
    });
  });

  describe('buildContent', () => {
    it('should return plain string when no images', () => {
      const result = buildContent('hello');
      expect(result).toBe('hello');
      expect(typeof result).toBe('string');
    });

    it('should return plain string when images is undefined', () => {
      expect(buildContent('hello', undefined)).toBe('hello');
    });

    it('should return plain string when images array is empty', () => {
      expect(buildContent('hello', [])).toBe('hello');
    });

    it('should return ContentPart array when images are provided', () => {
      const images: ImageInput[] = [
        { data: 'abc123', mimeType: 'image/png' },
      ];
      const result = buildContent('Describe this', images);
      expect(Array.isArray(result)).toBe(true);
      const parts = result as ContentPart[];
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ type: 'text', text: 'Describe this' });
      expect(parts[1]).toEqual({ type: 'image', data: 'abc123', mimeType: 'image/png' });
    });

    it('should handle multiple images', () => {
      const images: ImageInput[] = [
        { data: 'img1data', mimeType: 'image/png' },
        { data: 'img2data', mimeType: 'image/jpeg' },
      ];
      const result = buildContent('Compare these', images) as ContentPart[];
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'text', text: 'Compare these' });
      expect(result[1]).toEqual({ type: 'image', data: 'img1data', mimeType: 'image/png' });
      expect(result[2]).toEqual({ type: 'image', data: 'img2data', mimeType: 'image/jpeg' });
    });
  });
});

describe('DuckProvider.prepareMessages multimodal', () => {
  // We test prepareMessages indirectly by instantiating DuckProvider
  // and checking the prepared messages format
  let prepareMessages: (
    messages: { role: string; content: MessageContent; timestamp: Date }[],
    systemPrompt?: string
  ) => Array<{ role: string; content: unknown }>;

  beforeEach(async () => {
    // Access the protected method via a test subclass
    const { DuckProvider } = await import('../src/providers/provider.js');

    class TestDuckProvider extends DuckProvider {
      public testPrepareMessages(
        messages: { role: string; content: MessageContent; timestamp: Date }[],
        systemPrompt?: string
      ) {
        return this.prepareMessages(
          messages as Parameters<typeof this.prepareMessages>[0],
          systemPrompt
        );
      }
    }

    const provider = new TestDuckProvider('test', 'Test Duck', {
      apiKey: 'test-key',
      baseURL: 'http://localhost',
      model: 'test-model',
    });

    prepareMessages = (messages, systemPrompt) =>
      provider.testPrepareMessages(messages, systemPrompt);
  });

  it('should pass string content through unchanged', () => {
    const result = prepareMessages([
      { role: 'user', content: 'Hello', timestamp: new Date() },
    ]);
    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should convert ContentPart array to OpenAI format', () => {
    const content: ContentPart[] = [
      { type: 'text', text: 'What is this?' },
      { type: 'image', data: 'iVBOR...', mimeType: 'image/png' },
    ];

    const result = prepareMessages([
      { role: 'user', content, timestamp: new Date() },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    const parts = result[0].content as Array<Record<string, unknown>>;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: 'text', text: 'What is this?' });
    expect(parts[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,iVBOR...' },
    });
  });

  it('should handle mixed string and multimodal messages', () => {
    const result = prepareMessages([
      { role: 'user', content: 'First message', timestamp: new Date() },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Second with image' },
          { type: 'image', data: 'abc', mimeType: 'image/jpeg' },
        ],
        timestamp: new Date(),
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('First message');
    expect(Array.isArray(result[1].content)).toBe(true);
  });

  it('should prepend system prompt before messages', () => {
    const result = prepareMessages(
      [{ role: 'user', content: 'Hello', timestamp: new Date() }],
      'You are a helpful duck.'
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'system', content: 'You are a helpful duck.' });
    expect(result[1]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('should format data URI correctly with mimeType', () => {
    const content: ContentPart[] = [
      { type: 'image', data: 'SGVsbG8=', mimeType: 'image/webp' },
    ];

    const result = prepareMessages([
      { role: 'user', content, timestamp: new Date() },
    ]);

    const parts = result[0].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts[0].image_url?.url).toBe('data:image/webp;base64,SGVsbG8=');
  });
});

describe('askDuckTool with images', () => {
  let mockProviderManager: { askDuck: jest.Mock; validateModel: jest.Mock };

  const mockResponse = {
    provider: 'openai',
    nickname: 'OpenAI Duck',
    content: 'I can see the image.',
    model: 'gpt-4o',
    latency: 200,
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  };

  beforeEach(() => {
    mockProviderManager = {
      askDuck: jest.fn().mockResolvedValue(mockResponse),
      validateModel: jest.fn().mockReturnValue(true),
    };
  });

  it('should pass images through to provider via buildContent', async () => {
    const { askDuckTool } = await import('../src/tools/ask-duck.js');

    const images = [{ data: 'iVBOR...', mimeType: 'image/png' }];
    await askDuckTool(mockProviderManager as never, {
      prompt: 'What is in this image?',
      images,
    });

    // buildContent should create a ContentPart[] when images are present
    const callArgs = mockProviderManager.askDuck.mock.calls[0];
    const content = callArgs[1]; // second arg is the content
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'text', text: 'What is in this image?' });
    expect(content[1]).toEqual({ type: 'image', data: 'iVBOR...', mimeType: 'image/png' });
  });

  it('should pass plain string when no images provided', async () => {
    const { askDuckTool } = await import('../src/tools/ask-duck.js');

    await askDuckTool(mockProviderManager as never, {
      prompt: 'No images here',
    });

    const callArgs = mockProviderManager.askDuck.mock.calls[0];
    expect(callArgs[1]).toBe('No images here');
  });
});

describe('Guardrails with multimodal content', () => {
  it('pattern blocker redact should preserve images in multimodal messages', async () => {
    const { PatternBlockerPlugin } = await import(
      '../src/guardrails/plugins/pattern-blocker.js'
    );
    const { createGuardrailContext } = await import('../src/guardrails/context.js');

    const plugin = new PatternBlockerPlugin();
    await plugin.initialize({
      enabled: true,
      blocked_patterns: ['secret'],
      action_on_match: 'redact',
    });

    const context = createGuardrailContext({
      prompt: 'Tell me the secret code',
      messages: [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'Tell me the secret code' },
            { type: 'image' as const, data: 'base64imagedata', mimeType: 'image/png' },
          ],
          timestamp: new Date(),
        },
      ],
    });

    const result = await plugin.execute('pre_request', context);

    expect(result.action).toBe('modify');
    expect(context.prompt).toContain('[REDACTED]');

    // Content should still be an array (not flattened to string)
    const content = context.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const parts = content as ContentPart[];

    // Text should be redacted
    const textParts = parts.filter((p) => p.type === 'text');
    expect(textParts[0].text).toContain('[REDACTED]');
    expect(textParts[0].text).not.toContain('secret');

    // Image should be preserved
    const imageParts = parts.filter((p) => p.type === 'image');
    expect(imageParts).toHaveLength(1);
    expect(imageParts[0]).toEqual({
      type: 'image',
      data: 'base64imagedata',
      mimeType: 'image/png',
    });
  });

  it('pattern blocker should redact each text part independently (no duplication)', async () => {
    const { PatternBlockerPlugin } = await import(
      '../src/guardrails/plugins/pattern-blocker.js'
    );
    const { createGuardrailContext } = await import('../src/guardrails/context.js');

    const plugin = new PatternBlockerPlugin();
    await plugin.initialize({
      enabled: true,
      blocked_patterns: ['secret'],
      action_on_match: 'redact',
    });

    // Multiple text parts with an image between them — only the first has the blocked word
    const context = createGuardrailContext({
      prompt: 'The secret is here\nThis is safe text',
      messages: [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'The secret is here' },
            { type: 'image' as const, data: 'imgdata', mimeType: 'image/png' },
            { type: 'text' as const, text: 'This is safe text' },
          ],
          timestamp: new Date(),
        },
      ],
    });

    await plugin.execute('pre_request', context);

    const parts = context.messages[0].content as ContentPart[];
    expect(parts).toHaveLength(3);

    // First text part should be redacted
    expect(parts[0].type).toBe('text');
    expect((parts[0] as { text: string }).text).toContain('[REDACTED]');
    expect((parts[0] as { text: string }).text).not.toContain('secret');

    // Second part is the image — preserved
    expect(parts[1].type).toBe('image');

    // Third text part should NOT contain the redacted text from part 1
    expect(parts[2].type).toBe('text');
    expect((parts[2] as { text: string }).text).toBe('This is safe text');
  });

  it('PII redactor should preserve images in multimodal messages', async () => {
    const { PIIRedactorPlugin } = await import(
      '../src/guardrails/plugins/pii-redactor/index.js'
    );
    const { createGuardrailContext } = await import('../src/guardrails/context.js');

    const plugin = new PIIRedactorPlugin();
    await plugin.initialize({
      enabled: true,
      detect_emails: true,
    });

    const context = createGuardrailContext({
      prompt: 'Contact me at user@example.com',
      messages: [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'Contact me at user@example.com' },
            { type: 'image' as const, data: 'screenshotdata', mimeType: 'image/jpeg' },
          ],
          timestamp: new Date(),
        },
      ],
    });

    const result = await plugin.execute('pre_request', context);

    expect(result.action).toBe('modify');
    // Email should be redacted from prompt
    expect(context.prompt).not.toContain('user@example.com');

    // Content should still be an array
    const content = context.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const parts = content as ContentPart[];

    // Text should be redacted
    const textParts = parts.filter((p) => p.type === 'text');
    expect(textParts[0].text).not.toContain('user@example.com');

    // Image should be preserved
    const imageParts = parts.filter((p) => p.type === 'image');
    expect(imageParts).toHaveLength(1);
    expect(imageParts[0]).toEqual({
      type: 'image',
      data: 'screenshotdata',
      mimeType: 'image/jpeg',
    });
  });

  it('PII redactor should redact each text part independently (no duplication)', async () => {
    const { PIIRedactorPlugin } = await import(
      '../src/guardrails/plugins/pii-redactor/index.js'
    );
    const { createGuardrailContext } = await import('../src/guardrails/context.js');

    const plugin = new PIIRedactorPlugin();
    await plugin.initialize({
      enabled: true,
      detect_emails: true,
    });

    // Multiple text parts — only the first has PII
    const context = createGuardrailContext({
      prompt: 'Email me at user@example.com\nNo PII here',
      messages: [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'Email me at user@example.com' },
            { type: 'image' as const, data: 'imgdata', mimeType: 'image/png' },
            { type: 'text' as const, text: 'No PII here' },
          ],
          timestamp: new Date(),
        },
      ],
    });

    await plugin.execute('pre_request', context);

    const parts = context.messages[0].content as ContentPart[];
    expect(parts).toHaveLength(3);

    // First text part should have email redacted
    expect(parts[0].type).toBe('text');
    expect((parts[0] as { text: string }).text).not.toContain('user@example.com');

    // Image preserved
    expect(parts[1].type).toBe('image');

    // Third text part should remain unchanged — not contain redacted content from part 1
    expect(parts[2].type).toBe('text');
    expect((parts[2] as { text: string }).text).toBe('No PII here');
  });
});
