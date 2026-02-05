import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
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
import { ResponseCache } from './services/cache.js';
import { HealthMonitor } from './services/health.js';
import { MCPClientManager } from './services/mcp-client-manager.js';
import { PricingService } from './services/pricing.js';
import { UsageService } from './services/usage.js';
import { DuckResponse } from './config/types.js';
import { ApprovalService } from './services/approval.js';
import { FunctionBridge } from './services/function-bridge.js';
import { GuardrailsService } from './guardrails/service.js';
import { TaskManager } from './services/task-manager.js';
import { createProgressReporter } from './services/progress.js';
import { logger } from './utils/logger.js';
import { duckArt, getRandomDuckMessage } from './utils/ascii-art.js';

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

export class RubberDuckServer {
  private server: McpServer;
  private configManager: ConfigManager;
  private pricingService: PricingService;
  private usageService: UsageService;
  private guardrailsService?: GuardrailsService;
  private providerManager: ProviderManager;
  private enhancedProviderManager?: EnhancedProviderManager;
  private conversationManager: ConversationManager;
  private cache: ResponseCache;
  private healthMonitor: HealthMonitor;

  // MCP Bridge components
  private mcpClientManager?: MCPClientManager;
  private approvalService?: ApprovalService;
  private functionBridge?: FunctionBridge;
  private mcpEnabled: boolean = false;

  // Task management
  private taskManager: TaskManager;

