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
  toolRoundsUsed?: number;
}

export class EnhancedDuckProvider extends DuckProvider {
  private functionBridge: FunctionBridge;
  private mcpEnabled: boolean;
  private maxToolRounds: number;

  constructor(
    name: string,
    nickname: string,
    options: ProviderOptions,
    functionBridge: FunctionBridge,
    mcpEnabled: boolean = true,
    guardrailsService?: GuardrailsService,
    maxToolRounds: number = 10
  ) {
    super(name, nickname, options, guardrailsService);
    this.functionBridge = functionBridge;
    this.mcpEnabled = mcpEnabled;
    this.maxToolRounds = maxToolRounds;
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
          guardrailContext,
          response.usage
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
    _guardrailContext?: import('../guardrails/types.js').GuardrailContext,
    initialUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  ): Promise<EnhancedChatResponse> {
    // Accumulate usage across all rounds
    let accumulatedUsage = initialUsage
      ? { promptTokens: initialUsage.prompt_tokens, completionTokens: initialUsage.completion_tokens, totalTokens: initialUsage.total_tokens }
      : undefined;

    const allMcpResults: MCPResult[] = [];
    let currentToolCalls = toolCalls;
    let round = 0;

    while (round < this.maxToolRounds) {
      round++;
      const pendingApprovals: { id: string; message: string }[] = [];
      const toolMessages: OpenAIMessage[] = [];

      // Add the assistant message with tool calls
      const assistantMessage: OpenAIMessage = {
        role: 'assistant' as const,
        content: null,
        tool_calls: currentToolCalls,
      };
      messages.push(assistantMessage);

      // Process each tool call
      for (const toolCall of currentToolCalls) {
        try {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

          logger.info(`${this.nickname} calling function (round ${round}): ${functionName}`);
          SafeLogger.debug(`Function call arguments for ${functionName}:`, args);

          const result = await this.functionBridge.handleFunctionCall(
            this.nickname,
            functionName,
            args
          );

          if (result.needsApproval && result.approvalId) {
            pendingApprovals.push({
              id: result.approvalId,
              message: result.message || `Approval needed for ${functionName}`,
            });

            toolMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                status: 'approval_needed',
                approval_id: result.approvalId,
                message: result.message,
              }),
            });

            allMcpResults.push({
              id: toolCall.id,
              success: false,
              error: `Approval needed: ${result.message || functionName}`,
            });

          } else if (result.success) {
            toolMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result.data != null
                ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data))
                : 'Success',
            });

            allMcpResults.push({
              id: toolCall.id,
              success: true,
              data: result.data,
            });

          } else {
            toolMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: result.error || 'Unknown error',
              }),
            });

            allMcpResults.push({
              id: toolCall.id,
              success: false,
              error: result.error || 'Unknown error',
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

          allMcpResults.push({
            id: toolCall.id,
            success: false,
            error: `Tool execution failed: ${errorMessage}`,
          });
        }
      }

      // Always add tool messages to keep messages array consistent
      messages.push(...toolMessages);

      // If we have pending approvals, return immediately
      if (pendingApprovals.length > 0) {
        const approvalMessage = pendingApprovals.length === 1
          ? pendingApprovals[0].message
          : `Multiple approvals needed: ${pendingApprovals.map(a => a.id).join(', ')}`;

        return {
          content: `⏳ ${approvalMessage}`,
          model: modelToUse,
          usage: accumulatedUsage,
          pendingApprovals,
          finishReason: 'tool_calls',
          mcpResults: allMcpResults.length > 0 ? allMcpResults : undefined,
          toolRoundsUsed: round,
        };
      }

      // Make follow-up call WITH tools still available
      const followUpParams = {
        ...baseParams,
        messages,
      };

      const followUpResponse = await this.createChatCompletion(followUpParams);
      const followUpChoice = followUpResponse.choices[0];

      if (!followUpChoice) {
        throw new Error(`API returned empty choices array during tool calling round ${round}`);
      }

      // Accumulate usage
      if (followUpResponse.usage) {
        if (accumulatedUsage) {
          accumulatedUsage.promptTokens += followUpResponse.usage.prompt_tokens;
          accumulatedUsage.completionTokens += followUpResponse.usage.completion_tokens;
          accumulatedUsage.totalTokens += followUpResponse.usage.total_tokens;
        } else {
          accumulatedUsage = {
            promptTokens: followUpResponse.usage.prompt_tokens,
            completionTokens: followUpResponse.usage.completion_tokens,
            totalTokens: followUpResponse.usage.total_tokens,
          };
        }
      }

      // Warn about growing message count that could overflow context window
      if (messages.length > 40) {
        logger.warn(`${this.nickname} message count is ${messages.length} at round ${round} — risk of context window overflow`);
      }

      // If no more tool calls, return the text response
      if (!followUpChoice.message?.tool_calls || followUpChoice.message.tool_calls.length === 0) {
        return {
          content: followUpChoice.message?.content || '',
          usage: accumulatedUsage,
          model: modelToUse,
          finishReason: followUpChoice.finish_reason || undefined,
          mcpResults: allMcpResults.length > 0 ? allMcpResults : undefined,
          toolRoundsUsed: round,
        };
      }

      // LLM wants more tool calls — continue loop
      currentToolCalls = followUpChoice.message.tool_calls;
    }

    // Max rounds reached — force a text-only response
    logger.warn(`${this.nickname} hit max tool rounds (${this.maxToolRounds}), forcing text response`);
    const finalParams = {
      ...baseParams,
      messages,
    };
    delete finalParams.tools;
    delete finalParams.tool_choice;

    const finalResponse = await this.createChatCompletion(finalParams);
    const finalChoice = finalResponse.choices[0];

    if (!finalChoice) {
      throw new Error('API returned empty choices array during forced text response');
    }

    if (finalResponse.usage) {
      if (accumulatedUsage) {
        accumulatedUsage.promptTokens += finalResponse.usage.prompt_tokens;
        accumulatedUsage.completionTokens += finalResponse.usage.completion_tokens;
        accumulatedUsage.totalTokens += finalResponse.usage.total_tokens;
      } else {
        accumulatedUsage = {
          promptTokens: finalResponse.usage.prompt_tokens,
          completionTokens: finalResponse.usage.completion_tokens,
          totalTokens: finalResponse.usage.total_tokens,
        };
      }
    }

    return {
      content: finalChoice.message?.content || '',
      usage: accumulatedUsage,
      model: modelToUse,
      finishReason: finalChoice.finish_reason || undefined,
      mcpResults: allMcpResults.length > 0 ? allMcpResults : undefined,
      toolRoundsUsed: round,
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