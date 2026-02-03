import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConfigManager } from '../src/config/config';
import type { HttpProviderConfig, ProviderConfig } from '../src/config/types';

// Mock logger to avoid console noise during tests
jest.mock('../src/utils/logger');

/** Type guard: narrow ProviderConfig to HttpProviderConfig */
function isHttp(p: ProviderConfig): p is HttpProviderConfig {
  return p.type === 'http';
}

describe('ConfigManager - Default Providers', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    // Clear all provider keys
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.ENABLE_OLLAMA;
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('CUSTOM_')) delete process.env[key];
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create OpenAI provider when API key is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.openai).toBeDefined();
    expect(isHttp(providers.openai)).toBe(true);
    const openai = providers.openai as HttpProviderConfig;
    expect(openai.api_key).toBe('sk-test-key');
    expect(openai.base_url).toBe('https://api.openai.com/v1');
    expect(openai.nickname).toBe('GPT Duck');
  });

  it('should use custom OpenAI model and nickname from env', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.OPENAI_DEFAULT_MODEL = 'gpt-4-turbo';
    process.env.OPENAI_NICKNAME = 'Custom GPT Duck';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.openai.default_model).toBe('gpt-4-turbo');
    expect(providers.openai.nickname).toBe('Custom GPT Duck');
  });

  it('should create Gemini provider when API key is set', () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.gemini).toBeDefined();
    const gemini = providers.gemini as HttpProviderConfig;
    expect(gemini.api_key).toBe('gemini-test-key');
    expect(gemini.nickname).toBe('Gemini Duck');
  });

  it('should use custom Gemini model and nickname from env', () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    process.env.GEMINI_DEFAULT_MODEL = 'gemini-pro';
    process.env.GEMINI_NICKNAME = 'Custom Gemini Duck';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.gemini.default_model).toBe('gemini-pro');
    expect(providers.gemini.nickname).toBe('Custom Gemini Duck');
  });

  it('should create Groq provider when API key is set', () => {
    process.env.GROQ_API_KEY = 'gsk-test-key';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.groq).toBeDefined();
    const groq = providers.groq as HttpProviderConfig;
    expect(groq.api_key).toBe('gsk-test-key');
    expect(groq.nickname).toBe('Groq Duck');
  });

  it('should use custom Groq model and nickname from env', () => {
    process.env.GROQ_API_KEY = 'gsk-test-key';
    process.env.GROQ_DEFAULT_MODEL = 'custom-groq-model';
    process.env.GROQ_NICKNAME = 'Fast Groq Duck';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.groq.default_model).toBe('custom-groq-model');
    expect(providers.groq.nickname).toBe('Fast Groq Duck');
  });

  it('should create Ollama provider when OLLAMA_BASE_URL is set', () => {
    process.env.OPENAI_API_KEY = 'dummy'; // Need at least one provider
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/v1';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.ollama).toBeDefined();
    const ollama = providers.ollama as HttpProviderConfig;
    expect(ollama.api_key).toBe('not-needed');
    expect(ollama.base_url).toBe('http://localhost:11434/v1');
    expect(ollama.nickname).toBe('Local Duck');
  });

  it('should create Ollama provider when ENABLE_OLLAMA is true', () => {
    process.env.OPENAI_API_KEY = 'dummy'; // Need at least one provider
    process.env.ENABLE_OLLAMA = 'true';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.ollama).toBeDefined();
    expect((providers.ollama as HttpProviderConfig).base_url).toBe('http://localhost:11434/v1');
  });

  it('should use custom Ollama model and nickname from env', () => {
    process.env.OPENAI_API_KEY = 'dummy';
    process.env.ENABLE_OLLAMA = 'true';
    process.env.OLLAMA_DEFAULT_MODEL = 'mistral';
    process.env.OLLAMA_NICKNAME = 'My Local Duck';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.ollama.default_model).toBe('mistral');
    expect(providers.ollama.nickname).toBe('My Local Duck');
  });
});

