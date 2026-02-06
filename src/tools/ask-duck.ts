import { ProviderManager } from '../providers/manager.js';
import { formatDuckResponse } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

export async function askDuckTool(
  providerManager: ProviderManager,
  args: Record<string, unknown>
) {
  const { prompt, provider, model, temperature } = args as {
    prompt?: string;
    provider?: string;
    model?: string;
    temperature?: number;
  };

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  // Validate model if provided
  if (model && provider) {
    const isValid = providerManager.validateModel(provider, model);
    if (!isValid) {
      logger.warn(`Model ${model} may not be valid for provider ${provider}`);
    }
  }

  const response = await providerManager.askDuck(provider, prompt, {
    model,
    temperature,
  });

  // Format the response
  const formattedResponse = formatDuckResponse(
    response.nickname,
    response.content,
    response.model
  );

  // Add usage info if available
  let usageInfo = '';
  if (response.usage) {
    usageInfo = `\n\n📊 Tokens used: ${response.usage.total_tokens} (${response.usage.prompt_tokens} prompt, ${response.usage.completion_tokens} completion)`;
  }

  // Add latency info
  const metaInfo = `\n⏱️ Latency: ${response.latency}ms`;

  logger.info(`Duck ${response.nickname} responded to query`);

  return {
    content: [
      {
        type: 'text',
        text: formattedResponse + usageInfo + metaInfo,
      },
    ],
  };
}
