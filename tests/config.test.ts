import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConfigManager } from '../src/config/config';

// Mock logger to avoid console noise during tests
jest.mock('../src/utils/logger');

describe('ConfigManager - Custom Providers', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear custom provider environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('CUSTOM_')) {
        delete process.env[key];
      }
    });
    
    // Clear other provider keys that might interfere
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.TOGETHER_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getCustomProvidersFromEnv', () => {
    it('should parse single custom provider from environment', () => {
      // Set up environment variables
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_MYAPI_API_KEY = 'test-key-123';
      process.env.CUSTOM_MYAPI_BASE_URL = 'https://my-api.com/v1';
      process.env.CUSTOM_MYAPI_MODELS = 'model1,model2,model3';
      process.env.CUSTOM_MYAPI_DEFAULT_MODEL = 'model1';
      process.env.CUSTOM_MYAPI_NICKNAME = 'My Custom Duck';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      expect(providers.myapi).toBeDefined();
      expect(providers.myapi).toEqual({
        api_key: 'test-key-123',
        base_url: 'https://my-api.com/v1',
        models: ['model1', 'model2', 'model3'],
        default_model: 'model1',
        nickname: 'My Custom Duck',
      });
    });

    it('should parse multiple custom providers from environment', () => {
      // Set up multiple providers
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_API1_API_KEY = 'key1';
      process.env.CUSTOM_API1_BASE_URL = 'https://api1.com/v1';
      process.env.CUSTOM_API1_NICKNAME = 'API 1 Duck';

      process.env.CUSTOM_API2_API_KEY = 'key2';
      process.env.CUSTOM_API2_BASE_URL = 'https://api2.com/v1';
      process.env.CUSTOM_API2_MODELS = 'model-a,model-b';
      process.env.CUSTOM_API2_DEFAULT_MODEL = 'model-a';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      // Check first provider
      expect(providers.api1).toBeDefined();
      expect(providers.api1.api_key).toBe('key1');
      expect(providers.api1.base_url).toBe('https://api1.com/v1');
      expect(providers.api1.nickname).toBe('API 1 Duck');
      expect(providers.api1.models).toEqual(['custom-model']); // default
      expect(providers.api1.default_model).toBe('custom-model'); // default

      // Check second provider
      expect(providers.api2).toBeDefined();
      expect(providers.api2.api_key).toBe('key2');
      expect(providers.api2.base_url).toBe('https://api2.com/v1');
      expect(providers.api2.models).toEqual(['model-a', 'model-b']);
      expect(providers.api2.default_model).toBe('model-a');
      expect(providers.api2.nickname).toBe('API2 Duck'); // auto-generated
    });

    it('should convert provider names to lowercase', () => {
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_MYUPPERAPI_API_KEY = 'test-key';
      process.env.CUSTOM_MYUPPERAPI_BASE_URL = 'https://upper.com/v1';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      expect(providers.myupperapi).toBeDefined();
      expect(providers.MYUPPERAPI).toBeUndefined();
      expect(providers.myupperapi.nickname).toBe('MYUPPERAPI Duck');
    });

    it('should require both API_KEY and BASE_URL', () => {
      // Only API_KEY, missing BASE_URL
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_INCOMPLETE1_API_KEY = 'test-key';
      
      // Only BASE_URL, missing API_KEY
      process.env.CUSTOM_INCOMPLETE2_BASE_URL = 'https://test.com/v1';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      // Neither should be created
      expect(providers.incomplete1).toBeUndefined();
      expect(providers.incomplete2).toBeUndefined();
    });

    it('should handle comma-separated models list', () => {
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_TESTMODELS_API_KEY = 'test-key';
      process.env.CUSTOM_TESTMODELS_BASE_URL = 'https://test.com/v1';
      process.env.CUSTOM_TESTMODELS_MODELS = ' model1 , model2 , model3 ';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      expect(providers.testmodels.models).toEqual(['model1', 'model2', 'model3']);
    });

    it('should use default values for optional fields', () => {
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_MINIMAL_API_KEY = 'test-key';
      process.env.CUSTOM_MINIMAL_BASE_URL = 'https://minimal.com/v1';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      expect(providers.minimal).toBeDefined();
      expect(providers.minimal).toEqual({
        api_key: 'test-key',
        base_url: 'https://minimal.com/v1',
        models: ['custom-model'], // default
        default_model: 'custom-model', // default
        nickname: 'MINIMAL Duck', // auto-generated
      });
    });

    it('should handle custom nicknames', () => {
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_NICKNAMED_API_KEY = 'test-key';
      process.env.CUSTOM_NICKNAMED_BASE_URL = 'https://test.com/v1';
      process.env.CUSTOM_NICKNAMED_NICKNAME = 'My Special Test Duck 🦆';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      expect(providers.nicknamed.nickname).toBe('My Special Test Duck 🦆');
    });

    it('should handle empty models string', () => {
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_EMPTYMODELS_API_KEY = 'test-key';
      process.env.CUSTOM_EMPTYMODELS_BASE_URL = 'https://test.com/v1';
      process.env.CUSTOM_EMPTYMODELS_MODELS = '';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      // Empty models should fall back to default
      expect(providers.emptymodels.models).toEqual(['custom-model']);
    });

    it('should integrate with existing providers without conflicts', () => {
      // Set up API keys for built-in providers
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.GEMINI_API_KEY = 'gemini-key';
      
      // Add custom provider
      process.env.CUSTOM_INTEGRATION_API_KEY = 'custom-key';
      process.env.CUSTOM_INTEGRATION_BASE_URL = 'https://custom.com/v1';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      // Should have built-in providers
      expect(providers.openai).toBeDefined();
      expect(providers.gemini).toBeDefined();
      
      // Should have custom provider
      expect(providers.integration).toBeDefined();
      
      // Custom provider shouldn't override built-ins
      expect(providers.openai.base_url).toBe('https://api.openai.com/v1');
      expect(providers.integration.base_url).toBe('https://custom.com/v1');
    });

    it('should handle local LLM configuration via custom providers', () => {
      // Test common local LLM setups
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_OLLAMA_API_KEY = 'not-needed';
      process.env.CUSTOM_OLLAMA_BASE_URL = 'http://localhost:11434/v1';
      process.env.CUSTOM_OLLAMA_MODELS = 'llama3.2,mistral,codellama';
      process.env.CUSTOM_OLLAMA_NICKNAME = 'Local Ollama Duck';

      process.env.CUSTOM_LMSTUDIO_API_KEY = 'not-needed';
      process.env.CUSTOM_LMSTUDIO_BASE_URL = 'http://localhost:1234/v1';
      process.env.CUSTOM_LMSTUDIO_NICKNAME = 'LM Studio Duck';

      const configManager = new ConfigManager();
      const providers = configManager.getAllProviders();

      expect(providers.ollama).toBeDefined();
      expect(providers.ollama.api_key).toBe('not-needed');
      expect(providers.ollama.base_url).toBe('http://localhost:11434/v1');
      expect(providers.ollama.models).toEqual(['llama3.2', 'mistral', 'codellama']);

      expect(providers.lmstudio).toBeDefined();
      expect(providers.lmstudio.api_key).toBe('not-needed');
      expect(providers.lmstudio.base_url).toBe('http://localhost:1234/v1');
    });
  });

  describe('Integration with ProviderManager', () => {
    it('should allow custom providers to be used by ProviderManager', () => {
      process.env.OPENAI_API_KEY = 'dummy-key'; // Ensure getDefaultProviders is called
      process.env.CUSTOM_TESTPROVIDER_API_KEY = 'test-key';
      process.env.CUSTOM_TESTPROVIDER_BASE_URL = 'https://test.com/v1';
      process.env.CUSTOM_TESTPROVIDER_NICKNAME = 'Test Provider Duck';

      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      expect(config.providers.testprovider).toBeDefined();
      expect(config.providers.testprovider.nickname).toBe('Test Provider Duck');
      expect(config.providers.testprovider.api_key).toBe('test-key');
      expect(config.providers.testprovider.base_url).toBe('https://test.com/v1');
    });
  });
});