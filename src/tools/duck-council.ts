import { ProviderManager } from '../providers/manager.js';
import { duckArt, getRandomDuckMessage } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

export async function duckCouncilTool(
  providerManager: ProviderManager,
  args: Record<string, unknown>
) {
  const { prompt, model } = args as {
    prompt?: string;
    model?: string;
  };

  if (!prompt) {
    throw new Error('Prompt is required for the duck council');
  }

  logger.info('Convening the duck council...');

  // Get all available ducks
  const allProviders = providerManager.getProviderNames();
  
  if (allProviders.length === 0) {
    throw new Error('No ducks available for the council!');
  }

  // Get responses from all ducks
  const responses = await providerManager.duckCouncil(prompt, { model });

  // Build council response with a panel discussion format
  let response = `${duckArt.panel}\n\n`;
  response += `🎙️ **Duck Council Topic:** "${prompt}"\n`;
  response += `👥 **${allProviders.length} ducks in attendance**\n\n`;
  response += `═══════════════════════════════════════\n\n`;

  // Present each duck's perspective
  for (let i = 0; i < responses.length; i++) {
    const duckResponse = responses[i];
    const duckNumber = i + 1;
    
    response += `**Duck #${duckNumber}: ${duckResponse.nickname}**\n`;
    response += `─────────────────────────────────────\n`;
    
    if (duckResponse.content.startsWith('Error:')) {
      response += `🦆💬 *[Duck had to leave early: ${duckResponse.content}]*\n`;
    } else {
      response += `🦆💬 "${duckResponse.content}"\n`;
      
      // Add metadata in a subtle way
      response += `\n`;
      response += `*[${duckResponse.model}`;
      if (duckResponse.latency > 0) {
        response += ` • ${duckResponse.latency}ms`;
      }
      if (duckResponse.usage) {
        response += ` • ${duckResponse.usage.total_tokens} tokens`;
      }
      response += `]*\n`;
    }
    
    response += `\n`;
  }

  // Add council summary
  const successCount = responses.filter(r => !r.content.startsWith('Error:')).length;
  response += `═══════════════════════════════════════\n`;
  response += `🏛️ **Council Summary**\n`;
  response += `• ${successCount}/${responses.length} ducks provided their wisdom\n`;
  
  if (successCount === responses.length) {
    response += `• ${getRandomDuckMessage('success')}\n`;
  } else if (successCount > 0) {
    response += `• Partial council - some ducks were unavailable\n`;
  } else {
    response += `• ${getRandomDuckMessage('error')}\n`;
  }

  logger.info(`Duck council completed: ${successCount}/${responses.length} responses`);

  return {
    content: [
      {
        type: 'text',
        text: response,
      },
    ],
  };
}