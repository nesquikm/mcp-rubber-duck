import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { clearConversationsTool } from '../../src/tools/clear-conversations.js';
import { ConversationManager } from '../../src/services/conversation.js';

// Mock logger to avoid console noise during tests
jest.mock('../../src/utils/logger');

describe('clear_conversations tool', () => {
  let conversationManager: ConversationManager;

  beforeEach(() => {
    conversationManager = new ConversationManager();
  });

  describe('tool execution', () => {
    it('should call ConversationManager.clearAll and return proper response format', () => {
      // Create some conversations first
      conversationManager.createConversation('test-1', 'openai');
      conversationManager.addMessage('test-1', {
        role: 'user' as const,
        content: 'Hello',
        timestamp: new Date(),
      });

      const result = clearConversationsTool(conversationManager, {});
      
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0].text).toContain('🧹 Cleared 1 conversation (1 message)');
      expect(result.content[0].text).toContain('🦆 All ducks now have a fresh start!');
      
      // Verify conversations were actually cleared
      expect(conversationManager.getConversation('test-1')).toBeUndefined();
    });

    it('should handle empty state gracefully', () => {
      const result = clearConversationsTool(conversationManager, {});
      
      expect(result.content[0].text).toContain('🧹 No conversations to clear - memory is already empty!');
      expect(result.content[0].text).toContain('🦆 All ducks now have a fresh start!');
    });

    it('should handle multiple conversations correctly', () => {
      // Create multiple conversations with different message counts
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

      conversationManager.createConversation('test-2', 'groq');
      conversationManager.addMessage('test-2', {
        role: 'user' as const,
        content: 'Hello 2',
        timestamp: new Date(),
      });

      conversationManager.createConversation('test-3', 'gemini');
      // No messages in test-3

      const result = clearConversationsTool(conversationManager, {});
      
      expect(result.content[0].text).toContain('🧹 Cleared 3 conversations (3 messages)');
      expect(result.content[0].text).toContain('🦆 All ducks now have a fresh start!');
      
      // Verify all conversations were cleared
      expect(conversationManager.listConversations()).toHaveLength(0);
    });

    it('should handle singular vs plural correctly', () => {
      // Test single conversation with single message
      conversationManager.createConversation('test-1', 'openai');
      conversationManager.addMessage('test-1', {
        role: 'user' as const,
        content: 'Hello',
        timestamp: new Date(),
      });

      const result = clearConversationsTool(conversationManager, {});
      
      // Should use singular form
      expect(result.content[0].text).toContain('🧹 Cleared 1 conversation (1 message)');
      expect(result.content[0].text).not.toContain('conversations');
      expect(result.content[0].text).not.toContain('messages)');
    });

    it('should handle args parameter (even though unused)', () => {
      const args = { unused: 'parameter' };
      
      conversationManager.createConversation('test-1', 'openai');
      const result = clearConversationsTool(conversationManager, args);
      
      expect(result).toHaveProperty('content');
      expect(result.content[0].text).toContain('🧹 Cleared 1 conversation');
    });

    it('should return consistent response structure', () => {
      const result = clearConversationsTool(conversationManager, {});
      
      // Verify response structure matches MCP tool format
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: expect.stringContaining('🧹'),
          },
        ],
      });
      
      expect(result.content[0].text).toContain('🦆 All ducks now have a fresh start!');
    });
  });

  describe('integration with ConversationManager', () => {
    it('should properly clear all conversation state', () => {
      // Create complex scenario
      conversationManager.createConversation('debug-session', 'openai');
      conversationManager.addMessage('debug-session', {
        role: 'user' as const,
        content: 'Help with bug',
        timestamp: new Date(),
      });
      conversationManager.addMessage('debug-session', {
        role: 'assistant' as const,
        content: 'Sure, what\'s the issue?',
        timestamp: new Date(),
      });

      conversationManager.createConversation('code-review', 'groq');
      conversationManager.addMessage('code-review', {
        role: 'user' as const,
        content: 'Review this code',
        timestamp: new Date(),
      });

      // Switch provider in second conversation
      conversationManager.switchProvider('code-review', 'gemini');

      // Verify setup
      expect(conversationManager.listConversations()).toHaveLength(2);
      expect(conversationManager.getConversation('debug-session')!.messages).toHaveLength(2);
      expect(conversationManager.getConversation('code-review')!.messages).toHaveLength(2); // 1 + 1 system message

      // Clear all
      const result = clearConversationsTool(conversationManager, {});

      // Verify complete cleanup
      expect(conversationManager.listConversations()).toHaveLength(0);
      expect(conversationManager.getConversation('debug-session')).toBeUndefined();
      expect(conversationManager.getConversation('code-review')).toBeUndefined();
      
      // Verify counts in response
      expect(result.content[0].text).toContain('🧹 Cleared 2 conversations (4 messages)');
    });
  });
});