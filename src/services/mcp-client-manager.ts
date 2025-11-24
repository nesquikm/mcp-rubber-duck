import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '../utils/logger.js';
import { SafeLogger } from '../utils/safe-logger.js';

export interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'http';
  command?: string;  // for stdio
  args?: string[];   // for stdio
  url?: string;      // for http
  apiKey?: string;   // for http auth
  enabled?: boolean;
  retryAttempts?: number; // Number of retry attempts (default: 3)
  retryDelay?: number;    // Initial retry delay in ms (default: 1000)
}

export interface MCPTool {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private configs: MCPServerConfig[] = [];
  private connectionStatus: Map<string, 'connected' | 'connecting' | 'disconnected' | 'error'> = new Map();
  private retryInfo: Map<string, { attempts: number; lastAttempt: number }> = new Map();

  constructor(configs: MCPServerConfig[] = []) {
    this.configs = configs.filter(config => config.enabled !== false);
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing MCP Client Manager with ${this.configs.length} servers`);
    
    const connectionPromises = this.configs.map(config => this.connectToServer(config));
    
    // Connect to all servers in parallel, but don't fail if some fail
    const results = await Promise.allSettled(connectionPromises);
    
    let successCount = 0;
    results.forEach((result, index) => {
      const serverName = this.configs[index].name;
      if (result.status === 'fulfilled') {
        successCount++;
        logger.info(`Successfully connected to MCP server: ${serverName}`);
      } else {
        logger.error(`Failed to connect to MCP server ${serverName}:`, result.reason);
        this.connectionStatus.set(serverName, 'error');
      }
    });
    
    logger.info(`MCP Client Manager initialized: ${successCount}/${this.configs.length} servers connected`);
  }

  private async connectToServer(config: MCPServerConfig): Promise<Client> {
    const { name, type } = config;
    const maxRetries = config.retryAttempts ?? 3;
    const initialDelay = config.retryDelay ?? 1000;
    
    if (this.clients.has(name)) {
      logger.warn(`MCP server ${name} already connected`);
      return this.clients.get(name)!;
    }
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.connectionStatus.set(name, 'connecting');
        this.retryInfo.set(name, { attempts: attempt, lastAttempt: Date.now() });
        
        if (attempt > 0) {
          const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.info(`Retrying connection to MCP server ${name} (attempt ${attempt}/${maxRetries}) after ${delay}ms`);
          await this.sleep(delay);
        }
        
        // Create client
        const client = new Client({
          name: 'mcp-rubber-duck',
          version: '1.0.0',
        }, {
          capabilities: {},
        });
        
        // Create transport based on type
        let transport;
        if (type === 'stdio') {
          if (!config.command) {
            throw new Error(`stdio server ${name} requires command`);
          }
          
          transport = new StdioClientTransport({
            command: config.command,
            args: config.args || [],
          });
        } else if (type === 'http') {
          if (!config.url) {
            throw new Error(`http server ${name} requires url`);
          }
          
          // HTTP transport using StreamableHTTPClientTransport
          const url = new URL(config.url);
          const transportOptions: { requestInit?: { headers?: Record<string, string> } } = {};
          
          if (config.apiKey) {
            transportOptions.requestInit = {
              headers: {
                'Authorization': `Bearer ${config.apiKey}`,
              },
            };
          }
          
          transport = new StreamableHTTPClientTransport(url, transportOptions);
        } else {
          throw new Error(`Unsupported transport type: ${String(type)}`);
        }
        
        // Connect to server with timeout
        const connectTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 30000)
        );
        
        await Promise.race([
          client.connect(transport),
          connectTimeout
        ]);
        
        this.clients.set(name, client);
        this.connectionStatus.set(name, 'connected');
        this.retryInfo.delete(name); // Clear retry info on success
        
        logger.info(`Connected to MCP server: ${name} (${type}) after ${attempt} retries`);
        return client;
        
      } catch (error: unknown) {
        logger.warn(`Failed to connect to MCP server ${name} (attempt ${attempt + 1}/${maxRetries + 1}):`, error instanceof Error ? error.message : String(error));
        
        if (attempt === maxRetries) {
          this.connectionStatus.set(name, 'error');
          this.retryInfo.set(name, { attempts: attempt + 1, lastAttempt: Date.now() });
          logger.error(`All retry attempts exhausted for MCP server ${name}`);
          throw error;
        }
      }
    }
    
    throw new Error(`Failed to connect to MCP server ${name} after ${maxRetries + 1} attempts`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async disconnectAll(): Promise<void> {
    logger.info('Disconnecting all MCP clients');
    
    const disconnectPromises = Array.from(this.clients.entries()).map(async ([name, client]) => {
      try {
        await client.close();
        this.connectionStatus.set(name, 'disconnected');
        logger.info(`Disconnected from MCP server: ${name}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error disconnecting from MCP server ${name}:`, errorMessage);
      }
    });
    
    await Promise.allSettled(disconnectPromises);
    
    this.clients.clear();
    logger.info('All MCP clients disconnected');
  }

  getClient(serverName: string): Client | undefined {
    const client = this.clients.get(serverName);
    const status = this.connectionStatus.get(serverName);
    
    if (!client || status !== 'connected') {
      return undefined;
    }
    
    return client;
  }

  getConnectionStatus(serverName: string): 'connected' | 'connecting' | 'disconnected' | 'error' | 'unknown' {
    return this.connectionStatus.get(serverName) || 'unknown';
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys()).filter(name => 
      this.connectionStatus.get(name) === 'connected'
    );
  }

  async listAllTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    
    for (const [serverName, client] of this.clients.entries()) {
      if (this.connectionStatus.get(serverName) !== 'connected') {
        continue;
      }
      
      try {
        const toolsResult = await client.listTools();
        
        if (toolsResult.tools) {
          const serverTools = toolsResult.tools.map(tool => ({
            serverName,
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema,
          }));
          
          allTools.push(...serverTools);
          logger.debug(`Listed ${serverTools.length} tools from ${serverName}`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to list tools from ${serverName}:`, errorMessage);
      }
    }
    
    logger.debug(`Total MCP tools available: ${allTools.length}`);
    return allTools;
  }

  async listServerTools(serverName: string): Promise<MCPTool[]> {
    const client = this.getClient(serverName);
    if (!client) {
      throw new Error(`MCP server ${serverName} not connected`);
    }
    
    try {
      const toolsResult = await client.listTools();
      
      if (!toolsResult.tools) {
        return [];
      }
      
      return toolsResult.tools.map(tool => ({
        serverName,
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
      }));
    } catch (error: unknown) {
      logger.error(`Failed to list tools from ${serverName}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const client = this.getClient(serverName);
    if (!client) {
      throw new Error(`MCP server ${serverName} not connected`);
    }
    
    try {
      SafeLogger.debug(`Calling MCP tool ${serverName}:${toolName} with args:`, args);
      
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });
      
      SafeLogger.debug(`MCP tool ${serverName}:${toolName} returned:`, result);
      return result;
      
    } catch (error: unknown) {
      logger.error(`Failed to call MCP tool ${serverName}:${toolName}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // Health check for all connected servers
  async healthCheck(): Promise<Record<string, boolean>> {
    const healthStatus: Record<string, boolean> = {};
    
    for (const [serverName, client] of this.clients.entries()) {
      try {
        // Try to list tools as a health check
        await client.listTools();
        healthStatus[serverName] = true;
        this.connectionStatus.set(serverName, 'connected');
      } catch (error: unknown) {
        healthStatus[serverName] = false;
        this.connectionStatus.set(serverName, 'error');
        logger.warn(`Health check failed for MCP server ${serverName}:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    return healthStatus;
  }

  // Get status of all servers
  getStatus(): Record<string, {
    status: string;
    type: string;
    toolCount?: number;
    retryAttempts?: number;
    lastAttempt?: number;
  }> {
    const status: Record<string, {
      status: string;
      type: string;
      retryAttempts?: number;
      lastAttempt?: number;
    }> = {};
    
    this.configs.forEach(config => {
      const retryInfo = this.retryInfo.get(config.name);
      status[config.name] = {
        status: this.connectionStatus.get(config.name) || 'unknown',
        type: config.type,
        ...(retryInfo && {
          retryAttempts: retryInfo.attempts,
          lastAttempt: retryInfo.lastAttempt,
        }),
      };
    });
    
    return status;
  }

  // Get retry information for a specific server
  getRetryInfo(serverName: string): { attempts: number; lastAttempt: number } | undefined {
    return this.retryInfo.get(serverName);
  }

  // Retry connection for a specific server
  async retryConnection(serverName: string): Promise<boolean> {
    const config = this.configs.find(c => c.name === serverName);
    if (!config) {
      logger.error(`Server config not found for ${serverName}`);
      return false;
    }

    try {
      // Disconnect first if connected
      const existingClient = this.clients.get(serverName);
      if (existingClient) {
        await existingClient.close();
        this.clients.delete(serverName);
      }

      // Reset retry info
      this.retryInfo.delete(serverName);
      
      // Attempt to connect
      await this.connectToServer(config);
      return true;
    } catch (error: unknown) {
      logger.error(`Manual retry failed for ${serverName}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }
}