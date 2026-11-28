import {
  McpServer,
  CLIENT_CAPABILITIES_META_KEY,
  ProtocolError,
  ProtocolErrorCode,
} from '@modelcontextprotocol/server';
import type { CallToolResult, ServerContext } from '@modelcontextprotocol/server';
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';

import { ConfigManager } from './config/config.js';
import { ProviderManager } from './providers/manager.js';
import { EnhancedProviderManager } from './providers/enhanced-manager.js';
import { ConversationManager } from './services/conversation.js';

import { HealthMonitor } from './services/health.js';
import { MCPClientManager } from './services/mcp-client-manager.js';
import { PricingService } from './services/pricing.js';
import { UsageService } from './services/usage.js';
import { DuckResponse, ImageInput, buildContent } from './config/types.js';

/** Extension id of the hand-built tasks extension (SEP-2663). */
const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';

// Shared schema for image inputs used across multiple tools
// Accepts either base64 data+mimeType OR a url (or both)
const ImageInputSchema = z
  .object({
    data: z.string().optional().describe('Base64-encoded image data'),
    url: z.string().optional().describe('Image URL — passed directly to the LLM provider'),
    mimeType: z
      .string()
      .optional()
      .describe('MIME type (e.g., "image/png") — required for base64 data, optional for URLs'),
  })
  .refine((img) => img.data || img.url, {
    message: 'Either "data" (base64) or "url" must be provided',
  })
  .refine((img) => !img.data || img.mimeType, {
    message: '"mimeType" is required when "data" is provided',
  });
import { ApprovalService } from './services/approval.js';
import { FunctionBridge } from './services/function-bridge.js';
import { GuardrailsService } from './guardrails/service.js';
import { createProgressReporter, type ProgressReporter } from './services/progress.js';
import { TaskManager } from './services/task-manager.js';
import { isTerminal } from './services/retention-task-store.js';
import { serveHttp, validateHttpBind, type HttpServerHandle } from './transport/http.js';
import { logger } from './utils/logger.js';
import { getRandomDuckMessage, formatDuckReply, formatDuckFooter } from './utils/ascii-art.js';
import { printWelcomeBanner } from './utils/banner.js';

// Import tools
import { askDuckTool } from './tools/ask-duck.js';
import { chatDuckTool } from './tools/chat-duck.js';
import { clearConversationsTool } from './tools/clear-conversations.js';
import { listDucksTool } from './tools/list-ducks.js';
import { listModelsTool } from './tools/list-models.js';
import { compareDucksTool } from './tools/compare-ducks.js';
import { duckCouncilTool } from './tools/duck-council.js';
import { duckVoteTool } from './tools/duck-vote.js';
import { duckJudgeTool } from './tools/duck-judge.js';
import { duckIterateTool } from './tools/duck-iterate.js';
import { duckDebateTool } from './tools/duck-debate.js';

// Import MCP tools
import { getPendingApprovalsTool } from './tools/get-pending-approvals.js';
import { approveMCPRequestTool } from './tools/approve-mcp-request.js';
import { mcpStatusTool } from './tools/mcp-status.js';

// Import usage stats tool
import { getUsageStatsTool } from './tools/get-usage-stats.js';

// Import prompts
import { PROMPTS } from './prompts/index.js';
import { getPackageVersion } from './utils/version.js';

export class RubberDuckServer {
  private stdioHandle?: StdioServerHandle;
  private httpHandle?: HttpServerHandle;
  private configManager: ConfigManager;
  private pricingService: PricingService;
  private usageService: UsageService;
  private guardrailsService?: GuardrailsService;
  private providerManager: ProviderManager;
  private enhancedProviderManager?: EnhancedProviderManager;
  private conversationManager: ConversationManager;
  private healthMonitor: HealthMonitor;

  // MCP Bridge components
  private mcpClientManager?: MCPClientManager;
  private approvalService?: ApprovalService;
  private functionBridge?: FunctionBridge;
  private mcpEnabled: boolean = false;
  // Process-scoped: tasks outlive the per-connection McpServer instances.
  private taskManager = new TaskManager();

  // Services are built once per process; buildMcpServer() is the cheap
  // per-connection factory that only registers tools/prompts/resources.
  constructor() {
    // Initialize managers
    this.configManager = new ConfigManager();
    const config = this.configManager.getConfig();

    // Initialize pricing and usage services
    this.pricingService = new PricingService(config.pricing);
    this.usageService = new UsageService(this.pricingService);

    // Initialize guardrails service if configured
    if (config.guardrails?.enabled) {
      this.guardrailsService = new GuardrailsService(config.guardrails);
    }

    // Initialize MCP bridge if enabled
    this.initializeMCPBridge();

    // EnhancedProviderManager extends ProviderManager, so with the bridge on it
    // serves both roles and providers are constructed once per process.
    this.providerManager =
      this.enhancedProviderManager ??
      new ProviderManager(this.configManager, this.usageService, this.guardrailsService);
    this.conversationManager = new ConversationManager();
    this.healthMonitor = new HealthMonitor(this.providerManager);
  }

