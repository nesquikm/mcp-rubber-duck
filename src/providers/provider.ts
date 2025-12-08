import OpenAI from 'openai';
import { ChatOptions, ChatResponse, ProviderOptions, ModelInfo, OpenAIChatParams, OpenAIChatResponse, OpenAIMessage } from './types.js';
import { ConversationMessage } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class DuckProvider {
  protected client: OpenAI;
  protected options: ProviderOptions;
  public name: string;
  public nickname: string;

  constructor(name: string, nickname: string, options: ProviderOptions) {
    this.name = name;
    this.nickname = nickname;
    this.options = options;
    
    this.client = new OpenAI({
      apiKey: options.apiKey || 'not-needed',
      baseURL: options.baseURL,
      timeout: options.timeout || 300000,
      maxRetries: options.maxRetries || 3,
    });
  }

  protected supportsTemperature(model: string): boolean {
    // Reasoning models don't support temperature parameter
    return !model.startsWith('o1') && 
           !model.includes('o1-') &&
           !model.startsWith('o3') &&
           !model.includes('o3-') &&
           !model.startsWith('gpt-5') &&
           !model.includes('gpt-5');
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    try {
      const messages = this.prepareMessages(options.messages, options.systemPrompt);
      const modelToUse = options.model || this.options.model;
      
      const baseParams: Partial<OpenAIChatParams> = {
        model: modelToUse,
        messages: messages as OpenAIMessage[],
        stream: false,
      };

      // Only add temperature if the model supports it
      if (this.supportsTemperature(modelToUse)) {
        baseParams.temperature = options.temperature ?? this.options.temperature ?? 0.7;
      }

      const response = await this.createChatCompletion(baseParams);
      const choice = response.choices[0];
      
      return {
        content: choice.message?.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        model: modelToUse,  // Return the requested model, not the resolved one
        finishReason: choice.finish_reason || undefined,
      };
    } catch (error: unknown) {
      logger.error(`Provider ${this.name} chat error:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Duck ${this.nickname} couldn't respond: ${errorMessage}`);
    }
  }

  protected async createChatCompletion(baseParams: Partial<OpenAIChatParams>): Promise<OpenAIChatResponse> {
    const params = { ...baseParams } as OpenAIChatParams;
    return await this.client.chat.completions.create(params);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const baseParams: Partial<OpenAIChatParams> = {
        model: this.options.model,
        messages: [{ role: 'user', content: 'Say "healthy"' }] as OpenAIMessage[],
        stream: false,
      };

      // Only add temperature if the model supports it
      if (this.supportsTemperature(this.options.model)) {
        baseParams.temperature = 0.5;
      }
      
      // Health check without token limits
      const response = await this.createChatCompletion(baseParams);
      
      const content = response.choices[0]?.message?.content;
      const hasContent = !!content;
      
      if (!hasContent) {
        logger.warn(`Health check for ${this.name}: No content in response`, {
          response: JSON.stringify(response, null, 2)
        });
      } else {
        logger.debug(`Health check for ${this.name} succeeded with response: ${content}`);
      }
      
      return hasContent;
    } catch (error) {
      logger.warn(`Health check failed for ${this.name}:`, error);
      return false;
    }
  }

  protected prepareMessages(
    messages: ConversationMessage[],
    systemPrompt?: string
  ): Array<{ role: string; content: string }> {
    const prepared: Array<{ role: string; content: string }> = [];
    
    // Add system prompt if provided
    const prompt = systemPrompt || this.options.systemPrompt;
    if (prompt) {
      prepared.push({ role: 'system', content: prompt });
    }
    
    // Add conversation messages
    for (const msg of messages) {
      prepared.push({
        role: msg.role,
        content: msg.content,
      });
    }
    
    return prepared;
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      // Try to fetch models from the API
      const response = await this.client.models.list();
      const models: ModelInfo[] = [];
      
      for await (const model of response) {
        models.push({
          id: model.id,
          created: model.created,
          owned_by: model.owned_by,
          object: model.object,
        });
      }
      
      logger.debug(`Fetched ${models.length} models from ${this.name}`);
      return models;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to fetch models from ${this.name}: ${errorMessage}`);
      // Fall back to configured models
      if (this.options.availableModels && this.options.availableModels.length > 0) {
        return this.options.availableModels.map(id => ({
          id,
          description: 'Configured model (not fetched from API)',
        }));
      }
      // Last fallback: return just the default model
      return [{
        id: this.options.model,
        description: 'Default configured model',
      }];
    }
  }

  getInfo() {
    return {
      name: this.name,
      nickname: this.nickname,
      model: this.options.model,
      availableModels: this.options.availableModels,
      baseURL: this.options.baseURL,
      hasApiKey: !!this.options.apiKey,
    };
  }
}