describe('ConfigManager - MCP Bridge Config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    // Clear MCP-related env vars
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('MCP_')) delete process.env[key];
      if (key.startsWith('CUSTOM_')) delete process.env[key];
    });
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should enable MCP bridge when MCP_BRIDGE_ENABLED=true', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';

    const configManager = new ConfigManager();
    expect(configManager.getConfig().mcp_bridge?.enabled).toBe(true);
  });

  it('should disable MCP bridge when MCP_BRIDGE_ENABLED=false', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'false';

    const configManager = new ConfigManager();
    expect(configManager.getConfig().mcp_bridge?.enabled).toBe(false);
  });

  it('should set approval mode from environment', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';
    process.env.MCP_APPROVAL_MODE = 'always';

    const configManager = new ConfigManager();
    expect(configManager.getConfig().mcp_bridge?.approval_mode).toBe('always');
  });

  it('should set approval timeout from environment', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';
    process.env.MCP_APPROVAL_TIMEOUT = '120';

    const configManager = new ConfigManager();
    expect(configManager.getConfig().mcp_bridge?.approval_timeout).toBe(120);
  });

  it('should parse trusted tools from environment', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';
    process.env.MCP_TRUSTED_TOOLS = 'tool1, tool2, tool3';

    const configManager = new ConfigManager();
    expect(configManager.getConfig().mcp_bridge?.trusted_tools).toEqual(['tool1', 'tool2', 'tool3']);
  });

  it('should parse trusted tools by server from environment', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';
    process.env.MCP_TRUSTED_TOOLS_FILESYSTEM = 'read_file,write_file';

    const configManager = new ConfigManager();
    const trustedByServer = configManager.getConfig().mcp_bridge?.trusted_tools_by_server;
    expect(trustedByServer?.filesystem).toEqual(['read_file', 'write_file']);
  });

  it('should handle wildcard trusted tools for server', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';
    process.env.MCP_TRUSTED_TOOLS_INTERNAL_API = '*';

    const configManager = new ConfigManager();
    const trustedByServer = configManager.getConfig().mcp_bridge?.trusted_tools_by_server;
    expect(trustedByServer?.['internal-api']).toEqual(['*']);
  });

  it('should auto-enable MCP bridge when MCP_SERVER_ env vars exist', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_SERVER_TEST_TYPE = 'stdio';
    process.env.MCP_SERVER_TEST_COMMAND = '/usr/bin/test-server';

    const configManager = new ConfigManager();
    expect(configManager.getConfig().mcp_bridge?.enabled).toBe(true);
  });

  it('should set approval mode to trusted', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';
    process.env.MCP_APPROVAL_MODE = 'trusted';

    const configManager = new ConfigManager();
    expect(configManager.getConfig().mcp_bridge?.approval_mode).toBe('trusted');
  });

  it('should set approval mode to never', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_BRIDGE_ENABLED = 'true';
    process.env.MCP_APPROVAL_MODE = 'never';

    const configManager = new ConfigManager();
    expect(configManager.getConfig().mcp_bridge?.approval_mode).toBe('never');
  });
});

