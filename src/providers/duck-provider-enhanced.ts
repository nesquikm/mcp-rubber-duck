import { DuckProvider } from './provider.js';
import { ChatOptions, ChatResponse, ProviderOptions, OpenAIChatParams, OpenAIMessage, MCPResult, OpenAIToolCall } from './types.js';
import { FunctionBridge } from '../services/function-bridge.js';
import { ConversationMessage } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { SafeLogger } from '../utils/safe-logger.js';
import { GuardrailsService } from '../guardrails/service.js';
import { GuardrailBlockError } from '../guardrails/errors.js';

export interface EnhancedChatResponse extends ChatResponse {
  pendingApprovals?: {
    id: string;
    message: string;
  }[];
  mcpResults?: MCPResult[];
}

export class EnhancedDuckProvider extends DuckProvider {
  private functionBridge: FunctionBridge;
  private mcpEnabled: boolean;

  constructor(
    name: string,
    nickname: string,
    options: ProviderOptions,
    functionBridge: FunctionBridge,
    mcpEnabled: boolean = true,
    guardrailsService?: GuardrailsService
  ) {
    super(name, nickname, options, guardrailsService);
    this.functionBridge = functionBridge;
    this.mcpEnabled = mcpEnabled;
  }

  async chat(options: ChatOptions): Promise<EnhancedChatResponse> {
    try {
      const modelToUse = options.model || this.options.model;

      // Create guardrail context if service is enabled
      const guardrailContext = this.guardrailsService?.isEnabled()
        ? this.guardrailsService.createContext({
            provider: this.name,
            model: modelToUse,
            messages: options.messages,
            prompt: options.messages[options.messages.length - 1]?.content,
          })
        : undefined;

      // Execute pre_request guardrails
      if (guardrailContext && this.guardrailsService?.isEnabled()) {
        const preResult = await this.guardrailsService.execute('pre_request', guardrailContext);
        if (preResult.action === 'block') {
          throw new GuardrailBlockError(
            preResult.blockedBy || 'unknown',
            preResult.blockReason || 'Request blocked by guardrails'
          );
        }
        // Update messages if modified by guardrails (e.g., PII redaction)
        if (preResult.action === 'modify' && guardrailContext.messages.length > 0) {
          options = { ...options, messages: guardrailContext.messages };
        }
      }

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

      const baseParams: Partial<OpenAIChatParams> = {
        model: modelToUse,
        messages: messages as OpenAIMessage[],
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
        const toolResult = await this.handleToolCalls(
          choice.message.tool_calls,
          messages as OpenAIMessage[],
          baseParams,
          modelToUse,
          guardrailContext
        );

        // Execute post_response guardrails on final result
        if (guardrailContext && this.guardrailsService?.isEnabled()) {
          guardrailContext.response = toolResult.content;
          const postResult = await this.guardrailsService.execute('post_response', guardrailContext);
          if (postResult.action === 'block') {
            throw new GuardrailBlockError(
              postResult.blockedBy || 'unknown',
              postResult.blockReason || 'Response blocked by guardrails'
            );
          }
          if (postResult.action === 'modify' && guardrailContext.response) {
            toolResult.content = guardrailContext.response;
          }
        }

        return toolResult;
      }

      let content = choice.message?.content || '';

      // Execute post_response guardrails
      if (guardrailContext && this.guardrailsService?.isEnabled()) {
        guardrailContext.response = content;
        const postResult = await this.guardrailsService.execute('post_response', guardrailContext);
        if (postResult.action === 'block') {
          throw new GuardrailBlockError(
            postResult.blockedBy || 'unknown',
            postResult.blockReason || 'Response blocked by guardrails'
          );
        }
        if (postResult.action === 'modify' && guardrailContext.response) {
          content = guardrailContext.response;
        }
      }

      // No tool calls, return regular response
      return {
        content,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        model: modelToUse,
        finishReason: choice.finish_reason || undefined,
      };

    } catch (error: unknown) {
      // Re-throw GuardrailBlockError as-is
      if (error instanceof GuardrailBlockError) {
        throw error;
      }
      logger.error(`Enhanced provider ${this.name} chat error:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Duck ${this.nickname} couldn't respond: ${errorMessage}`);
    }
  }

  private async handleToolCalls(
    toolCalls: OpenAIToolCall[],
    messages: OpenAIMessage[],
    baseParams: Partial<OpenAIChatParams>,
    modelToUse: string,
    _guardrailContext?: import('../guardrails/types.js').GuardrailContext
  ): Promise<EnhancedChatResponse> {
    const pendingApprovals: { id: string; message: string }[] = [];
    const toolMessages: OpenAIMessage[] = [];
    let hasExecutedTools = false;

    // Add the assistant message with tool calls
    const assistantMessage: OpenAIMessage = {
      role: 'assistant' as const,
      content: null,
      tool_calls: toolCalls,
    };
    messages.push(assistantMessage);

    // Process each tool call
    for (const toolCall of toolCalls) {
      try {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

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
            content: typeof result.data === 'string' 
              ? result.data 
              : JSON.stringify(result.data),
          });

        } else {
          // Function failed
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: result.error || 'Unknown error',
            }),
          });
        }

      } catch (error: unknown) {
        logger.error(`Error processing tool call ${toolCall.id}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: `Tool execution failed: ${errorMessage}`,
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
      mcpResults: hasExecutedTools ? (toolMessages as unknown as MCPResult[]) : undefined,
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
            ...(tool.parameters.properties as Record<string, unknown>),
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
    } catch (_error) {
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