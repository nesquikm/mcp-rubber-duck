import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';
import { Config, ConfigSchema, ProviderConfig, MCPBridgeConfig, MCPServerConfig } from './types.js';
import { logger } from '../utils/logger.js';

dotenv.config();

export class ConfigManager {
  private config: Config;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || this.findConfigFile();
    this.config = this.loadConfig();
  }

  private findConfigFile(): string {
    const possiblePaths = [
      join(process.cwd(), 'config', 'config.json'),
      join(process.cwd(), 'config.json'),
      join(process.env.HOME || '', '.mcp-rubber-duck', 'config.json'),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        logger.info(`Found config file at: ${path}`);
        return path;
      }
    }

    // If no config file found, use default config
    logger.warn('No config file found, using environment variables and defaults');
    return '';
  }

  private loadConfig(): Config {
    let rawConfig: Record<string, unknown> = {};

    // Load from file if exists
    if (this.configPath && existsSync(this.configPath)) {
      try {
        const fileContent = readFileSync(this.configPath, 'utf-8');
        rawConfig = JSON.parse(fileContent) as Record<string, unknown>;
      } catch (error) {
        logger.error(`Failed to load config file: ${String(error)}`);
      }
    }

    // Merge with environment variables
    rawConfig = this.mergeWithEnv(rawConfig);

    // Add default providers if none configured
    if (!rawConfig.providers || Object.keys(rawConfig.providers).length === 0) {
      rawConfig.providers = this.getDefaultProviders();
    }

    // Validate and parse config
    try {
      const config = ConfigSchema.parse(rawConfig);
      
      // Set default provider if not specified
      if (!config.default_provider && Object.keys(config.providers).length > 0) {
        config.default_provider = Object.keys(config.providers)[0];
      }

      return config;
    } catch (error) {
      logger.error(`Invalid configuration: ${String(error)}`);
      throw new Error(`Configuration validation failed: ${String(error)}`);
    }
  }

  private mergeWithEnv(config: Record<string, unknown>): Record<string, unknown> {
    // Replace ${ENV_VAR} patterns with actual environment values
    const configStr = JSON.stringify(config);
    const replaced = configStr.replace(/\$\{([^}]+)\}/g, (match, envVar: string) => {
      const value = process.env[envVar];
      if (!value && envVar.includes('API_KEY')) {
        logger.warn(`Environment variable ${envVar} not found`);
      }
      return value || match;
    });
    
    const merged = JSON.parse(replaced) as Record<string, unknown>;

    // Apply environment overrides
    if (process.env.DEFAULT_PROVIDER) {
      merged.default_provider = process.env.DEFAULT_PROVIDER;
    }
    if (process.env.DEFAULT_TEMPERATURE) {
      merged.default_temperature = parseFloat(process.env.DEFAULT_TEMPERATURE);
    }
    if (process.env.LOG_LEVEL) {
      merged.log_level = process.env.LOG_LEVEL;
    }

    // Apply MCP bridge configuration from environment
    merged.mcp_bridge = this.getMCPBridgeConfig(merged.mcp_bridge as Partial<MCPBridgeConfig>);

    return merged;
  }

  private getDefaultProviders(): Record<string, ProviderConfig> {
    const providers: Record<string, ProviderConfig> = {};

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      providers.openai = {
        api_key: process.env.OPENAI_API_KEY,
        base_url: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
        default_model: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
        nickname: process.env.OPENAI_NICKNAME || 'GPT Duck',
      };
    }

    // Google Gemini
    if (process.env.GEMINI_API_KEY) {
      providers.gemini = {
        api_key: process.env.GEMINI_API_KEY,
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        models: ['gemini-2.5-flash', 'gemini-2.0-flash'],
        default_model: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash',
        nickname: process.env.GEMINI_NICKNAME || 'Gemini Duck',
      };
    }

    // Groq
    if (process.env.GROQ_API_KEY) {
      providers.groq = {
        api_key: process.env.GROQ_API_KEY,
        base_url: 'https://api.groq.com/openai/v1',
        models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
        default_model: process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile',
        nickname: process.env.GROQ_NICKNAME || 'Groq Duck',
      };
    }

    // Local Ollama (only if explicitly configured)
    if (process.env.OLLAMA_BASE_URL || process.env.ENABLE_OLLAMA === 'true') {
      providers.ollama = {
        api_key: 'not-needed',
        base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
        models: ['llama3.2', 'mistral', 'codellama'],
        default_model: process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2',
        nickname: process.env.OLLAMA_NICKNAME || 'Local Duck',
      };
    }

    // Add all custom providers from environment
    const customProviders = this.getCustomProvidersFromEnv();
    Object.assign(providers, customProviders);

    return providers;
  }

  private getMCPBridgeConfig(existingConfig: Partial<MCPBridgeConfig> = {}): Partial<MCPBridgeConfig> {
    // Don't override if MCP is explicitly disabled
    if (existingConfig?.enabled === false) {
      return existingConfig;
    }

    const mcpConfig: Partial<MCPBridgeConfig> = { ...existingConfig };

    // Enable MCP bridge if environment variables are present
    if (process.env.MCP_BRIDGE_ENABLED !== undefined) {
      mcpConfig.enabled = process.env.MCP_BRIDGE_ENABLED === 'true';
    } else if (this.hasMCPServerConfig()) {
      mcpConfig.enabled = true;
    }

    // Apply MCP bridge settings
    if (process.env.MCP_APPROVAL_MODE) {
      const approvalMode = process.env.MCP_APPROVAL_MODE;
      if (approvalMode === 'always' || approvalMode === 'trusted' || approvalMode === 'never') {
        mcpConfig.approval_mode = approvalMode;
      }
    }
    if (process.env.MCP_APPROVAL_TIMEOUT) {
      mcpConfig.approval_timeout = parseInt(process.env.MCP_APPROVAL_TIMEOUT);
    }
    if (process.env.MCP_TRUSTED_TOOLS) {
      mcpConfig.trusted_tools = process.env.MCP_TRUSTED_TOOLS.split(',').map(t => t.trim());
    }

    // Parse per-server trusted tools from environment
    mcpConfig.trusted_tools_by_server = this.getTrustedToolsByServerFromEnv();

    // Configure MCP servers from environment
    mcpConfig.mcp_servers = this.getMCPServersFromEnv();

    return mcpConfig.enabled || mcpConfig.mcp_servers?.length > 0 ? mcpConfig : existingConfig;
  }

  private hasMCPServerConfig(): boolean {
    // Check if any MCP server environment variables are present
    return Object.keys(process.env).some(key => key.startsWith('MCP_SERVER_'));
  }

  private getTrustedToolsByServerFromEnv(): Record<string, string[]> {
    const trustedToolsByServer: Record<string, string[]> = {};
    
    // Look for environment variables matching MCP_TRUSTED_TOOLS_{SERVER_NAME}
    Object.keys(process.env).forEach(key => {
      const match = key.match(/^MCP_TRUSTED_TOOLS_(.+)$/);
      if (match) {
        const serverName = match[1].toLowerCase().replace(/_/g, '-');
        const toolsStr = process.env[key];
        
        if (toolsStr) {
          if (toolsStr.trim() === '*') {
            // Wildcard: trust all tools from this server
            trustedToolsByServer[serverName] = ['*'];
          } else {
            // Parse comma-separated list of tools
            trustedToolsByServer[serverName] = toolsStr.split(',').map(tool => tool.trim());
          }
          
          logger.info(`Found trusted tools for server ${serverName}: ${JSON.stringify(trustedToolsByServer[serverName])}`);
        }
      }
    });
    
    return trustedToolsByServer;
  }

  private getCustomProvidersFromEnv(): Record<string, ProviderConfig> {
    const customProviders: Record<string, ProviderConfig> = {};
    const providerNames = new Set<string>();

    // Find all custom provider configurations
    Object.keys(process.env).forEach(key => {
      const match = key.match(/^CUSTOM_(.+)_(API_KEY|BASE_URL|MODELS|DEFAULT_MODEL|NICKNAME)$/);
      if (match) {
        const providerName = match[1];
        providerNames.add(providerName);
      }
    });

    // Build provider configurations
    providerNames.forEach(providerName => {
      const prefix = `CUSTOM_${providerName}_`;
      const apiKey = process.env[`${prefix}API_KEY`];
      const baseUrl = process.env[`${prefix}BASE_URL`];
      
      // Both API_KEY and BASE_URL are required
      if (apiKey && baseUrl) {
        const providerKey = providerName.toLowerCase();
        
        const modelsStr = process.env[`${prefix}MODELS`];
        const models = modelsStr && modelsStr.trim() ? 
          modelsStr.split(',').map(m => m.trim()).filter(m => m.length > 0) : 
          ['custom-model'];

        customProviders[providerKey] = {
          api_key: apiKey,
          base_url: baseUrl,
          models: models.length > 0 ? models : ['custom-model'],
          default_model: process.env[`${prefix}DEFAULT_MODEL`] || 'custom-model',
          nickname: process.env[`${prefix}NICKNAME`] || `${providerName} Duck`,
        };
      }
    });

    return customProviders;
  }

  private getMCPServersFromEnv(): MCPServerConfig[] {
    const servers: MCPServerConfig[] = [];
    const serverNames = new Set<string>();

    // Find all MCP server configurations
    Object.keys(process.env).forEach(key => {
      const match = key.match(/^MCP_SERVER_(.+)_(.+)$/);
      if (match) {
        serverNames.add(match[1]);
      }
    });

    // Build server configurations
    serverNames.forEach(serverName => {
      const prefix = `MCP_SERVER_${serverName}_`;
      const type = process.env[`${prefix}TYPE`];
      const command = process.env[`${prefix}COMMAND`];
      const url = process.env[`${prefix}URL`];
      
      // For stdio servers, we need type and command
      // For http servers, we need type and url
      if (type && ((type === 'stdio' && command) || (type === 'http' && url))) {
        const server: Partial<MCPServerConfig> = {
          name: serverName.toLowerCase().replace(/_/g, '-'),
          type: type as 'stdio' | 'http',
          enabled: process.env[`${prefix}ENABLED`] !== 'false',
        };

        // Add command for stdio servers
        if (type === 'stdio' && command) {
          server.command = command;
        }

        // Optional arguments
        const argsEnv = process.env[`${prefix}ARGS`];
        if (argsEnv) {
          server.args = argsEnv.split(',').map(arg => arg.trim());
        }

        // Add URL for http servers (required) and stdio servers (optional)
        if (process.env[`${prefix}URL`]) {
          server.url = process.env[`${prefix}URL`];
        }

        // Optional API key
        if (process.env[`${prefix}API_KEY`]) {
          server.apiKey = process.env[`${prefix}API_KEY`];
        }

        // Retry configuration
        const retryAttemptsEnv = process.env[`${prefix}RETRY_ATTEMPTS`];
        if (retryAttemptsEnv) {
          server.retryAttempts = parseInt(retryAttemptsEnv);
        }
        const retryDelayEnv = process.env[`${prefix}RETRY_DELAY`];
        if (retryDelayEnv) {
          server.retryDelay = parseInt(retryDelayEnv);
        }

        servers.push(server as MCPServerConfig);
      }
    });

    return servers;
  }

  getConfig(): Config {
    return this.config;
  }

  getProvider(name: string) {
    return this.config.providers[name];
  }

  getDefaultProvider() {
    if (!this.config.default_provider) {
      throw new Error('No default provider configured');
    }
    return this.config.providers[this.config.default_provider];
  }

  getAllProviders() {
    return this.config.providers;
  }

  updateConfig(updates: Partial<Config>) {
    this.config = { ...this.config, ...updates };
  }
}