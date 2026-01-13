import { Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Extended Prompt definition that includes a buildMessages function
 * to generate structured messages from user-provided arguments.
 */
export interface PromptDefinition extends Prompt {
  /**
   * Build the prompt messages from the provided arguments.
   * @param args - Record of argument name to value
   * @returns Array of PromptMessage objects
   */
  buildMessages: (args: Record<string, string>) => PromptMessage[];
}
