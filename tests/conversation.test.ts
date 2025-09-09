import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ConversationManager } from '../src/services/conversation.js';

// Mock logger to avoid console noise during tests
jest.mock('../src/utils/logger');

describe('ConversationManager', () => {
  let conversationManager: ConversationManager;

  beforeEach(() => {
    conversationManager = new ConversationManager();
  });

  describe('conversation creation and retrieval', () => {
    it('should create a new conversation', () => {
      const conversation = conversationManager.createConversation('test-1', 'openai');
      
      expect(conversation.id).toBe('test-1');
      expect(conversation.provider).toBe('openai');
      expect(conversation.messages).toHaveLength(0);
      expect(conversation.createdAt).toBeInstanceOf(Date);
      expect(conversation.updatedAt).toBeInstanceOf(Date);
    });

    it('should retrieve an existing conversation', () => {
      conversationManager.createConversation('test-1', 'openai');
      const retrieved = conversationManager.getConversation('test-1');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('test-1');
    });

    it('should return undefined for non-existent conversation', () => {
      const retrieved = conversationManager.getConversation('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      conversationManager.createConversation('test-1', 'openai');
    });

    it('should add messages to conversation', () => {
      const message = {
        role: 'user' as const,
        content: 'Hello duck',
        timestamp: new Date(),
      };

      const conversation = conversationManager.addMessage('test-1', message);
      
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]).toEqual(message);
      expect(conversation.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent conversation when adding message', () => {
      const message = {
        role: 'user' as const,
        content: 'Hello duck',
        timestamp: new Date(),
      };

      expect(() => {
        conversationManager.addMessage('nonexistent', message);
      }).toThrow('Conversation nonexistent not found');
    });

    it('should trim conversations that exceed max size', () => {
      // Add 55 messages (exceeds max of 50)
      for (let i = 0; i < 55; i++) {
        conversationManager.addMessage('test-1', {
          role: 'user' as const,
          content: `Message ${i}`,
          timestamp: new Date(),
        });
      }

      const conversation = conversationManager.getConversation('test-1');
      
      // Should be trimmed to 50 messages
      expect(conversation!.messages).toHaveLength(50);
      // Should keep the latest messages
      expect(conversation!.messages[0].content).toBe('Message 5');
      expect(conversation!.messages[49].content).toBe('Message 54');
    });
  });

  describe('provider switching', () => {
    beforeEach(() => {
      conversationManager.createConversation('test-1', 'openai');
    });

    it('should switch provider and add system message', () => {
      const conversation = conversationManager.switchProvider('test-1', 'groq');
      
      expect(conversation.provider).toBe('groq');
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].role).toBe('system');
      expect(conversation.messages[0].content).toBe('Switched to groq duck');
      expect(conversation.messages[0].provider).toBe('groq');
    });

    it('should throw error for non-existent conversation when switching provider', () => {
      expect(() => {
        conversationManager.switchProvider('nonexistent', 'groq');
      }).toThrow('Conversation nonexistent not found');
    });
  });

  describe('conversation context', () => {
    beforeEach(() => {
      conversationManager.createConversation('test-1', 'openai');
      
      // Add some messages
      for (let i = 0; i < 5; i++) {
        conversationManager.addMessage('test-1', {
          role: 'user' as const,
          content: `Message ${i}`,
          timestamp: new Date(),
        });
      }
    });

    it('should return all messages when no limit specified', () => {
      const context = conversationManager.getConversationContext('test-1');
      expect(context).toHaveLength(5);
    });

    it('should return limited messages when maxMessages specified', () => {
      const context = conversationManager.getConversationContext('test-1', 3);
      expect(context).toHaveLength(3);
      // Should return the last 3 messages
      expect(context[0].content).toBe('Message 2');
      expect(context[2].content).toBe('Message 4');
    });

    it('should return empty array for non-existent conversation', () => {
      const context = conversationManager.getConversationContext('nonexistent');
      expect(context).toEqual([]);
    });
  });

  describe('conversation management', () => {
    it('should list all conversations', () => {
      conversationManager.createConversation('test-1', 'openai');
      conversationManager.createConversation('test-2', 'groq');
      
      const list = conversationManager.listConversations();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('test-1');
      expect(list[1].id).toBe('test-2');
      expect(list[0].messageCount).toBe(0);
    });

    it('should delete conversation', () => {
      conversationManager.createConversation('test-1', 'openai');
      
      const deleted = conversationManager.deleteConversation('test-1');
      expect(deleted).toBe(true);
      
      const retrieved = conversationManager.getConversation('test-1');
      expect(retrieved).toBeUndefined();
    });

    it('should return false when deleting non-existent conversation', () => {
      const deleted = conversationManager.deleteConversation('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('clearAll functionality', () => {
    it('should clear empty conversation list', () => {
      const result = conversationManager.clearAll();
      
      expect(result.conversationsCleared).toBe(0);
      expect(result.messagesCleared).toBe(0);
    });

    it('should clear single conversation', () => {
      conversationManager.createConversation('test-1', 'openai');
      conversationManager.addMessage('test-1', {
        role: 'user' as const,
        content: 'Hello',
        timestamp: new Date(),
      });

      const result = conversationManager.clearAll();
      
      expect(result.conversationsCleared).toBe(1);
      expect(result.messagesCleared).toBe(1);
      
      // Verify conversations are actually cleared
      const retrieved = conversationManager.getConversation('test-1');
      expect(retrieved).toBeUndefined();
    });

    it('should clear multiple conversations with correct counts', () => {
      // Create first conversation with 2 messages
      conversationManager.createConversation('test-1', 'openai');
      conversationManager.addMessage('test-1', {
        role: 'user' as const,
        content: 'Hello 1',
        timestamp: new Date(),
      });
      conversationManager.addMessage('test-1', {
        role: 'assistant' as const,
        content: 'Hi 1',
        timestamp: new Date(),
      });

      // Create second conversation with 3 messages
      conversationManager.createConversation('test-2', 'groq');
      conversationManager.addMessage('test-2', {
        role: 'user' as const,
        content: 'Hello 2',
        timestamp: new Date(),
      });
      conversationManager.addMessage('test-2', {
        role: 'assistant' as const,
        content: 'Hi 2',
        timestamp: new Date(),
      });
      conversationManager.addMessage('test-2', {
        role: 'user' as const,
        content: 'Follow up',
        timestamp: new Date(),
      });

      const result = conversationManager.clearAll();
      
      expect(result.conversationsCleared).toBe(2);
      expect(result.messagesCleared).toBe(5);
      
      // Verify all conversations are cleared
      expect(conversationManager.getConversation('test-1')).toBeUndefined();
      expect(conversationManager.getConversation('test-2')).toBeUndefined();
      expect(conversationManager.listConversations()).toHaveLength(0);
    });

    it('should allow new conversations after clear', () => {
      // Create and clear
      conversationManager.createConversation('test-1', 'openai');
      conversationManager.clearAll();
      
      // Create new conversation after clear
      const newConversation = conversationManager.createConversation('test-2', 'groq');
      
      expect(newConversation.id).toBe('test-2');
      expect(newConversation.provider).toBe('groq');
      expect(conversationManager.listConversations()).toHaveLength(1);
    });
  });

  describe('conversation persistence', () => {
    it('should maintain conversation between message additions', () => {
      conversationManager.createConversation('test-1', 'openai');
      
      // Add first message
      conversationManager.addMessage('test-1', {
        role: 'user' as const,
        content: 'First message',
        timestamp: new Date(),
      });
      
      // Add second message
      conversationManager.addMessage('test-1', {
        role: 'assistant' as const,
        content: 'First response',
        timestamp: new Date(),
      });
      
      const conversation = conversationManager.getConversation('test-1');
      expect(conversation!.messages).toHaveLength(2);
      expect(conversation!.messages[0].content).toBe('First message');
      expect(conversation!.messages[1].content).toBe('First response');
    });

    it('should handle provider switching without losing messages', () => {
      conversationManager.createConversation('test-1', 'openai');
      
      // Add initial message
      conversationManager.addMessage('test-1', {
        role: 'user' as const,
        content: 'Before switch',
        timestamp: new Date(),
      });
      
      // Switch provider
      conversationManager.switchProvider('test-1', 'groq');
      
      // Add message after switch
      conversationManager.addMessage('test-1', {
        role: 'user' as const,
        content: 'After switch',
        timestamp: new Date(),
      });
      
      const conversation = conversationManager.getConversation('test-1');
      expect(conversation!.messages).toHaveLength(3);
      expect(conversation!.messages[0].content).toBe('Before switch');
      expect(conversation!.messages[1].content).toBe('Switched to groq duck');
      expect(conversation!.messages[2].content).toBe('After switch');
      expect(conversation!.provider).toBe('groq');
    });
  });
});