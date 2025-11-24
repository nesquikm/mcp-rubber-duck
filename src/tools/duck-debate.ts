import { ProviderManager } from '../providers/manager.js';
import {
  DebateFormat,
  DebatePosition,
  DebateParticipant,
  DebateArgument,
  DebateResult,
} from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface DuckDebateArgs {
  prompt: string;
  rounds?: number;
  providers?: string[];
  format: DebateFormat;
  synthesizer?: string;
}

const DEFAULT_ROUNDS = 3;

export async function duckDebateTool(
  providerManager: ProviderManager,
  args: Record<string, unknown>
) {
  const {
    prompt,
    rounds = DEFAULT_ROUNDS,
    providers,
    format,
    synthesizer,
  } = args as unknown as DuckDebateArgs;

  // Validate inputs
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt/topic is required');
  }

  if (!format || !['oxford', 'socratic', 'adversarial'].includes(format)) {
    throw new Error('Format must be "oxford", "socratic", or "adversarial"');
  }

  if (rounds < 1 || rounds > 10) {
    throw new Error('Rounds must be between 1 and 10');
  }

  // Get providers
  const allProviders = providerManager.getProviderNames();

  // If providers explicitly specified but less than 2, error
  if (providers && providers.length < 2) {
    throw new Error('At least 2 providers are required for a debate');
  }

  const debateProviders = providers && providers.length >= 2
    ? providers
    : allProviders;

  if (debateProviders.length < 2) {
    throw new Error('At least 2 providers are required for a debate');
  }

  // Validate providers exist
  for (const p of debateProviders) {
    if (!allProviders.includes(p)) {
      throw new Error(`Provider "${p}" not found`);
    }
  }

  logger.info(`Starting ${format} debate with ${debateProviders.length} participants for ${rounds} rounds`);

  // Assign positions based on format
  const participants = assignPositions(debateProviders, format, providerManager);

  // Run debate rounds
  const debateRounds: DebateArgument[][] = [];

  for (let roundNum = 1; roundNum <= rounds; roundNum++) {
    logger.info(`Debate round ${roundNum}/${rounds}`);
    const roundArguments: DebateArgument[] = [];

    // Each participant argues in this round
    for (const participant of participants) {
      const argumentPrompt = buildArgumentPrompt(
        prompt,
        format,
        participant,
        roundNum,
        debateRounds,
        participants
      );

      const response = await providerManager.askDuck(participant.provider, argumentPrompt);

      roundArguments.push({
        round: roundNum,
        provider: participant.provider,
        nickname: participant.nickname,
        position: participant.position,
        content: response.content,
        timestamp: new Date(),
      });
    }

    debateRounds.push(roundArguments);
  }

  // Generate synthesis
  const synthesizerProvider = synthesizer || debateProviders[0];
  const synthesisPrompt = buildSynthesisPrompt(prompt, format, debateRounds, participants);
  const synthesisResponse = await providerManager.askDuck(synthesizerProvider, synthesisPrompt);

  const result: DebateResult = {
    topic: prompt,
    format,
    participants,
    rounds: debateRounds,
    synthesis: synthesisResponse.content,
    synthesizer: synthesizerProvider,
    totalRounds: rounds,
  };

  // Format output
  const formattedOutput = formatDebateResult(result);

  logger.info(`Debate completed: ${rounds} rounds, synthesized by ${synthesizerProvider}`);

  return {
    content: [
      {
        type: 'text',
        text: formattedOutput,
      },
    ],
  };
}

function assignPositions(
  providers: string[],
  format: DebateFormat,
  providerManager: ProviderManager
): DebateParticipant[] {
  const participants: DebateParticipant[] = [];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const providerInfo = providerManager.getProvider(provider);

    let position: DebatePosition;

    if (format === 'oxford') {
      // Oxford: alternating pro/con
      position = i % 2 === 0 ? 'pro' : 'con';
    } else if (format === 'adversarial') {
      // Adversarial: first is defender, rest are challengers (con)
      position = i === 0 ? 'pro' : 'con';
    } else {
      // Socratic: all neutral, questioning each other
      position = 'neutral';
    }

    participants.push({
      provider,
      nickname: providerInfo.nickname,
      position,
    });
  }

  return participants;
}

function buildArgumentPrompt(
  topic: string,
  format: DebateFormat,
  participant: DebateParticipant,
  round: number,
  previousRounds: DebateArgument[][],
  allParticipants: DebateParticipant[]
): string {
  const previousContext = buildPreviousContext(previousRounds);

  if (format === 'oxford') {
    return buildOxfordPrompt(topic, participant, round, previousContext);
  } else if (format === 'socratic') {
    return buildSocraticPrompt(topic, participant, round, previousContext, allParticipants);
  } else {
    return buildAdversarialPrompt(topic, participant, round, previousContext);
  }
}

function buildPreviousContext(previousRounds: DebateArgument[][]): string {
  if (previousRounds.length === 0) {
    return '';
  }

  let context = '\n\nPREVIOUS ARGUMENTS:\n';
  for (const round of previousRounds) {
    for (const arg of round) {
      const posLabel = arg.position === 'pro' ? '[PRO]' :
                       arg.position === 'con' ? '[CON]' : '[NEUTRAL]';
      context += `\n--- Round ${arg.round} - ${arg.nickname} ${posLabel} ---\n`;
      context += `${arg.content}\n`;
    }
  }
  return context;
}

