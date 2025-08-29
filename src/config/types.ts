import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  api_key: z.string().optional(),
  base_url: z.string().url(),
  models: z.array(z.string()),
  default_model: z.string(),
  nickname: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  system_prompt: z.string().optional(),
  timeout: z.number().positive().optional(),
  max_retries: z.number().min(0).max(5).optional(),
});

export const ConfigSchema = z.object({
  providers: z.record(z.string(), ProviderConfigSchema),
  default_provider: z.string().optional(),
  default_temperature: z.number().min(0).max(2).default(0.7),
  cache_ttl: z.number().min(0).default(300), // 5 minutes
  enable_failover: z.boolean().default(true),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
  provider?: string;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  provider: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderHealth {
  provider: string;
  healthy: boolean;
  latency?: number;
  lastCheck: Date;
  error?: string;
}

export interface DuckResponse {
  provider: string;
  nickname: string;
  model: string;
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  latency: number;
  cached: boolean;
}