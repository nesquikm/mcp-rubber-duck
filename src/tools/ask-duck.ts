import { ProviderManager } from '../providers/manager.js';
import { ResponseCache } from '../services/cache.js';
import { formatDuckResponse } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

export async function askDuckTool(
  providerManager: ProviderManager,
  cache: ResponseCache,
  args: any
) {
  const { prompt, provider, temperature, max_tokens } = args;

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  // Generate cache key
  const cacheKey = cache.generateKey(
    provider || 'default',
    prompt,
    { temperature, max_tokens }
  );

  // Try to get cached response
  const { value: response, cached } = await cache.getOrSet(
    cacheKey,
    async () => {
      return await providerManager.askDuck(provider, prompt, {
        temperature,
        maxTokens: max_tokens,
      });
    }
  );

  // Format the response
  const formattedResponse = formatDuckResponse(
    response.nickname,
    response.content
  );

  // Add usage info if available
  let usageInfo = '';
  if (response.usage) {
    usageInfo = `\n\n📊 Tokens used: ${response.usage.total_tokens} (${response.usage.prompt_tokens} prompt, ${response.usage.completion_tokens} completion)`;
  }

  // Add cache and latency info
  const metaInfo = `\n⏱️ Latency: ${response.latency}ms | ${cached ? '💾 Cached' : '🔄 Fresh'}`;

  logger.info(`Duck ${response.nickname} responded to query ${cached ? '(cached)' : ''}`);

  return {
    content: [
      {
        type: 'text',
        text: formattedResponse + usageInfo + metaInfo,
      },
    ],
  };
}