  /**
   * Create a fresh McpServer with every tool, prompt and UI resource registered.
   * Cheap and side-effect free: it reuses the services built in the constructor,
   * so serveStdio may call it more than once per connection (probe + fallback).
   */
  buildMcpServer(): McpServer {
    const server = new McpServer({
      name: 'mcp-rubber-duck',
      version: getPackageVersion(),
    });

    // Hand-built tasks extension (SEP-2663): advertised in capabilities.extensions,
    // which 2026-07-28 clients see on server/discover. No legacy `tasks` key.
    server.server.registerCapabilities({
      extensions: { [TASKS_EXTENSION]: {} },
    });

    this.registerTools(server);
    this.skipOutputValidationForTasks(server);
    this.registerTaskHandlers(server);
    this.registerPrompts(server);
    this.registerUIResources(server);

    // Handle errors
    server.server.onerror = (error) => {
      logger.error('Server error:', error);
    };

    return server;
  }

  private initializeMCPBridge(): void {
    const config = this.configManager.getConfig();
    const mcpConfig = config.mcp_bridge;

    if (!mcpConfig?.enabled) {
      logger.info('MCP bridge disabled in configuration');
      return;
    }

    try {
      logger.info('Initializing MCP bridge...');

      // Initialize MCP client manager
      this.mcpClientManager = new MCPClientManager(mcpConfig.mcp_servers);

      // Initialize approval service
      this.approvalService = new ApprovalService(mcpConfig.approval_timeout);

      // Initialize function bridge with guardrails
      this.functionBridge = new FunctionBridge(
        this.mcpClientManager,
        this.approvalService,
        mcpConfig.trusted_tools,
        mcpConfig.approval_mode,
        mcpConfig.trusted_tools_by_server || {},
        this.guardrailsService
      );

      // Initialize enhanced provider manager with usage tracking and guardrails
      this.enhancedProviderManager = new EnhancedProviderManager(
        this.configManager,
        this.functionBridge,
        this.usageService,
        this.guardrailsService
      );

      this.mcpEnabled = true;
      logger.info('MCP bridge initialized successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize MCP bridge:', errorMessage);
      logger.warn('Falling back to regular duck provider functionality');
      this.mcpEnabled = false;
    }
  }

