import { MCPClientManager, MCPTool } from './mcp-client-manager.js';
import { ApprovalService } from './approval.js';
import { logger } from '../utils/logger.js';
import Ajv from 'ajv';

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: any; // JSON Schema
}

export interface FunctionCallResult {
  success: boolean;
  needsApproval?: boolean;
  approvalId?: string;
  data?: any;
  error?: string;
  message?: string;
}

export class FunctionBridge {
  private mcpManager: MCPClientManager;
  private approvalService: ApprovalService;
  private trustedTools: Set<string> = new Set();
  private trustedToolsByServer: Map<string, Set<string>> = new Map();
  private ajv: any;
  private toolSchemas: Map<string, any> = new Map();
  private approvalMode: 'always' | 'trusted' | 'never';

  constructor(
    mcpManager: MCPClientManager,
    approvalService: ApprovalService,
    trustedTools: string[] = [],
    approvalMode: 'always' | 'trusted' | 'never' = 'always',
    trustedToolsByServer: Record<string, string[]> = {}
  ) {
    this.mcpManager = mcpManager;
    this.approvalService = approvalService;
    this.trustedTools = new Set(trustedTools);
    this.ajv = new (Ajv as any)({ allErrors: true, removeAdditional: 'all' });
    this.approvalMode = approvalMode;
    
    // Initialize per-server trusted tools
    Object.entries(trustedToolsByServer).forEach(([serverName, tools]) => {
      this.trustedToolsByServer.set(serverName, new Set(tools));
    });
  }

  async getFunctionDefinitions(): Promise<FunctionDefinition[]> {
    try {
      const mcpTools = await this.mcpManager.listAllTools();
      
      const functionDefinitions: FunctionDefinition[] = mcpTools.map(tool => {
        const functionDef = this.convertMCPToolToFunction(tool);
        // Cache the tool schema for validation
        const toolKey = `${tool.serverName}:${tool.name}`;
        this.toolSchemas.set(toolKey, tool.inputSchema);
        return functionDef;
      });
      
      logger.debug(`Generated ${functionDefinitions.length} function definitions from MCP tools`);
      return functionDefinitions;
      
    } catch (error: any) {
      logger.error('Failed to generate function definitions:', error.message);
      return [];
    }
  }

  private convertMCPToolToFunction(mcpTool: MCPTool): FunctionDefinition {
    return {
      name: `mcp__${mcpTool.serverName}__${mcpTool.name}`,
      description: `[${mcpTool.serverName}] ${mcpTool.description}`,
      parameters: {
        type: 'object',
        properties: {
          // Include the MCP tool's original parameters
          ...(mcpTool.inputSchema?.properties || {}),
          
          // Add our internal parameters
          _mcp_server: {
            type: 'string',
            description: 'Internal: MCP server name',
            default: mcpTool.serverName,
          },
          _mcp_tool: {
            type: 'string', 
            description: 'Internal: MCP tool name',
            default: mcpTool.name,
          },
          _approval_id: {
            type: 'string',
            description: 'Internal: Approval ID if pre-approved',
          },
        },
        required: mcpTool.inputSchema?.required || [],
      },
    };
  }

