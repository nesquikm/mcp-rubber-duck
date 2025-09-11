import { EnhancedDuckProvider } from './duck-provider-enhanced.js';
import { ProviderManager } from './manager.js';
import { ConfigManager } from '../config/config.js';
import { FunctionBridge } from '../services/function-bridge.js';
import { DuckResponse } from '../config/types.js';
import { ChatOptions, MCPResult } from './types.js';
import { logger } from '../utils/logger.js';

export class EnhancedProviderManager extends ProviderManager {
  private enhancedProviders: Map<string, EnhancedDuckProvider> = new Map();
  private functionBridge?: FunctionBridge;
  private mcpEnabled: boolean = false;

  constructor(configManager: ConfigManager, functionBridge?: FunctionBridge) {
    super(configManager);
    this.functionBridge = functionBridge;
    this.mcpEnabled = !!functionBridge && 
      (configManager.getConfig().mcp_bridge?.enabled || false);
    
    if (this.mcpEnabled) {
      this.initializeEnhancedProviders();
    }
  }

  private initializeEnhancedProviders() {
    if (!this.functionBridge) {
      logger.warn('Function bridge not available, skipping enhanced providers');
      return;
    }

    const config = this.configManager.getConfig();
    const allProviders = config.providers;

    for (const [name, providerConfig] of Object.entries(allProviders)) {
      try {
        // Create enhanced provider if MCP is enabled
        const enhancedProvider = new EnhancedDuckProvider(
          name,
          providerConfig.nickname,
          {
            apiKey: providerConfig.api_key,
            baseURL: providerConfig.base_url,
            model: providerConfig.default_model,
            availableModels: providerConfig.models,
            temperature: providerConfig.temperature,
            timeout: providerConfig.timeout,
            maxRetries: providerConfig.max_retries,
            systemPrompt: providerConfig.system_prompt,
          },
          this.functionBridge,
          this.mcpEnabled
        );

        this.enhancedProviders.set(name, enhancedProvider);
        logger.info(`Initialized enhanced provider: ${name} (${providerConfig.nickname}) with MCP support`);
      } catch (error) {
        logger.error(`Failed to initialize enhanced provider ${name}:`, error);
      }
    }
  }

  getEnhancedProvider(name?: string): EnhancedDuckProvider {
    if (!this.mcpEnabled) {
      throw new Error('MCP bridge is not enabled');
    }

    const providerName = name || this.configManager.getConfig().default_provider;
    
    if (!providerName) {
      throw new Error('No provider specified and no default provider configured');
    }

    const provider = this.enhancedProviders.get(providerName);
    
    if (!provider) {
      throw new Error(`Enhanced duck "${providerName}" not found in the pond`);
    }

    return provider;
  }

