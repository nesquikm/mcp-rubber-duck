import { ProviderManager } from '../providers/manager.js';
import { ConversationManager } from '../services/conversation.js';
import { ImageInput, buildContent } from '../config/types.js';
import { formatDuckReply, formatDuckFooter } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

export async function chatDuckTool(
  providerManager: ProviderManager,
  conversationManager: ConversationManager,
  args: Record<string, unknown>
) {
  const { conversation_id, message, provider, model, images } = args as {
    conversation_id?: string;
    message?: string;
    provider?: string;
    model?: string;
    images?: ImageInput[];
  };

  if (!conversation_id || !message) {
    throw new Error('conversation_id and message are required');
  }

  // Get or create conversation
  let conversation = conversationManager.getConversation(conversation_id);

  if (!conversation) {
    // Create new conversation with specified or default provider
    const providerName = provider || providerManager.getDefaultProviderName();
    conversation = conversationManager.createConversation(conversation_id, providerName);
    logger.info(`Created new conversation: ${conversation_id} with ${providerName}`);
  } else if (provider && provider !== conversation.provider) {
    // Switch provider if requested
    conversation = conversationManager.switchProvider(conversation_id, provider);
    logger.info(`Switched conversation ${conversation_id} to ${provider}`);
  }

  // Add user message to conversation
  const userContent = buildContent(message, images);
  conversationManager.addMessage(conversation_id, {
    role: 'user',
    content: userContent,
    timestamp: new Date(),
  });

  // Get conversation context
  const messages = conversationManager.getConversationContext(conversation_id);

  // Get response from provider
  const providerToUse = provider || conversation.provider;
  const response = await providerManager.askDuck(providerToUse, '', {
    messages,
    model,
  });

  // Add assistant response to conversation
  const updated = conversationManager.addMessage(conversation_id, {
    role: 'assistant',
    content: response.content,
    timestamp: new Date(),
    provider: providerToUse,
  });

  const text =
    `${formatDuckReply(response)}\n\n` +
    `💬 Conversation: ${conversation_id} | Messages: ${updated.messages.length}\n` +
    formatDuckFooter(response);

  logger.info(`Duck ${response.nickname} responded in conversation ${conversation_id}`);

  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}
