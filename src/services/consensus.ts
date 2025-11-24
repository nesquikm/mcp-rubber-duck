import { VoteResult, AggregatedVote } from '../config/types.js';
import { logger } from '../utils/logger.js';

interface ParsedVote {
  choice?: string;
  confidence?: number | string;
  reasoning?: string;
}

export class ConsensusService {
  /**
   * Build a voting prompt that asks the LLM to vote on options
   */
  buildVotePrompt(
    question: string,
    options: string[],
    requireReasoning: boolean = true
  ): string {
    const optionsList = options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');

    const format = requireReasoning
      ? `{
  "choice": "<exact option text>",
  "confidence": <0-100>,
  "reasoning": "<brief explanation>"
}`
      : `{
  "choice": "<exact option text>",
  "confidence": <0-100>
}`;

    return `You are voting on the following question. You MUST choose exactly ONE option from the list below.

QUESTION: ${question}

OPTIONS:
${optionsList}

INSTRUCTIONS:
1. Analyze each option carefully
2. Choose the BEST option based on your knowledge and reasoning
3. Respond with ONLY a JSON object in this exact format:

${format}

IMPORTANT:
- "choice" must be the EXACT text of one of the options above
- "confidence" must be a number from 0 to 100
- Do NOT include any text before or after the JSON
- Do NOT use markdown code blocks`;
  }

  /**
   * Parse a vote from an LLM response
   */
  parseVote(
    response: string,
    voter: string,
    nickname: string,
    options: string[]
  ): VoteResult {
    const result: VoteResult = {
      voter,
      nickname,
      choice: '',
      confidence: 0,
      reasoning: '',
      rawResponse: response,
    };

    try {
      // Try to extract JSON from the response (greedy to handle nested objects)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(`No JSON found in vote response from ${voter}`);
        return this.fallbackParse(response, voter, nickname, options);
      }

      const parsed = JSON.parse(jsonMatch[0]) as ParsedVote;

      // Validate choice
      const choice = parsed.choice?.toString().trim();
      if (choice) {
        // Try exact match first
        const exactMatch = options.find(
          opt => opt.toLowerCase() === choice.toLowerCase()
        );

        if (exactMatch) {
          result.choice = exactMatch;
        } else {
          // Try partial match
          const partialMatch = options.find(
            opt => opt.toLowerCase().includes(choice.toLowerCase()) ||
                   choice.toLowerCase().includes(opt.toLowerCase())
          );
          if (partialMatch) {
            result.choice = partialMatch;
            logger.debug(`Fuzzy matched "${choice}" to "${partialMatch}" for ${voter}`);
          }
        }
      }

      // Parse confidence
      if (typeof parsed.confidence === 'number') {
        result.confidence = Math.max(0, Math.min(100, parsed.confidence));
      } else if (typeof parsed.confidence === 'string') {
        const conf = parseFloat(parsed.confidence);
        if (!isNaN(conf)) {
          result.confidence = Math.max(0, Math.min(100, conf));
        }
      }

      // Parse reasoning
      if (parsed.reasoning) {
        result.reasoning = parsed.reasoning.toString().trim();
      }

    } catch (error) {
      logger.warn(`Failed to parse JSON vote from ${voter}:`, error);
      return this.fallbackParse(response, voter, nickname, options);
    }

