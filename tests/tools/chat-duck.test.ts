import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { chatDuckTool } from '../../src/tools/chat-duck.js';
import { ProviderManager } from '../../src/providers/manager.js';
import { ConversationManager } from '../../src/services/conversation.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/providers/manager.js');
jest.mock('../../src/services/conversation.js');

describe('chatDuckTool', () => {
  let mockProviderManager: jest.Mocked<ProviderManager>;
  let mockConversationManager: jest.Mocked<ConversationManager>;

  const mockResponse = {
    provider: 'openai',
    nickname: 'OpenAI Duck',
    content: 'This is a test response.',
    model: 'gpt-4',
    latency: 150,
  };

  const mockConversation = {
    id: 'test-conv',
    provider: 'openai',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockProviderManager = {
      askDuck: jest.fn().mockResolvedValue(mockResponse),
      getProviderNames: jest.fn().mockReturnValue(['openai', 'groq']),
    } as unknown as jest.Mocked<ProviderManager>;

    mockConversationManager = {
      getConversation: jest.fn().mockReturnValue(mockConversation),
      createConversation: jest.fn().mockReturnValue(mockConversation),
      switchProvider: jest.fn().mockReturnValue({ ...mockConversation, provider: 'groq' }),
      addMessage: jest.fn().mockReturnValue(mockConversation),
      getConversationContext: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<ConversationManager>;
  });

  it('should throw error when conversation_id is missing', async () => {
    await expect(
      chatDuckTool(mockProviderManager, mockConversationManager, { message: 'Hello' })
    ).rejects.toThrow('conversation_id and message are required');
  });

  it('should throw error when message is missing', async () => {
    await expect(
      chatDuckTool(mockProviderManager, mockConversationManager, { conversation_id: 'test' })
    ).rejects.toThrow('conversation_id and message are required');
  });

  it('should create new conversation if not exists', async () => {
    mockConversationManager.getConversation.mockReturnValue(undefined);

    await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'new-conv',
      message: 'Hello',
    });

    expect(mockConversationManager.createConversation).toHaveBeenCalledWith('new-conv', 'openai');
  });

  it('should use existing conversation', async () => {
    await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'test-conv',
      message: 'Hello',
    });

    expect(mockConversationManager.createConversation).not.toHaveBeenCalled();
  });

  it('should switch provider when requested', async () => {
    await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'test-conv',
      message: 'Hello',
      provider: 'groq',
    });

    expect(mockConversationManager.switchProvider).toHaveBeenCalledWith('test-conv', 'groq');
  });

  it('should not switch provider if same as current', async () => {
    await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'test-conv',
      message: 'Hello',
      provider: 'openai', // Same as mockConversation.provider
    });

    expect(mockConversationManager.switchProvider).not.toHaveBeenCalled();
  });

  it('should add user message to conversation', async () => {
    await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'test-conv',
      message: 'What is TypeScript?',
    });

    expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
      'test-conv',
      expect.objectContaining({
        role: 'user',
        content: 'What is TypeScript?',
      })
    );
  });

  it('should add assistant response to conversation', async () => {
    await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'test-conv',
      message: 'Hello',
    });

    expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
      'test-conv',
      expect.objectContaining({
        role: 'assistant',
        content: 'This is a test response.',
      })
    );
  });

  it('should pass conversation context to provider', async () => {
    const contextMessages = [
      { role: 'user' as const, content: 'Previous', timestamp: new Date() },
    ];
    mockConversationManager.getConversationContext.mockReturnValue(contextMessages);

    await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'test-conv',
      message: 'Hello',
    });

    expect(mockProviderManager.askDuck).toHaveBeenCalledWith(
      'openai',
      '',
      expect.objectContaining({
        messages: contextMessages,
      })
    );
  });

  it('should pass model option to provider', async () => {
    await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'test-conv',
      message: 'Hello',
      model: 'gpt-3.5-turbo',
    });

    expect(mockProviderManager.askDuck).toHaveBeenCalledWith(
      'openai',
      '',
      expect.objectContaining({
        model: 'gpt-3.5-turbo',
      })
    );
  });

  it('should format response with conversation info', async () => {
    mockConversationManager.getConversationContext.mockReturnValue([
      { role: 'user' as const, content: 'Hello', timestamp: new Date() },
    ]);

    const result = await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'test-conv',
      message: 'Hello',
    });

    expect(result.content[0].text).toContain('OpenAI Duck');
    expect(result.content[0].text).toContain('test-conv');
    expect(result.content[0].text).toContain('Messages: 2'); // context (1) + 1 new
    expect(result.content[0].text).toContain('150ms');
  });

  it('should use specified provider for new conversation', async () => {
    mockConversationManager.getConversation.mockReturnValue(undefined);

    await chatDuckTool(mockProviderManager, mockConversationManager, {
      conversation_id: 'new-conv',
      message: 'Hello',
      provider: 'groq',
    });

    expect(mockConversationManager.createConversation).toHaveBeenCalledWith('new-conv', 'groq');
  });
});
