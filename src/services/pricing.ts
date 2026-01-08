import { ModelPricing, PricingConfig } from '../config/types.js';
import { DEFAULT_PRICING } from '../data/default-pricing.js';
import { logger } from '../utils/logger.js';

export interface CostCalculation {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Provider name aliases.
 * Maps common user-provided names to canonical provider names in pricing data.
 */
const PROVIDER_ALIASES: Record<string, string> = {
  gemini: 'google',
};

/**
 * PricingService manages token pricing data.
 *
 * It merges hardcoded default pricing with optional user config overrides.
 * User overrides take precedence over defaults.
 */
export class PricingService {
  private pricing: PricingConfig;

  constructor(configPricing?: PricingConfig) {
    this.pricing = this.mergePricing(DEFAULT_PRICING, configPricing);
    const providerCount = Object.keys(this.pricing).length;
    const modelCount = Object.values(this.pricing).reduce(
      (acc, models) => acc + Object.keys(models).length,
      0
    );
    logger.debug(`PricingService initialized with ${providerCount} providers, ${modelCount} models`);
  }

  /**
   * Deep merge pricing configs. Overrides take precedence.
   */
  private mergePricing(defaults: PricingConfig, overrides?: PricingConfig): PricingConfig {
    const result: PricingConfig = {};

    // Deep copy all defaults
    for (const [provider, models] of Object.entries(defaults)) {
      result[provider] = {};
      for (const [model, pricing] of Object.entries(models)) {
        result[provider][model] = { ...pricing };
      }
    }

    if (!overrides) {
      return result;
    }

    // Apply overrides
    for (const [provider, models] of Object.entries(overrides)) {
      if (!result[provider]) {
        result[provider] = {};
      }
      for (const [model, pricing] of Object.entries(models)) {
        result[provider][model] = { ...pricing };
      }
    }

    return result;
  }

  /**
   * Resolve provider name, checking for aliases.
   * First checks if provider exists directly, then checks aliases.
   */
  private resolveProvider(provider: string): string {
    // Direct match takes precedence
    if (this.pricing[provider]) {
      return provider;
    }
    // Check aliases
    return PROVIDER_ALIASES[provider] || provider;
  }

  /**
   * Get pricing for a specific provider and model.
   * Returns undefined if pricing is not configured.
   * Supports provider aliases (e.g., "gemini" -> "google").
   */
  getPricing(provider: string, model: string): ModelPricing | undefined {
    const resolvedProvider = this.resolveProvider(provider);
    return this.pricing[resolvedProvider]?.[model];
  }

  /**
   * Calculate the cost for a given number of tokens.
   * Returns null if pricing is not configured for the provider/model.
   */
  calculateCost(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number
  ): CostCalculation | null {
    const pricing = this.getPricing(provider, model);
    if (!pricing) {
      return null;
    }

    const inputCost = (promptTokens / 1_000_000) * pricing.inputPricePerMillion;
    const outputCost = (completionTokens / 1_000_000) * pricing.outputPricePerMillion;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };
  }

  /**
   * Check if pricing is configured for a provider/model combination.
   * Supports provider aliases.
   */
  hasPricingFor(provider: string, model: string): boolean {
    return this.getPricing(provider, model) !== undefined;
  }

  /**
   * Get all pricing data (for debugging/display).
   * Returns a deep copy to prevent external mutation.
   */
  getAllPricing(): PricingConfig {
    const result: PricingConfig = {};
    for (const [provider, models] of Object.entries(this.pricing)) {
      result[provider] = {};
      for (const [model, pricing] of Object.entries(models)) {
        result[provider][model] = { ...pricing };
      }
    }
    return result;
  }

  /**
   * Get list of all configured providers.
   */
  getProviders(): string[] {
    return Object.keys(this.pricing);
  }

  /**
   * Get list of all models for a provider.
   * Supports provider aliases.
   */
  getModelsForProvider(provider: string): string[] {
    const resolvedProvider = this.resolveProvider(provider);
    return Object.keys(this.pricing[resolvedProvider] || {});
  }
}
