import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { ConfigManager } from './config/config.js';
import { ProviderManager } from './providers/manager.js';
import { ConversationManager } from './services/conversation.js';
import { ResponseCache } from './services/cache.js';
import { HealthMonitor } from './services/health.js';
import { logger } from './utils/logger.js';
import { duckArt, getRandomDuckMessage } from './utils/ascii-art.js';

// Import tools
import { askDuckTool } from './tools/ask-duck.js';
import { chatDuckTool } from './tools/chat-duck.js';
import { listDucksTool } from './tools/list-ducks.js';
import { compareDucksTool } from './tools/compare-ducks.js';
import { duckCouncilTool } from './tools/duck-council.js';

export class RubberDuckServer {
  private server: Server;
  private configManager: ConfigManager;
  private providerManager: ProviderManager;
  private conversationManager: ConversationManager;
  private cache: ResponseCache;
  private healthMonitor: HealthMonitor;

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
    this.providerManager = new ProviderManager(this.configManager);
    this.conversationManager = new ConversationManager();
    this.cache = new ResponseCache(this.configManager.getConfig().cache_ttl);
    this.healthMonitor = new HealthMonitor(this.providerManager);

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'ask_duck':
            return await askDuckTool(
              this.providerManager,
              this.cache,
              args
            );

          case 'chat_with_duck':
            return await chatDuckTool(
              this.providerManager,
              this.conversationManager,
              args
            );

          case 'list_ducks':
            return await listDucksTool(
              this.providerManager,
              this.healthMonitor,
              args
            );

          case 'compare_ducks':
            return await compareDucksTool(
              this.providerManager,
              this.cache,
              args
            );

          case 'duck_council':
            return await duckCouncilTool(
              this.providerManager,
              args
            );

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        logger.error(`Tool execution error for ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `${getRandomDuckMessage('error')}\n\nError: ${error.message}`,
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

  private getTools(): Tool[] {
    return [
      {
        name: 'ask_duck',
        description: 'Ask a question to a specific LLM provider (duck)',
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
            temperature: {
              type: 'number',
              description: 'Temperature for response generation (0-2)',
              minimum: 0,
              maximum: 2,
            },
            max_tokens: {
              type: 'number',
              description: 'Maximum tokens for response',
              minimum: 1,
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
          },
          required: ['conversation_id', 'message'],
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
          },
          required: ['prompt'],
        },
      },
    ];
  }

  async start() {
    console.log(duckArt.welcome);
    console.log('\n' + getRandomDuckMessage('startup'));
    
    // Start health monitoring
    this.healthMonitor.startMonitoring(60000);
    
    // Initial health check
    await this.healthMonitor.performHealthChecks();
    
    // Start the server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    logger.info('🦆 MCP Rubber Duck server started successfully!');
  }

  async stop() {
    this.healthMonitor.stopMonitoring();
    await this.server.close();
    logger.info('Server stopped');
  }
}