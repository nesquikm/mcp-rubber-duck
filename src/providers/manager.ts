import { DuckProvider } from './provider.js';
import { ConfigManager } from '../config/config.js';
import { ProviderHealth, DuckResponse } from '../config/types.js';
import { ChatOptions, ModelInfo, IDuckProvider } from './types.js';
import { CLIDuckProvider, resolvePreset } from './cli/index.js';
import { UsageService } from '../services/usage.js';
import { GuardrailsService } from '../guardrails/service.js';
import { logger } from '../utils/logger.js';
import { getRandomDuckMessage } from '../utils/ascii-art.js';

export class ProviderManager {
  private providers: Map<string, IDuckProvider> = new Map();
  private healthStatus: Map<string, ProviderHealth> = new Map();
  protected configManager: ConfigManager;
  protected usageService?: UsageService;
  protected guardrailsService?: GuardrailsService;
  private defaultProvider?: string;

  constructor(configManager: ConfigManager, usageService?: UsageService, guardrailsService?: GuardrailsService) {
    this.configManager = configManager;
    this.usageService = usageService;
    this.guardrailsService = guardrailsService;
    this.initializeProviders();
  }

  private initializeProviders() {
    const config = this.configManager.getConfig();
    const allProviders = config.providers;

    for (const [name, providerConfig] of Object.entries(allProviders)) {
      try {
        let provider: IDuckProvider;

        if (providerConfig.type === 'cli') {
          const resolved = resolvePreset(providerConfig);
          provider = new CLIDuckProvider(name, resolved);
          logger.info(`Initialized CLI provider: ${name} (${providerConfig.nickname}) [${providerConfig.cli_type}]`);
        } else {
          provider = new DuckProvider(name, providerConfig.nickname, {
            apiKey: providerConfig.api_key,
            baseURL: providerConfig.base_url,
            model: providerConfig.default_model,
            availableModels: providerConfig.models,
            temperature: providerConfig.temperature,
            timeout: providerConfig.timeout,
            maxRetries: providerConfig.max_retries,
            systemPrompt: providerConfig.system_prompt,
          }, this.guardrailsService);
          logger.info(`Initialized provider: ${name} (${providerConfig.nickname})`);
        }

        this.providers.set(name, provider);
      } catch (error) {
        logger.error(`Failed to initialize provider ${name}:`, error);
      }
    }

    this.defaultProvider = config.default_provider;

    if (this.providers.size === 0) {
      throw new Error('No providers could be initialized');
    }
  }

