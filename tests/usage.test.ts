import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { UsageService } from '../src/services/usage.js';
import { PricingService } from '../src/services/pricing.js';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock logger to avoid console noise during tests
jest.mock('../src/utils/logger');

describe('UsageService', () => {
  let tempDir: string;
  let pricingService: PricingService;
  let usageService: UsageService;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'usage-test-'));

    // Create pricing service with test pricing
    pricingService = new PricingService({
      testprovider: {
        'test-model': { inputPricePerMillion: 5, outputPricePerMillion: 15 },
      },
    });

    // Create usage service with temp directory and no debounce for testing
    usageService = new UsageService(pricingService, {
      dataDir: tempDir,
      debounceMs: 0, // Immediate writes for testing
    });
  });

  afterEach(() => {
    // Clean up
    usageService.shutdown();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe('recordUsage', () => {
    it('should create nested structure on first record', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['openai']).toBeDefined();
      expect(stats.usage['openai']['gpt-4o']).toBeDefined();
      expect(stats.usage['openai']['gpt-4o'].requests).toBe(1);
    });

    it('should increment stats on subsequent records', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);
      usageService.recordUsage('openai', 'gpt-4o', 200, 100, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['openai']['gpt-4o'].requests).toBe(2);
      expect(stats.usage['openai']['gpt-4o'].promptTokens).toBe(300);
      expect(stats.usage['openai']['gpt-4o'].completionTokens).toBe(150);
    });

    it('should track cache hits', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, true, false);
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['openai']['gpt-4o'].cacheHits).toBe(1);
    });

    it('should track errors', () => {
      usageService.recordUsage('openai', 'gpt-4o', 0, 0, false, true);
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['openai']['gpt-4o'].errors).toBe(1);
      expect(stats.usage['openai']['gpt-4o'].requests).toBe(2);
    });

    it('should track multiple providers separately', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);
      usageService.recordUsage('anthropic', 'claude-3', 200, 100, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['openai']['gpt-4o'].requests).toBe(1);
      expect(stats.usage['anthropic']['claude-3'].requests).toBe(1);
    });

    it('should track multiple models separately', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);
      usageService.recordUsage('openai', 'gpt-4o-mini', 200, 100, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['openai']['gpt-4o'].requests).toBe(1);
      expect(stats.usage['openai']['gpt-4o-mini'].requests).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return zero totals for empty usage', () => {
      const stats = usageService.getStats('today');

      expect(stats.totals.requests).toBe(0);
      expect(stats.totals.promptTokens).toBe(0);
      expect(stats.totals.completionTokens).toBe(0);
      expect(stats.totals.cacheHits).toBe(0);
      expect(stats.totals.errors).toBe(0);
    });

    it('should aggregate totals correctly', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);
      usageService.recordUsage('anthropic', 'claude-3', 200, 100, true, false);
      usageService.recordUsage('groq', 'llama', 50, 25, false, true);

      const stats = usageService.getStats('today');

      expect(stats.totals.requests).toBe(3);
      expect(stats.totals.promptTokens).toBe(350);
      expect(stats.totals.completionTokens).toBe(175);
      expect(stats.totals.cacheHits).toBe(1);
      expect(stats.totals.errors).toBe(1);
    });

    it('should return correct period label', () => {
      expect(usageService.getStats('today').period).toBe('today');
      expect(usageService.getStats('7d').period).toBe('7d');
      expect(usageService.getStats('30d').period).toBe('30d');
      expect(usageService.getStats('all').period).toBe('all');
    });

    it('should return correct date range for today', () => {
      const stats = usageService.getStats('today');

      // Both startDate and endDate should be the same for 'today'
      expect(stats.startDate).toBe(stats.endDate);
      // Should be a valid date format
      expect(stats.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should aggregate data across multiple days for 7d period', () => {
      // Record some usage for today
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);
      usageService.shutdown();

      // Read and modify the data file to add historical data
      const usageFile = join(tempDir, 'usage.json');
      const data = JSON.parse(readFileSync(usageFile, 'utf-8'));

      // Add data for 3 days ago (use local date to match getTodayKey format)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const threeDaysAgoKey = `${threeDaysAgo.getFullYear()}-${String(threeDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(threeDaysAgo.getDate()).padStart(2, '0')}`;

      data.daily[threeDaysAgoKey] = {
        anthropic: {
          'claude-3': { requests: 5, promptTokens: 500, completionTokens: 250, cacheHits: 1, errors: 0 },
        },
      };

      writeFileSync(usageFile, JSON.stringify(data, null, 2));

      // Create new service and check 7d aggregation
      const newService = new UsageService(pricingService, {
        dataDir: tempDir,
        debounceMs: 0,
      });

      const stats = newService.getStats('7d');

      // Should have both today's and 3-days-ago data
      expect(stats.totals.requests).toBe(6); // 1 + 5
      expect(stats.totals.promptTokens).toBe(600); // 100 + 500
      expect(stats.usage['openai']).toBeDefined();
      expect(stats.usage['anthropic']).toBeDefined();

      newService.shutdown();
    });

    it('should exclude data outside the requested period', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);
      usageService.shutdown();

      // Add data for 10 days ago (outside 7d window, use local date)
      const usageFile = join(tempDir, 'usage.json');
      const data = JSON.parse(readFileSync(usageFile, 'utf-8'));

      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      const tenDaysAgoKey = `${tenDaysAgo.getFullYear()}-${String(tenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(tenDaysAgo.getDate()).padStart(2, '0')}`;

      data.daily[tenDaysAgoKey] = {
        anthropic: {
          'claude-3': { requests: 99, promptTokens: 9999, completionTokens: 9999, cacheHits: 0, errors: 0 },
        },
      };

      writeFileSync(usageFile, JSON.stringify(data, null, 2));

      const newService = new UsageService(pricingService, {
        dataDir: tempDir,
        debounceMs: 0,
      });

      // 7d should NOT include 10-day-old data
      const stats7d = newService.getStats('7d');
      expect(stats7d.totals.requests).toBe(1); // Only today's data
      expect(stats7d.usage['anthropic']).toBeUndefined();

      // But 30d SHOULD include it
      const stats30d = newService.getStats('30d');
      expect(stats30d.totals.requests).toBe(100); // 1 + 99
      expect(stats30d.usage['anthropic']).toBeDefined();

      newService.shutdown();
    });

    it('should exclude future dates from stats', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);
      usageService.shutdown();

      // Add data for a future date (should be excluded, use local date)
      const usageFile = join(tempDir, 'usage.json');
      const data = JSON.parse(readFileSync(usageFile, 'utf-8'));

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

      data.daily[tomorrowKey] = {
        future: {
          'model': { requests: 999, promptTokens: 9999, completionTokens: 9999, cacheHits: 0, errors: 0 },
        },
      };

      writeFileSync(usageFile, JSON.stringify(data, null, 2));

      const newService = new UsageService(pricingService, {
        dataDir: tempDir,
        debounceMs: 0,
      });

      // Future data should be excluded from all periods
      const statsAll = newService.getStats('all');
      expect(statsAll.totals.requests).toBe(1); // Only today's data
      expect(statsAll.usage['future']).toBeUndefined();

      newService.shutdown();
    });

    it('should include cost data when pricing available', () => {
      usageService.recordUsage('testprovider', 'test-model', 1000, 500, false, false);

      const stats = usageService.getStats('today');

      // 1000 tokens at $5/M = $0.005 input
      // 500 tokens at $15/M = $0.0075 output
      // Total = $0.0125
      expect(stats.totals.estimatedCostUSD).toBeCloseTo(0.0125, 6);
      expect(stats.costByProvider?.['testprovider']).toBeCloseTo(0.0125, 6);
    });

    it('should omit cost data when pricing unavailable', () => {
      usageService.recordUsage('unknown-provider', 'unknown-model', 1000, 500, false, false);

      const stats = usageService.getStats('today');

      expect(stats.totals.estimatedCostUSD).toBeUndefined();
      expect(stats.costByProvider).toBeUndefined();
    });

    it('should handle mixed pricing availability', () => {
      // Provider with pricing
      usageService.recordUsage('testprovider', 'test-model', 1000, 500, false, false);
      // Provider without pricing
      usageService.recordUsage('unknown-provider', 'unknown-model', 2000, 1000, false, false);

      const stats = usageService.getStats('today');

      // Should still have cost data (only from priced provider)
      expect(stats.totals.estimatedCostUSD).toBeCloseTo(0.0125, 6);
      // Both providers should be in usage
      expect(stats.usage['testprovider']).toBeDefined();
      expect(stats.usage['unknown-provider']).toBeDefined();
    });

    it('should include cost data for free models (zero cost)', () => {
      // Create service with free pricing
      const freePricingService = new PricingService({
        freeprovider: {
          'free-model': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
        },
      });
      const freeUsageService = new UsageService(freePricingService, {
        dataDir: tempDir,
        debounceMs: 0,
      });

      freeUsageService.recordUsage('freeprovider', 'free-model', 1000, 500, false, false);

      const stats = freeUsageService.getStats('today');

      // Cost should be $0, but still present
      expect(stats.totals.estimatedCostUSD).toBe(0);
      expect(stats.costByProvider?.['freeprovider']).toBe(0);

      freeUsageService.shutdown();
    });
  });

  describe('persistence', () => {
    it('should create usage file after recording', (done) => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      // Wait for debounced write
      setTimeout(() => {
        const usageFile = join(tempDir, 'usage.json');
        expect(existsSync(usageFile)).toBe(true);
        done();
      }, 50);
    });

    it('should persist data that survives restart', (done) => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      // Wait for write, then create new service
      setTimeout(() => {
        usageService.shutdown();

        const newService = new UsageService(pricingService, {
          dataDir: tempDir,
          debounceMs: 0,
        });

        const stats = newService.getStats('today');
        expect(stats.usage['openai']['gpt-4o'].requests).toBe(1);
        expect(stats.usage['openai']['gpt-4o'].promptTokens).toBe(100);

        newService.shutdown();
        done();
      }, 50);
    });

    it('should flush pending writes on shutdown', () => {
      // Use a longer debounce to ensure we test shutdown flushing
      const serviceWithDebounce = new UsageService(pricingService, {
        dataDir: tempDir,
        debounceMs: 10000, // 10 second debounce
      });

      serviceWithDebounce.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      // File shouldn't exist yet (debounce pending)
      const usageFile = join(tempDir, 'usage.json');

      // Shutdown should flush immediately
      serviceWithDebounce.shutdown();

      // Now file should exist
      expect(existsSync(usageFile)).toBe(true);

      const data = JSON.parse(readFileSync(usageFile, 'utf-8'));
      expect(data.daily).toBeDefined();
    });

    it('should create data directory if it does not exist', () => {
      const newDataDir = join(tempDir, 'nested', 'data', 'dir');

      // Directory should not exist
      expect(existsSync(newDataDir)).toBe(false);

      // Create service - should create directory
      const newService = new UsageService(pricingService, {
        dataDir: newDataDir,
        debounceMs: 0,
      });

      // Directory should now exist
      expect(existsSync(newDataDir)).toBe(true);

      newService.shutdown();
    });
  });

  describe('clearData', () => {
    it('should clear all usage data', (done) => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      let stats = usageService.getStats('today');
      expect(stats.totals.requests).toBe(1);

      usageService.clearData();

      stats = usageService.getStats('today');
      expect(stats.totals.requests).toBe(0);

      done();
    });
  });

  describe('getRawData', () => {
    it('should return raw usage data', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      const rawData = usageService.getRawData();

      expect(rawData.version).toBe(1);
      expect(rawData.daily).toBeDefined();
    });

    it('should return a copy', () => {
      const data1 = usageService.getRawData();
      const data2 = usageService.getRawData();

      expect(data1).not.toBe(data2);
    });

    it('should return a deep copy (mutations do not affect original)', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      const rawData = usageService.getRawData();
      const today = Object.keys(rawData.daily)[0];

      // Mutate the copy
      rawData.daily[today]['openai']['gpt-4o'].requests = 999;
      rawData.daily[today]['openai']['gpt-4o'].promptTokens = 999;

      // Original should be unchanged
      const stats = usageService.getStats('today');
      expect(stats.usage['openai']['gpt-4o'].requests).toBe(1);
      expect(stats.usage['openai']['gpt-4o'].promptTokens).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('should handle zero token counts', () => {
      usageService.recordUsage('openai', 'gpt-4o', 0, 0, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['openai']['gpt-4o'].requests).toBe(1);
      expect(stats.usage['openai']['gpt-4o'].promptTokens).toBe(0);
    });

    it('should handle very large token counts', () => {
      usageService.recordUsage('openai', 'gpt-4o', 10_000_000, 5_000_000, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['openai']['gpt-4o'].promptTokens).toBe(10_000_000);
      expect(stats.usage['openai']['gpt-4o'].completionTokens).toBe(5_000_000);
    });

    it('should handle special characters in provider/model names', () => {
      usageService.recordUsage('my-provider', 'model/v2:latest', 100, 50, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['my-provider']['model/v2:latest'].requests).toBe(1);
    });

    it('should handle empty strings for provider/model names', () => {
      usageService.recordUsage('', '', 100, 50, false, false);

      const stats = usageService.getStats('today');
      expect(stats.usage['']['']).toBeDefined();
      expect(stats.usage[''][''].requests).toBe(1);
    });

    it('should handle corrupted usage file gracefully', (done) => {
      // Write corrupted data to file
      const usageFile = join(tempDir, 'usage.json');
      writeFileSync(usageFile, 'not valid json');

      // Create new service - should start fresh
      const newService = new UsageService(pricingService, {
        dataDir: tempDir,
        debounceMs: 0,
      });

      const stats = newService.getStats('today');
      expect(stats.totals.requests).toBe(0);

      newService.shutdown();
      done();
    });

    it('should handle invalid structure in usage file gracefully', (done) => {
      // Write data with missing daily field
      const usageFile = join(tempDir, 'usage.json');
      writeFileSync(usageFile, JSON.stringify({ version: 1 }));

      // Create new service - should start fresh
      const newService = new UsageService(pricingService, {
        dataDir: tempDir,
        debounceMs: 0,
      });

      const stats = newService.getStats('today');
      expect(stats.totals.requests).toBe(0);

      newService.shutdown();
      done();
    });

    it('should handle malformed date keys in data file', (done) => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      setTimeout(() => {
        usageService.shutdown();

        // Add malformed date key to the data file
        const usageFile = join(tempDir, 'usage.json');
        const data = JSON.parse(readFileSync(usageFile, 'utf-8'));

        // Add entry with invalid date key
        data.daily['not-a-date'] = {
          badprovider: {
            'bad-model': { requests: 999, promptTokens: 9999, completionTokens: 9999, cacheHits: 0, errors: 0 },
          },
        };

        writeFileSync(usageFile, JSON.stringify(data, null, 2));

        const newService = new UsageService(pricingService, {
          dataDir: tempDir,
          debounceMs: 0,
        });

        // Malformed date should be skipped, only valid data included
        const stats = newService.getStats('all');
        expect(stats.totals.requests).toBe(1); // Only today's valid data
        expect(stats.usage['badprovider']).toBeUndefined();

        newService.shutdown();
        done();
      }, 50);
    });

    it('should include data exactly at period boundary (6 days ago for 7d)', (done) => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      setTimeout(() => {
        usageService.shutdown();

        const usageFile = join(tempDir, 'usage.json');
        const data = JSON.parse(readFileSync(usageFile, 'utf-8'));

        // Add data for exactly 6 days ago (should be included in 7d)
        const sixDaysAgo = new Date();
        sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
        const sixDaysAgoKey = `${sixDaysAgo.getFullYear()}-${String(sixDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sixDaysAgo.getDate()).padStart(2, '0')}`;

        data.daily[sixDaysAgoKey] = {
          boundary: {
            'model': { requests: 10, promptTokens: 1000, completionTokens: 500, cacheHits: 0, errors: 0 },
          },
        };

        // Add data for exactly 7 days ago (should NOT be included in 7d)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoKey = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;

        data.daily[sevenDaysAgoKey] = {
          outside: {
            'model': { requests: 99, promptTokens: 9999, completionTokens: 9999, cacheHits: 0, errors: 0 },
          },
        };

        writeFileSync(usageFile, JSON.stringify(data, null, 2));

        const newService = new UsageService(pricingService, {
          dataDir: tempDir,
          debounceMs: 0,
        });

        const stats = newService.getStats('7d');

        // 6 days ago should be included
        expect(stats.usage['boundary']).toBeDefined();
        // 7 days ago should NOT be included (7d means last 7 days including today)
        expect(stats.usage['outside']).toBeUndefined();
        // Total: today (1) + 6 days ago (10) = 11
        expect(stats.totals.requests).toBe(11);

        newService.shutdown();
        done();
      }, 50);
    });

    it('should accumulate costs correctly across multiple days', (done) => {
      // Use the test pricing service which has testprovider configured
      usageService.recordUsage('testprovider', 'test-model', 1000, 500, false, false);

      setTimeout(() => {
        usageService.shutdown();

        const usageFile = join(tempDir, 'usage.json');
        const data = JSON.parse(readFileSync(usageFile, 'utf-8'));

        // Add same provider/model for yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        data.daily[yesterdayKey] = {
          testprovider: {
            'test-model': { requests: 2, promptTokens: 2000, completionTokens: 1000, cacheHits: 0, errors: 0 },
          },
        };

        writeFileSync(usageFile, JSON.stringify(data, null, 2));

        const newService = new UsageService(pricingService, {
          dataDir: tempDir,
          debounceMs: 0,
        });

        const stats = newService.getStats('7d');

        // Total tokens: today (1000+500) + yesterday (2000+1000) = 4500
        expect(stats.totals.promptTokens).toBe(3000);
        expect(stats.totals.completionTokens).toBe(1500);

        // Cost calculation:
        // Today: 1000 * $5/M + 500 * $15/M = $0.005 + $0.0075 = $0.0125
        // Yesterday: 2000 * $5/M + 1000 * $15/M = $0.01 + $0.015 = $0.025
        // Total: $0.0375
        expect(stats.totals.estimatedCostUSD).toBeCloseTo(0.0375, 6);
        expect(stats.costByProvider?.['testprovider']).toBeCloseTo(0.0375, 6);

        newService.shutdown();
        done();
      }, 50);
    });

    it('should handle rapid successive recordUsage calls', () => {
      // Record many usage entries in quick succession
      for (let i = 0; i < 100; i++) {
        usageService.recordUsage('openai', 'gpt-4o', 10, 5, i % 10 === 0, i % 20 === 0);
      }

      const stats = usageService.getStats('today');

      expect(stats.totals.requests).toBe(100);
      expect(stats.totals.promptTokens).toBe(1000); // 100 * 10
      expect(stats.totals.completionTokens).toBe(500); // 100 * 5
      expect(stats.totals.cacheHits).toBe(10); // every 10th
      expect(stats.totals.errors).toBe(5); // every 20th
    });
  });
});
