import { ConversationMessage } from '../config/types.js';

/**
 * Phases in the guardrail pipeline where plugins can intercept
 */
export type GuardrailPhase =
  | 'pre_request' // Before LLM API call
  | 'post_response' // After LLM response, before tool handling
  | 'pre_tool_input' // Before MCP tool execution
  | 'post_tool_output' // After MCP tool returns
  | 'pre_cache'; // Before caching response

/**
 * Action to take after guardrail evaluation
 */
export type GuardrailAction = 'allow' | 'block' | 'modify';

/**
 * Severity levels for violations
 */
export type ViolationSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * A violation detected by a guardrail plugin
 */
export interface GuardrailViolation {
  pluginName: string;
  phase: GuardrailPhase;
  rule: string;
  severity: ViolationSeverity;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * A modification made by a guardrail plugin
 */
export interface GuardrailModification {
  pluginName: string;
  phase: GuardrailPhase;
  field: string;
  originalValue?: unknown;
  newValue?: unknown;
  reason: string;
}

/**
 * Context passed through the guardrail pipeline
 */
export interface GuardrailContext {
  // Request metadata
  requestId: string;
  provider: string;
  model: string;
  timestamp: Date;

  // Phase-specific data (mutable by plugins)
  messages: ConversationMessage[];
  prompt?: string;
  response?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;

  // Tracking data (persisted across phases)
  metadata: Map<string, unknown>; // For plugins to store state
  violations: GuardrailViolation[]; // Accumulated violations
  modifications: GuardrailModification[]; // Tracking changes made
}

/**
 * Result from a guardrail plugin execution
 */
export interface GuardrailResult {
  action: GuardrailAction;
  context: GuardrailContext;
  blockedBy?: string; // Plugin name that blocked
  blockReason?: string;
}

/**
 * Base interface for guardrail plugins
 */
export interface GuardrailPlugin {
  /** Unique plugin name */
  name: string;

  /** Whether the plugin is currently enabled */
  enabled: boolean;

  /** Execution priority (lower = runs first) */
  priority: number;

  /** Which phases this plugin handles */
  phases: GuardrailPhase[];

  /** Initialize the plugin with its configuration */
  initialize(config: Record<string, unknown>): Promise<void>;

  /** Execute the plugin for a specific phase */
  execute(phase: GuardrailPhase, context: GuardrailContext): Promise<GuardrailResult>;

  /** Cleanup plugin resources */
  shutdown(): Promise<void>;
}

/**
 * Options for creating a guardrail context
 */
export interface CreateContextOptions {
  requestId?: string;
  provider?: string;
  model?: string;
  messages?: ConversationMessage[];
  prompt?: string;
  response?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
}
