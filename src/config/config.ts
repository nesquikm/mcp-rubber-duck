import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';
import { Config, ConfigSchema } from './types.js';
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
    let rawConfig: any = {};

    // Load from file if exists
    if (this.configPath && existsSync(this.configPath)) {
      try {
        const fileContent = readFileSync(this.configPath, 'utf-8');
        rawConfig = JSON.parse(fileContent);
      } catch (error) {
        logger.error(`Failed to load config file: ${error}`);
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
      logger.error(`Invalid configuration: ${error}`);
      throw new Error(`Configuration validation failed: ${error}`);
    }
  }

  private mergeWithEnv(config: any): any {
    // Replace ${ENV_VAR} patterns with actual environment values
    const configStr = JSON.stringify(config);
    const replaced = configStr.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const value = process.env[envVar];
      if (!value && envVar.includes('API_KEY')) {
        logger.warn(`Environment variable ${envVar} not found`);
      }
      return value || match;
    });
    
    const merged = JSON.parse(replaced);

    // Apply environment overrides
    if (process.env.DEFAULT_PROVIDER) {
      merged.default_provider = process.env.DEFAULT_PROVIDER;
    }
    if (process.env.DEFAULT_TEMPERATURE) {
      merged.default_temperature = parseFloat(process.env.DEFAULT_TEMPERATURE);
    }
    if (process.env.DEFAULT_MAX_TOKENS) {
      merged.default_max_tokens = parseInt(process.env.DEFAULT_MAX_TOKENS);
    }
    if (process.env.LOG_LEVEL) {
      merged.log_level = process.env.LOG_LEVEL;
    }

    return merged;
  }

  private getDefaultProviders(): Record<string, any> {
    const providers: Record<string, any> = {};

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      providers.openai = {
        api_key: process.env.OPENAI_API_KEY,
        base_url: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
        default_model: 'gpt-4o-mini',
        nickname: 'GPT Duck',
      };
    }

    // Groq
    if (process.env.GROQ_API_KEY) {
      providers.groq = {
        api_key: process.env.GROQ_API_KEY,
        base_url: 'https://api.groq.com/openai/v1',
        models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
        default_model: 'llama-3.3-70b-versatile',
        nickname: 'Groq Duck',
      };
    }

    // Local Ollama (no API key needed)
    if (process.env.OLLAMA_BASE_URL || this.isOllamaAvailable()) {
      providers.ollama = {
        api_key: 'not-needed',
        base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
        models: ['llama3.2', 'mistral', 'codellama'],
        default_model: 'llama3.2',
        nickname: 'Local Duck',
      };
    }

    // Custom provider
    if (process.env.CUSTOM_API_KEY && process.env.CUSTOM_BASE_URL) {
      providers.custom = {
        api_key: process.env.CUSTOM_API_KEY,
        base_url: process.env.CUSTOM_BASE_URL,
        models: process.env.CUSTOM_MODELS?.split(',') || ['custom-model'],
        default_model: process.env.CUSTOM_DEFAULT_MODEL || 'custom-model',
        nickname: process.env.CUSTOM_NICKNAME || 'Custom Duck',
      };
    }

    return providers;
  }

  private isOllamaAvailable(): boolean {
    // Simple check - could be enhanced with actual HTTP check
    return process.platform === 'darwin' || process.platform === 'linux';
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