describe('ConfigManager - MCP Server Config from Environment', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('MCP_')) delete process.env[key];
    });
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should configure stdio MCP server from environment', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_SERVER_FILESYSTEM_TYPE = 'stdio';
    process.env.MCP_SERVER_FILESYSTEM_COMMAND = 'npx @modelcontextprotocol/server-filesystem';
    process.env.MCP_SERVER_FILESYSTEM_ARGS = '/home/user,/tmp';

    const configManager = new ConfigManager();
    const servers = configManager.getConfig().mcp_bridge?.mcp_servers;

    expect(servers).toBeDefined();
    expect(servers?.length).toBeGreaterThan(0);
    const fsServer = servers?.find(s => s.name === 'filesystem');
    expect(fsServer).toBeDefined();
    expect(fsServer?.type).toBe('stdio');
    expect(fsServer?.command).toBe('npx @modelcontextprotocol/server-filesystem');
    expect(fsServer?.args).toEqual(['/home/user', '/tmp']);
  });

  it('should configure http MCP server from environment', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_SERVER_MYAPI_TYPE = 'http';
    process.env.MCP_SERVER_MYAPI_URL = 'https://api.example.com/mcp';
    process.env.MCP_SERVER_MYAPI_API_KEY = 'server-api-key';

    const configManager = new ConfigManager();
    const servers = configManager.getConfig().mcp_bridge?.mcp_servers;

    const httpServer = servers?.find(s => s.name === 'myapi');
    expect(httpServer).toBeDefined();
    expect(httpServer?.type).toBe('http');
    expect(httpServer?.url).toBe('https://api.example.com/mcp');
    expect(httpServer?.apiKey).toBe('server-api-key');
  });

  it('should skip stdio server without command', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_SERVER_NOCOMMAND_TYPE = 'stdio';
    // Missing COMMAND

    const configManager = new ConfigManager();
    const servers = configManager.getConfig().mcp_bridge?.mcp_servers;

    const nocommandServer = servers?.find(s => s.name === 'nocommand');
    expect(nocommandServer).toBeUndefined();
  });

  it('should skip http server without URL', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_SERVER_NOURL_TYPE = 'http';
    // Missing URL

    const configManager = new ConfigManager();
    const servers = configManager.getConfig().mcp_bridge?.mcp_servers;

    const nourlServer = servers?.find(s => s.name === 'nourl');
    expect(nourlServer).toBeUndefined();
  });

  it('should handle disabled MCP server', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_SERVER_DISABLED_TYPE = 'stdio';
    process.env.MCP_SERVER_DISABLED_COMMAND = 'some-command';
    process.env.MCP_SERVER_DISABLED_ENABLED = 'false';

    const configManager = new ConfigManager();
    const servers = configManager.getConfig().mcp_bridge?.mcp_servers;

    const disabledServer = servers?.find(s => s.name === 'disabled');
    expect(disabledServer?.enabled).toBe(false);
  });

  it('should configure retry settings from environment', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_SERVER_RETRYTEST_TYPE = 'stdio';
    process.env.MCP_SERVER_RETRYTEST_COMMAND = 'test-command';
    process.env.MCP_SERVER_RETRYTEST_RETRY_ATTEMPTS = '5';
    process.env.MCP_SERVER_RETRYTEST_RETRY_DELAY = '2000';

    const configManager = new ConfigManager();
    const servers = configManager.getConfig().mcp_bridge?.mcp_servers;

    const retryServer = servers?.find(s => s.name === 'retrytest');
    expect(retryServer?.retryAttempts).toBe(5);
    expect(retryServer?.retryDelay).toBe(2000);
  });

  it('should convert server names to lowercase with hyphens', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MCP_SERVER_MY_FANCY_SERVER_TYPE = 'stdio';
    process.env.MCP_SERVER_MY_FANCY_SERVER_COMMAND = 'fancy-command';

    const configManager = new ConfigManager();
    const servers = configManager.getConfig().mcp_bridge?.mcp_servers;

    const fancyServer = servers?.find(s => s.name === 'my-fancy-server');
    expect(fancyServer).toBeDefined();
  });
});

