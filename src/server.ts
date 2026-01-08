import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

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

export class RubberDuckServer {
  private server: Server;
  private configManager: ConfigManager;
  private pricingService: PricingService;
  private usageService: UsageService;
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

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-rubber-duck',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize managers
    this.configManager = new ConfigManager();
    const config = this.configManager.getConfig();

    // Initialize pricing and usage services
    this.pricingService = new PricingService(config.pricing);
    this.usageService = new UsageService(this.pricingService);

    // Initialize provider manager with usage tracking
    this.providerManager = new ProviderManager(this.configManager, this.usageService);
    this.conversationManager = new ConversationManager();
    this.cache = new ResponseCache(config.cache_ttl);
    this.healthMonitor = new HealthMonitor(this.providerManager);

    // Initialize MCP bridge if enabled
    this.initializeMCPBridge();

    this.setupHandlers();
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

      // Initialize function bridge
      this.functionBridge = new FunctionBridge(
        this.mcpClientManager,
        this.approvalService,
        mcpConfig.trusted_tools,
        mcpConfig.approval_mode,
        mcpConfig.trusted_tools_by_server || {}
      );

      // Initialize enhanced provider manager with usage tracking
      this.enhancedProviderManager = new EnhancedProviderManager(
        this.configManager,
        this.functionBridge,
        this.usageService
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

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: this.getTools() };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'ask_duck':
            // Use enhanced provider manager if MCP is enabled
            if (this.mcpEnabled && this.enhancedProviderManager) {
              return await this.handleAskDuckWithMCP(args || {});
            }
            return await askDuckTool(this.providerManager, this.cache, args || {});

          case 'chat_with_duck':
            return await chatDuckTool(this.providerManager, this.conversationManager, args || {});

          case 'clear_conversations':
            return clearConversationsTool(this.conversationManager, args || {});

          case 'list_ducks':
            return await listDucksTool(this.providerManager, this.healthMonitor, args || {});

          case 'list_models':
            return await listModelsTool(this.providerManager, args || {});

          case 'compare_ducks':
            // Use enhanced provider manager if MCP is enabled
            if (this.mcpEnabled && this.enhancedProviderManager) {
              return await this.handleCompareDucksWithMCP(args || {});
            }
            return await compareDucksTool(this.providerManager, args || {});

          case 'duck_council':
            // Use enhanced provider manager if MCP is enabled
            if (this.mcpEnabled && this.enhancedProviderManager) {
              return await this.handleDuckCouncilWithMCP(args || {});
            }
            return await duckCouncilTool(this.providerManager, args || {});

          case 'duck_vote':
            return await duckVoteTool(this.providerManager, args || {});

          case 'duck_judge':
            return await duckJudgeTool(this.providerManager, args || {});

          case 'duck_iterate':
            return await duckIterateTool(this.providerManager, args || {});

          case 'duck_debate':
            return await duckDebateTool(this.providerManager, args || {});

          // Usage stats tool
          case 'get_usage_stats':
            return getUsageStatsTool(this.usageService, args || {});

          // MCP-specific tools
          case 'get_pending_approvals':
            if (!this.approvalService) {
              throw new Error('MCP bridge not enabled');
            }
            return getPendingApprovalsTool(this.approvalService, args || {});

          case 'approve_mcp_request':
            if (!this.approvalService) {
              throw new Error('MCP bridge not enabled');
            }
            return approveMCPRequestTool(this.approvalService, args || {});

