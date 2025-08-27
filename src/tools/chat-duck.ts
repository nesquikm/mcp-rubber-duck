import { ProviderManager } from '../providers/manager.js';
import { ConversationManager } from '../services/conversation.js';
import { formatDuckResponse } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

export async function chatDuckTool(
  providerManager: ProviderManager,
  conversationManager: ConversationManager,
  args: any
) {
  const { conversation_id, message, provider } = args;

  if (!conversation_id || !message) {
    throw new Error('conversation_id and message are required');
  }

  // Get or create conversation
  let conversation = conversationManager.getConversation(conversation_id);
  
  if (!conversation) {
    // Create new conversation with specified or default provider
    const providerName = provider || providerManager.getProviderNames()[0];
    conversation = conversationManager.createConversation(conversation_id, providerName);
    logger.info(`Created new conversation: ${conversation_id} with ${providerName}`);
  } else if (provider && provider !== conversation.provider) {
    // Switch provider if requested
    conversation = conversationManager.switchProvider(conversation_id, provider);
    logger.info(`Switched conversation ${conversation_id} to ${provider}`);
  }

  // Add user message to conversation
  conversationManager.addMessage(conversation_id, {
    role: 'user',
    content: message,
    timestamp: new Date(),
  });

  // Get conversation context
  const messages = conversationManager.getConversationContext(conversation_id);

  // Get response from provider
  const providerToUse = provider || conversation.provider;
  const response = await providerManager.askDuck(providerToUse, '', {
    messages,
  });

  // Add assistant response to conversation
  conversationManager.addMessage(conversation_id, {
    role: 'assistant',
    content: response.content,
    timestamp: new Date(),
    provider: providerToUse,
  });

  // Format response
  const formattedResponse = formatDuckResponse(
    response.nickname,
    response.content
  );

  // Add conversation info
  const conversationInfo = `\n\n💬 Conversation: ${conversation_id} | Messages: ${messages.length + 1}`;
  const latencyInfo = `\n⏱️ Latency: ${response.latency}ms`;

  logger.info(`Duck ${response.nickname} responded in conversation ${conversation_id}`);

  return {
    content: [
      {
        type: 'text',
        text: formattedResponse + conversationInfo + latencyInfo,
      },
    ],
  };
}