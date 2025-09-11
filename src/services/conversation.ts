import { Conversation, ConversationMessage } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class ConversationManager {
  private conversations: Map<string, Conversation> = new Map();
  private maxConversationSize = 50; // Maximum messages per conversation

  createConversation(id: string, provider: string): Conversation {
    const conversation: Conversation = {
      id,
      messages: [],
      provider,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.conversations.set(id, conversation);
    logger.debug(`Created new conversation: ${id}`);
    return conversation;
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  addMessage(
    conversationId: string,
    message: ConversationMessage
  ): Conversation {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push(message);
    conversation.updatedAt = new Date();

    // Trim conversation if too long
    if (conversation.messages.length > this.maxConversationSize) {
      const toRemove = conversation.messages.length - this.maxConversationSize;
      conversation.messages = conversation.messages.slice(toRemove);
      logger.debug(`Trimmed ${toRemove} messages from conversation ${conversationId}`);
    }

    this.conversations.set(conversationId, conversation);
    return conversation;
  }

  switchProvider(conversationId: string, newProvider: string): Conversation {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.provider = newProvider;
    conversation.updatedAt = new Date();
    
    // Add a system message noting the provider switch
    conversation.messages.push({
      role: 'system',
      content: `Switched to ${newProvider} duck`,
      timestamp: new Date(),
      provider: newProvider,
    });

    this.conversations.set(conversationId, conversation);
    return conversation;
  }

  listConversations(): Array<{
    id: string;
    provider: string;
    messageCount: number;
    createdAt: Date;
    updatedAt: Date;
  }> {
    return Array.from(this.conversations.values()).map(conv => ({
      id: conv.id,
      provider: conv.provider,
      messageCount: conv.messages.length,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    }));
  }

  deleteConversation(id: string): boolean {
    const deleted = this.conversations.delete(id);
    if (deleted) {
      logger.debug(`Deleted conversation: ${id}`);
    }
    return deleted;
  }

  clearOldConversations(maxAge: number = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let deleted = 0;

    for (const [id, conversation] of this.conversations) {
      if (now - conversation.updatedAt.getTime() > maxAge) {
        this.conversations.delete(id);
        deleted++;
      }
    }

    if (deleted > 0) {
      logger.info(`Cleared ${deleted} old conversations`);
    }
  }

  getConversationContext(id: string, maxMessages?: number): ConversationMessage[] {
    const conversation = this.conversations.get(id);
    
    if (!conversation) {
      return [];
    }

    const messages = conversation.messages;
    
    if (maxMessages && messages.length > maxMessages) {
      return messages.slice(-maxMessages);
    }

    return messages;
  }

  clearAll(): { conversationsCleared: number; messagesCleared: number } {
    let totalMessages = 0;
    
    // Count total messages across all conversations
    for (const conversation of this.conversations.values()) {
      totalMessages += conversation.messages.length;
    }
    
    const conversationsCleared = this.conversations.size;
    this.conversations.clear();
    
    logger.info(`Cleared ${conversationsCleared} conversations with ${totalMessages} total messages`);
    
    return {
      conversationsCleared,
      messagesCleared: totalMessages,
    };
  }
}