import { ConversationMessage } from '../config/types.js';
import { FunctionDefinition } from '../services/function-bridge.js';

export interface ModelInfo {
  id: string;
  created?: number;
  owned_by?: string;
  object?: string;
  context_window?: number;
  description?: string;
}

export interface ProviderOptions {
  apiKey?: string;
  baseURL: string;
  model: string;
  availableModels?: string[];
  temperature?: number;
  timeout?: number;
  maxRetries?: number;
  systemPrompt?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatOptions {
  messages: ConversationMessage[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  systemPrompt?: string;
  tools?: FunctionDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
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
  toolCalls?: ToolCall[];
}

export interface StreamChunk {
  content: string;
  done: boolean;
}