describe('ConfigManager - Public Methods', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('CUSTOM_')) delete process.env[key];
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getProvider', () => {
    it('should return specific provider by name', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.GEMINI_API_KEY = 'gemini-key';

      const configManager = new ConfigManager();
      const provider = configManager.getProvider('openai');

      expect(provider).toBeDefined();
      expect((provider as HttpProviderConfig).api_key).toBe('openai-key');
    });

    it('should return undefined for non-existent provider', () => {
      process.env.OPENAI_API_KEY = 'openai-key';

      const configManager = new ConfigManager();
      const provider = configManager.getProvider('nonexistent');

      expect(provider).toBeUndefined();
    });
  });

  describe('getDefaultProvider', () => {
    it('should return the default provider', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.DEFAULT_PROVIDER = 'openai';

      const configManager = new ConfigManager();
      const provider = configManager.getDefaultProvider();

      expect(provider).toBeDefined();
      expect((provider as HttpProviderConfig).api_key).toBe('openai-key');
    });

    it('should use first provider as default when none specified', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      // No DEFAULT_PROVIDER set

      const configManager = new ConfigManager();
      const provider = configManager.getDefaultProvider();

      expect(provider).toBeDefined();
      expect((provider as HttpProviderConfig).api_key).toBe('openai-key');
    });
  });

  describe('updateConfig', () => {
    it('should update config with partial updates', () => {
      process.env.OPENAI_API_KEY = 'openai-key';

      const configManager = new ConfigManager();
      const originalTemp = configManager.getConfig().default_temperature;

      configManager.updateConfig({ default_temperature: 0.99 });

      expect(configManager.getConfig().default_temperature).toBe(0.99);
      expect(configManager.getConfig().default_temperature).not.toBe(originalTemp);
    });

    it('should preserve existing config when updating', () => {
      process.env.OPENAI_API_KEY = 'openai-key';

      const configManager = new ConfigManager();
      configManager.updateConfig({ log_level: 'debug' });

      expect(configManager.getConfig().log_level).toBe('debug');
      expect(configManager.getConfig().providers.openai).toBeDefined();
    });
  });

  describe('environment overrides', () => {
    it('should override default_provider from environment', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.GEMINI_API_KEY = 'gemini-key';
      process.env.DEFAULT_PROVIDER = 'gemini';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().default_provider).toBe('gemini');
    });

    it('should override default_temperature from environment', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.DEFAULT_TEMPERATURE = '0.9';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().default_temperature).toBe(0.9);
    });

    it('should override log_level from environment', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.LOG_LEVEL = 'debug';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().log_level).toBe('debug');
    });
  });
});

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
        type: 'http',
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
      const api1 = providers.api1 as HttpProviderConfig;
      expect(api1.api_key).toBe('key1');
      expect(api1.base_url).toBe('https://api1.com/v1');
      expect(api1.nickname).toBe('API 1 Duck');
      expect(api1.models).toEqual(['custom-model']); // default
      expect(api1.default_model).toBe('custom-model'); // default

      // Check second provider
      expect(providers.api2).toBeDefined();
      const api2 = providers.api2 as HttpProviderConfig;
      expect(api2.api_key).toBe('key2');
      expect(api2.base_url).toBe('https://api2.com/v1');
      expect(api2.models).toEqual(['model-a', 'model-b']);
      expect(api2.default_model).toBe('model-a');
      expect(api2.nickname).toBe('API2 Duck'); // auto-generated
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
        type: 'http',
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
      expect((providers.openai as HttpProviderConfig).base_url).toBe('https://api.openai.com/v1');
      expect((providers.integration as HttpProviderConfig).base_url).toBe('https://custom.com/v1');
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
      const ollama = providers.ollama as HttpProviderConfig;
      expect(ollama.api_key).toBe('not-needed');
      expect(ollama.base_url).toBe('http://localhost:11434/v1');
      expect(ollama.models).toEqual(['llama3.2', 'mistral', 'codellama']);

      expect(providers.lmstudio).toBeDefined();
      const lmstudio = providers.lmstudio as HttpProviderConfig;
      expect(lmstudio.api_key).toBe('not-needed');
      expect(lmstudio.base_url).toBe('http://localhost:1234/v1');
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
      // Access HTTP-specific fields via type guard
      const tp = config.providers.testprovider;
      if (tp.type === 'http') {
        expect(tp.api_key).toBe('test-key');
        expect(tp.base_url).toBe('https://test.com/v1');
      } else {
        throw new Error('Expected HTTP provider');
      }
    });
  });
});

