import { ProviderManager } from '../providers/manager.js';
import { duckArt } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

export async function compareDucksTool(
  providerManager: ProviderManager,
  _cache: any,
  args: any
) {
  const { prompt, providers, model } = args;

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  // Get responses from multiple ducks
  const responses = await providerManager.compareDucks(prompt, providers, { model });

  // Build comparison response
  let response = `${duckArt.panel}\n`;
  response += `Asked: "${prompt}"\n\n`;
  response += `═══════════════════════════════════════\n\n`;

  for (const duckResponse of responses) {
    response += `🦆 **${duckResponse.nickname}** (${duckResponse.provider})\n`;
    response += `─────────────────────────────────────\n`;
    
    if (duckResponse.content.startsWith('Error:')) {
      response += `❌ ${duckResponse.content}\n`;
    } else {
      response += `${duckResponse.content}\n`;
      
      if (duckResponse.usage) {
        response += `\n📊 Tokens: ${duckResponse.usage.total_tokens}`;
      }
      if (duckResponse.latency > 0) {
        response += ` | ⏱️ ${duckResponse.latency}ms`;
      }
      if (duckResponse.cached) {
        response += ` | 💾 Cached`;
      }
    }
    
    response += `\n\n`;
  }

  // Add summary
  const successCount = responses.filter(r => !r.content.startsWith('Error:')).length;
  response += `═══════════════════════════════════════\n`;
  response += `✅ ${successCount}/${responses.length} ducks responded successfully`;

  logger.info(`Compared ${responses.length} ducks, ${successCount} successful`);

  return {
    content: [
      {
        type: 'text',
        text: response,
      },
    ],
  };
}