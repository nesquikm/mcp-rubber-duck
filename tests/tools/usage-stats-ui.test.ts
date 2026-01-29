import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getUsageStatsTool } from '../../src/tools/get-usage-stats.js';
import { UsageService } from '../../src/services/usage.js';
import { PricingService } from '../../src/services/pricing.js';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

jest.mock('../../src/utils/logger');

describe('getUsageStatsTool structured JSON', () => {
  let tempDir: string;
  let pricingService: PricingService;
  let usageService: UsageService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'usage-ui-test-'));
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

  it('should return two content items: text and JSON', () => {
    const result = getUsageStatsTool(usageService, { period: 'today' });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect(result.content[1].type).toBe('text');
    expect(() => JSON.parse(result.content[1].text)).not.toThrow();
  });

  it('should include period and date range in JSON', () => {
    const result = getUsageStatsTool(usageService, { period: '7d' });
    const data = JSON.parse(result.content[1].text) as {
      period: string;
      startDate: string;
      endDate: string;
    };

    expect(data.period).toBe('7d');
    expect(data.startDate).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(data.endDate).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('should include totals in JSON', () => {
    usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

    const result = getUsageStatsTool(usageService, { period: 'today' });
    const data = JSON.parse(result.content[1].text) as {
      totals: {
        requests: number;
        promptTokens: number;
        completionTokens: number;
        cacheHits: number;
        errors: number;
      };
    };

    expect(data.totals.requests).toBe(1);
    expect(data.totals.promptTokens).toBe(100);
    expect(data.totals.completionTokens).toBe(50);
    expect(data.totals.cacheHits).toBe(0);
    expect(data.totals.errors).toBe(0);
  });

  it('should include per-provider usage breakdown', () => {
    usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);
    usageService.recordUsage('anthropic', 'claude-3', 200, 100, false, false);

    const result = getUsageStatsTool(usageService, { period: 'today' });
    const data = JSON.parse(result.content[1].text) as {
      usage: Record<string, Record<string, { requests: number }>>;
    };

    expect(data.usage).toHaveProperty('openai');
    expect(data.usage).toHaveProperty('anthropic');
    expect(data.usage['openai']['gpt-4o'].requests).toBe(1);
    expect(data.usage['anthropic']['claude-3'].requests).toBe(1);
  });

  it('should include cost data when pricing is configured', () => {
    usageService.recordUsage('testprovider', 'test-model', 1000, 500, false, false);

    const result = getUsageStatsTool(usageService, { period: 'today' });
    const data = JSON.parse(result.content[1].text) as {
      totals: { estimatedCostUSD?: number };
      costByProvider?: Record<string, number>;
    };

    expect(data.totals.estimatedCostUSD).toBeDefined();
    expect(typeof data.totals.estimatedCostUSD).toBe('number');
    expect(data.costByProvider).toBeDefined();
    expect(data.costByProvider!['testprovider']).toBeDefined();
  });

  it('should handle empty usage data in JSON', () => {
    // No usage recorded — should still return valid JSON with empty usage
    const result = getUsageStatsTool(usageService, { period: 'today' });
    const data = JSON.parse(result.content[1].text) as {
      totals: { requests: number };
      usage: Record<string, unknown>;
    };

    expect(data.totals.requests).toBe(0);
    expect(Object.keys(data.usage)).toHaveLength(0);
  });

  it('should preserve text content identical to before', () => {
    usageService.recordUsage('openai', 'gpt-4o', 100, 50, false, false);

    const result = getUsageStatsTool(usageService, { period: 'today' });

    expect(result.content[0].text).toContain('Usage Statistics');
    expect(result.content[0].text).toContain('TOTALS');
    expect(result.content[0].text).toContain('openai');
  });
});
