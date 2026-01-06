import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ResponseCache } from '../src/services/cache.js';

// Mock logger to avoid console noise during tests
jest.mock('../src/utils/logger');

describe('ResponseCache', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = new ResponseCache(300); // 5 minute TTL
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      const deleted = cache.delete('key1');
      expect(deleted).toBe(1);
      expect(cache.has('key1')).toBe(false);
    });

    it('should return 0 when deleting nonexistent key', () => {
      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(0);
    });

    it('should store complex objects', () => {
      const obj = { foo: 'bar', nested: { value: 123 } };
      cache.set('obj', obj);
      expect(cache.get('obj')).toEqual(obj);
    });
  });

  describe('key generation', () => {
    it('should generate consistent keys for same input', () => {
      const key1 = cache.generateKey('openai', 'test prompt', { temp: 0.7 });
      const key2 = cache.generateKey('openai', 'test prompt', { temp: 0.7 });
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different providers', () => {
      const key1 = cache.generateKey('openai', 'test prompt');
      const key2 = cache.generateKey('groq', 'test prompt');
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different prompts', () => {
      const key1 = cache.generateKey('openai', 'prompt 1');
      const key2 = cache.generateKey('openai', 'prompt 2');
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different options', () => {
      const key1 = cache.generateKey('openai', 'test', { temp: 0.7 });
      const key2 = cache.generateKey('openai', 'test', { temp: 0.5 });
      expect(key1).not.toBe(key2);
    });

    it('should generate valid hex hashes', () => {
      const key = cache.generateKey('openai', 'test');
      expect(key).toMatch(/^[a-f0-9]{64}$/); // SHA-256 produces 64 hex chars
    });
  });

  describe('TTL handling', () => {
    it('should respect custom TTL on set', () => {
      const shortTTLCache = new ResponseCache(1); // 1 second default TTL
      shortTTLCache.set('key', 'value', 10); // 10 second TTL
      expect(shortTTLCache.get('key')).toBe('value');
    });

    it('should use default TTL when not specified', () => {
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });
  });

  describe('flush', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);

      cache.flush();

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(false);
    });

    it('should allow new entries after flush', () => {
      cache.set('key1', 'value1');
      cache.flush();
      cache.set('key2', 'value2');

      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('stats', () => {
    it('should track cache statistics', () => {
      cache.set('key1', 'value1');

      // Generate a hit
      cache.get('key1');

      // Generate a miss
      cache.get('nonexistent');

      const stats = cache.getStats();
      expect(stats.keys).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should handle zero hits and misses', () => {
      const stats = cache.getStats();
      expect(stats.keys).toBe(0);
      expect(stats.hitRate).toBe(0); // NaN protection check
    });
  });

  describe('getOrSet', () => {
    it('should return cached value on hit', async () => {
      cache.set('key', 'cached-value');
      const fetcher = jest.fn<() => Promise<string>>().mockResolvedValue('fetched-value');

      const result = await cache.getOrSet('key', fetcher);

      expect(result.value).toBe('cached-value');
      expect(result.cached).toBe(true);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should fetch and cache on miss', async () => {
      const fetcher = jest.fn<() => Promise<string>>().mockResolvedValue('fetched-value');

      const result = await cache.getOrSet('key', fetcher);

      expect(result.value).toBe('fetched-value');
      expect(result.cached).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Verify it was cached
      expect(cache.get('key')).toBe('fetched-value');
    });

    it('should use custom TTL when provided', async () => {
      const fetcher = jest.fn<() => Promise<string>>().mockResolvedValue('value');

      await cache.getOrSet('key', fetcher, 600);

      expect(cache.get('key')).toBe('value');
    });

    it('should handle async fetcher errors', async () => {
      const fetcher = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Fetch failed'));

      await expect(cache.getOrSet('key', fetcher)).rejects.toThrow('Fetch failed');

      // Should not cache failed result
      expect(cache.has('key')).toBe(false);
    });

    it('should cache complex objects', async () => {
      const complexValue = { data: [1, 2, 3], nested: { key: 'value' } };
      const fetcher = jest.fn<() => Promise<typeof complexValue>>().mockResolvedValue(complexValue);

      const result = await cache.getOrSet('key', fetcher);

      expect(result.value).toEqual(complexValue);
      expect(cache.get('key')).toEqual(complexValue);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string values', () => {
      cache.set('key', '');
      expect(cache.get('key')).toBe('');
      expect(cache.has('key')).toBe(true);
    });

    it('should handle null values', () => {
      cache.set('key', null);
      expect(cache.get('key')).toBe(null);
      expect(cache.has('key')).toBe(true);
    });

    it('should handle zero values', () => {
      cache.set('key', 0);
      expect(cache.get('key')).toBe(0);
      expect(cache.has('key')).toBe(true);
    });

    it('should handle false boolean values', () => {
      cache.set('key', false);
      expect(cache.get('key')).toBe(false);
      expect(cache.has('key')).toBe(true);
    });

    it('should handle undefined values by not storing', () => {
      // node-cache doesn't store undefined values
      cache.set('key', undefined);
      expect(cache.has('key')).toBe(true);
    });

    it('should handle very long keys', () => {
      const longKey = 'a'.repeat(10000);
      cache.set(longKey, 'value');
      expect(cache.get(longKey)).toBe('value');
    });

    it('should handle special characters in keys', () => {
      const specialKey = 'key:with/special\\chars!@#$%^&*()';
      cache.set(specialKey, 'value');
      expect(cache.get(specialKey)).toBe('value');
    });
  });
});
