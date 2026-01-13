import { Prompt, GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { PromptDefinition } from './types.js';

// Import all prompt definitions
import { perspectivesPrompt } from './perspectives.js';
import { assumptionsPrompt } from './assumptions.js';
import { blindspotsPrompt } from './blindspots.js';
import { tradeoffsPrompt } from './tradeoffs.js';
import { redTeamPrompt } from './red-team.js';
import { reframePrompt } from './reframe.js';
import { architecturePrompt } from './architecture.js';
import { divergeConvergePrompt } from './diverge-converge.js';

/**
 * Registry of all available prompts.
 */
export const PROMPTS: Record<string, PromptDefinition> = {
  perspectives: perspectivesPrompt,
  assumptions: assumptionsPrompt,
  blindspots: blindspotsPrompt,
  tradeoffs: tradeoffsPrompt,
  red_team: redTeamPrompt,
  reframe: reframePrompt,
  architecture: architecturePrompt,
  diverge_converge: divergeConvergePrompt,
};

/**
 * Get all available prompts (without buildMessages function).
 * Used for prompts/list handler.
 */
export function getPrompts(): Prompt[] {
  return Object.values(PROMPTS).map(({ buildMessages: _, ...prompt }) => prompt);
}

/**
 * Get a specific prompt with generated messages.
 * Used for prompts/get handler.
 *
 * @param name - The prompt name
 * @param args - Arguments to pass to the prompt
 * @returns GetPromptResult with description and messages
 * @throws Error if prompt not found or required arguments missing
 */
export function getPrompt(name: string, args: Record<string, string>): GetPromptResult {
  const prompt = PROMPTS[name];

  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  try {
    const messages = prompt.buildMessages(args);
    return {
      description: prompt.description,
      messages,
    };
  } catch (error) {
    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to build prompt "${name}": ${errorMessage}`);
  }
}
