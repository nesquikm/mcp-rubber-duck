import { MCPClientManager, MCPTool } from './mcp-client-manager.js';
import { ApprovalService } from './approval.js';
import { logger } from '../utils/logger.js';
import Ajv, { ValidateFunction } from 'ajv';
import { GuardrailsService } from '../guardrails/service.js';
import { GuardrailContext } from '../guardrails/types.js';
import { GuardrailBlockError } from '../guardrails/errors.js';

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface FunctionCallResult {
  success: boolean;
  needsApproval?: boolean;
  approvalId?: string;
  data?: unknown;
  error?: string;
  message?: string;
}

export class FunctionBridge {
  private mcpManager: MCPClientManager;
  private approvalService: ApprovalService;
  private trustedTools: Set<string> = new Set();
  private trustedToolsByServer: Map<string, Set<string>> = new Map();
  private ajv: unknown;
  private toolSchemas: Map<string, Record<string, unknown>> = new Map();
  private approvalMode: 'always' | 'trusted' | 'never';
  private guardrailsService?: GuardrailsService;

  constructor(
    mcpManager: MCPClientManager,
    approvalService: ApprovalService,
    trustedTools: string[] = [],
    approvalMode: 'always' | 'trusted' | 'never' = 'always',
    trustedToolsByServer: Record<string, string[]> = {},
    guardrailsService?: GuardrailsService
  ) {
    this.mcpManager = mcpManager;
    this.approvalService = approvalService;
    this.trustedTools = new Set(trustedTools);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.ajv = new (Ajv as unknown as new (options: unknown) => unknown)({ allErrors: true, removeAdditional: 'all' });
    this.approvalMode = approvalMode;
    this.guardrailsService = guardrailsService;

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
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to generate function definitions:', errorMessage);
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
          ...((mcpTool.inputSchema as { properties?: Record<string, unknown> })?.properties || {}),
          
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
        required: ((mcpTool.inputSchema as { required?: string[] })?.required || []),
      },
    };
  }

  private validateToolArguments(toolKey: string, args: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const schema = this.toolSchemas.get(toolKey);
    if (!schema) {
      return { valid: true }; // No schema available, skip validation
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const validate: ValidateFunction = (this.ajv as { compile: (schema: unknown) => ValidateFunction }).compile(schema);
      const valid = validate(args);
      
      if (!valid && validate.errors) {
        const errors = validate.errors.map(err => 
          `${err.instancePath || 'root'}: ${err.message || 'validation error'}`
        );
        return { valid: false, errors };
      }
      
      return { valid: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to validate schema for ${toolKey}:`, errorMessage);
      return { valid: true }; // Skip validation on error
    }
  }

  async handleFunctionCall(
    duckName: string,
    functionName: string,
    args: Record<string, unknown>
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
      const mcpServer = (args._mcp_server as string) || this.extractServerFromFunctionName(functionName);
      const mcpTool = (args._mcp_tool as string) || this.extractToolFromFunctionName(functionName);
      const approvalId = args._approval_id as string;

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
        logger.debug(`Server-specific trust check for ${mcpServer}: ${Array.from(serverTrustedTools).join(', ')} - isTrusted: ${isTrusted}`);
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

      // Create guardrail context if service is enabled
      let guardrailContext: GuardrailContext | undefined;
      if (this.guardrailsService?.isEnabled()) {
        guardrailContext = this.guardrailsService.createContext({
          toolName: `${mcpServer}:${mcpTool}`,
          toolArgs: cleanArgs,
        });

        // Execute pre_tool_input guardrails
        const preResult = await this.guardrailsService.execute('pre_tool_input', guardrailContext);
        if (preResult.action === 'block') {
          throw new GuardrailBlockError(
            preResult.blockedBy || 'unknown',
            preResult.blockReason || 'Tool input blocked by guardrails'
          );
        }
        // Use potentially modified args (e.g., PII redaction)
        if (preResult.action === 'modify' && guardrailContext.toolArgs) {
          Object.assign(cleanArgs, guardrailContext.toolArgs);
        }
      }

      // Execute the MCP tool
      logger.info(`Executing MCP tool ${mcpServer}:${mcpTool} for ${duckName}`);
      const result = await this.mcpManager.callTool(mcpServer, mcpTool, cleanArgs);

      // Execute post_tool_output guardrails
      if (guardrailContext && this.guardrailsService?.isEnabled()) {
        guardrailContext.toolResult = result;
        const postResult = await this.guardrailsService.execute('post_tool_output', guardrailContext);
        if (postResult.action === 'block') {
          throw new GuardrailBlockError(
            postResult.blockedBy || 'unknown',
            postResult.blockReason || 'Tool output blocked by guardrails'
          );
        }
        // Return potentially modified result
        if (postResult.action === 'modify') {
          return {
            success: true,
            data: guardrailContext.toolResult,
          };
        }
      }

      return {
        success: true,
        data: result,
      };

    } catch (error: unknown) {
      // Re-throw GuardrailBlockError as-is
      if (error instanceof GuardrailBlockError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Function call failed for ${functionName}:`, errorMessage);
      return {
        success: false,
        error: `MCP tool execution failed: ${errorMessage}`,
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get tools by server:', errorMessage);
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