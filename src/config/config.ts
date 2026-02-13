import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';
import {
  Config,
  ConfigSchema,
  ProviderConfig,
  CLIProviderConfig,
  MCPBridgeConfig,
  MCPServerConfig,
  GuardrailsConfig,
} from './types.js';
import { logger } from '../utils/logger.js';

dotenv.config();

function safeParseInt(value: string): number | undefined {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}

function safeParseFloat(value: string): number | undefined {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? undefined : parsed;
}

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
      const temp = safeParseFloat(process.env.DEFAULT_TEMPERATURE);
      if (temp !== undefined) merged.default_temperature = temp;
    }
    if (process.env.LOG_LEVEL) {
      merged.log_level = process.env.LOG_LEVEL;
    }

    // Apply MCP bridge configuration from environment
    merged.mcp_bridge = this.getMCPBridgeConfig(merged.mcp_bridge as Partial<MCPBridgeConfig>);

    // Apply guardrails configuration from environment
    merged.guardrails = this.getGuardrailsConfig(merged.guardrails as Partial<GuardrailsConfig>);

    return merged;
  }

  private getDefaultProviders(): Record<string, ProviderConfig> {
    const providers: Record<string, ProviderConfig> = {};

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      providers.openai = {
        type: 'http' as const,
        api_key: process.env.OPENAI_API_KEY,
        base_url: 'https://api.openai.com/v1',
        models: ['gpt-5.1', 'gpt-4.1', 'gpt-4o'],
        default_model: process.env.OPENAI_DEFAULT_MODEL || 'gpt-5.1',
        nickname: process.env.OPENAI_NICKNAME || 'GPT Duck',
      };
    }

    // Google Gemini
    if (process.env.GEMINI_API_KEY) {
      providers.gemini = {
        type: 'http' as const,
        api_key: process.env.GEMINI_API_KEY,
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        models: ['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
        default_model: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash',
        nickname: process.env.GEMINI_NICKNAME || 'Gemini Duck',
      };
    }

    // Groq
    if (process.env.GROQ_API_KEY) {
      providers.groq = {
        type: 'http' as const,
        api_key: process.env.GROQ_API_KEY,
        base_url: 'https://api.groq.com/openai/v1',
        models: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'llama-3.3-70b-versatile'],
        default_model: process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile',
        nickname: process.env.GROQ_NICKNAME || 'Groq Duck',
      };
    }

    // Local Ollama (only if explicitly configured)
    if (process.env.OLLAMA_BASE_URL || process.env.ENABLE_OLLAMA === 'true') {
      providers.ollama = {
        type: 'http' as const,
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

    // Add CLI providers from environment
    const cliProviders = this.getCLIProvidersFromEnv();
    Object.assign(providers, cliProviders);

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
      const timeout = safeParseInt(process.env.MCP_APPROVAL_TIMEOUT);
      if (timeout !== undefined) mcpConfig.approval_timeout = timeout;
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
          type: 'http' as const,
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

  private getCLIProvidersFromEnv(): Record<string, ProviderConfig> {
    const providers: Record<string, ProviderConfig> = {};

    // Known CLI presets: CLI_CLAUDE_ENABLED, CLI_CODEX_ENABLED, etc.
    const presets: Record<string, { cli_type: CLIProviderConfig['cli_type']; defaultNickname: string }> = {
      CLAUDE: { cli_type: 'claude', defaultNickname: 'Claude Agent' },
      CODEX: { cli_type: 'codex', defaultNickname: 'Codex Agent' },
      GEMINI: { cli_type: 'gemini', defaultNickname: 'Gemini Agent' },
      GROK: { cli_type: 'grok', defaultNickname: 'Grok Agent' },
      AIDER: { cli_type: 'aider', defaultNickname: 'Aider Agent' },
    };

    for (const [envName, preset] of Object.entries(presets)) {
      if (process.env[`CLI_${envName}_ENABLED`] === 'true') {
        const prefix = `CLI_${envName}_`;
        const cliArgsStr = process.env[`${prefix}CLI_ARGS`];

        providers[`cli-${envName.toLowerCase()}`] = {
          type: 'cli' as const,
          cli_type: preset.cli_type,
          nickname: process.env[`${prefix}NICKNAME`] || preset.defaultNickname,
          ...(process.env[`${prefix}DEFAULT_MODEL`] && {
            default_model: process.env[`${prefix}DEFAULT_MODEL`],
          }),
          ...(process.env[`${prefix}SYSTEM_PROMPT`] && {
            system_prompt: process.env[`${prefix}SYSTEM_PROMPT`],
          }),
          ...(cliArgsStr && {
            cli_args: cliArgsStr.split(',').map(a => a.trim()),
          }),
        };
      }
    }

    // Custom CLI providers: CLI_CUSTOM_{NAME}_COMMAND
    const customNames = new Set<string>();
    Object.keys(process.env).forEach(key => {
      const match = key.match(/^CLI_CUSTOM_(.+)_(COMMAND|PROMPT_DELIVERY|PROMPT_FLAG|OUTPUT_FORMAT|NICKNAME|DEFAULT_MODEL|CLI_ARGS|PROCESS_TIMEOUT|WORKING_DIRECTORY)$/);
      if (match) {
        customNames.add(match[1]);
      }
    });

    customNames.forEach(name => {
      const prefix = `CLI_CUSTOM_${name}_`;
      const command = process.env[`${prefix}COMMAND`];

      if (command) {
        const cliArgsStr = process.env[`${prefix}CLI_ARGS`];
        const promptDelivery = process.env[`${prefix}PROMPT_DELIVERY`] as 'flag' | 'positional' | 'stdin' | undefined;
        const outputFormat = process.env[`${prefix}OUTPUT_FORMAT`] as 'text' | 'json' | 'jsonl' | undefined;

        providers[`cli-${name.toLowerCase()}`] = {
          type: 'cli' as const,
          cli_type: 'custom' as const,
          cli_command: command,
          nickname: process.env[`${prefix}NICKNAME`] || `${name} Agent`,
          ...(promptDelivery && { prompt_delivery: promptDelivery }),
          ...(process.env[`${prefix}PROMPT_FLAG`] && {
            prompt_flag: process.env[`${prefix}PROMPT_FLAG`],
          }),
          ...(outputFormat && { output_format: outputFormat }),
          ...(process.env[`${prefix}DEFAULT_MODEL`] && {
            default_model: process.env[`${prefix}DEFAULT_MODEL`],
          }),
          ...(cliArgsStr && {
            cli_args: cliArgsStr.split(',').map(a => a.trim()),
          }),
          ...(process.env[`${prefix}PROCESS_TIMEOUT`] && safeParseInt(process.env[`${prefix}PROCESS_TIMEOUT`]!) !== undefined && {
            process_timeout: safeParseInt(process.env[`${prefix}PROCESS_TIMEOUT`]!)!,
          }),
          ...(process.env[`${prefix}WORKING_DIRECTORY`] && {
            working_directory: process.env[`${prefix}WORKING_DIRECTORY`],
          }),
        };
      }
    });

    return providers;
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
          const val = safeParseInt(retryAttemptsEnv);
          if (val !== undefined) server.retryAttempts = val;
        }
        const retryDelayEnv = process.env[`${prefix}RETRY_DELAY`];
        if (retryDelayEnv) {
          const val = safeParseInt(retryDelayEnv);
          if (val !== undefined) server.retryDelay = val;
        }

        servers.push(server as MCPServerConfig);
      }
    });

    return servers;
  }

  private getGuardrailsConfig(
    existingConfig: Partial<GuardrailsConfig> = {}
  ): Partial<GuardrailsConfig> | undefined {
    // Don't override if guardrails is explicitly disabled
    if (existingConfig?.enabled === false) {
      return existingConfig;
    }

    const guardrailsConfig: Partial<GuardrailsConfig> = { ...existingConfig };

    // Enable guardrails if environment variable is set
    if (process.env.GUARDRAILS_ENABLED !== undefined) {
      guardrailsConfig.enabled = process.env.GUARDRAILS_ENABLED === 'true';
    }

    // Global guardrails settings
    if (process.env.GUARDRAILS_LOG_VIOLATIONS !== undefined) {
      guardrailsConfig.log_violations = process.env.GUARDRAILS_LOG_VIOLATIONS === 'true';
    }
    if (process.env.GUARDRAILS_LOG_MODIFICATIONS !== undefined) {
      guardrailsConfig.log_modifications = process.env.GUARDRAILS_LOG_MODIFICATIONS === 'true';
    }
    if (process.env.GUARDRAILS_FAIL_OPEN !== undefined) {
      guardrailsConfig.fail_open = process.env.GUARDRAILS_FAIL_OPEN === 'true';
    }

    // Initialize plugins object if any plugin env vars are set
    const plugins = this.getGuardrailsPluginsFromEnv(guardrailsConfig.plugins || {});
    if (Object.keys(plugins).length > 0) {
      guardrailsConfig.plugins = plugins;
      // Auto-enable guardrails if any plugin is enabled
      if (!guardrailsConfig.enabled) {
        const anyEnabled = Object.values(plugins).some(
          (p) => p && typeof p === 'object' && 'enabled' in p && (p as { enabled?: boolean }).enabled === true
        );
        if (anyEnabled) {
          guardrailsConfig.enabled = true;
        }
      }
    }

    return guardrailsConfig.enabled ? guardrailsConfig : undefined;
  }

  private getGuardrailsPluginsFromEnv(
    existingPlugins: Record<string, unknown>
  ): Record<string, unknown> {
    const plugins: Record<string, unknown> = { ...existingPlugins };

    // Rate Limiter
    if (
      process.env.GUARDRAILS_RATE_LIMITER_ENABLED !== undefined ||
      existingPlugins.rate_limiter
    ) {
      plugins.rate_limiter = {
        ...(existingPlugins.rate_limiter as object),
        ...(process.env.GUARDRAILS_RATE_LIMITER_ENABLED !== undefined && {
          enabled: process.env.GUARDRAILS_RATE_LIMITER_ENABLED === 'true',
        }),
        ...(process.env.GUARDRAILS_RATE_LIMITER_REQUESTS_PER_MINUTE && safeParseInt(process.env.GUARDRAILS_RATE_LIMITER_REQUESTS_PER_MINUTE) !== undefined && {
          requests_per_minute: safeParseInt(process.env.GUARDRAILS_RATE_LIMITER_REQUESTS_PER_MINUTE)!,
        }),
        ...(process.env.GUARDRAILS_RATE_LIMITER_REQUESTS_PER_HOUR && safeParseInt(process.env.GUARDRAILS_RATE_LIMITER_REQUESTS_PER_HOUR) !== undefined && {
          requests_per_hour: safeParseInt(process.env.GUARDRAILS_RATE_LIMITER_REQUESTS_PER_HOUR)!,
        }),
        ...(process.env.GUARDRAILS_RATE_LIMITER_PER_PROVIDER !== undefined && {
          per_provider: process.env.GUARDRAILS_RATE_LIMITER_PER_PROVIDER === 'true',
        }),
        ...(process.env.GUARDRAILS_RATE_LIMITER_BURST_ALLOWANCE && safeParseInt(process.env.GUARDRAILS_RATE_LIMITER_BURST_ALLOWANCE) !== undefined && {
          burst_allowance: safeParseInt(process.env.GUARDRAILS_RATE_LIMITER_BURST_ALLOWANCE)!,
        }),
      };
    }

    // Token Limiter
    if (
      process.env.GUARDRAILS_TOKEN_LIMITER_ENABLED !== undefined ||
      existingPlugins.token_limiter
    ) {
      plugins.token_limiter = {
        ...(existingPlugins.token_limiter as object),
        ...(process.env.GUARDRAILS_TOKEN_LIMITER_ENABLED !== undefined && {
          enabled: process.env.GUARDRAILS_TOKEN_LIMITER_ENABLED === 'true',
        }),
        ...(process.env.GUARDRAILS_TOKEN_LIMITER_MAX_INPUT_TOKENS && safeParseInt(process.env.GUARDRAILS_TOKEN_LIMITER_MAX_INPUT_TOKENS) !== undefined && {
          max_input_tokens: safeParseInt(process.env.GUARDRAILS_TOKEN_LIMITER_MAX_INPUT_TOKENS)!,
        }),
        ...(process.env.GUARDRAILS_TOKEN_LIMITER_MAX_OUTPUT_TOKENS && safeParseInt(process.env.GUARDRAILS_TOKEN_LIMITER_MAX_OUTPUT_TOKENS) !== undefined && {
          max_output_tokens: safeParseInt(process.env.GUARDRAILS_TOKEN_LIMITER_MAX_OUTPUT_TOKENS)!,
        }),
        ...(process.env.GUARDRAILS_TOKEN_LIMITER_WARN_AT_PERCENTAGE && safeParseInt(process.env.GUARDRAILS_TOKEN_LIMITER_WARN_AT_PERCENTAGE) !== undefined && {
          warn_at_percentage: safeParseInt(process.env.GUARDRAILS_TOKEN_LIMITER_WARN_AT_PERCENTAGE)!,
        }),
      };
    }

    // Pattern Blocker
    if (
      process.env.GUARDRAILS_PATTERN_BLOCKER_ENABLED !== undefined ||
      existingPlugins.pattern_blocker
    ) {
      plugins.pattern_blocker = {
        ...(existingPlugins.pattern_blocker as object),
        ...(process.env.GUARDRAILS_PATTERN_BLOCKER_ENABLED !== undefined && {
          enabled: process.env.GUARDRAILS_PATTERN_BLOCKER_ENABLED === 'true',
        }),
        ...(process.env.GUARDRAILS_PATTERN_BLOCKER_PATTERNS && {
          blocked_patterns: process.env.GUARDRAILS_PATTERN_BLOCKER_PATTERNS.split(',').map((p) =>
            p.trim()
          ),
        }),
        ...(process.env.GUARDRAILS_PATTERN_BLOCKER_PATTERNS_REGEX && {
          blocked_patterns_regex: process.env.GUARDRAILS_PATTERN_BLOCKER_PATTERNS_REGEX.split(
            ','
          ).map((p) => p.trim()),
        }),
        ...(process.env.GUARDRAILS_PATTERN_BLOCKER_CASE_SENSITIVE !== undefined && {
          case_sensitive: process.env.GUARDRAILS_PATTERN_BLOCKER_CASE_SENSITIVE === 'true',
        }),
        ...(process.env.GUARDRAILS_PATTERN_BLOCKER_ACTION && {
          action_on_match: process.env.GUARDRAILS_PATTERN_BLOCKER_ACTION as
            | 'block'
            | 'warn'
            | 'redact',
        }),
      };
    }

    // PII Redactor
    if (
      process.env.GUARDRAILS_PII_REDACTOR_ENABLED !== undefined ||
      existingPlugins.pii_redactor
    ) {
      plugins.pii_redactor = {
        ...(existingPlugins.pii_redactor as object),
        ...(process.env.GUARDRAILS_PII_REDACTOR_ENABLED !== undefined && {
          enabled: process.env.GUARDRAILS_PII_REDACTOR_ENABLED === 'true',
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_DETECT_EMAILS !== undefined && {
          detect_emails: process.env.GUARDRAILS_PII_REDACTOR_DETECT_EMAILS === 'true',
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_DETECT_PHONES !== undefined && {
          detect_phones: process.env.GUARDRAILS_PII_REDACTOR_DETECT_PHONES === 'true',
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_DETECT_SSN !== undefined && {
          detect_ssn: process.env.GUARDRAILS_PII_REDACTOR_DETECT_SSN === 'true',
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_DETECT_API_KEYS !== undefined && {
          detect_api_keys: process.env.GUARDRAILS_PII_REDACTOR_DETECT_API_KEYS === 'true',
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_DETECT_CREDIT_CARDS !== undefined && {
          detect_credit_cards: process.env.GUARDRAILS_PII_REDACTOR_DETECT_CREDIT_CARDS === 'true',
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_DETECT_IP_ADDRESSES !== undefined && {
          detect_ip_addresses: process.env.GUARDRAILS_PII_REDACTOR_DETECT_IP_ADDRESSES === 'true',
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_ALLOWLIST && {
          allowlist: process.env.GUARDRAILS_PII_REDACTOR_ALLOWLIST.split(',').map((a) => a.trim()),
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_ALLOWLIST_DOMAINS && {
          allowlist_domains: process.env.GUARDRAILS_PII_REDACTOR_ALLOWLIST_DOMAINS.split(',').map(
            (d) => d.trim()
          ),
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_RESTORE_ON_RESPONSE !== undefined && {
          restore_on_response: process.env.GUARDRAILS_PII_REDACTOR_RESTORE_ON_RESPONSE === 'true',
        }),
        ...(process.env.GUARDRAILS_PII_REDACTOR_LOG_DETECTIONS !== undefined && {
          log_detections: process.env.GUARDRAILS_PII_REDACTOR_LOG_DETECTIONS === 'true',
        }),
      };
    }

    return plugins;
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