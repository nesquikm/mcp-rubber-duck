import { ProviderManager } from '../providers/manager.js';
import { ImageInput, buildContent } from '../config/types.js';
import { formatDuckReply, formatDuckFooter } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

export async function askDuckTool(providerManager: ProviderManager, args: Record<string, unknown>) {
  const { prompt, provider, model, temperature, images } = args as {
    prompt?: string;
    provider?: string;
    model?: string;
    temperature?: number;
    images?: ImageInput[];
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

  const content = buildContent(prompt, images);
  const response = await providerManager.askDuck(provider, content, {
    model,
    temperature,
  });

  const text = `${formatDuckReply(response)}\n\n${formatDuckFooter(response)}`;

  logger.info(`Duck ${response.nickname} responded to query`);

  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}
