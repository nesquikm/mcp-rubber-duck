import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  UsageData,
  DailyUsage,
  ModelUsageStats,
  UsageTimePeriod,
  UsageStatsResult,
} from '../config/types.js';
import { PricingService } from './pricing.js';
import { logger } from '../utils/logger.js';

const USAGE_DATA_VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 5000;

/**
 * UsageService tracks token usage per model per day.
 *
 * Data is stored in ~/.mcp-rubber-duck/data/usage.json
 * Writes are debounced to avoid excessive disk I/O.
 */
export class UsageService {
  private usagePath: string;
  private data: UsageData;
  private pricingService: PricingService;
  private pendingWrites: number = 0;
  private writeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;

  constructor(pricingService: PricingService, options?: { dataDir?: string; debounceMs?: number }) {
    this.pricingService = pricingService;
    this.debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;

    const dataDir = options?.dataDir ?? join(homedir(), '.mcp-rubber-duck', 'data');
    this.ensureDirectoryExists(dataDir);
    this.usagePath = join(dataDir, 'usage.json');
    this.data = this.loadUsage();

    logger.debug(`UsageService initialized, data path: ${this.usagePath}`);
  }

  private ensureDirectoryExists(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.debug(`Created data directory: ${dir}`);
    }
  }

  private loadUsage(): UsageData {
    try {
      if (existsSync(this.usagePath)) {
        const raw = readFileSync(this.usagePath, 'utf-8');
        const data = JSON.parse(raw) as UsageData;

        // Validate structure
        if (typeof data !== 'object' || data === null) {
          throw new Error('Invalid usage data: not an object');
        }
        if (typeof data.daily !== 'object' || data.daily === null) {
          throw new Error('Invalid usage data: missing daily object');
        }

        logger.debug(`Loaded usage data from ${this.usagePath}`);
        return data;
      }
    } catch (error) {
      logger.warn('Failed to load usage data, starting fresh:', error);
    }
    return { version: USAGE_DATA_VERSION, daily: {} };
  }

  private saveUsage(): void {
    try {
      writeFileSync(this.usagePath, JSON.stringify(this.data, null, 2));
      logger.debug(`Saved usage data to ${this.usagePath}`);
    } catch (error) {
      logger.error('Failed to save usage data:', error);
    }
  }

  private scheduleSave(): void {
    this.pendingWrites++;
    if (this.writeDebounceTimer) {
      clearTimeout(this.writeDebounceTimer);
    }
    this.writeDebounceTimer = setTimeout(() => {
      this.saveUsage();
      this.pendingWrites = 0;
      this.writeDebounceTimer = null;
    }, this.debounceMs);
  }

  private getTodayKey(): string {
    // Use local date to match getStats() behavior
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Record usage for a provider/model.
   */
  recordUsage(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    error: boolean = false
  ): void {
    const today = this.getTodayKey();

    // Initialize nested structure if needed
    if (!this.data.daily[today]) {
      this.data.daily[today] = {};
    }
    if (!this.data.daily[today][provider]) {
      this.data.daily[today][provider] = {};
    }
    if (!this.data.daily[today][provider][model]) {
      this.data.daily[today][provider][model] = {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        errors: 0,
      };
    }

    const stats = this.data.daily[today][provider][model];
    stats.requests++;
    stats.promptTokens += promptTokens;
    stats.completionTokens += completionTokens;
    if (error) stats.errors++;

    logger.debug(
      `Recorded usage: ${provider}/${model} +${promptTokens}/${completionTokens} tokens`
    );

    this.scheduleSave();
  }

  /**
   * Get usage statistics for a time period.
   */
  getStats(period: UsageTimePeriod): UsageStatsResult {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    switch (period) {
      case 'today':
        startDate = today;
        break;
      case '7d':
        startDate = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date(0);
        break;
    }

    const aggregated: DailyUsage = {};
    const totals: ModelUsageStats = {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      errors: 0,
    };
    const costByProvider: Record<string, number> = {};
    let totalCost = 0;
    let hasCostData = false;

    for (const [dateKey, dayData] of Object.entries(this.data.daily)) {
      // Parse dateKey as local date (not UTC) to match getTodayKey() format
      // dateKey is "YYYY-MM-DD", we need to parse it as local midnight
      const [year, month, day] = dateKey.split('-').map(Number);
      const date = new Date(year, month - 1, day); // month is 0-indexed

      // Skip invalid dates or dates outside range
      if (isNaN(date.getTime()) || date < startDate || date > today) continue;

      for (const [provider, providerData] of Object.entries(dayData)) {
        if (!aggregated[provider]) {
          aggregated[provider] = {};
          costByProvider[provider] = 0;
        }

        for (const [model, stats] of Object.entries(providerData)) {
          if (!aggregated[provider][model]) {
            aggregated[provider][model] = {
              requests: 0,
              promptTokens: 0,
              completionTokens: 0,
              errors: 0,
            };
          }

          const agg = aggregated[provider][model];
          agg.requests += stats.requests;
          agg.promptTokens += stats.promptTokens;
          agg.completionTokens += stats.completionTokens;
          agg.errors += stats.errors;

          totals.requests += stats.requests;
          totals.promptTokens += stats.promptTokens;
          totals.completionTokens += stats.completionTokens;
          totals.errors += stats.errors;

          // Calculate cost if pricing available
          const cost = this.pricingService.calculateCost(
            provider,
            model,
            stats.promptTokens,
            stats.completionTokens
          );
          if (cost) {
            totalCost += cost.totalCost;
            costByProvider[provider] += cost.totalCost;
            hasCostData = true;
          }
        }
      }
    }

    const result: UsageStatsResult = {
      period,
      startDate: this.formatDate(startDate),
      endDate: this.formatDate(today),
      usage: aggregated,
      totals: {
        ...totals,
      },
    };

    if (hasCostData) {
      result.totals.estimatedCostUSD = totalCost;
      result.costByProvider = costByProvider;
    }

    return result;
  }

  private formatDate(date: Date): string {
    // Use local date components to match getTodayKey() and date filtering
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Flush pending writes immediately. Call on shutdown.
   */
  shutdown(): void {
    if (this.writeDebounceTimer) {
      clearTimeout(this.writeDebounceTimer);
      this.writeDebounceTimer = null;
    }
    if (this.pendingWrites > 0) {
      this.saveUsage();
      this.pendingWrites = 0;
    }
    logger.debug('UsageService shutdown complete');
  }

  /**
   * Get raw usage data (for testing/debugging).
   * Returns a deep copy to prevent external mutation.
   */
  getRawData(): UsageData {
    return JSON.parse(JSON.stringify(this.data)) as UsageData;
  }

  /**
   * Clear all usage data (for testing).
   */
  clearData(): void {
    this.data = { version: USAGE_DATA_VERSION, daily: {} };
    this.scheduleSave();
  }
}
