import { ProviderManager } from '../providers/manager.js';
import { ProviderHealth } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class HealthMonitor {
  private providerManager: ProviderManager;

  constructor(providerManager: ProviderManager) {
    this.providerManager = providerManager;
  }

  async performHealthChecks(): Promise<ProviderHealth[]> {
    logger.info('🦆 Performing health checks on all ducks...');

    const results = await this.providerManager.checkHealth();

    for (const result of results) {
      const statusEmoji = result.healthy ? '✅' : '❌';
      const latencyInfo = result.latency ? ` (${result.latency}ms)` : '';

      logger.info(
        `${statusEmoji} ${result.provider}: ${result.healthy ? 'Healthy' : 'Unhealthy'}${latencyInfo}`
      );

      if (result.error) {
        logger.warn(`  Error: ${result.error}`);
      }
    }

    return results;
  }
}