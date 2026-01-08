import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getUsageStatsTool } from '../../src/tools/get-usage-stats.js';
import { UsageService } from '../../src/services/usage.js';
import { PricingService } from '../../src/services/pricing.js';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock logger to avoid console noise during tests
jest.mock('../../src/utils/logger');

describe('getUsageStatsTool', () => {
  let tempDir: string;
  let pricingService: PricingService;
  let usageService: UsageService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'usage-tool-test-'));

    pricingService = new PricingService({
      testprovider: {
        'test-model': { inputPricePerMillion: 5, outputPricePerMillion: 15 },
      },
    });

    usageService = new UsageService(pricingService, {
      dataDir: tempDir,
      debounceMs: 0,
    });
  });

  afterEach(() => {
    usageService.shutdown();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe('input validation', () => {
    it('should throw error for invalid period', () => {
      expect(() => {
        getUsageStatsTool(usageService, { period: 'invalid' });
      }).toThrow('Invalid period "invalid"');
    });

    it('should accept valid periods', () => {
      expect(() => getUsageStatsTool(usageService, { period: 'today' })).not.toThrow();
      expect(() => getUsageStatsTool(usageService, { period: '7d' })).not.toThrow();
      expect(() => getUsageStatsTool(usageService, { period: '30d' })).not.toThrow();
      expect(() => getUsageStatsTool(usageService, { period: 'all' })).not.toThrow();
    });

    it('should default to today when period not specified', () => {
      const result = getUsageStatsTool(usageService, {});

      expect(result.content[0].text).toContain('Today');
    });
  });

  describe('output format', () => {
    it('should return MCP-compliant response', () => {
      const result = getUsageStatsTool(usageService, { period: 'today' });

      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should include period label in output', () => {
      const result = getUsageStatsTool(usageService, { period: '7d' });
      expect(result.content[0].text).toContain('Last 7 Days');
    });

    it('should include date range', () => {
      const result = getUsageStatsTool(usageService, { period: 'today' });
      // Should contain dates in YYYY-MM-DD format
      expect(result.content[0].text).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should include totals section', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      expect(text).toContain('TOTALS');
      expect(text).toContain('Requests:');
      expect(text).toContain('Prompt Tokens:');
      expect(text).toContain('Completion Tokens:');
    });

    it('should include per-provider breakdown', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);
      usageService.recordUsage('anthropic', 'claude-3', 200, 100, false, false);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      expect(text).toContain('BY PROVIDER');
      expect(text).toContain('openai');
      expect(text).toContain('anthropic');
      expect(text).toContain('gpt-4o');
      expect(text).toContain('claude-3');
    });

    it('should show cost when pricing available', () => {
      usageService.recordUsage('testprovider', 'test-model', 1000, 500, false, false);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      expect(text).toContain('Estimated Cost:');
      expect(text).toContain('$');
      expect(text).toContain('USD');
    });

    it('should show hint when cost unavailable', () => {
      usageService.recordUsage('unknown-provider', 'unknown-model', 1000, 500, false, false);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      expect(text).toContain('Cost estimates not available');
    });

    it('should handle empty usage gracefully', () => {
      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      expect(text).toContain('No usage data');
    });

    it('should show cache hits when present', () => {
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, true, false);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      expect(text).toContain('Cache Hits:');
    });

    it('should show errors when present', () => {
      usageService.recordUsage('openai', 'gpt-4o', 0, 0, false, true);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      expect(text).toContain('Errors:');
    });
  });

  describe('period filtering', () => {
    it('should filter data by period', () => {
      // Record some usage for today
      usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

      // Today should have data
      const todayResult = getUsageStatsTool(usageService, { period: 'today' });
      expect(todayResult.content[0].text).toContain('Requests: 1');

      // All should also have data
      const allResult = getUsageStatsTool(usageService, { period: 'all' });
      expect(allResult.content[0].text).toContain('Requests: 1');
    });
  });

  describe('formatting', () => {
    it('should format large numbers with commas', () => {
      usageService.recordUsage('openai', 'gpt-4o', 1000000, 500000, false, false);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      // Should have formatted numbers
      expect(text).toContain('1,000,000');
    });

    it('should format cost with appropriate precision', () => {
      // Small cost
      usageService.recordUsage('testprovider', 'test-model', 100, 50, false, false);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      // Should show cost with decimal places
      expect(text).toMatch(/\$\d+\.\d+/);
    });

    it('should format very small costs with 6 decimal places', () => {
      // Very small cost (10 tokens at $5/M = $0.00005)
      usageService.recordUsage('testprovider', 'test-model', 10, 0, false, false);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      // Should show 6 decimal places for very small amounts
      expect(text).toMatch(/\$0\.0000\d+/);
    });

    it('should format large costs with 2 decimal places', () => {
      // Large cost (10M tokens at $5/M = $50)
      usageService.recordUsage('testprovider', 'test-model', 10000000, 0, false, false);

      const result = getUsageStatsTool(usageService, { period: 'today' });
      const text = result.content[0].text;

      // Should show 2 decimal places for larger amounts
      expect(text).toMatch(/\$\d+\.\d{2}\s*USD/);
    });

    it('should show $0 cost for free models', () => {
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

      freeUsageService.recordUsage('freeprovider', 'free-model', 1000000, 500000, false, false);

      const result = getUsageStatsTool(freeUsageService, { period: 'today' });
      const text = result.content[0].text;

      // Should show $0 cost
      expect(text).toContain('$0');
      expect(text).toContain('Estimated Cost:');

      freeUsageService.shutdown();
    });
  });
});
