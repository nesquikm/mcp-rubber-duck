import { DuckProvider } from './provider.js';
import { ChatOptions, ChatResponse } from './types.js';
import { FunctionBridge } from '../services/function-bridge.js';
import { ConversationMessage } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { SafeLogger } from '../utils/safe-logger.js';

export interface EnhancedChatResponse extends ChatResponse {
  pendingApprovals?: {
    id: string;
    message: string;
  }[];
  mcpResults?: any[];
}

export class EnhancedDuckProvider extends DuckProvider {
  private functionBridge: FunctionBridge;
  private mcpEnabled: boolean;

  constructor(
    name: string,
    nickname: string,
    options: any,
    functionBridge: FunctionBridge,
    mcpEnabled: boolean = true
  ) {
    super(name, nickname, options);
    this.functionBridge = functionBridge;
    this.mcpEnabled = mcpEnabled;
  }

  async chat(options: ChatOptions): Promise<EnhancedChatResponse> {
    try {
      // If MCP is enabled, add function definitions
      if (this.mcpEnabled) {
        const functions = await this.functionBridge.getFunctionDefinitions();
        if (functions.length > 0) {
          options.tools = functions;
          options.toolChoice = 'auto';
          logger.debug(`Added ${functions.length} MCP functions for ${this.nickname}`);
        }
      }

      // Prepare messages for function calling
      const messages = this.prepareMessages(options.messages, options.systemPrompt);
      const modelToUse = options.model || this.options.model;

      const baseParams: any = {
        model: modelToUse,
        messages: messages as any,
        stream: false,
      };

      // Add temperature if model supports it
      if (this.supportsTemperature(modelToUse)) {
        baseParams.temperature = options.temperature ?? this.options.temperature ?? 0.7;
      }

      // Add tools if available
      if (options.tools && options.tools.length > 0) {
        baseParams.tools = options.tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }));
        baseParams.tool_choice = options.toolChoice || 'auto';
      }

      // First API call
      const response = await this.createChatCompletion(baseParams);
      const choice = response.choices[0];

      // Check if the model wants to call functions
      if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
        return await this.handleToolCalls(
          choice.message.tool_calls,
          messages,
          baseParams,
          modelToUse
        );
      }

      // No tool calls, return regular response
      return {
        content: choice.message?.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        model: modelToUse,
        finishReason: choice.finish_reason || undefined,
      };

    } catch (error: any) {
      logger.error(`Enhanced provider ${this.name} chat error:`, error);
      throw new Error(`Duck ${this.nickname} couldn't respond: ${error.message}`);
    }
  }

  private async handleToolCalls(
    toolCalls: any[],
    messages: any[],
    baseParams: any,
    modelToUse: string
  ): Promise<EnhancedChatResponse> {
    const pendingApprovals: { id: string; message: string }[] = [];
    const toolMessages: any[] = [];
    let hasExecutedTools = false;

    // Add the assistant message with tool calls
    const assistantMessage = {
      role: 'assistant',
      content: null,
      tool_calls: toolCalls,
    };
    messages.push(assistantMessage);

    // Process each tool call
    for (const toolCall of toolCalls) {
      try {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        logger.info(`${this.nickname} wants to call function: ${functionName}`);
        SafeLogger.debug(`Function call arguments for ${functionName}:`, args);

        const result = await this.functionBridge.handleFunctionCall(
          this.nickname,
          functionName,
          args
        );

        if (result.needsApproval && result.approvalId) {
          // Function needs approval
          pendingApprovals.push({
            id: result.approvalId,
            message: result.message || `Approval needed for ${functionName}`,
          });

          // Add a tool message indicating approval is needed
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: functionName,
            content: JSON.stringify({
              status: 'approval_needed',
              approval_id: result.approvalId,
              message: result.message,
            }),
          });

        } else if (result.success && result.data) {
          // Function executed successfully
          hasExecutedTools = true;
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: functionName,
            content: typeof result.data === 'string' 
              ? result.data 
              : JSON.stringify(result.data),
          });

        } else {
          // Function failed
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: functionName,
            content: JSON.stringify({
              error: result.error || 'Unknown error',
            }),
          });
        }

      } catch (error: any) {
        logger.error(`Error processing tool call ${toolCall.id}:`, error);
        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify({
            error: `Tool execution failed: ${error.message}`,
          }),
        });
      }
    }

    // If we have pending approvals, return them without calling the model again
    if (pendingApprovals.length > 0) {
      const approvalMessage = pendingApprovals.length === 1
        ? pendingApprovals[0].message
        : `Multiple approvals needed: ${pendingApprovals.map(a => a.id).join(', ')}`;

      return {
        content: `⏳ ${approvalMessage}`,
        model: modelToUse,
        pendingApprovals,
        finishReason: 'tool_calls',
      };
    }

    // Add tool messages and call model again for final response
    messages.push(...toolMessages);

    // Remove tools from the follow-up call to get a natural language response
    const followUpParams = {
      ...baseParams,
      messages,
    };
    delete followUpParams.tools;
    delete followUpParams.tool_choice;

    const finalResponse = await this.createChatCompletion(followUpParams);
    const finalChoice = finalResponse.choices[0];

    return {
      content: finalChoice.message?.content || '',
      usage: finalResponse.usage ? {
        promptTokens: finalResponse.usage.prompt_tokens,
        completionTokens: finalResponse.usage.completion_tokens,
        totalTokens: finalResponse.usage.total_tokens,
      } : undefined,
      model: modelToUse,
      finishReason: finalChoice.finish_reason || undefined,
      mcpResults: hasExecutedTools ? toolMessages : undefined,
    };
  }

  // Method to retry with approval
  async retryWithApproval(
    approvalId: string,
    originalMessages: ConversationMessage[],
    options: ChatOptions
  ): Promise<EnhancedChatResponse> {
    // Add approval ID to the tool arguments
    if (options.tools) {
      options.tools = options.tools.map(tool => ({
        ...tool,
        parameters: {
          ...tool.parameters,
          properties: {
            ...tool.parameters.properties,
            _approval_id: {
              type: 'string',
              default: approvalId,
            },
          },
        },
      }));
    }

    // Retry the chat with the approval ID
    return this.chat({
      ...options,
      messages: originalMessages,
    });
  }

  // Check if MCP functions are available
  async getMCPFunctionCount(): Promise<number> {
    if (!this.mcpEnabled) {
      return 0;
    }

    try {
      const functions = await this.functionBridge.getFunctionDefinitions();
      return functions.length;
    } catch (error) {
      return 0;
    }
  }

  // Get MCP bridge statistics
  getMCPStats() {
    if (!this.mcpEnabled) {
      return null;
    }

    return this.functionBridge.getStats();
  }

  // Enable/disable MCP for this provider
  setMCPEnabled(enabled: boolean): void {
    this.mcpEnabled = enabled;
    logger.info(`MCP ${enabled ? 'enabled' : 'disabled'} for ${this.nickname}`);
  }

  isMCPEnabled(): boolean {
    return this.mcpEnabled;
  }
}