  // Tool functions return `{ type: 'text' }` where TS infers `string`, not the literal `"text"`.
  // This helper narrows the type to satisfy McpServer's CallToolResult expectation.
  private toolResult(result: {
    content: { type: string; text: string }[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }): CallToolResult {
    return result as CallToolResult;
  }

  /**
   * McpServer validates every tools/call result against the tool's outputSchema,
   * which a CreateTaskResult (resultType 'task') never satisfies. The SDK has no
   * hook for this, so wrap its private validator on this instance to let task
   * results through; the real result is validated by shape when it completes.
   */
  private skipOutputValidationForTasks(server: McpServer): void {
    type Validator = (tool: unknown, result: unknown, toolName: string) => Promise<void>;
    const target = server as unknown as { validateToolOutput: Validator };
    if (typeof target.validateToolOutput !== 'function') {
      throw new Error(
        'McpServer.validateToolOutput not found: the tasks extension relies on this private ' +
          'hook of @modelcontextprotocol/server ~2.4.x; re-check it after an SDK upgrade.'
      );
    }
    const original = target.validateToolOutput.bind(server);
    target.validateToolOutput = async (tool, result, toolName) => {
      if ((result as { resultType?: unknown } | undefined)?.resultType === 'task') return;
      return original(tool, result, toolName);
    };
  }

  /** tasks/get, tasks/cancel and tasks/update; an unknown taskId is -32602 on all three. */
  private registerTaskHandlers(server: McpServer): void {
    const store = this.taskManager.taskStore;
    const taskIdParams = { params: z.object({ taskId: z.string() }) };
    const requireTask = async (taskId: string) => {
      const task = await store.getTask(taskId);
      if (!task) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown task: ${taskId}`);
      }
      return task;
    };
    // tasks/get: the DetailedTask, with `result` once completed or `error` once failed.
    server.server.setRequestHandler('tasks/get', taskIdParams, async ({ taskId }) => {
      const task = await requireTask(taskId);
      const detailed: Record<string, unknown> = {
        taskId: task.taskId,
        status: task.status,
        createdAt: task.createdAt,
        lastUpdatedAt: task.lastUpdatedAt,
        ttlMs: task.ttl,
        ...(task.pollInterval !== undefined && { pollIntervalMs: task.pollInterval }),
        ...(task.statusMessage !== undefined && { statusMessage: task.statusMessage }),
      };
      if (task.status === 'completed') {
        detailed.result = await store.getTaskResult(taskId);
      } else if (task.status === 'failed') {
        const failed = (await store.getTaskResult(taskId)) as {
          content?: { text?: string }[];
        };
        detailed.error = {
          code: ProtocolErrorCode.InternalError,
          message: failed.content?.[0]?.text ?? 'Task failed',
        };
      }
      return detailed;
    });
    // tasks/cancel: abort the running work, mark the task cancelled, empty ack.
    server.server.setRequestHandler('tasks/cancel', taskIdParams, async ({ taskId }) => {
      const task = await requireTask(taskId);
      this.taskManager.cancel(taskId);
      if (!isTerminal(task.status)) {
        try {
          await store.updateTaskStatus(taskId, 'cancelled', 'Task was cancelled');
        } catch {
          // The work reached a terminal state between the read and this write;
          // cancellation of a finished task is still acknowledged.
        }
      }
      return {};
    });
    // tasks/update: the SDK lifts inputResponses into ctx.mcpReq.inputResponses, so the
    // params carry only taskId. No duck task asks for input, so every key is ignored.
    server.server.setRequestHandler('tasks/update', taskIdParams, async ({ taskId }) => {
      await requireTask(taskId);
      return {};
    });
  }

  /** True when this request's envelope declares the io.modelcontextprotocol/tasks extension. */
  private tasksRequested(ctx: ServerContext): boolean {
    const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
    const caps = envelope?.[CLIENT_CAPABILITIES_META_KEY] as
      | { extensions?: Record<string, unknown> }
      | undefined;
    return caps?.extensions?.[TASKS_EXTENSION] !== undefined;
  }

  /**
   * Create a task, start `work` in the background and return the CreateTaskResult.
   * The work never sees the finished request's notify, only the task's own signal
   * and a reporter that surfaces progress as the task's statusMessage and lastUpdatedAt.
   */
  private async startToolTask(
    name: string,
    args: Record<string, unknown>,
    ctx: ServerContext,
    work: (signal: AbortSignal, progress: ProgressReporter) => Promise<CallToolResult>
  ): Promise<CallToolResult> {
    const task = await this.taskManager.taskStore.createTask(
      {
        ttl: this.taskManager.config.defaultTtl,
        pollInterval: this.taskManager.config.pollInterval,
      },
      ctx.mcpReq.id,
      { method: 'tools/call', params: { name, arguments: args } }
    );
    // A throw from `work` marks the task failed; tasks/get reports it as a JSON-RPC error.
    const store = this.taskManager.taskStore;
    const progress: ProgressReporter = {
      enabled: true,
      report: async (_current, _total, message) => {
        try {
          await store.updateTaskStatus(task.taskId, 'working', message);
        } catch {
          // The task already reached a terminal state (e.g. cancelled); drop the update.
        }
      },
    };
    this.taskManager.startBackground(task.taskId, (signal) => work(signal, progress));
    return {
      resultType: 'task',
      taskId: task.taskId,
      status: task.status,
      createdAt: task.createdAt,
      lastUpdatedAt: task.lastUpdatedAt,
      ttlMs: task.ttl ?? this.taskManager.config.defaultTtl,
      pollIntervalMs: task.pollInterval ?? this.taskManager.config.pollInterval,
    } as unknown as CallToolResult;
  }

  /** Progress reporter bound to a tool call's progress token (no-op without one). */
  private progressFor(ctx: ServerContext): ProgressReporter {
    return createProgressReporter(ctx.mcpReq._meta?.progressToken, ctx.mcpReq.notify);
  }

  private toolErrorResult(error: unknown): CallToolResult {
    logger.error('Tool execution error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text' as const,
          text: `${getRandomDuckMessage('error')}\n\nError: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Build a Zod enum from configured provider names.
   * Falls back to z.string() when no providers are configured (z.enum([]) would throw).
   */
  private providerEnum() {
    const names = this.providerManager.getProviderNames();
    if (names.length === 0) return z.string();
    return z.enum(names as [string, ...string[]]);
  }

  private registerTools(server: McpServer) {
    // ask_duck
    server.registerTool(
      'ask_duck',
      {
        title: 'Ask a Duck',
        description: this.mcpEnabled
          ? 'Ask a question to a specific LLM provider (duck) with MCP tool access'
          : 'Ask a question to a specific LLM provider (duck)',
        inputSchema: z.object({
          prompt: z.string().describe('The question or prompt to send to the duck'),
          provider: this.providerEnum()
            .optional()
            .describe('The provider name (optional, uses default if not specified)'),
          model: z
            .string()
            .optional()
            .describe('Specific model to use (optional, uses provider default if not specified)'),
          temperature: z
            .number()
            .min(0)
            .max(2)
            .optional()
            .describe('Temperature for response generation (0-2)'),
          images: z
            .array(ImageInputSchema)
            .optional()
            .describe('Optional images to include with the prompt (for vision-capable models)'),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          if (this.mcpEnabled && this.enhancedProviderManager) {
            return this.toolResult(await this.handleAskDuckWithMCP(args));
          }
          return this.toolResult(await askDuckTool(this.providerManager, args));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // chat_with_duck
    server.registerTool(
      'chat_with_duck',
      {
        title: 'Chat with a Duck',
        description: 'Have a conversation with a duck, maintaining context across messages',
        inputSchema: z.object({
          conversation_id: z.string().describe('Conversation ID (creates new if not exists)'),
          message: z.string().describe('Your message to the duck'),
          provider: this.providerEnum()
            .optional()
            .describe('Provider to use (can switch mid-conversation)'),
          model: z.string().optional().describe('Specific model to use (optional)'),
          images: z
            .array(ImageInputSchema)
            .optional()
            .describe('Optional images to include with the message (for vision-capable models)'),
        }),
        annotations: {
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          return this.toolResult(
            await chatDuckTool(this.providerManager, this.conversationManager, args)
          );
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // clear_conversations
    server.registerTool(
      'clear_conversations',
      {
        title: 'Clear Conversations',
        description: 'Clear all conversation history and start fresh',
        annotations: {
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      () => {
        try {
          return this.toolResult(clearConversationsTool(this.conversationManager, {}));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // list_ducks
    server.registerTool(
      'list_ducks',
      {
        title: 'List Ducks',
        description: 'List all available LLM providers (ducks) and their status',
        inputSchema: z.object({
          check_health: z
            .boolean()
            .default(false)
            .describe('Perform health check on all providers'),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          return this.toolResult(
            await listDucksTool(this.providerManager, this.healthMonitor, args)
          );
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // list_models
    server.registerTool(
      'list_models',
      {
        title: 'List Models',
        description: 'List available models for LLM providers',
        inputSchema: z.object({
          provider: this.providerEnum()
            .optional()
            .describe('Provider name (optional, lists all if not specified)'),
          fetch_latest: z
            .boolean()
            .default(false)
            .describe('Fetch latest models from API vs using cached/configured'),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          return this.toolResult(await listModelsTool(this.providerManager, args));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // compare_ducks
    registerAppTool(
      server,
      'compare_ducks',
      {
        title: 'Compare Ducks',
        description: 'Ask the same question to multiple ducks simultaneously',
        inputSchema: z.object({
          prompt: z.string().describe('The question to ask all ducks'),
          providers: z
            .array(this.providerEnum())
            .optional()
            .describe('List of provider names to query (optional, uses all if not specified)'),
          model: z
            .string()
            .optional()
            .describe('Specific model to use for all providers (optional)'),
          images: z
            .array(ImageInputSchema)
            .optional()
            .describe('Optional images to include with the prompt (for vision-capable models)'),
        }),
        outputSchema: z.object({
          responses: z.array(
            z.object({
              provider: z.string(),
              nickname: z.string(),
              model: z.string(),
              content: z.string(),
              latency: z.number(),
              tokens: z
                .object({
                  prompt: z.number(),
                  completion: z.number(),
                  total: z.number(),
                })
                .nullable(),
              error: z.string().optional(),
            })
          ),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        _meta: { ui: { resourceUri: 'ui://rubber-duck/compare-ducks' } },
      },
      async (args, ctx) => {
        try {
          const progress = this.progressFor(ctx);
          if (this.mcpEnabled && this.enhancedProviderManager) {
            return this.toolResult(await this.handleCompareDucksWithMCP(args, progress));
          }
          return this.toolResult(await compareDucksTool(this.providerManager, args, progress));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // duck_council
    server.registerTool(
      'duck_council',
      {
        title: 'Duck Council',
        description: 'Get responses from all configured ducks (like a panel discussion)',
        inputSchema: z.object({
          prompt: z.string().describe('The question for the duck council'),
          model: z.string().optional().describe('Specific model to use for all ducks (optional)'),
          images: z
            .array(ImageInputSchema)
            .optional()
            .describe('Optional images to include with the prompt (for vision-capable models)'),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args, ctx) => {
        try {
          const progress = this.progressFor(ctx);
          if (this.mcpEnabled && this.enhancedProviderManager) {
            return this.toolResult(await this.handleDuckCouncilWithMCP(args, progress));
          }
          return this.toolResult(await duckCouncilTool(this.providerManager, args, progress));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // duck_vote
    registerAppTool(
      server,
      'duck_vote',
      {
        title: 'Duck Vote',
        description:
          'Have multiple ducks vote on options with reasoning. Returns vote tally, confidence scores, and consensus level.',
        inputSchema: z.object({
          question: z
            .string()
            .describe('The question to vote on (e.g., "Best approach for error handling?")'),
          options: z
            .array(z.string())
            .min(2)
            .max(10)
            .describe('The options to vote on (2-10 options)'),
          voters: z
            .array(this.providerEnum())
            .optional()
            .describe('List of provider names to vote (optional, uses all if not specified)'),
          require_reasoning: z
            .boolean()
            .default(true)
            .describe('Require ducks to explain their vote (default: true)'),
        }),
        outputSchema: z.object({
          question: z.string(),
          options: z.array(z.string()),
          winner: z.string().nullable(),
          isTie: z.boolean(),
          tally: z.record(z.string(), z.number()),
          confidenceByOption: z.record(z.string(), z.number()),
          votes: z.array(
            z.object({
              voter: z.string(),
              nickname: z.string(),
              choice: z.string(),
              confidence: z.number(),
              reasoning: z.string(),
              error: z.string().optional(),
            })
          ),
          totalVoters: z.number(),
          validVotes: z.number(),
          consensusLevel: z.enum(['unanimous', 'majority', 'plurality', 'split', 'none']),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        _meta: { ui: { resourceUri: 'ui://rubber-duck/duck-vote' } },
      },
      async (args, ctx) => {
        try {
          const progress = this.progressFor(ctx);
          return this.toolResult(await duckVoteTool(this.providerManager, args, progress));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // duck_judge
    server.registerTool(
      'duck_judge',
      {
        title: 'Duck Judge',
        description:
          "Have one duck evaluate and rank other ducks' responses. Use after duck_council to get a comparative evaluation.",
        inputSchema: z.object({
          responses: z
            .array(
              z.object({
                provider: z.string(),
                nickname: z.string(),
                model: z.string().optional(),
                content: z.string(),
              })
            )
            .min(2)
            .describe('Array of duck responses to evaluate (from duck_council output)'),
          judge: this.providerEnum()
            .optional()
            .describe('Provider name of the judge duck (optional, uses first available)'),
          criteria: z
            .array(z.string())
            .optional()
            .describe('Evaluation criteria (default: ["accuracy", "completeness", "clarity"])'),
          persona: z
            .string()
            .optional()
            .describe('Judge persona (e.g., "senior engineer", "security expert")'),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          return this.toolResult(await duckJudgeTool(this.providerManager, args));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // duck_iterate
    server.registerTool(
      'duck_iterate',
      {
        title: 'Duck Iteration',
        description:
          'Iteratively refine a response between two ducks. One generates, the other critiques/improves, alternating for multiple rounds.',
        inputSchema: z.object({
          prompt: z.string().describe('The initial prompt/task to iterate on'),
          iterations: z
            .number()
            .min(1)
            .max(10)
            .default(3)
            .describe('Number of iteration rounds (default: 3, max: 10)'),
          providers: z
            .array(this.providerEnum())
            .min(2)
            .max(2)
            .describe('Exactly 2 provider names for the ping-pong iteration'),
          mode: z
            .enum(['refine', 'critique-improve'])
            .describe(
              'refine: each duck improves the previous response. critique-improve: alternates between critiquing and improving.'
            ),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args, ctx) => {
        if (this.tasksRequested(ctx)) {
          return this.startToolTask('duck_iterate', args, ctx, async (signal, progress) =>
            this.toolResult(await duckIterateTool(this.providerManager, args, progress, signal))
          );
        }
        try {
          const progress = this.progressFor(ctx);
          return this.toolResult(
            await duckIterateTool(this.providerManager, args, progress, ctx.mcpReq.signal)
          );
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // duck_debate
    server.registerTool(
      'duck_debate',
      {
        title: 'Duck Debate',
        description:
          'Structured multi-round debate between ducks. Supports oxford (pro/con), socratic (questioning), and adversarial (attack/defend) formats.',
        inputSchema: z.object({
          prompt: z.string().describe('The debate topic or proposition'),
          rounds: z
            .number()
            .min(1)
            .max(10)
            .default(3)
            .describe('Number of debate rounds (default: 3)'),
          providers: z
            .array(this.providerEnum())
            .min(2)
            .optional()
            .describe('Provider names to participate (min 2, uses all if not specified)'),
          format: z
            .enum(['oxford', 'socratic', 'adversarial'])
            .describe(
              'Debate format: oxford (pro/con), socratic (questioning), adversarial (attack/defend)'
            ),
          synthesizer: this.providerEnum()
            .optional()
            .describe('Provider to synthesize the debate (optional, uses first provider)'),
        }),
        outputSchema: z.object({
          topic: z.string(),
          format: z.enum(['oxford', 'socratic', 'adversarial']),
          totalRounds: z.number(),
          participants: z.array(
            z.object({
              provider: z.string(),
              nickname: z.string(),
              position: z.enum(['pro', 'con', 'neutral']),
            })
          ),
          rounds: z.array(
            z.array(
              z.object({
                round: z.number(),
                provider: z.string(),
                nickname: z.string(),
                position: z.enum(['pro', 'con', 'neutral']),
                content: z.string(),
                error: z.string().optional(),
              })
            )
          ),
          synthesis: z.string(),
          synthesizer: z.string(),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        _meta: { ui: { resourceUri: 'ui://rubber-duck/duck-debate' } },
      },
      async (args, ctx) => {
        if (this.tasksRequested(ctx)) {
          return this.startToolTask('duck_debate', args, ctx, async (signal, progress) =>
            this.toolResult(await duckDebateTool(this.providerManager, args, progress, signal))
          );
        }
        try {
          const progress = this.progressFor(ctx);
          return this.toolResult(
            await duckDebateTool(this.providerManager, args, progress, ctx.mcpReq.signal)
          );
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // get_usage_stats
    registerAppTool(
      server,
      'get_usage_stats',
      {
        title: 'Usage Statistics',
        description:
          'Get usage statistics for a time period. Shows token counts and costs (when pricing configured).',
        inputSchema: z.object({
          period: z
            .enum(['today', '7d', '30d', 'all'])
            .default('today')
            .describe('Time period for stats'),
        }),
        outputSchema: z.object({
          period: z.string(),
          startDate: z.string(),
          endDate: z.string(),
          totals: z.object({
            requests: z.number(),
            promptTokens: z.number(),
            completionTokens: z.number(),
            errors: z.number(),
            estimatedCostUSD: z.number().optional(),
          }),
          usage: z.record(
            z.string(),
            z.record(
              z.string(),
              z.object({
                requests: z.number(),
                promptTokens: z.number(),
                completionTokens: z.number(),
                errors: z.number(),
                estimatedCostUSD: z.number().optional(),
              })
            )
          ),
          costByProvider: z.record(z.string(), z.number()).optional(),
        }),
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        _meta: { ui: { resourceUri: 'ui://rubber-duck/usage-stats' } },
      },
      (args) => {
        try {
          return this.toolResult(getUsageStatsTool(this.usageService, args));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // Conditionally register MCP tools
    if (this.mcpEnabled) {
      // get_pending_approvals
      server.registerTool(
        'get_pending_approvals',
        {
          title: 'Pending Approvals',
          description: 'Get list of pending MCP tool approvals from ducks',
          inputSchema: z.object({
            duck: this.providerEnum().optional().describe('Filter by duck name (optional)'),
          }),
          annotations: {
            readOnlyHint: true,
            openWorldHint: false,
          },
        },
        (args) => {
          try {
            if (!this.approvalService) {
              throw new Error('MCP bridge not enabled');
            }
            return this.toolResult(getPendingApprovalsTool(this.approvalService, args));
          } catch (error) {
            return this.toolErrorResult(error);
          }
        }
      );

      // approve_mcp_request
      server.registerTool(
        'approve_mcp_request',
        {
          title: 'Approve MCP Request',
          description: "Approve or deny a duck's MCP tool request",
          inputSchema: z.object({
            approval_id: z.string().describe('The approval request ID'),
            decision: z
              .enum(['approve', 'deny'])
              .describe('Whether to approve or deny the request'),
            reason: z.string().optional().describe('Reason for denial (optional)'),
          }),
          annotations: {
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        (args) => {
          try {
            if (!this.approvalService) {
              throw new Error('MCP bridge not enabled');
            }
            return this.toolResult(approveMCPRequestTool(this.approvalService, args));
          } catch (error) {
            return this.toolErrorResult(error);
          }
        }
      );

      // mcp_status
      server.registerTool(
        'mcp_status',
        {
          title: 'MCP Bridge Status',
          description: 'Get status of MCP bridge, servers, and pending approvals',
          annotations: {
            readOnlyHint: true,
            openWorldHint: true,
          },
        },
        async () => {
          try {
            if (!this.mcpClientManager || !this.approvalService || !this.functionBridge) {
              throw new Error('MCP bridge not enabled');
            }
            return this.toolResult(
              await mcpStatusTool(
                this.mcpClientManager,
                this.approvalService,
                this.functionBridge,
                {}
              )
            );
          } catch (error) {
            return this.toolErrorResult(error);
          }
        }
      );
    }
  }

  private registerPrompts(server: McpServer) {
    for (const [name, prompt] of Object.entries(PROMPTS)) {
      // Convert prompt.arguments array to a Zod object schema
      const argsShape: Record<string, z.ZodType> = {};
      for (const arg of prompt.arguments || []) {
        argsShape[arg.name] = arg.required
          ? z.string().describe(arg.description || '')
          : z
              .string()
              .optional()
              .describe(arg.description || '');
      }

      server.registerPrompt(
        name,
        {
          description: prompt.description,
          argsSchema: z.object(argsShape),
        },
        (args) => {
          try {
            const messages = prompt.buildMessages((args || {}) as Record<string, string>);
            return { messages };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Prompt error for ${name}: ${errorMessage}`);
            throw error;
          }
        }
      );
    }
  }

  private registerUIResources(server: McpServer) {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const uiDir = join(currentDir, '..', 'dist', 'ui');

    const uiApps = [
      {
        name: 'Compare Ducks',
        uri: 'ui://rubber-duck/compare-ducks',
        file: 'compare-ducks/mcp-app.html',
      },
      { name: 'Duck Vote', uri: 'ui://rubber-duck/duck-vote', file: 'duck-vote/mcp-app.html' },
      {
        name: 'Duck Debate',
        uri: 'ui://rubber-duck/duck-debate',
        file: 'duck-debate/mcp-app.html',
      },
      {
        name: 'Usage Stats',
        uri: 'ui://rubber-duck/usage-stats',
        file: 'usage-stats/mcp-app.html',
      },
    ];

    for (const app of uiApps) {
      registerAppResource(
        server,
        app.name,
        app.uri,
        { description: `Interactive UI for ${app.name}` },
        () => {
          let html: string;
          try {
            html = readFileSync(join(uiDir, app.file), 'utf-8');
          } catch {
            html = `<html><body><p>UI not built. Run npm run build:ui</p></body></html>`;
          }
          return {
            contents: [
              {
                uri: app.uri,
                mimeType: RESOURCE_MIME_TYPE,
                text: html,
              },
            ],
          };
        }
      );
    }
  }

  // MCP-enhanced tool handlers
  private async handleAskDuckWithMCP(args: Record<string, unknown>) {
    if (!this.enhancedProviderManager) {
      throw new Error('Enhanced provider manager not available');
    }

    const { prompt, provider, model, temperature, images } = args as {
      prompt?: string;
      provider?: string;
      model?: string;
      temperature?: number;
      images?: ImageInput[];
    };

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    const content = buildContent(prompt, images);
    const response = await this.enhancedProviderManager.askDuckWithMCP(provider, content, {
      model,
      temperature,
    });

    // Format the response with MCP information
    const formattedResponse = this.formatEnhancedDuckResponse(response);

    return {
      content: [
        {
          type: 'text' as const,
          text: formattedResponse,
        },
      ],
    };
  }

  private async handleCompareDucksWithMCP(
    args: Record<string, unknown>,
    progress?: import('./services/progress.js').ProgressReporter
  ) {
    if (!this.enhancedProviderManager) {
      throw new Error('Enhanced provider manager not available');
    }

    const { prompt, providers, model, images } = args as {
      prompt: string;
      providers?: string[];
      model?: string;
      images?: ImageInput[];
    };

    const content = buildContent(prompt, images);
    const responses = progress
      ? await this.enhancedProviderManager.compareDucksWithProgressMCP(
          content,
          providers,
          { model },
          (providerName, completed, total) => {
            void progress.report(
              completed,
              total,
              `${providerName} responded (${completed}/${total})`
            );
          }
        )
      : await this.enhancedProviderManager.compareDucksWithMCP(content, providers, { model });

    const formattedResponse = responses
      .map((response) => this.formatEnhancedDuckResponse(response))
      .join('\n\n═══════════════════════════════════════\n\n');

    // Build structured data for UI consumption (same shape as compareDucksTool)
    const structuredData = responses.map((r) => ({
      provider: r.provider,
      nickname: r.nickname,
      model: r.model,
      content: r.content,
      latency: r.latency,
      tokens: r.usage
        ? {
            prompt: r.usage.prompt_tokens,
            completion: r.usage.completion_tokens,
            total: r.usage.total_tokens,
          }
        : null,
      ...(r.content.startsWith('Error:') && { error: r.content }),
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: formattedResponse,
        },
        {
          type: 'text' as const,
          text: JSON.stringify(structuredData),
        },
      ],
      structuredContent: { responses: structuredData },
    };
  }

  private async handleDuckCouncilWithMCP(
    args: Record<string, unknown>,
    progress?: import('./services/progress.js').ProgressReporter
  ) {
    if (!this.enhancedProviderManager) {
      throw new Error('Enhanced provider manager not available');
    }

    const { prompt, model, images } = args as {
      prompt: string;
      model?: string;
      images?: ImageInput[];
    };

    const content = buildContent(prompt, images);
    const responses = progress
      ? await this.enhancedProviderManager.compareDucksWithProgressMCP(
          content,
          undefined,
          { model },
          (providerName, completed, total) => {
            void progress.report(
              completed,
              total,
              `${providerName} responded (${completed}/${total})`
            );
          }
        )
      : await this.enhancedProviderManager.duckCouncilWithMCP(content, { model });

    const header = '🦆 Duck Council in Session 🦆\n=============================';
    const formattedResponse = responses
      .map((response) => this.formatEnhancedDuckResponse(response))
      .join('\n\n═══════════════════════════════════════\n\n');

    return {
      content: [
        {
          type: 'text' as const,
          text: `${header}\n\n${formattedResponse}`,
        },
      ],
    };
  }

  private formatEnhancedDuckResponse(
    response: DuckResponse & {
      pendingApprovals?: { id: string; message: string }[];
      mcpResults?: unknown[];
      toolRoundsUsed?: number;
    }
  ): string {
    let formatted = formatDuckReply(response);

    // Add pending approvals if any
    if (response.pendingApprovals && response.pendingApprovals.length > 0) {
      formatted += '\n\n⏳ **Pending Approvals:**';
      response.pendingApprovals.forEach((approval) => {
        formatted += `\n- ${approval.message} (ID: ${approval.id})`;
      });
      formatted +=
        '\n\n💡 Use `get_pending_approvals` and `approve_mcp_request` to manage approvals';
    }

    // Add MCP results indicator
    if (response.mcpResults && response.mcpResults.length > 0) {
      const roundInfo = response.toolRoundsUsed
        ? ` across ${response.toolRoundsUsed} round(s)`
        : '';
      formatted += `\n\n🔧 **Used MCP Tools:** ${response.mcpResults.length} tool call(s)${roundInfo}`;
    }

    formatted += `\n\n${formatDuckFooter(response, response.mcpResults ? ['🔄 MCP Enhanced'] : [])}`;

    return formatted;
  }

  async start() {
    // The welcome banner always goes to stderr (see printWelcomeBanner), so it is
    // safe to print in every mode — stdout stays reserved for framed JSON-RPC.
    printWelcomeBanner();

    // Refuse an unsafe HTTP bind before anything else starts (guardrails, MCP
    // Bridge connections), not just before listen (AC-R2JF6A.3).
    const transport = this.configManager.getConfig().transport;
    if (transport?.mode === 'http') {
      const refusal = validateHttpBind(transport);
      if (refusal) throw new Error(refusal);
    }

    // Initialize guardrails service if configured
    if (this.guardrailsService) {
      try {
        await this.guardrailsService.initialize();
        logger.info('Guardrails service initialized successfully');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to initialize guardrails:', errorMessage);
        logger.warn('Guardrails functionality may not be available');
      }
    }

    // Initialize MCP connections if enabled
    if (this.mcpEnabled && this.mcpClientManager) {
      try {
        logger.info('Connecting to MCP servers...');
        await this.mcpClientManager.initialize();
        logger.info('MCP servers connected successfully');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to connect to some MCP servers:', errorMessage);
        logger.warn('Some MCP functionality may not be available');
      }
    }

    // Serve: HTTP builds an McpServer per request; stdio pins one per connection
    // (serveStdio may discard a server/discover probe and call the factory again).
    if (transport?.mode === 'http') {
      this.httpHandle = await serveHttp(() => this.buildMcpServer(), {
        ...transport,
        onerror: (error) => logger.error('HTTP transport error:', error.message),
      });
      logger.info(`Serving MCP over HTTP at http://${transport.host}:${transport.port}/mcp`);
    } else {
      this.stdioHandle = serveStdio(() => this.buildMcpServer());
    }

    if (this.mcpEnabled) {
      logger.info('🦆 MCP Rubber Duck server with MCP bridge started successfully!');
    } else {
      logger.info('🦆 MCP Rubber Duck server started successfully!');
    }
  }

  async stop() {
    this.taskManager.shutdown();

    // Cleanup usage service (flush pending writes)
    this.usageService.shutdown();

    // Cleanup guardrails service
    if (this.guardrailsService) {
      await this.guardrailsService.shutdown();
    }

    // Cleanup MCP resources
    if (this.approvalService) {
      this.approvalService.shutdown();
    }

    if (this.mcpClientManager) {
      await this.mcpClientManager.disconnectAll();
    }

    // Stop the server
    await this.stdioHandle?.close();
    this.stdioHandle = undefined;
    await this.httpHandle?.close();
    this.httpHandle = undefined;

    logger.info('Server stopped');
  }
}
