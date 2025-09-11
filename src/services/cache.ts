import NodeCache from 'node-cache';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';

export class ResponseCache {
  private cache: NodeCache;

  constructor(ttlSeconds: number = 300) {
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds * 0.2,
      useClones: false,
    });

    this.cache.on('expired', (key) => {
      logger.debug(`Cache expired for key: ${key}`);
    });
  }

  generateKey(provider: string, prompt: string, options?: Record<string, unknown>): string {
    const data = JSON.stringify({ provider, prompt, options });
    return createHash('sha256').update(data).digest('hex');
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    if (ttl !== undefined) {
      return this.cache.set(key, value, ttl);
    } else {
      return this.cache.set(key, value);
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): number {
    return this.cache.del(key);
  }

  flush(): void {
    this.cache.flushAll();
    logger.debug('Cache flushed');
  }

  getStats() {
    const stats = this.cache.getStats();
    return {
      keys: this.cache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits / (stats.hits + stats.misses) || 0,
    };
  }

  // Helper method for caching provider responses
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<{ value: T; cached: boolean }> {
    const cached = this.get<T>(key);
    
    if (cached !== undefined) {
      logger.debug(`Cache hit for key: ${key}`);
      return { value: cached, cached: true };
    }

    logger.debug(`Cache miss for key: ${key}`);
    const value = await fetcher();
    this.set(key, value, ttl);
    
    return { value, cached: false };
  }
}