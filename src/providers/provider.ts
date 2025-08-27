import OpenAI from 'openai';
import { ChatOptions, ChatResponse, ProviderOptions, StreamChunk, ModelInfo } from './types.js';
import { ConversationMessage } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class DuckProvider {
  private client: OpenAI;
  private options: ProviderOptions;
  private useMaxCompletionTokens: boolean | null = null; // Cache which parameter works
  public name: string;
  public nickname: string;

  constructor(name: string, nickname: string, options: ProviderOptions) {
    this.name = name;
    this.nickname = nickname;
    this.options = options;
    
    this.client = new OpenAI({
      apiKey: options.apiKey || 'not-needed',
      baseURL: options.baseURL,
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3,
    });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    try {
      const messages = this.prepareMessages(options.messages, options.systemPrompt);
      const modelToUse = options.model || this.options.model;
      const maxTokens = options.maxTokens ?? this.options.maxTokens ?? 2000;
      
      const baseParams = {
        model: modelToUse,
        messages: messages as any,
        temperature: options.temperature ?? this.options.temperature ?? 0.7,
        stream: false,
      };

      const response = await this.createChatCompletion(baseParams, maxTokens);
      const choice = response.choices[0];
      
      return {
        content: choice.message?.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        model: response.model,
        finishReason: choice.finish_reason || undefined,
      };
    } catch (error: any) {
      logger.error(`Provider ${this.name} chat error:`, error);
      throw new Error(`Duck ${this.nickname} couldn't respond: ${error.message}`);
    }
  }

  private async createChatCompletion(baseParams: any, maxTokens: number): Promise<any> {
    // If we already know which parameter to use, use it
    if (this.useMaxCompletionTokens !== null) {
      const params = { ...baseParams };
      if (this.useMaxCompletionTokens) {
        params.max_completion_tokens = maxTokens;
      } else {
        params.max_tokens = maxTokens;
      }
      return await this.client.chat.completions.create(params);
    }

    // First time - try max_completion_tokens first (newer)
    try {
      const response = await this.client.chat.completions.create({
        ...baseParams,
        max_completion_tokens: maxTokens,
      });
      this.useMaxCompletionTokens = true;
      logger.debug(`Provider ${this.name} uses max_completion_tokens`);
      return response;
    } catch (error: any) {
      // Check if error is about the parameter
      if (error.message?.includes('max_completion_tokens') || 
          error.message?.includes('Unsupported parameter')) {
        // Fallback to max_tokens
        const response = await this.client.chat.completions.create({
          ...baseParams,
          max_tokens: maxTokens,
        });
        this.useMaxCompletionTokens = false;
        logger.debug(`Provider ${this.name} uses max_tokens`);
        return response;
      }
      // Other error - rethrow
      throw error;
    }
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    try {
      const messages = this.prepareMessages(options.messages, options.systemPrompt);
      const modelToUse = options.model || this.options.model;
      const maxTokens = options.maxTokens ?? this.options.maxTokens ?? 2000;
      
      const baseParams = {
        model: modelToUse,
        messages: messages as any,
        temperature: options.temperature ?? this.options.temperature ?? 0.7,
        stream: true,
      };
      
      const stream = await this.createChatCompletion(baseParams, maxTokens);

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
      const baseParams = {
        model: this.options.model,
        messages: [{ role: 'user', content: 'Quack?' }],
        temperature: 0.5,
        stream: false,
      };
      
      // Use reasonable token limit for health check (not 10!)
      const response = await this.createChatCompletion(baseParams, 100);
      
      return !!response.choices[0]?.message?.content;
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