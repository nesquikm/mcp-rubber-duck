import OpenAI from 'openai';
import { ChatOptions, ChatResponse, ProviderOptions, StreamChunk } from './types.js';
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
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3,
    });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    try {
      const messages = this.prepareMessages(options.messages, options.systemPrompt);
      
      const response = await this.client.chat.completions.create({
        model: this.options.model,
        messages: messages as any,
        temperature: options.temperature ?? this.options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? this.options.maxTokens ?? 2000,
        stream: false,
      });

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

  async *chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    try {
      const messages = this.prepareMessages(options.messages, options.systemPrompt);
      
      const stream = await this.client.chat.completions.create({
        model: this.options.model,
        messages: messages as any,
        temperature: options.temperature ?? this.options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? this.options.maxTokens ?? 2000,
        stream: true,
      });

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
      const response = await this.client.chat.completions.create({
        model: this.options.model,
        messages: [{ role: 'user', content: 'Quack?' }],
        max_tokens: 10,
      });
      
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

  getInfo() {
    return {
      name: this.name,
      nickname: this.nickname,
      model: this.options.model,
      baseURL: this.options.baseURL,
      hasApiKey: !!this.options.apiKey,
    };
  }
}