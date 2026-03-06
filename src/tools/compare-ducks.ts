import { ProviderManager } from '../providers/manager.js';
import { ImageInput, buildContent } from '../config/types.js';
import { duckArt } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';
import type { ProgressReporter } from '../services/progress.js';

export async function compareDucksTool(
  providerManager: ProviderManager,
  args: Record<string, unknown>,
  progress?: ProgressReporter
) {
  const { prompt, providers, model, images } = args as {
    prompt?: string;
    providers?: string[];
    model?: string;
    images?: ImageInput[];
  };

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  const content = buildContent(prompt, images);

  // Get responses from multiple ducks, reporting progress as each completes
  const responses = progress
    ? await providerManager.compareDucksWithProgress(
        content,
        providers,
        { model },
        (providerName, completed, total) => {
          void progress.report(
            completed,
            total,
            `${providerName} responded (${completed}/${total})`
          );
        }
      )
    : await providerManager.compareDucks(content, providers, { model });

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
      response += `\n📍 Model: ${duckResponse.model}`;

      if (duckResponse.usage) {
        response += ` | 📊 Tokens: ${duckResponse.usage.total_tokens}`;
      }
      if (duckResponse.latency > 0) {
        response += ` | ⏱️ ${duckResponse.latency}ms`;
      }
    }

    response += `\n\n`;
  }

  // Add summary
  const successCount = responses.filter((r) => !r.content.startsWith('Error:')).length;
  response += `═══════════════════════════════════════\n`;
  response += `✅ ${successCount}/${responses.length} ducks responded successfully`;

  logger.info(`Compared ${responses.length} ducks, ${successCount} successful`);

  // Build structured data for UI consumption
  const structuredData = responses.map((r) => ({
    provider: r.provider,
    nickname: r.nickname,
    model: r.model,
    content: r.content,
    latency: r.latency,
    tokens: r.usage
      ? {
          prompt: r.usage.prompt_tokens,
          completion: r.usage.completion_tokens,
          total: r.usage.total_tokens,
        }
      : null,
    error: r.content.startsWith('Error:') ? r.content : undefined,
  }));

  return {
    content: [
      {
        type: 'text',
        text: response,
      },
      {
        type: 'text',
        text: JSON.stringify(structuredData),
      },
    ],
  };
}