    return result;
  }

  /**
   * Fallback parsing when JSON fails - try to extract choice from text
   */
  private fallbackParse(
    response: string,
    voter: string,
    nickname: string,
    options: string[]
  ): VoteResult {
    const result: VoteResult = {
      voter,
      nickname,
      choice: '',
      confidence: 50, // Default confidence for fallback
      reasoning: 'Vote extracted via fallback parsing',
      rawResponse: response,
    };

    // Try to find any option mentioned in the response
    const responseLower = response.toLowerCase();
    for (const option of options) {
      if (responseLower.includes(option.toLowerCase())) {
        result.choice = option;
        logger.debug(`Fallback parsed choice "${option}" from ${voter}`);
        break;
      }
    }

    return result;
  }

  /**
   * Aggregate votes into a final result
   */
  aggregateVotes(
    question: string,
    options: string[],
    votes: VoteResult[]
  ): AggregatedVote {
    // Initialize tally and confidence tracking
    const tally: Record<string, number> = {};
    const confidenceSums: Record<string, number> = {};
    const confidenceCounts: Record<string, number> = {};

    for (const option of options) {
      tally[option] = 0;
      confidenceSums[option] = 0;
      confidenceCounts[option] = 0;
    }

    // Count votes
    let validVotes = 0;
    for (const vote of votes) {
      if (vote.choice && options.includes(vote.choice)) {
        tally[vote.choice]++;
        confidenceSums[vote.choice] += vote.confidence;
        confidenceCounts[vote.choice]++;
        validVotes++;
      }
    }

    // Calculate average confidence per option
    const confidenceByOption: Record<string, number> = {};
    for (const option of options) {
      confidenceByOption[option] = confidenceCounts[option] > 0
        ? Math.round(confidenceSums[option] / confidenceCounts[option])
        : 0;
    }

    // Determine winner
    const maxVotes = Math.max(...Object.values(tally));
    const winners = options.filter(opt => tally[opt] === maxVotes && maxVotes > 0);

    const isTie = winners.length > 1;
    let winner: string | null = null;

    if (winners.length === 1) {
      winner = winners[0];
    } else if (isTie && winners.length > 0) {
      // Break tie by confidence
      let highestConfidence = -1;
      for (const w of winners) {
        if (confidenceByOption[w] > highestConfidence) {
          highestConfidence = confidenceByOption[w];
          winner = w;
        }
      }
    }

    // Determine consensus level
    const consensusLevel = this.determineConsensusLevel(
      validVotes,
      votes.length,
      maxVotes,
      isTie
    );

    return {
      question,
      options,
      winner,
      isTie,
      tally,
      confidenceByOption,
      votes,
      totalVoters: votes.length,
      validVotes,
      consensusLevel,
    };
  }

  /**
   * Determine the level of consensus reached
   */
  private determineConsensusLevel(
    validVotes: number,
    totalVoters: number,
    maxVotes: number,
    isTie: boolean
  ): 'unanimous' | 'majority' | 'plurality' | 'split' | 'none' {
    if (validVotes === 0) {
      return 'none';
    }

    const winnerRatio = maxVotes / validVotes;

    if (winnerRatio === 1 && validVotes === totalVoters) {
      return 'unanimous';
    } else if (winnerRatio > 0.5) {
      return 'majority';
    } else if (!isTie && maxVotes > 0) {
      return 'plurality';
    } else if (isTie) {
      return 'split';
    }

    return 'none';
  }

  /**
   * Format the aggregated vote result for display
   */
  formatVoteResult(result: AggregatedVote): string {
    let output = `🗳️ **Vote Results**\n`;
    output += `═══════════════════════════════════════\n\n`;
    output += `**Question:** ${result.question}\n\n`;

    // Winner announcement
    if (result.winner) {
      const emoji = result.consensusLevel === 'unanimous' ? '🏆' :
                    result.consensusLevel === 'majority' ? '✅' : '📊';
      output += `${emoji} **Winner:** ${result.winner}`;
      if (result.isTie) {
        output += ` (tie-breaker by confidence)`;
      }
      output += `\n`;
      output += `📈 **Consensus:** ${result.consensusLevel}\n\n`;
    } else {
      output += `⚠️ **No valid votes recorded**\n\n`;
    }

    // Vote tally
    output += `**Vote Tally:**\n`;
    const sortedOptions = [...result.options].sort(
      (a, b) => result.tally[b] - result.tally[a]
    );

    for (const option of sortedOptions) {
      const votes = result.tally[option];
      const confidence = result.confidenceByOption[option];
      const bar = '█'.repeat(Math.min(votes * 3, 15));
      const isWinner = option === result.winner;
      const marker = isWinner ? ' 👑' : '';
      output += `  ${option}: ${bar} ${votes} vote(s) (avg confidence: ${confidence}%)${marker}\n`;
    }

    output += `\n**Individual Votes:**\n`;
    output += `─────────────────────────────────────\n`;

    for (const vote of result.votes) {
      if (vote.choice) {
        output += `🦆 **${vote.nickname}** voted: **${vote.choice}**`;
        output += ` (confidence: ${vote.confidence}%)\n`;
        if (vote.reasoning) {
          output += `   💭 "${vote.reasoning}"\n`;
        }
      } else {
        output += `🦆 **${vote.nickname}**: ❌ Invalid vote\n`;
      }
      output += `\n`;
    }

    output += `═══════════════════════════════════════\n`;
    output += `📊 ${result.validVotes}/${result.totalVoters} valid votes\n`;

    return output;
  }
}
