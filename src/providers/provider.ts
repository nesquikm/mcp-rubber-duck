import OpenAI from 'openai';
import { ChatOptions, ChatResponse, ProviderOptions, StreamChunk, ModelInfo } from './types.js';
import { ConversationMessage } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class DuckProvider {
  private client: OpenAI;
  private options: ProviderOptions;
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

  private supportsTemperature(model: string): boolean {
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
      
      const baseParams: any = {
        model: modelToUse,
        messages: messages as any,
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
    } catch (error: any) {
      logger.error(`Provider ${this.name} chat error:`, error);
      throw new Error(`Duck ${this.nickname} couldn't respond: ${error.message}`);
    }
  }

  private async createChatCompletion(baseParams: any): Promise<any> {
    const params = { ...baseParams };
    return await this.client.chat.completions.create(params);
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    try {
      const messages = this.prepareMessages(options.messages, options.systemPrompt);
      const modelToUse = options.model || this.options.model;
      
      const baseParams: any = {
        model: modelToUse,
        messages: messages as any,
        stream: true,
      };

      // Only add temperature if the model supports it
      if (this.supportsTemperature(modelToUse)) {
        baseParams.temperature = options.temperature ?? this.options.temperature ?? 0.7;
      }
      
      const stream = await this.createChatCompletion(baseParams);

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        const done = chunk.choices[0]?.finish_reason !== null;
        
        yield { content, done };
      }
    } catch (error: any) {
      logger.error(`Provider ${this.name} stream error:`, error);
      throw new Error(`Duck ${this.nickname} stream failed: ${error.message}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const baseParams: any = {
        model: this.options.model,
        messages: [{ role: 'user', content: 'Say "healthy"' }],
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

  private prepareMessages(
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
    } catch (error: any) {
      logger.warn(`Failed to fetch models from ${this.name}: ${error.message}`);
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