  async checkHealth(providerName?: string): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];
    const providersToCheck = providerName 
      ? [this.providers.get(providerName)].filter(Boolean)
      : Array.from(this.providers.values());

    for (const provider of providersToCheck) {
      if (!provider) continue;
      
      const startTime = Date.now();
      try {
        const healthy = await provider.healthCheck();
        const health: ProviderHealth = {
          provider: provider.name,
          healthy,
          latency: Date.now() - startTime,
          lastCheck: new Date(),
        };
        
        this.healthStatus.set(provider.name, health);
        results.push(health);
      } catch (error: unknown) {
        const health: ProviderHealth = {
          provider: provider.name,
          healthy: false,
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : String(error),
        };
        
        this.healthStatus.set(provider.name, health);
        results.push(health);
      }
    }

    return results;
  }

  async askDuck(
    providerName: string | undefined,
    prompt: string,
    options?: Partial<ChatOptions>
  ): Promise<DuckResponse> {
    const provider = this.getProvider(providerName);
    const startTime = Date.now();
    const modelToUse = options?.model || provider.getInfo().model;

    try {
      const response = await provider.chat({
        messages: [{ role: 'user', content: prompt, timestamp: new Date() }],
        ...options,
      });

      // Record usage
      if (this.usageService && response.usage) {
        this.usageService.recordUsage(
          provider.name,
          response.model,
          response.usage.promptTokens,
          response.usage.completionTokens,
          false
        );
      }

      return {
        provider: provider.name,
        nickname: provider.nickname,
        model: response.model,
        content: response.content,
        usage: response.usage ? {
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens,
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        } : undefined,
        latency: Date.now() - startTime,
      };
    } catch (error: unknown) {
      // Record error
      if (this.usageService) {
        this.usageService.recordUsage(provider.name, modelToUse, 0, 0, true);
      }

      // Try failover if enabled
      if (this.configManager.getConfig().enable_failover && providerName === undefined) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Primary provider failed, attempting failover: ${errorMessage}`);
        return this.askWithFailover(prompt, options, provider.name);
      }
      throw error;
    }
  }

  async compareDucks(
    prompt: string,
    providerNames?: string[],
    options?: Partial<ChatOptions>
  ): Promise<DuckResponse[]> {
    const providersToUse = providerNames 
      ? providerNames.map(name => this.providers.get(name)).filter(Boolean)
      : Array.from(this.providers.values());

    if (providersToUse.length === 0) {
      throw new Error('No valid providers specified');
    }

    const promises = providersToUse.map(provider => 
      provider ? this.askDuck(provider.name, prompt, options).catch(error => ({
        provider: provider.name,
        nickname: provider.nickname,
        model: '',
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        latency: 0,
      })) : Promise.resolve({
        provider: 'unknown',
        nickname: 'Unknown',
        model: '',
        content: 'Error: Invalid provider',
        latency: 0,
      })
    );

    return Promise.all(promises);
  }

  async compareDucksWithProgress(
    prompt: string,
    providerNames: string[] | undefined,
    options: Partial<ChatOptions> | undefined,
    onProviderComplete: (providerName: string, completed: number, total: number) => void
  ): Promise<DuckResponse[]> {
    const providersToUse = providerNames
      ? providerNames.map(name => this.providers.get(name)).filter(Boolean)
      : Array.from(this.providers.values());

    if (providersToUse.length === 0) {
      throw new Error('No valid providers specified');
    }

    const total = providersToUse.length;
    let completed = 0;

    const promises = providersToUse.map(provider =>
      provider ? this.askDuck(provider.name, prompt, options)
        .catch(error => ({
          provider: provider.name,
          nickname: provider.nickname,
          model: '',
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          latency: 0,
        }))
        .then(result => {
          completed++;
          onProviderComplete(provider.name, completed, total);
          return result;
        })
      : Promise.resolve({
          provider: 'unknown',
          nickname: 'Unknown',
          model: '',
          content: 'Error: Invalid provider',
          latency: 0,
        })
    );

    return Promise.all(promises);
  }

  async duckCouncil(
    prompt: string,
    options?: Partial<ChatOptions>
  ): Promise<DuckResponse[]> {
    return this.compareDucks(prompt, undefined, options);
  }

  private async askWithFailover(
    prompt: string,
    options: Partial<ChatOptions> | undefined,
    failedProvider: string
  ): Promise<DuckResponse> {
    const availableProviders = Array.from(this.providers.keys()).filter(
      name => name !== failedProvider
    );

    for (const providerName of availableProviders) {
      try {
        logger.info(`${getRandomDuckMessage('failover')} Trying ${providerName}...`);
        return await this.askDuck(providerName, prompt, options);
      } catch (error) {
        logger.warn(`Failover to ${providerName} failed:`, error);
        continue;
      }
    }

    throw new Error('All ducks have flown away! No providers available.');
  }

  getProvider(name?: string): IDuckProvider {
    const providerName = name || this.defaultProvider;

    if (!providerName) {
      throw new Error('No provider specified and no default provider configured');
    }

    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Duck "${providerName}" not found in the pond`);
    }

    return provider;
  }

  getAllProviders(): Array<{ name: string; info: ReturnType<IDuckProvider['getInfo']>; health?: ProviderHealth }> {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      info: provider.getInfo(),
      health: this.healthStatus.get(name),
    }));
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  async getAvailableModels(providerName: string): Promise<ModelInfo[]> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }
    return provider.listModels();
  }

  async getAllModels(): Promise<Map<string, ModelInfo[]>> {
    const allModels = new Map<string, ModelInfo[]>();
    
    for (const [name, provider] of this.providers) {
      try {
        const models = await provider.listModels();
        allModels.set(name, models);
      } catch (error) {
        logger.error(`Failed to get models for ${name}:`, error);
        allModels.set(name, []);
      }
    }
    
    return allModels;
  }

  validateModel(providerName: string, modelId: string): boolean {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return false;
    }
    
    const info = provider.getInfo();
    if (info.availableModels) {
      return info.availableModels.includes(modelId);
    }
    
    // If no models list, accept any model (let the API validate)
    return true;
  }
}