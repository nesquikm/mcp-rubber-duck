import { ProviderManager } from '../providers/manager.js';
import { HealthMonitor } from '../services/health.js';
import { ProviderHealth } from '../config/types.js';
import { duckArt } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

export async function listDucksTool(
  providerManager: ProviderManager,
  healthMonitor: HealthMonitor,
  args: Record<string, unknown>
) {
  const { check_health = false } = args as {
    check_health?: boolean;
  };

  // Get all providers with their info
  const providers = providerManager.getAllProviders();

  // Perform health check if requested
  let healthStatus = new Map<string, ProviderHealth>();
  if (check_health) {
    const healthResults = await healthMonitor.performHealthChecks();
    healthStatus = new Map(healthResults.map(result => [result.provider, result]));
  }

  // Build response
  let response = `${duckArt.panel}\n\n`;
  response += `Found ${providers.length} duck(s) in the pond:\n\n`;

  for (const provider of providers) {
    const health = healthStatus.get(provider.name);
    const statusEmoji = health?.healthy ? '✅' : health === undefined ? '❓' : '❌';
    
    response += `${statusEmoji} **${provider.info.nickname}** (${provider.name})\n`;
    response += `   📍 Model: ${provider.info.model}\n`;
    response += `   🔗 Endpoint: ${provider.info.baseURL}\n`;
    response += `   🔑 API Key: ${provider.info.hasApiKey ? 'Configured' : 'Not required'}\n`;
    
    if (health) {
      response += `   💓 Health: ${health.healthy ? 'Healthy' : 'Unhealthy'}`;
      if (health.latency) {
        response += ` (${health.latency}ms)`;
      }
      if (health.error) {
        response += `\n   ⚠️ Error: ${health.error}`;
      }
      response += `\n   🕒 Last check: ${health.lastCheck.toLocaleTimeString()}\n`;
    }
    
    response += '\n';
  }

  // Add summary
  const healthyCount = Array.from(healthStatus.values()).filter(h => h.healthy).length;
  response += `\n📊 Summary: ${healthyCount}/${providers.length} ducks are healthy and ready!`;

  logger.info(`Listed ${providers.length} ducks, ${healthyCount} healthy`);

  return {
    content: [
      {
        type: 'text',
        text: response,
      },
    ],
  };
}