function buildOxfordPrompt(
  topic: string,
  participant: DebateParticipant,
  round: number,
  previousContext: string
): string {
  const position = participant.position === 'pro' ? 'IN FAVOR OF' : 'AGAINST';
  const positionLabel = participant.position === 'pro' ? 'PRO' : 'CON';

  return `You are participating in an Oxford-style debate.

TOPIC: "${topic}"

YOUR POSITION: ${position} (${positionLabel})
ROUND: ${round}

${previousContext}

INSTRUCTIONS:
1. Present clear, logical arguments ${position.toLowerCase()} the topic
2. ${round > 1 ? 'Address and rebut opposing arguments from previous rounds' : 'Establish your core thesis and supporting points'}
3. Use evidence, examples, and reasoning
4. Be persuasive but intellectually honest
5. Keep your argument focused and structured

Present your argument for Round ${round}:`;
}

function buildSocraticPrompt(
  topic: string,
  participant: DebateParticipant,
  round: number,
  previousContext: string,
  allParticipants: DebateParticipant[]
): string {
  const otherParticipants = allParticipants
    .filter(p => p.provider !== participant.provider)
    .map(p => p.nickname)
    .join(', ');

  return `You are participating in a Socratic dialogue.

TOPIC: "${topic}"

YOUR ROLE: Philosophical inquirer exploring the topic through questions and reasoning
OTHER PARTICIPANTS: ${otherParticipants}
ROUND: ${round}

${previousContext}

INSTRUCTIONS:
1. ${round === 1 ? 'Begin by questioning assumptions about the topic' : 'Build on previous responses with deeper questions'}
2. Use the Socratic method: ask probing questions that reveal underlying assumptions
3. Offer your own perspective while remaining open to other views
4. Seek to understand the truth through dialogue, not to "win"
5. Challenge ideas respectfully and constructively

Present your contribution to Round ${round}:`;
}

function buildAdversarialPrompt(
  topic: string,
  participant: DebateParticipant,
  round: number,
  previousContext: string
): string {
  const role = participant.position === 'pro' ? 'DEFENDER' : 'CHALLENGER';
  const instruction = participant.position === 'pro'
    ? 'Defend the proposition and address all critiques raised'
    : 'Attack weaknesses in the arguments, find flaws, and present counter-examples';

  return `You are participating in an adversarial debate.

TOPIC: "${topic}"

YOUR ROLE: ${role}
ROUND: ${round}

${previousContext}

INSTRUCTIONS:
1. ${instruction}
2. Be rigorous and thorough in your analysis
3. ${participant.position === 'con' ? 'Identify logical fallacies, weak evidence, or missing considerations' : 'Strengthen your position against attacks'}
4. Use concrete examples and evidence
5. Be intellectually aggressive but fair

Present your ${role.toLowerCase()} argument for Round ${round}:`;
}

function buildSynthesisPrompt(
  topic: string,
  format: DebateFormat,
  rounds: DebateArgument[][],
  participants: DebateParticipant[]
): string {
  let transcript = '';
  for (const round of rounds) {
    for (const arg of round) {
      const posLabel = arg.position === 'pro' ? '[PRO]' :
                       arg.position === 'con' ? '[CON]' : '[NEUTRAL]';
      transcript += `\n--- Round ${arg.round} - ${arg.nickname} ${posLabel} ---\n`;
      transcript += `${arg.content}\n`;
    }
  }

  const participantList = participants
    .map(p => `${p.nickname} (${p.position})`)
    .join(', ');

  return `You are the moderator synthesizing a ${format} debate.

TOPIC: "${topic}"
PARTICIPANTS: ${participantList}

DEBATE TRANSCRIPT:
${transcript}

YOUR TASK:
1. Summarize the key arguments from each side
2. Identify the strongest points made
3. Note where participants agreed or found common ground
4. Highlight unresolved tensions or questions
5. Provide a balanced conclusion (who had stronger arguments, or if it was a draw)
6. Suggest what additional considerations might be valuable

Provide your synthesis:`;
}

function formatDebateResult(result: DebateResult): string {
  const formatEmoji = result.format === 'oxford' ? '🎓' :
                      result.format === 'socratic' ? '🏛️' : '⚔️';

  let output = `${formatEmoji} **${result.format.charAt(0).toUpperCase() + result.format.slice(1)} Debate**\n`;
  output += `═══════════════════════════════════════\n\n`;
  output += `**Topic:** "${result.topic}"\n`;
  output += `**Format:** ${result.format}\n`;
  output += `**Rounds:** ${result.totalRounds}\n\n`;

  // Participants
  output += `**Participants:**\n`;
  for (const p of result.participants) {
    const posEmoji = p.position === 'pro' ? '✅' : p.position === 'con' ? '❌' : '🔍';
    output += `  ${posEmoji} ${p.nickname} (${p.position})\n`;
  }
  output += `\n`;

  // Debate rounds
  output += `**Debate Transcript:**\n`;
  output += `─────────────────────────────────────\n`;

  for (let i = 0; i < result.rounds.length; i++) {
    output += `\n📢 **ROUND ${i + 1}**\n`;

    for (const arg of result.rounds[i]) {
      const posEmoji = arg.position === 'pro' ? '✅' : arg.position === 'con' ? '❌' : '🔍';
      output += `\n${posEmoji} **${arg.nickname}** [${arg.position.toUpperCase()}]:\n`;

      // Truncate long arguments
      const displayContent = arg.content.length > 800
        ? arg.content.substring(0, 800) + '...[truncated]'
        : arg.content;
      output += `${displayContent}\n`;
    }
  }

  // Synthesis
  output += `\n═══════════════════════════════════════\n`;
  output += `🎯 **Synthesis** (by ${result.synthesizer})\n`;
  output += `─────────────────────────────────────\n`;
  output += `${result.synthesis}\n`;

  output += `\n═══════════════════════════════════════\n`;
  output += `📊 ${result.totalRounds} rounds completed with ${result.participants.length} participants\n`;

  return output;
}
