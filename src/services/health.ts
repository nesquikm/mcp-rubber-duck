import { ProviderManager } from '../providers/manager.js';
import { ProviderHealth } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class HealthMonitor {
  private providerManager: ProviderManager;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCache: Map<string, ProviderHealth> = new Map();

  constructor(providerManager: ProviderManager) {
    this.providerManager = providerManager;
  }

  async performHealthChecks(): Promise<Map<string, ProviderHealth>> {
    logger.info('🦆 Performing health checks on all ducks...');
    
    const results = await this.providerManager.checkHealth();
    
    for (const result of results) {
      this.healthCache.set(result.provider, result);
      
      const statusEmoji = result.healthy ? '✅' : '❌';
      const latencyInfo = result.latency ? ` (${result.latency}ms)` : '';
      
      logger.info(
        `${statusEmoji} ${result.provider}: ${result.healthy ? 'Healthy' : 'Unhealthy'}${latencyInfo}`
      );
      
      if (result.error) {
        logger.warn(`  Error: ${result.error}`);
      }
    }

    return this.healthCache;
  }

  startMonitoring(intervalMs: number = 60000): void {
    if (this.healthCheckInterval) {
      this.stopMonitoring();
    }

    // Initial check
    this.performHealthChecks().catch(error => {
      logger.error('Initial health check failed:', error);
    });

    // Set up periodic checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch(error => {
        logger.error('Periodic health check failed:', error);
      });
    }, intervalMs);

    logger.info(`Started health monitoring with ${intervalMs}ms interval`);
  }

  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Stopped health monitoring');
    }
  }

  getHealthStatus(): Map<string, ProviderHealth> {
    return new Map(this.healthCache);
  }

  getHealthyProviders(): string[] {
    return Array.from(this.healthCache.entries())
      .filter(([_, health]) => health.healthy)
      .map(([provider, _]) => provider);
  }

  isProviderHealthy(providerName: string): boolean {
    const health = this.healthCache.get(providerName);
    return health?.healthy || false;
  }

  getProviderLatency(providerName: string): number | undefined {
    const health = this.healthCache.get(providerName);
    return health?.latency;
  }

  async waitForHealthyProvider(
    maxWaitMs: number = 30000,
    checkIntervalMs: number = 1000
  ): Promise<string | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const healthyProviders = this.getHealthyProviders();
      
      if (healthyProviders.length > 0) {
        return healthyProviders[0];
      }

      // Perform a fresh health check
      await this.performHealthChecks();

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }

    return null;
  }
}