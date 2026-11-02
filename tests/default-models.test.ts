import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { ConfigManager } from '../src/config/config';
import type { HttpProviderConfig } from '../src/config/types';
import { PricingService } from '../src/services/pricing.js';
import { getPackageVersion } from '../src/utils/version.js';

jest.mock('../src/utils/logger');

const PROVIDER_ENV = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OLLAMA_BASE_URL',
  'ENABLE_OLLAMA',
  'OPENAI_DEFAULT_MODEL',
  'GEMINI_DEFAULT_MODEL',
  'GROQ_DEFAULT_MODEL',
  'OLLAMA_DEFAULT_MODEL',
  'RUBBER_DUCK_CONFIG',
];

describe('built-in default models', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    for (const key of PROVIDER_ENV) delete process.env[key];
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.GROQ_API_KEY = 'gsk-test';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses the current default model per provider', () => {
    const providers = new ConfigManager().getAllProviders();
    expect(providers.openai.default_model).toBe('gpt-5.4');
    expect(providers.google.default_model).toBe('gemini-3.8-flash');
    expect(providers.groq.default_model).toBe('openai/gpt-oss-120b');
  });

  it('has default pricing for every built-in model, so usage costs are never unknown', () => {
    const providers = new ConfigManager().getAllProviders();
    const pricing = new PricingService();
    for (const name of ['openai', 'google', 'groq']) {
      const p = providers[name] as HttpProviderConfig;
      for (const model of [p.default_model, ...(p.models ?? [])]) {
        expect({ provider: name, model, priced: pricing.hasPricingFor(name, model!) }).toEqual({
          provider: name,
          model,
          priced: true,
        });
      }
    }
  });
});

describe('getPackageVersion', () => {
  it('returns the version from package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(getPackageVersion()).toBe(pkg.version);
    expect(getPackageVersion()).not.toBe('0.0.0');
  });
});
