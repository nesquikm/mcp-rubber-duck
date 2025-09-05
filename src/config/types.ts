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

export const MCPServerConfigSchema = z.object({
  name: z.string(),
  type: z.enum(['stdio', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  apiKey: z.string().optional(),
  enabled: z.boolean().default(true),
  retryAttempts: z.number().min(0).max(10).default(3),
  retryDelay: z.number().min(100).max(30000).default(1000),
});

export const MCPBridgeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  approval_mode: z.enum(['always', 'trusted', 'never']).default('always'),
  approval_timeout: z.number().min(30).max(3600).default(300), // 5 minutes
  trusted_tools: z.array(z.string()).default([]), // Global fallback trusted tools
  trusted_tools_by_server: z.record(z.string(), z.array(z.string())).optional(), // Per-server trusted tools
  mcp_servers: z.array(MCPServerConfigSchema).default([]),
});

export const ConfigSchema = z.object({
  providers: z.record(z.string(), ProviderConfigSchema),
  default_provider: z.string().optional(),
  default_temperature: z.number().min(0).max(2).default(0.7),
  cache_ttl: z.number().min(0).default(300), // 5 minutes
  enable_failover: z.boolean().default(true),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  mcp_bridge: MCPBridgeConfigSchema.optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type MCPBridgeConfig = z.infer<typeof MCPBridgeConfigSchema>;
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