import { ConversationMessage } from '../config/types.js';

export interface ProviderOptions {
  apiKey?: string;
  baseURL: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  maxRetries?: number;
  systemPrompt?: string;
}

export interface ChatOptions {
  messages: ConversationMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason?: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}