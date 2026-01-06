import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { HealthMonitor } from '../src/services/health.js';
import { ProviderManager } from '../src/providers/manager.js';
import { ProviderHealth } from '../src/config/types.js';

// Mock dependencies
jest.mock('../src/utils/logger');
jest.mock('../src/providers/manager.js');

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;
  let mockProviderManager: jest.Mocked<ProviderManager>;

  beforeEach(() => {
    // Create a mock ProviderManager
    mockProviderManager = {
      checkHealth: jest.fn(),
    } as unknown as jest.Mocked<ProviderManager>;

    healthMonitor = new HealthMonitor(mockProviderManager);
  });

  describe('performHealthChecks', () => {
    it('should call providerManager.checkHealth and return results', async () => {
      const healthResults: ProviderHealth[] = [
        {
          provider: 'openai',
          healthy: true,
          latency: 150,
          lastCheck: new Date(),
        },
        {
          provider: 'groq',
          healthy: true,
          latency: 80,
          lastCheck: new Date(),
        },
      ];

      mockProviderManager.checkHealth.mockResolvedValue(healthResults);

      const results = await healthMonitor.performHealthChecks();

      expect(mockProviderManager.checkHealth).toHaveBeenCalledTimes(1);
      expect(results).toEqual(healthResults);
      expect(results).toHaveLength(2);
    });

    it('should handle unhealthy providers with errors', async () => {
      const healthResults: ProviderHealth[] = [
        {
          provider: 'openai',
          healthy: true,
          latency: 150,
          lastCheck: new Date(),
        },
        {
          provider: 'groq',
          healthy: false,
          lastCheck: new Date(),
          error: 'Connection refused',
        },
      ];

      mockProviderManager.checkHealth.mockResolvedValue(healthResults);

      const results = await healthMonitor.performHealthChecks();

      expect(results).toHaveLength(2);
      expect(results[0].healthy).toBe(true);
      expect(results[1].healthy).toBe(false);
      expect(results[1].error).toBe('Connection refused');
    });

    it('should handle all unhealthy providers', async () => {
      const healthResults: ProviderHealth[] = [
        {
          provider: 'openai',
          healthy: false,
          lastCheck: new Date(),
          error: 'API key invalid',
        },
        {
          provider: 'groq',
          healthy: false,
          lastCheck: new Date(),
          error: 'Timeout',
        },
      ];

      mockProviderManager.checkHealth.mockResolvedValue(healthResults);

      const results = await healthMonitor.performHealthChecks();

      expect(results.every((r) => !r.healthy)).toBe(true);
    });

    it('should handle empty provider list', async () => {
      mockProviderManager.checkHealth.mockResolvedValue([]);

      const results = await healthMonitor.performHealthChecks();

      expect(results).toEqual([]);
    });

    it('should handle providers without latency info', async () => {
      const healthResults: ProviderHealth[] = [
        {
          provider: 'openai',
          healthy: false,
          lastCheck: new Date(),
          error: 'Failed before timing',
        },
      ];

      mockProviderManager.checkHealth.mockResolvedValue(healthResults);

      const results = await healthMonitor.performHealthChecks();

      expect(results[0].latency).toBeUndefined();
    });

    it('should propagate errors from checkHealth', async () => {
      mockProviderManager.checkHealth.mockRejectedValue(new Error('Network error'));

      await expect(healthMonitor.performHealthChecks()).rejects.toThrow('Network error');
    });
  });
});
