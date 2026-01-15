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

export const ModelPricingSchema = z.object({
  inputPricePerMillion: z.number().min(0),
  outputPricePerMillion: z.number().min(0),
});

export const PricingConfigSchema = z.record(
  z.string(), // provider name
  z.record(z.string(), ModelPricingSchema) // model name -> pricing
);

// Guardrails Plugin Configs
export const RateLimiterConfigSchema = z.object({
  enabled: z.boolean().default(false),
  priority: z.number().min(0).max(1000).default(10),
  requests_per_minute: z.number().min(1).default(60),
  requests_per_hour: z.number().min(1).default(1000),
  per_provider: z.boolean().default(false),
  burst_allowance: z.number().min(0).default(5),
});

export const TokenLimiterConfigSchema = z.object({
  enabled: z.boolean().default(false),
  priority: z.number().min(0).max(1000).default(20),
  max_input_tokens: z.number().min(1).default(8192),
  max_output_tokens: z.number().min(1).optional(),
  warn_at_percentage: z.number().min(0).max(100).default(80),
});

export const PatternBlockerConfigSchema = z.object({
  enabled: z.boolean().default(false),
  priority: z.number().min(0).max(1000).default(30),
  blocked_patterns: z.array(z.string()).default([]),
  blocked_patterns_regex: z.array(z.string()).default([]),
  case_sensitive: z.boolean().default(false),
  action_on_match: z.enum(['block', 'warn', 'redact']).default('block'),
});

export const PIIRedactorConfigSchema = z.object({
  enabled: z.boolean().default(false),
  priority: z.number().min(0).max(1000).default(25),
  detect_emails: z.boolean().default(true),
  detect_phones: z.boolean().default(true),
  detect_ssn: z.boolean().default(true),
  detect_api_keys: z.boolean().default(true),
  detect_credit_cards: z.boolean().default(true),
  detect_ip_addresses: z.boolean().default(false),
  custom_patterns: z
    .array(
      z.object({
        name: z.string(),
        pattern: z.string(),
        placeholder: z.string(),
      })
    )
    .default([]),
  allowlist: z.array(z.string()).default([]),
  allowlist_domains: z.array(z.string()).default([]),
  restore_on_response: z.boolean().default(false),
  log_detections: z.boolean().default(true),
});

export const GuardrailsPluginsConfigSchema = z.object({
  rate_limiter: RateLimiterConfigSchema.optional(),
  token_limiter: TokenLimiterConfigSchema.optional(),
  pattern_blocker: PatternBlockerConfigSchema.optional(),
  pii_redactor: PIIRedactorConfigSchema.optional(),
});

export const GuardrailsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  log_violations: z.boolean().default(true),
  log_modifications: z.boolean().default(false),
  fail_open: z.boolean().default(false), // If true, allow on plugin errors
  plugins: GuardrailsPluginsConfigSchema.optional(),
});

export const ConfigSchema = z.object({
  providers: z.record(z.string(), ProviderConfigSchema),
  default_provider: z.string().optional(),
  default_temperature: z.number().min(0).max(2).default(0.7),
  cache_ttl: z.number().min(0).default(300), // 5 minutes
  enable_failover: z.boolean().default(true),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  mcp_bridge: MCPBridgeConfigSchema.optional(),
  pricing: PricingConfigSchema.optional(),
  guardrails: GuardrailsConfigSchema.optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type MCPBridgeConfig = z.infer<typeof MCPBridgeConfigSchema>;
export type ModelPricing = z.infer<typeof ModelPricingSchema>;
export type PricingConfig = z.infer<typeof PricingConfigSchema>;
export type RateLimiterConfig = z.infer<typeof RateLimiterConfigSchema>;
export type TokenLimiterConfig = z.infer<typeof TokenLimiterConfigSchema>;
export type PatternBlockerConfig = z.infer<typeof PatternBlockerConfigSchema>;
export type PIIRedactorConfig = z.infer<typeof PIIRedactorConfigSchema>;
export type GuardrailsPluginsConfig = z.infer<typeof GuardrailsPluginsConfigSchema>;
export type GuardrailsConfig = z.infer<typeof GuardrailsConfigSchema>;
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

// Consensus & Voting Types
export interface VoteResult {
  voter: string;
  nickname: string;
  choice: string;
  confidence: number;
  reasoning: string;
  rawResponse: string;
}

export interface AggregatedVote {
  question: string;
  options: string[];
  winner: string | null;
  isTie: boolean;
  tally: Record<string, number>;
  confidenceByOption: Record<string, number>;
  votes: VoteResult[];
  totalVoters: number;
  validVotes: number;
  consensusLevel: 'unanimous' | 'majority' | 'plurality' | 'split' | 'none';
}

// Judge Evaluation Types
export interface JudgeRanking {
  provider: string;
  nickname: string;
  rank: number;
  score: number;
  justification: string;
}

export interface JudgeEvaluation {
  judge: string;
  judgeNickname: string;
  prompt: string;
  criteria: string[];
  rankings: JudgeRanking[];
  criteriaScores: Record<string, Record<string, number>>;
  summary: string;
  rawResponse: string;
}

// Iteration Types
export interface IterationRound {
  round: number;
  provider: string;
  nickname: string;
  role: 'generator' | 'critic' | 'refiner';
  content: string;
  timestamp: Date;
}

export interface IterationResult {
  prompt: string;
  mode: 'refine' | 'critique-improve';
  providers: [string, string];
  rounds: IterationRound[];
  finalResponse: string;
  totalIterations: number;
  converged: boolean;
}

// Debate Types
export type DebateFormat = 'oxford' | 'socratic' | 'adversarial';
export type DebatePosition = 'pro' | 'con' | 'neutral';

export interface DebateParticipant {
  provider: string;
  nickname: string;
  position: DebatePosition;
}

export interface DebateArgument {
  round: number;
  provider: string;
  nickname: string;
  position: DebatePosition;
  content: string;
  timestamp: Date;
}

export interface DebateResult {
  topic: string;
  format: DebateFormat;
  participants: DebateParticipant[];
  rounds: DebateArgument[][];
  synthesis: string;
  synthesizer: string;
  totalRounds: number;
}

// Usage Statistics Types
export interface ModelUsageStats {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cacheHits: number;
  errors: number;
}

export interface DailyUsage {
  [provider: string]: {
    [model: string]: ModelUsageStats;
  };
}

export interface UsageData {
  version: number;
  daily: Record<string, DailyUsage>;
}

export type UsageTimePeriod = 'today' | '7d' | '30d' | 'all';

export interface UsageStatsResult {
  period: UsageTimePeriod;
  startDate: string;
  endDate: string;
  usage: DailyUsage;
  totals: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    cacheHits: number;
    errors: number;
    estimatedCostUSD?: number;
  };
  costByProvider?: Record<string, number>;
}