import { describe, it, expect, beforeEach } from '@jest/globals';
import { PricingService } from '../src/services/pricing.js';
import { PricingConfig } from '../src/config/types.js';
import { DEFAULT_PRICING } from '../src/data/default-pricing.js';

describe('PricingService', () => {
  describe('default pricing', () => {
    let service: PricingService;

    beforeEach(() => {
      service = new PricingService();
    });

    it('should load default pricing when no config override', () => {
      // Check a known default price
      const pricing = service.getPricing('openai', 'gpt-4o');
      expect(pricing).toBeDefined();
      expect(pricing?.inputPricePerMillion).toBe(2.5);
      expect(pricing?.outputPricePerMillion).toBe(10);
    });

    it('should have pricing for common providers', () => {
      expect(service.getPricing('openai', 'gpt-4o')).toBeDefined();
      expect(service.getPricing('anthropic', 'claude-3-5-sonnet-20241022')).toBeDefined();
      expect(service.getPricing('google', 'gemini-1.5-pro')).toBeDefined();
      expect(service.getPricing('groq', 'llama-3.3-70b-versatile')).toBeDefined();
    });

    it('should return undefined for unknown provider', () => {
      expect(service.getPricing('unknown-provider', 'some-model')).toBeUndefined();
    });

    it('should return undefined for unknown model', () => {
      expect(service.getPricing('openai', 'unknown-model')).toBeUndefined();
    });

    it('should list all providers', () => {
      const providers = service.getProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('google');
      expect(providers).toContain('groq');
    });

    it('should list models for a provider', () => {
      const models = service.getModelsForProvider('openai');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4o-mini');
    });

    it('should return empty array for unknown provider models', () => {
      const models = service.getModelsForProvider('unknown-provider');
      expect(models).toEqual([]);
    });
  });

  describe('config overrides', () => {
    it('should override default pricing with config values', () => {
      const configPricing: PricingConfig = {
        openai: {
          'gpt-4o': { inputPricePerMillion: 100, outputPricePerMillion: 200 },
        },
      };

      const service = new PricingService(configPricing);
      const pricing = service.getPricing('openai', 'gpt-4o');

      expect(pricing?.inputPricePerMillion).toBe(100);
      expect(pricing?.outputPricePerMillion).toBe(200);
    });

    it('should add new providers from config', () => {
      const configPricing: PricingConfig = {
        'my-custom-provider': {
          'custom-model': { inputPricePerMillion: 1, outputPricePerMillion: 2 },
        },
      };

      const service = new PricingService(configPricing);
      const pricing = service.getPricing('my-custom-provider', 'custom-model');

      expect(pricing?.inputPricePerMillion).toBe(1);
      expect(pricing?.outputPricePerMillion).toBe(2);
    });

    it('should add new models to existing providers', () => {
      const configPricing: PricingConfig = {
        openai: {
          'new-custom-model': { inputPricePerMillion: 5, outputPricePerMillion: 10 },
        },
      };

      const service = new PricingService(configPricing);

      // New model should exist
      const newPricing = service.getPricing('openai', 'new-custom-model');
      expect(newPricing?.inputPricePerMillion).toBe(5);

      // Existing default models should still exist
      const existingPricing = service.getPricing('openai', 'gpt-4o-mini');
      expect(existingPricing).toBeDefined();
    });

    it('should preserve default providers when config adds new ones', () => {
      const configPricing: PricingConfig = {
        'new-provider': {
          'new-model': { inputPricePerMillion: 1, outputPricePerMillion: 2 },
        },
      };

      const service = new PricingService(configPricing);

      // New provider should exist
      expect(service.getPricing('new-provider', 'new-model')).toBeDefined();

      // Default providers should still exist
      expect(service.getPricing('openai', 'gpt-4o')).toBeDefined();
      expect(service.getPricing('anthropic', 'claude-3-5-sonnet-20241022')).toBeDefined();
    });

    it('should handle empty config override object', () => {
      const service = new PricingService({});

      // Default providers should still exist
      expect(service.getPricing('openai', 'gpt-4o')).toBeDefined();
      expect(service.getProviders().length).toBeGreaterThan(0);
    });

    it('should be case-sensitive for provider and model names', () => {
      const service = new PricingService();

      // Exact case should work
      expect(service.getPricing('openai', 'gpt-4o')).toBeDefined();

      // Different case should NOT work
      expect(service.getPricing('OpenAI', 'gpt-4o')).toBeUndefined();
      expect(service.getPricing('openai', 'GPT-4o')).toBeUndefined();
      expect(service.getPricing('OPENAI', 'GPT-4O')).toBeUndefined();
    });
  });

  describe('cost calculation', () => {
    let service: PricingService;

    beforeEach(() => {
      service = new PricingService({
        test: {
          'test-model': { inputPricePerMillion: 5, outputPricePerMillion: 15 },
        },
      });
    });

    it('should calculate cost correctly', () => {
      // 500 prompt tokens at $5/M = $0.0025
      // 200 completion tokens at $15/M = $0.003
      // Total = $0.0055
      const cost = service.calculateCost('test', 'test-model', 500, 200);

      expect(cost).not.toBeNull();
      expect(cost?.inputCost).toBeCloseTo(0.0025, 6);
      expect(cost?.outputCost).toBeCloseTo(0.003, 6);
      expect(cost?.totalCost).toBeCloseTo(0.0055, 6);
    });

    it('should return null for unknown provider', () => {
      const cost = service.calculateCost('unknown', 'model', 1000, 1000);
      expect(cost).toBeNull();
    });

    it('should return null for unknown model', () => {
      const cost = service.calculateCost('test', 'unknown-model', 1000, 1000);
      expect(cost).toBeNull();
    });

    it('should return zero cost for zero tokens', () => {
      const cost = service.calculateCost('test', 'test-model', 0, 0);

      expect(cost).not.toBeNull();
      expect(cost?.inputCost).toBe(0);
      expect(cost?.outputCost).toBe(0);
      expect(cost?.totalCost).toBe(0);
    });

    it('should handle large token counts', () => {
      // 1 million tokens at $5/M = $5
      const cost = service.calculateCost('test', 'test-model', 1_000_000, 1_000_000);

      expect(cost).not.toBeNull();
      expect(cost?.inputCost).toBe(5);
      expect(cost?.outputCost).toBe(15);
      expect(cost?.totalCost).toBe(20);
    });

    it('should handle fractional prices correctly', () => {
      const serviceWithFractional = new PricingService({
        test: {
          'cheap-model': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
        },
      });

      // 1000 tokens at $0.15/M = $0.00015
      const cost = serviceWithFractional.calculateCost('test', 'cheap-model', 1000, 1000);

      expect(cost).not.toBeNull();
      expect(cost?.inputCost).toBeCloseTo(0.00015, 8);
      expect(cost?.outputCost).toBeCloseTo(0.0006, 8);
    });

    it('should calculate cost for free models as zero', () => {
      const serviceWithFree = new PricingService({
        test: {
          'free-model': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
        },
      });

      const cost = serviceWithFree.calculateCost('test', 'free-model', 10000, 5000);

      expect(cost).not.toBeNull();
      expect(cost?.totalCost).toBe(0);
    });
  });

  describe('hasPricingFor', () => {
    let service: PricingService;

    beforeEach(() => {
      service = new PricingService();
    });

    it('should return true for known provider/model', () => {
      expect(service.hasPricingFor('openai', 'gpt-4o')).toBe(true);
    });

    it('should return false for unknown provider', () => {
      expect(service.hasPricingFor('unknown', 'gpt-4o')).toBe(false);
    });

    it('should return false for unknown model', () => {
      expect(service.hasPricingFor('openai', 'unknown-model')).toBe(false);
    });
  });

  describe('provider aliases', () => {
    let service: PricingService;

    beforeEach(() => {
      service = new PricingService();
    });

    it('should resolve "gemini" to "google" pricing', () => {
      const pricing = service.getPricing('gemini', 'gemini-2.5-flash');
      expect(pricing).toBeDefined();
      expect(pricing?.inputPricePerMillion).toBe(0.3);
      expect(pricing?.outputPricePerMillion).toBe(2.5);
    });

    it('should still work with canonical "google" provider name', () => {
      const pricing = service.getPricing('google', 'gemini-2.5-flash');
      expect(pricing).toBeDefined();
      expect(pricing?.inputPricePerMillion).toBe(0.3);
    });

    it('should calculate cost with aliased provider', () => {
      const cost = service.calculateCost('gemini', 'gemini-2.5-flash', 1_000_000, 1_000_000);
      expect(cost).not.toBeNull();
      expect(cost?.inputCost).toBe(0.3);
      expect(cost?.outputCost).toBe(2.5);
    });

    it('should return true for hasPricingFor with aliased provider', () => {
      expect(service.hasPricingFor('gemini', 'gemini-2.5-flash')).toBe(true);
    });

    it('should list models for aliased provider', () => {
      const models = service.getModelsForProvider('gemini');
      expect(models).toContain('gemini-2.5-flash');
      expect(models).toContain('gemini-1.5-pro');
    });

    it('should prefer direct provider match over alias', () => {
      // If user adds "gemini" in their config, it should take precedence
      const configPricing: PricingConfig = {
        gemini: {
          'custom-gemini-model': { inputPricePerMillion: 99, outputPricePerMillion: 199 },
        },
      };
      const serviceWithOverride = new PricingService(configPricing);

      // Custom model should work
      const customPricing = serviceWithOverride.getPricing('gemini', 'custom-gemini-model');
      expect(customPricing?.inputPricePerMillion).toBe(99);

      // But google models won't be accessible via "gemini" anymore since direct match wins
      const googlePricing = serviceWithOverride.getPricing('gemini', 'gemini-2.5-flash');
      expect(googlePricing).toBeUndefined();

      // Google models still accessible via "google"
      const directPricing = serviceWithOverride.getPricing('google', 'gemini-2.5-flash');
      expect(directPricing).toBeDefined();
    });
  });

  describe('getAllPricing', () => {
    it('should return all pricing data', () => {
      const service = new PricingService();
      const allPricing = service.getAllPricing();

      expect(allPricing).toHaveProperty('openai');
      expect(allPricing).toHaveProperty('anthropic');
      expect(allPricing.openai).toHaveProperty('gpt-4o');
    });

    it('should return a copy, not the original', () => {
      const service = new PricingService();
      const pricing1 = service.getAllPricing();
      const pricing2 = service.getAllPricing();

      expect(pricing1).not.toBe(pricing2);
    });

    it('should return a deep copy (mutations do not affect original)', () => {
      const service = new PricingService();
      const pricing = service.getAllPricing();

      // Store original values
      const originalInput = service.getPricing('openai', 'gpt-4o')?.inputPricePerMillion;

      // Mutate the copy
      pricing.openai['gpt-4o'].inputPricePerMillion = 999;

      // Original should be unchanged
      expect(service.getPricing('openai', 'gpt-4o')?.inputPricePerMillion).toBe(originalInput);
    });
  });
});
