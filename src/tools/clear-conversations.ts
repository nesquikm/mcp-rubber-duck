import { ConversationManager } from '../services/conversation.js';
import { logger } from '../utils/logger.js';

export function clearConversationsTool(
  conversationManager: ConversationManager,
  _args: Record<string, unknown>
) {
  const result = conversationManager.clearAll();
  
  logger.info(`User cleared ${result.conversationsCleared} conversations`);
  
  const message = result.conversationsCleared === 0 
    ? '🧹 No conversations to clear - memory is already empty!'
    : `🧹 Cleared ${result.conversationsCleared} conversation${result.conversationsCleared === 1 ? '' : 's'} (${result.messagesCleared} message${result.messagesCleared === 1 ? '' : 's'})`;

  return {
    content: [
      {
        type: 'text',
        text: `${message}\n\n🦆 All ducks now have a fresh start! Previous conversation context has been removed.`,
      },
    ],
  };
}