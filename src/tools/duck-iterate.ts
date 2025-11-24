import { ProviderManager } from '../providers/manager.js';
import { IterationRound, IterationResult } from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface DuckIterateArgs {
  prompt: string;
  iterations?: number;
  providers: [string, string];
  mode: 'refine' | 'critique-improve';
}

const DEFAULT_ITERATIONS = 3;
const CONVERGENCE_THRESHOLD = 0.8; // 80% similarity indicates convergence

export async function duckIterateTool(
  providerManager: ProviderManager,
  args: Record<string, unknown>
) {
  const {
    prompt,
    iterations = DEFAULT_ITERATIONS,
    providers,
    mode,
  } = args as unknown as DuckIterateArgs;

  // Validate inputs
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required');
  }

  if (!providers || !Array.isArray(providers) || providers.length !== 2) {
    throw new Error('Exactly 2 providers are required for iteration');
  }

  if (!mode || !['refine', 'critique-improve'].includes(mode)) {
    throw new Error('Mode must be either "refine" or "critique-improve"');
  }

  if (iterations < 1 || iterations > 10) {
    throw new Error('Iterations must be between 1 and 10');
  }

  // Validate providers exist
  const providerNames = providerManager.getProviderNames();
  for (const p of providers) {
    if (!providerNames.includes(p)) {
      throw new Error(`Provider "${p}" not found`);
    }
  }

  logger.info(`Starting ${mode} iteration with ${providers.join(' <-> ')} for ${iterations} rounds`);

  const rounds: IterationRound[] = [];
  let lastResponse = '';
  let converged = false;

  // Round 1: Initial generation by provider A
  const initialResponse = await providerManager.askDuck(providers[0], prompt);
  const providerAInfo = providerManager.getProvider(providers[0]);

  rounds.push({
    round: 1,
    provider: providers[0],
    nickname: providerAInfo.nickname,
    role: 'generator',
    content: initialResponse.content,
    timestamp: new Date(),
  });

  lastResponse = initialResponse.content;
  logger.info(`Round 1: ${providers[0]} generated initial response`);

  // Subsequent rounds: Alternate between providers
  for (let i = 2; i <= iterations; i++) {
    const isProviderA = i % 2 === 1;
    const currentProvider = isProviderA ? providers[0] : providers[1];
    const providerInfo = providerManager.getProvider(currentProvider);

    const iterationPrompt = buildIterationPrompt(prompt, lastResponse, mode, i, rounds);

    const response = await providerManager.askDuck(currentProvider, iterationPrompt);

    // Check for convergence
    if (checkConvergence(lastResponse, response.content)) {
      converged = true;
      logger.info(`Convergence detected at round ${i}`);
    }

    const role = mode === 'refine' ? 'refiner' : (i % 2 === 0 ? 'critic' : 'refiner');

    rounds.push({
      round: i,
      provider: currentProvider,
      nickname: providerInfo.nickname,
      role,
      content: response.content,
      timestamp: new Date(),
    });

    lastResponse = response.content;
    logger.info(`Round ${i}: ${currentProvider} ${role === 'critic' ? 'critiqued' : 'refined'}`);

    if (converged) {
      break;
    }
  }

  const result: IterationResult = {
    prompt,
    mode,
    providers,
    rounds,
    finalResponse: lastResponse,
    totalIterations: rounds.length,
    converged,
  };

  // Format output
  const formattedOutput = formatIterationResult(result);

  logger.info(`Iteration completed: ${rounds.length} rounds, converged: ${converged}`);

  return {
    content: [
      {
        type: 'text',
        text: formattedOutput,
      },
    ],
  };
}

function buildIterationPrompt(
  originalPrompt: string,
  previousResponse: string,
  mode: 'refine' | 'critique-improve',
  round: number,
  previousRounds: IterationRound[]
): string {
  if (mode === 'refine') {
    return `You are refining a response through iterative improvement.

ORIGINAL TASK:
${originalPrompt}

PREVIOUS RESPONSE (Round ${round - 1}):
${previousResponse}

YOUR TASK:
Improve upon the previous response. Make it:
- More accurate
- More complete
- Clearer and better structured
- More practical and actionable

Provide your improved version directly. Do not explain what you changed - just give the improved response.`;
  } else {
    // critique-improve mode
    const isEvenRound = round % 2 === 0;

    if (isEvenRound) {
      // Critic round
      return `You are a critical reviewer evaluating a response.

ORIGINAL TASK:
${originalPrompt}

RESPONSE TO CRITIQUE:
${previousResponse}

YOUR TASK:
Provide a thorough critique of this response:
1. Identify specific weaknesses, errors, or gaps
2. Point out unclear or confusing parts
3. Suggest concrete improvements
4. Note any missing considerations

Be constructive but thorough. Format as a bulleted critique.`;
    } else {
      // Improvement round based on critique
      const lastCritique = previousRounds[previousRounds.length - 1]?.content || '';
      const lastGoodResponse = previousRounds[previousRounds.length - 2]?.content || previousResponse;

      return `You are improving a response based on critical feedback.

ORIGINAL TASK:
${originalPrompt}

PREVIOUS RESPONSE:
${lastGoodResponse}

CRITIQUE RECEIVED:
${lastCritique}

YOUR TASK:
Create an improved response that addresses the critique points while maintaining the strengths of the original. Provide only the improved response, not meta-commentary.`;
    }
  }
}

function checkConvergence(previous: string, current: string): boolean {
  // Simple similarity check based on length and common words
  const prevWords = new Set(previous.toLowerCase().split(/\s+/));
  const currWords = new Set(current.toLowerCase().split(/\s+/));

  const intersection = new Set([...prevWords].filter(x => currWords.has(x)));
  const union = new Set([...prevWords, ...currWords]);

  const similarity = intersection.size / union.size;

  // Also check if lengths are similar
  const lengthRatio = Math.min(previous.length, current.length) / Math.max(previous.length, current.length);

  return similarity > CONVERGENCE_THRESHOLD && lengthRatio > 0.8;
}

function formatIterationResult(result: IterationResult): string {
  let output = `🔄 **Iterative Refinement Results**\n`;
  output += `═══════════════════════════════════════\n\n`;
  output += `**Mode:** ${result.mode}\n`;
  output += `**Providers:** ${result.providers.join(' ↔ ')}\n`;
  output += `**Iterations:** ${result.totalIterations}`;
  if (result.converged) {
    output += ` (converged early ✓)`;
  }
  output += `\n\n`;

  // Show each round
  output += `**Iteration History:**\n`;
  output += `─────────────────────────────────────\n`;

  for (const round of result.rounds) {
    const roleEmoji = round.role === 'generator' ? '🎯' :
                      round.role === 'critic' ? '🔍' : '✨';
    output += `\n${roleEmoji} **Round ${round.round}: ${round.nickname}** (${round.role})\n`;

    // Truncate long content for display
    const displayContent = round.content.length > 500
      ? round.content.substring(0, 500) + '...[truncated]'
      : round.content;
    output += `${displayContent}\n`;
  }

  // Final response
  output += `\n═══════════════════════════════════════\n`;
  output += `🏁 **Final Response:**\n`;
  output += `─────────────────────────────────────\n`;
  output += `${result.finalResponse}\n`;
  output += `\n═══════════════════════════════════════\n`;
  output += `📊 ${result.totalIterations} rounds completed\n`;

  return output;
}