describe('ConfigManager - CLI Providers', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('CUSTOM_') || key.startsWith('CLI_')) delete process.env[key];
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create CLI claude provider when CLI_CLAUDE_ENABLED=true', () => {
    process.env.OPENAI_API_KEY = 'dummy-key';
    process.env.CLI_CLAUDE_ENABLED = 'true';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers['cli-claude']).toBeDefined();
    expect(providers['cli-claude'].type).toBe('cli');
    expect(providers['cli-claude'].nickname).toBe('Claude Agent');
    if (providers['cli-claude'].type === 'cli') {
      expect(providers['cli-claude'].cli_type).toBe('claude');
    }
  });

  it('should create CLI codex provider when CLI_CODEX_ENABLED=true', () => {
    process.env.OPENAI_API_KEY = 'dummy-key';
    process.env.CLI_CODEX_ENABLED = 'true';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers['cli-codex']).toBeDefined();
    expect(providers['cli-codex'].type).toBe('cli');
    if (providers['cli-codex'].type === 'cli') {
      expect(providers['cli-codex'].cli_type).toBe('codex');
    }
  });

  it('should use custom nickname from env var', () => {
    process.env.OPENAI_API_KEY = 'dummy-key';
    process.env.CLI_CLAUDE_ENABLED = 'true';
    process.env.CLI_CLAUDE_NICKNAME = 'My Claude';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers['cli-claude'].nickname).toBe('My Claude');
  });

  it('should parse CLI_ARGS from env var', () => {
    process.env.OPENAI_API_KEY = 'dummy-key';
    process.env.CLI_CLAUDE_ENABLED = 'true';
    process.env.CLI_CLAUDE_CLI_ARGS = '--max-turns,5,--verbose';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    if (providers['cli-claude'].type === 'cli') {
      expect(providers['cli-claude'].cli_args).toEqual(['--max-turns', '5', '--verbose']);
    }
  });

  it('should create custom CLI provider with CLI_CUSTOM_ prefix', () => {
    process.env.OPENAI_API_KEY = 'dummy-key';
    process.env.CLI_CUSTOM_MYTOOL_COMMAND = '/usr/local/bin/mytool';
    process.env.CLI_CUSTOM_MYTOOL_PROMPT_DELIVERY = 'flag';
    process.env.CLI_CUSTOM_MYTOOL_PROMPT_FLAG = '-p';
    process.env.CLI_CUSTOM_MYTOOL_OUTPUT_FORMAT = 'text';
    process.env.CLI_CUSTOM_MYTOOL_NICKNAME = 'My Tool';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers['cli-mytool']).toBeDefined();
    expect(providers['cli-mytool'].type).toBe('cli');
    if (providers['cli-mytool'].type === 'cli') {
      expect(providers['cli-mytool'].cli_type).toBe('custom');
      expect(providers['cli-mytool'].cli_command).toBe('/usr/local/bin/mytool');
      expect(providers['cli-mytool'].prompt_delivery).toBe('flag');
      expect(providers['cli-mytool'].prompt_flag).toBe('-p');
    }
  });

  it('should parse PROCESS_TIMEOUT for custom CLI provider', () => {
    process.env.OPENAI_API_KEY = 'dummy-key';
    process.env.CLI_CUSTOM_SLOWTOOL_COMMAND = '/usr/local/bin/slow-tool';
    process.env.CLI_CUSTOM_SLOWTOOL_PROCESS_TIMEOUT = '600000';
    process.env.CLI_CUSTOM_SLOWTOOL_NICKNAME = 'Slow Tool';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers['cli-slowtool']).toBeDefined();
    if (providers['cli-slowtool'].type === 'cli') {
      expect(providers['cli-slowtool'].process_timeout).toBe(600000);
    }
  });

  it('should parse WORKING_DIRECTORY for custom CLI provider', () => {
    process.env.OPENAI_API_KEY = 'dummy-key';
    process.env.CLI_CUSTOM_DIRTOOL_COMMAND = '/usr/local/bin/dir-tool';
    process.env.CLI_CUSTOM_DIRTOOL_WORKING_DIRECTORY = '/home/user/projects';
    process.env.CLI_CUSTOM_DIRTOOL_NICKNAME = 'Dir Tool';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers['cli-dirtool']).toBeDefined();
    if (providers['cli-dirtool'].type === 'cli') {
      expect(providers['cli-dirtool'].working_directory).toBe('/home/user/projects');
    }
  });

  it('should skip custom CLI provider without COMMAND', () => {
    process.env.OPENAI_API_KEY = 'dummy-key';
    process.env.CLI_CUSTOM_NOCMD_NICKNAME = 'No Command';
    process.env.CLI_CUSTOM_NOCMD_PROMPT_DELIVERY = 'stdin';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers['cli-nocmd']).toBeUndefined();
  });

  it('should not create CLI provider without ENABLED=true', () => {
    process.env.OPENAI_API_KEY = 'dummy-key';
    process.env.CLI_CLAUDE_ENABLED = 'false';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers['cli-claude']).toBeUndefined();
  });

  it('should coexist with HTTP providers', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.CLI_CLAUDE_ENABLED = 'true';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    expect(providers.openai).toBeDefined();
    expect(providers.openai.type).toBe('http');
    expect(providers['cli-claude']).toBeDefined();
    expect(providers['cli-claude'].type).toBe('cli');
  });

  it('should handle config without type field as HTTP (backward compatibility)', () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const configManager = new ConfigManager();
    const providers = configManager.getAllProviders();

    // Provider should have type 'http' after parsing
    expect(providers.openai.type).toBe('http');
  });
});