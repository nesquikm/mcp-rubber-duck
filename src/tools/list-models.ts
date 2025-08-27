import { ProviderManager } from '../providers/manager.js';
import { ModelInfo } from '../providers/types.js';
import { duckArt } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

export async function listModelsTool(
  providerManager: ProviderManager,
  args: any
) {
  const { provider, fetch_latest = false } = args;

  try {
    let response = `${duckArt.panel}\n📋 **Available Models**\n\n`;
    
    if (provider) {
      // List models for a specific provider
      const providerInfo = providerManager.getAllProviders().find(p => p.name === provider);
      if (!providerInfo) {
        throw new Error(`Provider "${provider}" not found`);
      }

      const models = await providerManager.getAvailableModels(provider);
      response += formatProviderModels(providerInfo.info.nickname, provider, models, providerInfo.info.model);
    } else {
      // List models for all providers
      const allProviders = providerManager.getAllProviders();
      
      for (const providerInfo of allProviders) {
        try {
          const models = await providerManager.getAvailableModels(providerInfo.name);
          response += formatProviderModels(
            providerInfo.info.nickname, 
            providerInfo.name, 
            models, 
            providerInfo.info.model
          );
          response += '\n';
        } catch (error) {
          logger.warn(`Failed to get models for ${providerInfo.name}:`, error);
          response += `\n🦆 **${providerInfo.info.nickname}** (${providerInfo.name})\n`;
          response += `   ⚠️ Failed to fetch models\n\n`;
        }
      }
    }

    response += `\n─────────────────────────────────────\n`;
    response += fetch_latest ? '🔄 Fetched from API' : '📋 Using cached/configured models';

    logger.info(`Listed models for ${provider || 'all providers'}`);

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error: any) {
    logger.error('Error listing models:', error);
    throw error;
  }
}

function formatProviderModels(
  nickname: string,
  providerName: string,
  models: ModelInfo[],
  defaultModel: string
): string {
  let output = `\n🦆 **${nickname}** (${providerName})\n`;
  
  if (models.length === 0) {
    output += `   📭 No models available\n`;
    return output;
  }

  for (const model of models) {
    const isDefault = model.id === defaultModel;
    const defaultMarker = isDefault ? ' **(default)**' : '';
    
    output += `   • ${model.id}${defaultMarker}`;
    
    if (model.description) {
      output += ` - ${model.description}`;
    } else if (model.owned_by) {
      output += ` - by ${model.owned_by}`;
    }
    
    if (model.context_window) {
      output += ` [${model.context_window} tokens]`;
    }
    
    output += '\n';
  }

  return output;
}