  private validateToolArguments(toolKey: string, args: any): { valid: boolean; errors?: string[] } {
    const schema = this.toolSchemas.get(toolKey);
    if (!schema) {
      return { valid: true }; // No schema available, skip validation
    }

    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(args);
      
      if (!valid && validate.errors) {
        const errors = validate.errors.map((err: any) => 
          `${err.instancePath || 'root'}: ${err.message}`
        );
        return { valid: false, errors };
      }
      
      return { valid: true };
    } catch (error: any) {
      logger.warn(`Failed to validate schema for ${toolKey}:`, error.message);
      return { valid: true }; // Skip validation on error
    }
  }

  async handleFunctionCall(
    duckName: string,
    functionName: string,
    args: any
  ): Promise<FunctionCallResult> {
    try {
      logger.info(`FunctionBridge.handleFunctionCall called: ${duckName} -> ${functionName}`);
      logger.debug(`Approval mode: ${this.approvalMode}, Function: ${functionName}`);
      
      // Validate that this is an MCP function
      if (!functionName.startsWith('mcp__')) {
        logger.warn(`Invalid function name format: ${functionName}`);
        return {
          success: false,
          error: `Invalid function name: ${functionName}`,
        };
      }

      // Extract MCP server and tool names from args or function name
      const mcpServer = args._mcp_server || this.extractServerFromFunctionName(functionName);
      const mcpTool = args._mcp_tool || this.extractToolFromFunctionName(functionName);
      const approvalId = args._approval_id;

      if (!mcpServer || !mcpTool) {
        return {
          success: false,
          error: `Could not determine MCP server/tool from function: ${functionName}`,
        };
      }

      // Clean up internal parameters from args
      const cleanArgs = { ...args };
      delete cleanArgs._mcp_server;
      delete cleanArgs._mcp_tool;
      delete cleanArgs._approval_id;

      // Validate arguments against tool schema
      const toolKey = `${mcpServer}:${mcpTool}`;
      const validation = this.validateToolArguments(toolKey, cleanArgs);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid arguments for ${toolKey}: ${validation.errors?.join(', ')}`,
        };
      }

      // Check if approval is needed based on approval mode
      let isTrusted = false;
      
      // First check server-specific trusted tools
      const serverTrustedTools = this.trustedToolsByServer.get(mcpServer);
      if (serverTrustedTools) {
        isTrusted = serverTrustedTools.has('*') || // Wildcard for all tools from server
                    serverTrustedTools.has(mcpTool) || // Tool name only
                    serverTrustedTools.has(toolKey); // Full server:tool format
        logger.debug(`Server-specific trust check for ${mcpServer}: ${Array.from(serverTrustedTools)} - isTrusted: ${isTrusted}`);
      } else {
        // Fall back to global trusted tools
        isTrusted = this.trustedTools.has(toolKey) || this.trustedTools.has(mcpTool);
        logger.debug(`Global trust check - isTrusted: ${isTrusted}`);
      }
      
      const isAlreadyApprovedForSession = this.approvalService.isToolApprovedForSession(duckName, mcpServer, mcpTool);
      let needsApproval = false;

      logger.debug(`Approval check - Mode: ${this.approvalMode}, Trusted: ${isTrusted}, SessionApproved: ${isAlreadyApprovedForSession}, ToolKey: ${toolKey}, Server: ${mcpServer}, ApprovalId: ${approvalId}`);

      if (this.approvalMode === 'always') {
        // Always require approval unless already approved or approved for session
        needsApproval = !approvalId && !isAlreadyApprovedForSession;
        logger.debug(`Always mode: needsApproval = ${needsApproval}`);
      } else if (this.approvalMode === 'trusted') {
        // Only untrusted tools need approval, unless already approved for session
        needsApproval = !isTrusted && !approvalId && !isAlreadyApprovedForSession;
        logger.debug(`Trusted mode: needsApproval = ${needsApproval}`);
      } else if (this.approvalMode === 'never') {
        // Never require approval
        needsApproval = false;
        logger.debug(`Never mode: needsApproval = ${needsApproval}`);
      }

      if (needsApproval) {
        // Create approval request
        const request = this.approvalService.createApprovalRequest(
          duckName,
          mcpServer,
          mcpTool,
          cleanArgs
        );

        return {
          success: false,
          needsApproval: true,
          approvalId: request.id,
          message: `🔒 Approval needed for ${duckName} to call ${mcpServer}:${mcpTool}. Request ID: ${request.id}`,
        };
      }

      // If approval ID provided, verify it (except in 'never' mode)
      if (approvalId && this.approvalMode !== 'never') {
        const approvalStatus = this.approvalService.getApprovalStatus(approvalId);
        
        if (approvalStatus !== 'approved') {
          return {
            success: false,
            error: `Request not approved or expired (status: ${approvalStatus})`,
          };
        }
      }

      // Execute the MCP tool
      logger.info(`Executing MCP tool ${mcpServer}:${mcpTool} for ${duckName}`);
      const result = await this.mcpManager.callTool(mcpServer, mcpTool, cleanArgs);

      return {
        success: true,
        data: result,
      };

    } catch (error: any) {
      logger.error(`Function call failed for ${functionName}:`, error.message);
      return {
        success: false,
        error: `MCP tool execution failed: ${error.message}`,
      };
    }
  }

  private extractServerFromFunctionName(functionName: string): string | null {
    // Function name format: mcp__{server}__{tool}
    const match = functionName.match(/^mcp__([^_]+(?:_[^_]+)*)__/);
    return match ? match[1] : null;
  }

  private extractToolFromFunctionName(functionName: string): string | null {
    // Function name format: mcp__{server}__{tool}
    const match = functionName.match(/^mcp__[^_]+(?:_[^_]+)*__(.+)$/);
    return match ? match[1] : null;
  }

  // Check if a specific MCP tool is available
  async isToolAvailable(serverName: string, toolName: string): Promise<boolean> {
    try {
      const tools = await this.mcpManager.listServerTools(serverName);
      return tools.some(tool => tool.name === toolName);
    } catch (error) {
      return false;
    }
  }

  // Get available MCP tools grouped by server
  async getAvailableToolsByServer(): Promise<Record<string, MCPTool[]>> {
    try {
      const allTools = await this.mcpManager.listAllTools();
      const toolsByServer: Record<string, MCPTool[]> = {};

      allTools.forEach(tool => {
        if (!toolsByServer[tool.serverName]) {
          toolsByServer[tool.serverName] = [];
        }
        toolsByServer[tool.serverName].push(tool);
      });

      return toolsByServer;
    } catch (error: any) {
      logger.error('Failed to get tools by server:', error.message);
      return {};
    }
  }

  // Update trusted tools list
  updateTrustedTools(trustedTools: string[], trustedToolsByServer?: Record<string, string[]>): void {
    this.trustedTools = new Set(trustedTools);
    logger.info(`Updated global trusted tools list: ${Array.from(this.trustedTools).join(', ')}`);
    
    if (trustedToolsByServer) {
      this.trustedToolsByServer.clear();
      Object.entries(trustedToolsByServer).forEach(([serverName, tools]) => {
        this.trustedToolsByServer.set(serverName, new Set(tools));
        logger.info(`Updated trusted tools for server ${serverName}: ${tools.join(', ')}`);
      });
    }
  }

  // Get statistics about function calls
  getStats(): {
    totalFunctions: number;
    serverCount: number;
    trustedToolCount: number;
    connectedServers: string[];
  } {
    return {
      totalFunctions: 0, // Will be populated when tools are loaded
      serverCount: this.mcpManager.getConnectedServers().length,
      trustedToolCount: this.trustedTools.size,
      connectedServers: this.mcpManager.getConnectedServers(),
    };
  }
}