          case 'mcp_status':
            if (!this.mcpClientManager || !this.approvalService || !this.functionBridge) {
              throw new Error('MCP bridge not enabled');
            }
            return await mcpStatusTool(
              this.mcpClientManager,
              this.approvalService,
              this.functionBridge,
              args || {}
            );

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: unknown) {
        logger.error(`Tool execution error for ${name}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `${getRandomDuckMessage('error')}\n\nError: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Handle errors
    this.server.onerror = (error) => {
      logger.error('Server error:', error);
    };
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
          type: 'text',
          text: formattedResponse,
        },
      ],
    };
  }

  private async handleCompareDucksWithMCP(args: Record<string, unknown>) {
    if (!this.enhancedProviderManager) {
      throw new Error('Enhanced provider manager not available');
    }

    const { prompt, providers, model } = args as {
      prompt: string;
      providers?: string[];
      model?: string;
    };

    const responses = await this.enhancedProviderManager.compareDucksWithMCP(prompt, providers, {
      model,
    });

    const formattedResponse = responses
      .map((response) => this.formatEnhancedDuckResponse(response))
      .join('\n\n═══════════════════════════════════════\n\n');

    return {
      content: [
        {
          type: 'text',
          text: formattedResponse,
        },
      ],
    };
  }

  private async handleDuckCouncilWithMCP(args: Record<string, unknown>) {
    if (!this.enhancedProviderManager) {
      throw new Error('Enhanced provider manager not available');
    }

    const { prompt, model } = args as { prompt: string; model?: string };

    const responses = await this.enhancedProviderManager.duckCouncilWithMCP(prompt, { model });

    const header = '🦆 Duck Council in Session 🦆\n=============================';
    const formattedResponse = responses
      .map((response) => this.formatEnhancedDuckResponse(response))
      .join('\n\n═══════════════════════════════════════\n\n');

    return {
      content: [
        {
          type: 'text',
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

  private getTools(): Tool[] {
    const baseTools: Tool[] = [
      {
        name: 'ask_duck',
        description: this.mcpEnabled
          ? 'Ask a question to a specific LLM provider (duck) with MCP tool access'
          : 'Ask a question to a specific LLM provider (duck)',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The question or prompt to send to the duck',
            },
            provider: {
              type: 'string',
              description: 'The provider name (optional, uses default if not specified)',
            },
            model: {
              type: 'string',
              description:
                'Specific model to use (optional, uses provider default if not specified)',
            },
            temperature: {
              type: 'number',
              description: 'Temperature for response generation (0-2)',
              minimum: 0,
              maximum: 2,
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'chat_with_duck',
        description: 'Have a conversation with a duck, maintaining context across messages',
        inputSchema: {
          type: 'object',
          properties: {
            conversation_id: {
              type: 'string',
              description: 'Conversation ID (creates new if not exists)',
            },
            message: {
              type: 'string',
              description: 'Your message to the duck',
            },
            provider: {
              type: 'string',
              description: 'Provider to use (can switch mid-conversation)',
            },
            model: {
              type: 'string',
              description: 'Specific model to use (optional)',
            },
          },
          required: ['conversation_id', 'message'],
        },
      },
      {
        name: 'clear_conversations',
        description: 'Clear all conversation history and start fresh',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_ducks',
        description: 'List all available LLM providers (ducks) and their status',
        inputSchema: {
          type: 'object',
          properties: {
            check_health: {
              type: 'boolean',
              description: 'Perform health check on all providers',
              default: false,
            },
          },
        },
      },
      {
        name: 'list_models',
        description: 'List available models for LLM providers',
        inputSchema: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              description: 'Provider name (optional, lists all if not specified)',
            },
            fetch_latest: {
              type: 'boolean',
              description: 'Fetch latest models from API vs using cached/configured',
              default: false,
            },
          },
        },
      },
      {
        name: 'compare_ducks',
        description: 'Ask the same question to multiple ducks simultaneously',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The question to ask all ducks',
            },
            providers: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'List of provider names to query (optional, uses all if not specified)',
            },
            model: {
              type: 'string',
              description: 'Specific model to use for all providers (optional)',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'duck_council',
        description: 'Get responses from all configured ducks (like a panel discussion)',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The question for the duck council',
            },
            model: {
              type: 'string',
              description: 'Specific model to use for all ducks (optional)',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'duck_vote',
        description: 'Have multiple ducks vote on options with reasoning. Returns vote tally, confidence scores, and consensus level.',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question to vote on (e.g., "Best approach for error handling?")',
            },
            options: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 10,
              description: 'The options to vote on (2-10 options)',
            },
            voters: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of provider names to vote (optional, uses all if not specified)',
            },
            require_reasoning: {
              type: 'boolean',
              default: true,
              description: 'Require ducks to explain their vote (default: true)',
            },
          },
          required: ['question', 'options'],
        },
      },
      {
        name: 'duck_judge',
        description: 'Have one duck evaluate and rank other ducks\' responses. Use after duck_council to get a comparative evaluation.',
        inputSchema: {
          type: 'object',
          properties: {
            responses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  provider: { type: 'string' },
                  nickname: { type: 'string' },
                  model: { type: 'string' },
                  content: { type: 'string' },
                },
                required: ['provider', 'nickname', 'content'],
              },
              minItems: 2,
              description: 'Array of duck responses to evaluate (from duck_council output)',
            },
            judge: {
              type: 'string',
              description: 'Provider name of the judge duck (optional, uses first available)',
            },
            criteria: {
              type: 'array',
              items: { type: 'string' },
              description: 'Evaluation criteria (default: ["accuracy", "completeness", "clarity"])',
            },
            persona: {
              type: 'string',
              description: 'Judge persona (e.g., "senior engineer", "security expert")',
            },
          },
          required: ['responses'],
        },
      },
      {
        name: 'duck_iterate',
        description: 'Iteratively refine a response between two ducks. One generates, the other critiques/improves, alternating for multiple rounds.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The initial prompt/task to iterate on',
            },
            iterations: {
              type: 'number',
              minimum: 1,
              maximum: 10,
              default: 3,
              description: 'Number of iteration rounds (default: 3, max: 10)',
            },
            providers: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 2,
              description: 'Exactly 2 provider names for the ping-pong iteration',
            },
            mode: {
              type: 'string',
              enum: ['refine', 'critique-improve'],
              description: 'refine: each duck improves the previous response. critique-improve: alternates between critiquing and improving.',
            },
          },
          required: ['prompt', 'providers', 'mode'],
        },
      },
      {
        name: 'duck_debate',
        description: 'Structured multi-round debate between ducks. Supports oxford (pro/con), socratic (questioning), and adversarial (attack/defend) formats.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The debate topic or proposition',
            },
            rounds: {
              type: 'number',
              minimum: 1,
              maximum: 10,
              default: 3,
              description: 'Number of debate rounds (default: 3)',
            },
            providers: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              description: 'Provider names to participate (min 2, uses all if not specified)',
            },
            format: {
              type: 'string',
              enum: ['oxford', 'socratic', 'adversarial'],
              description: 'Debate format: oxford (pro/con), socratic (questioning), adversarial (attack/defend)',
            },
            synthesizer: {
              type: 'string',
              description: 'Provider to synthesize the debate (optional, uses first provider)',
            },
          },
          required: ['prompt', 'format'],
        },
      },
      {
        name: 'get_usage_stats',
        description:
          'Get usage statistics for a time period. Shows token counts and costs (when pricing configured).',
        inputSchema: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['today', '7d', '30d', 'all'],
              default: 'today',
              description: 'Time period for stats',
            },
          },
        },
      },
    ];

    // Add MCP-specific tools if enabled
    if (this.mcpEnabled) {
      baseTools.push(
        {
          name: 'get_pending_approvals',
          description: 'Get list of pending MCP tool approvals from ducks',
          inputSchema: {
            type: 'object',
            properties: {
              duck: {
                type: 'string',
                description: 'Filter by duck name (optional)',
              },
            },
          },
        },
        {
          name: 'approve_mcp_request',
          description: "Approve or deny a duck's MCP tool request",
          inputSchema: {
            type: 'object',
            properties: {
              approval_id: {
                type: 'string',
                description: 'The approval request ID',
              },
              decision: {
                type: 'string',
                enum: ['approve', 'deny'],
                description: 'Whether to approve or deny the request',
              },
              reason: {
                type: 'string',
                description: 'Reason for denial (optional)',
              },
            },
            required: ['approval_id', 'decision'],
          },
        },
        {
          name: 'mcp_status',
          description: 'Get status of MCP bridge, servers, and pending approvals',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        }
      );
    }

    return baseTools;
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
    // Cleanup usage service (flush pending writes)
    this.usageService.shutdown();

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