  async askDuckWithMCP(
    providerName: string | undefined,
    prompt: string,
    options?: Partial<ChatOptions>
  ): Promise<DuckResponse & { pendingApprovals?: { id: string; message: string }[]; mcpResults?: MCPResult[] }> {
    if (!this.mcpEnabled) {
      // Fall back to regular provider
      return this.askDuck(providerName, prompt, options);
    }

    const provider = this.getEnhancedProvider(providerName);
    const startTime = Date.now();

    try {
      const response = await provider.chat({
        messages: [{ role: 'user', content: prompt, timestamp: new Date() }],
        ...options,
      });

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
        cached: false,
        pendingApprovals: response.pendingApprovals,
        mcpResults: response.mcpResults,
      };
    } catch (error: unknown) {
      // Try failover if enabled
      if (this.configManager.getConfig().enable_failover && providerName === undefined) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Primary enhanced provider failed, attempting failover: ${errorMessage}`);
        return this.askDuckWithMCPFailover(prompt, options, provider.name);
      }
      throw error;
    }
  }

  private async askDuckWithMCPFailover(
    prompt: string,
    options: Partial<ChatOptions> | undefined,
    failedProvider: string
  ): Promise<DuckResponse & { pendingApprovals?: { id: string; message: string }[]; mcpResults?: MCPResult[] }> {
    const availableProviders = Array.from(this.enhancedProviders.keys()).filter(
      name => name !== failedProvider
    );

    for (const providerName of availableProviders) {
      try {
        logger.info(`Trying enhanced failover to ${providerName}...`);
        return await this.askDuckWithMCP(providerName, prompt, options);
      } catch (error) {
        logger.warn(`Enhanced failover to ${providerName} failed:`, error);
        continue;
      }
    }

    throw new Error('All enhanced ducks have flown away! No providers available.');
  }

  async compareDucksWithMCP(
    prompt: string,
    providerNames?: string[],
    options?: Partial<ChatOptions>
  ): Promise<Array<DuckResponse & { pendingApprovals?: { id: string; message: string }[]; mcpResults?: MCPResult[] }>> {
    if (!this.mcpEnabled) {
      // Fall back to regular comparison
      return this.compareDucks(prompt, providerNames, options);
    }

    const providersToUse = providerNames 
      ? providerNames.map(name => this.enhancedProviders.get(name)).filter(Boolean)
      : Array.from(this.enhancedProviders.values());

    if (providersToUse.length === 0) {
      throw new Error('No valid enhanced providers specified');
    }

    const promises = providersToUse.map(provider => 
      provider ? this.askDuckWithMCP(provider.name, prompt, options).catch(error => ({
        provider: provider.name,
        nickname: provider.nickname,
        model: '',
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        latency: 0,
        cached: false,
      })) : Promise.resolve({
        provider: 'unknown',
        nickname: 'Unknown',
        model: '',
        content: 'Error: Invalid provider',
        latency: 0,
        cached: false,
      })
    );

    return Promise.all(promises);
  }

  async duckCouncilWithMCP(
    prompt: string,
    options?: Partial<ChatOptions>
  ): Promise<Array<DuckResponse & { pendingApprovals?: { id: string; message: string }[]; mcpResults?: MCPResult[] }>> {
    return this.compareDucksWithMCP(prompt, undefined, options);
  }

  // Method to retry with approval
  async retryWithApproval(
    approvalId: string,
    providerName: string | undefined,
    prompt: string,
    options?: Partial<ChatOptions>
  ): Promise<DuckResponse & { pendingApprovals?: { id: string; message: string }[]; mcpResults?: MCPResult[] }> {
    if (!this.mcpEnabled) {
      throw new Error('MCP bridge is not enabled');
    }

    const provider = this.getEnhancedProvider(providerName);
    const startTime = Date.now();

    try {
      const response = await provider.retryWithApproval(
        approvalId,
        [{ role: 'user', content: prompt, timestamp: new Date() }],
        {
          messages: [{ role: 'user', content: prompt, timestamp: new Date() }],
          ...options,
        }
      );

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
        cached: false,
        pendingApprovals: response.pendingApprovals,
        mcpResults: response.mcpResults,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to retry with approval: ${errorMessage}`);
    }
  }

  // Get enhanced provider statistics
  getAllEnhancedProviders(): Array<{ 
    name: string; 
    info: ReturnType<EnhancedDuckProvider['getInfo']>; 
    mcpEnabled: boolean;
    mcpStats?: ReturnType<EnhancedDuckProvider['getMCPStats']>;
    functionCount?: number;
  }> {
    return Array.from(this.enhancedProviders.entries()).map(([name, provider]) => ({
      name,
      info: provider.getInfo(),
      mcpEnabled: provider.isMCPEnabled(),
      mcpStats: provider.getMCPStats(),
      functionCount: 0, // Will be populated when functions are loaded
    }));
  }

  // Check if MCP is enabled
  isMCPEnabled(): boolean {
    return this.mcpEnabled;
  }

  // Enable/disable MCP for all providers
  setMCPEnabled(enabled: boolean): void {
    this.mcpEnabled = enabled;
    for (const provider of this.enhancedProviders.values()) {
      provider.setMCPEnabled(enabled);
    }
    logger.info(`MCP ${enabled ? 'enabled' : 'disabled'} for all providers`);
  }

  // Get MCP function count for a provider
  async getMCPFunctionCount(providerName?: string): Promise<number> {
    if (!this.mcpEnabled) {
      return 0;
    }

    try {
      const provider = this.getEnhancedProvider(providerName);
      return await provider.getMCPFunctionCount();
    } catch (error) {
      return 0;
    }
  }
}