  constructor() {
    this.taskManager = new TaskManager();

    this.server = new McpServer(
      {
        name: 'mcp-rubber-duck',
        version: '1.0.0',
      },
      {
        capabilities: {
          tasks: {
            list: {},
            cancel: {},
            requests: {
              tools: { call: {} },
            },
          },
        },
        taskStore: this.taskManager.taskStore,
        taskMessageQueue: this.taskManager.taskMessageQueue,
        defaultTaskPollInterval: this.taskManager.config.pollInterval,
        maxTaskQueueSize: this.taskManager.config.maxQueueSize,
      }
    );

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

    // Initialize provider manager with usage tracking and guardrails
    this.providerManager = new ProviderManager(this.configManager, this.usageService, this.guardrailsService);
    this.conversationManager = new ConversationManager();
    this.cache = new ResponseCache(config.cache_ttl);
    this.healthMonitor = new HealthMonitor(this.providerManager);

    // Initialize MCP bridge if enabled
    this.initializeMCPBridge();

    this.registerTools();
    this.registerPrompts();
    this.registerUIResources();

    // Handle errors
    this.server.server.onerror = (error) => {
      logger.error('Server error:', error);
    };
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
  private toolResult(result: { content: { type: string; text: string }[]; isError?: boolean }): CallToolResult {
    return result as CallToolResult;
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

  private registerTools() {
    // ask_duck
    this.server.registerTool(
      'ask_duck',
      {
        title: 'Ask a Duck',
        description: this.mcpEnabled
          ? 'Ask a question to a specific LLM provider (duck) with MCP tool access'
          : 'Ask a question to a specific LLM provider (duck)',
        inputSchema: {
          prompt: z.string().describe('The question or prompt to send to the duck'),
          provider: z.string().optional().describe('The provider name (optional, uses default if not specified)'),
          model: z.string().optional().describe('Specific model to use (optional, uses provider default if not specified)'),
          temperature: z.number().min(0).max(2).optional().describe('Temperature for response generation (0-2)'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          if (this.mcpEnabled && this.enhancedProviderManager) {
            return this.toolResult(await this.handleAskDuckWithMCP(args as Record<string, unknown>));
          }
          return this.toolResult(await askDuckTool(this.providerManager, this.cache, args as Record<string, unknown>));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // chat_with_duck
    this.server.registerTool(
      'chat_with_duck',
      {
        title: 'Chat with a Duck',
        description: 'Have a conversation with a duck, maintaining context across messages',
        inputSchema: {
          conversation_id: z.string().describe('Conversation ID (creates new if not exists)'),
          message: z.string().describe('Your message to the duck'),
          provider: z.string().optional().describe('Provider to use (can switch mid-conversation)'),
          model: z.string().optional().describe('Specific model to use (optional)'),
        },
        annotations: {
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          return this.toolResult(await chatDuckTool(this.providerManager, this.conversationManager, args as Record<string, unknown>));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // clear_conversations
    this.server.registerTool(
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
    this.server.registerTool(
      'list_ducks',
      {
        title: 'List Ducks',
        description: 'List all available LLM providers (ducks) and their status',
        inputSchema: {
          check_health: z.boolean().default(false).describe('Perform health check on all providers'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          return this.toolResult(await listDucksTool(this.providerManager, this.healthMonitor, args as Record<string, unknown>));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // list_models
    this.server.registerTool(
      'list_models',
      {
        title: 'List Models',
        description: 'List available models for LLM providers',
        inputSchema: {
          provider: z.string().optional().describe('Provider name (optional, lists all if not specified)'),
          fetch_latest: z.boolean().default(false).describe('Fetch latest models from API vs using cached/configured'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          return this.toolResult(await listModelsTool(this.providerManager, args as Record<string, unknown>));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // compare_ducks
    registerAppTool(
      this.server,
      'compare_ducks',
      {
        title: 'Compare Ducks',
        description: 'Ask the same question to multiple ducks simultaneously',
        inputSchema: {
          prompt: z.string().describe('The question to ask all ducks'),
          providers: z.array(z.string()).optional().describe('List of provider names to query (optional, uses all if not specified)'),
          model: z.string().optional().describe('Specific model to use for all providers (optional)'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        _meta: { ui: { resourceUri: 'ui://rubber-duck/compare-ducks' } },
      },
      async (args, extra) => {
        try {
          const progress = createProgressReporter(extra._meta?.progressToken, extra.sendNotification);
          if (this.mcpEnabled && this.enhancedProviderManager) {
            return this.toolResult(await this.handleCompareDucksWithMCP(args as Record<string, unknown>, progress));
          }
          return this.toolResult(await compareDucksTool(this.providerManager, args as Record<string, unknown>, progress));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // duck_council
    this.server.registerTool(
      'duck_council',
      {
        title: 'Duck Council',
        description: 'Get responses from all configured ducks (like a panel discussion)',
        inputSchema: {
          prompt: z.string().describe('The question for the duck council'),
          model: z.string().optional().describe('Specific model to use for all ducks (optional)'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args, extra) => {
        try {
          const progress = createProgressReporter(extra._meta?.progressToken, extra.sendNotification);
          if (this.mcpEnabled && this.enhancedProviderManager) {
            return this.toolResult(await this.handleDuckCouncilWithMCP(args as Record<string, unknown>, progress));
          }
          return this.toolResult(await duckCouncilTool(this.providerManager, args as Record<string, unknown>, progress));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // duck_vote
    registerAppTool(
      this.server,
      'duck_vote',
      {
        title: 'Duck Vote',
        description: 'Have multiple ducks vote on options with reasoning. Returns vote tally, confidence scores, and consensus level.',
        inputSchema: {
          question: z.string().describe('The question to vote on (e.g., "Best approach for error handling?")'),
          options: z.array(z.string()).min(2).max(10).describe('The options to vote on (2-10 options)'),
          voters: z.array(z.string()).optional().describe('List of provider names to vote (optional, uses all if not specified)'),
          require_reasoning: z.boolean().default(true).describe('Require ducks to explain their vote (default: true)'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        _meta: { ui: { resourceUri: 'ui://rubber-duck/duck-vote' } },
      },
      async (args, extra) => {
        try {
          const progress = createProgressReporter(extra._meta?.progressToken, extra.sendNotification);
          return this.toolResult(await duckVoteTool(this.providerManager, args as Record<string, unknown>, progress));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // duck_judge
    this.server.registerTool(
      'duck_judge',
      {
        title: 'Duck Judge',
        description: 'Have one duck evaluate and rank other ducks\' responses. Use after duck_council to get a comparative evaluation.',
        inputSchema: {
          responses: z.array(z.object({
            provider: z.string(),
            nickname: z.string(),
            model: z.string().optional(),
            content: z.string(),
          })).min(2).describe('Array of duck responses to evaluate (from duck_council output)'),
          judge: z.string().optional().describe('Provider name of the judge duck (optional, uses first available)'),
          criteria: z.array(z.string()).optional().describe('Evaluation criteria (default: ["accuracy", "completeness", "clarity"])'),
          persona: z.string().optional().describe('Judge persona (e.g., "senior engineer", "security expert")'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          return this.toolResult(await duckJudgeTool(this.providerManager, args as Record<string, unknown>));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // duck_iterate (task-based: supports async execution for long-running iterations)
    this.server.experimental.tasks.registerToolTask(
      'duck_iterate',
      {
        title: 'Duck Iteration',
        description: 'Iteratively refine a response between two ducks. One generates, the other critiques/improves, alternating for multiple rounds.',
        inputSchema: {
          prompt: z.string().describe('The initial prompt/task to iterate on'),
          iterations: z.number().min(1).max(10).default(3).describe('Number of iteration rounds (default: 3, max: 10)'),
          providers: z.array(z.string()).min(2).max(2).describe('Exactly 2 provider names for the ping-pong iteration'),
          mode: z.enum(['refine', 'critique-improve']).describe('refine: each duck improves the previous response. critique-improve: alternates between critiquing and improving.'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        execution: {
          taskSupport: 'optional',
        },
      },
      {
        createTask: async (args, extra) => {
          const task = await extra.taskStore.createTask({
            ttl: this.taskManager.config.defaultTtl,
            pollInterval: this.taskManager.config.pollInterval,
          });
          const progress = createProgressReporter(extra._meta?.progressToken, extra.sendNotification);
          this.taskManager.startBackground(task.taskId, async (signal) => {
            return this.toolResult(
              await duckIterateTool(this.providerManager, args as Record<string, unknown>, progress, signal)
            );
          });
          return { task };
        },
        getTask: async (_args, extra) => {
          const task = await extra.taskStore.getTask(extra.taskId);
          return task;
        },
        getTaskResult: async (_args, extra) => {
          return await extra.taskStore.getTaskResult(extra.taskId) as CallToolResult;
        },
      }
    );

    // duck_debate (task-based: supports async execution for multi-round debates)
    this.server.experimental.tasks.registerToolTask(
      'duck_debate',
      {
        title: 'Duck Debate',
        description: 'Structured multi-round debate between ducks. Supports oxford (pro/con), socratic (questioning), and adversarial (attack/defend) formats.',
        inputSchema: {
          prompt: z.string().describe('The debate topic or proposition'),
          rounds: z.number().min(1).max(10).default(3).describe('Number of debate rounds (default: 3)'),
          providers: z.array(z.string()).min(2).optional().describe('Provider names to participate (min 2, uses all if not specified)'),
          format: z.enum(['oxford', 'socratic', 'adversarial']).describe('Debate format: oxford (pro/con), socratic (questioning), adversarial (attack/defend)'),
          synthesizer: z.string().optional().describe('Provider to synthesize the debate (optional, uses first provider)'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
        },
        _meta: { ui: { resourceUri: 'ui://rubber-duck/duck-debate' } },
        execution: {
          taskSupport: 'optional',
        },
      },
      {
        createTask: async (args, extra) => {
          const task = await extra.taskStore.createTask({
            ttl: this.taskManager.config.defaultTtl,
            pollInterval: this.taskManager.config.pollInterval,
          });
          const progress = createProgressReporter(extra._meta?.progressToken, extra.sendNotification);
          this.taskManager.startBackground(task.taskId, async (signal) => {
            return this.toolResult(
              await duckDebateTool(this.providerManager, args as Record<string, unknown>, progress, signal)
            );
          });
          return { task };
        },
        getTask: async (_args, extra) => {
          const task = await extra.taskStore.getTask(extra.taskId);
          return task;
        },
        getTaskResult: async (_args, extra) => {
          return await extra.taskStore.getTaskResult(extra.taskId) as CallToolResult;
        },
      }
    );

    // get_usage_stats
    registerAppTool(
      this.server,
      'get_usage_stats',
      {
        title: 'Usage Statistics',
        description: 'Get usage statistics for a time period. Shows token counts and costs (when pricing configured).',
        inputSchema: {
          period: z.enum(['today', '7d', '30d', 'all']).default('today').describe('Time period for stats'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
        },
        _meta: { ui: { resourceUri: 'ui://rubber-duck/usage-stats' } },
      },
      (args) => {
        try {
          return this.toolResult(getUsageStatsTool(this.usageService, args as Record<string, unknown>));
        } catch (error) {
          return this.toolErrorResult(error);
        }
      }
    );

    // Conditionally register MCP tools
    if (this.mcpEnabled) {
      // get_pending_approvals
      this.server.registerTool(
        'get_pending_approvals',
        {
          title: 'Pending Approvals',
          description: 'Get list of pending MCP tool approvals from ducks',
          inputSchema: {
            duck: z.string().optional().describe('Filter by duck name (optional)'),
          },
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
            return this.toolResult(getPendingApprovalsTool(this.approvalService, args as Record<string, unknown>));
          } catch (error) {
            return this.toolErrorResult(error);
          }
        }
      );

      // approve_mcp_request
      this.server.registerTool(
        'approve_mcp_request',
        {
          title: 'Approve MCP Request',
          description: "Approve or deny a duck's MCP tool request",
          inputSchema: {
            approval_id: z.string().describe('The approval request ID'),
            decision: z.enum(['approve', 'deny']).describe('Whether to approve or deny the request'),
            reason: z.string().optional().describe('Reason for denial (optional)'),
          },
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
            return this.toolResult(approveMCPRequestTool(this.approvalService, args as Record<string, unknown>));
          } catch (error) {
            return this.toolErrorResult(error);
          }
        }
      );

      // mcp_status
      this.server.registerTool(
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
            return this.toolResult(await mcpStatusTool(
              this.mcpClientManager,
              this.approvalService,
              this.functionBridge,
              {}
            ));
          } catch (error) {
            return this.toolErrorResult(error);
          }
        }
      );
    }
  }

  private registerPrompts() {
    for (const [name, prompt] of Object.entries(PROMPTS)) {
      // Convert prompt.arguments array to Zod schema
      const argsSchema: Record<string, z.ZodType> = {};
      for (const arg of prompt.arguments || []) {
        argsSchema[arg.name] = arg.required
          ? z.string().describe(arg.description || '')
          : z.string().optional().describe(arg.description || '');
      }

      this.server.registerPrompt(
        name,
        {
          description: prompt.description,
          argsSchema,
        },
        (args) => {
          try {
            const messages = prompt.buildMessages((args || {}) as Record<string, string>);
            return { messages };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Prompt error for ${name}:`, errorMessage);
            throw error;
          }
        }
      );
    }
  }

  private registerUIResources() {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const uiDir = join(currentDir, '..', 'dist', 'ui');

    const uiApps = [
      { name: 'Compare Ducks', uri: 'ui://rubber-duck/compare-ducks', file: 'compare-ducks/mcp-app.html' },
      { name: 'Duck Vote', uri: 'ui://rubber-duck/duck-vote', file: 'duck-vote/mcp-app.html' },
      { name: 'Duck Debate', uri: 'ui://rubber-duck/duck-debate', file: 'duck-debate/mcp-app.html' },
      { name: 'Usage Stats', uri: 'ui://rubber-duck/usage-stats', file: 'usage-stats/mcp-app.html' },
    ];

    for (const app of uiApps) {
      registerAppResource(
        this.server,
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
    if (!this.enhancedProviderManager || !this.cache) {
      throw new Error('Enhanced provider manager not available');
    }

    const { prompt, provider, model, temperature } = args as {
      prompt?: string;
      provider?: string;
      model?: string;
      temperature?: number;
    };

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    // Generate cache key (same as regular ask_duck)
    const cacheKey = this.cache.generateKey(provider || 'default', prompt, { model, temperature });

    // Try to get cached response
    const { value: response, cached } = await this.cache.getOrSet(cacheKey, async () => {
      return await this.enhancedProviderManager!.askDuckWithMCP(provider, prompt, {
        model,
        temperature,
      });
    });

    // Format the response with MCP information
    const formattedResponse = this.formatEnhancedDuckResponse(response, cached);

    return {
      content: [
        {
          type: 'text' as const,
          text: formattedResponse,
        },
      ],
    };
  }

  private async handleCompareDucksWithMCP(args: Record<string, unknown>, progress?: import('./services/progress.js').ProgressReporter) {
    if (!this.enhancedProviderManager) {
      throw new Error('Enhanced provider manager not available');
    }

    const { prompt, providers, model } = args as {
      prompt: string;
      providers?: string[];
      model?: string;
    };

    const responses = progress
      ? await this.enhancedProviderManager.compareDucksWithProgressMCP(
          prompt,
          providers,
          { model },
          (providerName, completed, total) => {
            void progress.report(completed, total, `${providerName} responded (${completed}/${total})`);
          }
        )
      : await this.enhancedProviderManager.compareDucksWithMCP(prompt, providers, { model });

    const formattedResponse = responses
      .map((response) => this.formatEnhancedDuckResponse(response))
      .join('\n\n═══════════════════════════════════════\n\n');

    // Build structured data for UI consumption (same shape as compareDucksTool)
    const structuredData = responses.map(r => ({
      provider: r.provider,
      nickname: r.nickname,
      model: r.model,
      content: r.content,
      latency: r.latency,
      tokens: r.usage ? {
        prompt: r.usage.prompt_tokens,
        completion: r.usage.completion_tokens,
        total: r.usage.total_tokens,
      } : null,
      cached: r.cached,
      error: r.content.startsWith('Error:') ? r.content : undefined,
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
    };
  }

  private async handleDuckCouncilWithMCP(args: Record<string, unknown>, progress?: import('./services/progress.js').ProgressReporter) {
    if (!this.enhancedProviderManager) {
      throw new Error('Enhanced provider manager not available');
    }

    const { prompt, model } = args as { prompt: string; model?: string };

    const responses = progress
      ? await this.enhancedProviderManager.compareDucksWithProgressMCP(
          prompt,
          undefined,
          { model },
          (providerName, completed, total) => {
            void progress.report(completed, total, `${providerName} responded (${completed}/${total})`);
          }
        )
      : await this.enhancedProviderManager.duckCouncilWithMCP(prompt, { model });

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
    },
    cached?: boolean
  ): string {
    let formatted = `🦆 **${response.nickname}** (${response.provider})\n─────────────────────────────────────\n${response.content}`;

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
      formatted += '\n\n🔧 **Used MCP Tools:** ' + response.mcpResults.length + ' tool call(s)';
    }

    // Add model and performance info
    formatted += `\n\n📍 Model: ${response.model}`;
    if (response.usage) {
      formatted += ` | 📊 Tokens: ${response.usage.total_tokens}`;
    }
    formatted += ` | ⏱️ ${response.latency}ms`;
    if (cached) {
      formatted += ' | 💾 Cached';
    } else if (response.mcpResults) {
      formatted += ' | 🔄 MCP Enhanced';
    } else {
      formatted += ' | 🔄 Fresh';
    }

    return formatted;
  }

  async start() {
    // Only show welcome message when not running as MCP server
    const isMCP = process.env.MCP_SERVER === 'true' || process.argv.includes('--mcp');
    if (!isMCP) {
      // eslint-disable-next-line no-console
      console.log(duckArt.welcome);
      // eslint-disable-next-line no-console
      console.log('\n' + getRandomDuckMessage('startup'));
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


    // Start the server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    if (this.mcpEnabled) {
      logger.info('🦆 MCP Rubber Duck server with MCP bridge started successfully!');
    } else {
      logger.info('🦆 MCP Rubber Duck server started successfully!');
    }
  }

  async stop() {
    // Cleanup task manager (cancel active tasks, clear timers)
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
    await this.server.close();

    logger.info('Server stopped');
  }
}
