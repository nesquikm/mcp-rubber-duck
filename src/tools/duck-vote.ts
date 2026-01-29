import { ProviderManager } from '../providers/manager.js';
import { ConsensusService } from '../services/consensus.js';
import { VoteResult } from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface DuckVoteArgs {
  question: string;
  options: string[];
  voters?: string[];
  require_reasoning?: boolean;
}

export async function duckVoteTool(
  providerManager: ProviderManager,
  args: Record<string, unknown>
) {
  const {
    question,
    options,
    voters,
    require_reasoning = true,
  } = args as unknown as DuckVoteArgs;

  // Validate inputs
  if (!question || typeof question !== 'string') {
    throw new Error('Question is required');
  }

  if (!options || !Array.isArray(options) || options.length < 2) {
    throw new Error('At least 2 options are required');
  }

  if (options.length > 10) {
    throw new Error('Maximum 10 options allowed');
  }

  // Get voters (all providers if not specified)
  const voterNames = voters && voters.length > 0
    ? voters
    : providerManager.getProviderNames();

  if (voterNames.length === 0) {
    throw new Error('No voters available');
  }

  logger.info(`Starting vote with ${voterNames.length} voters on: "${question}"`);

  const consensusService = new ConsensusService();
  const votePrompt = consensusService.buildVotePrompt(
    question,
    options,
    require_reasoning
  );

  // Get votes from all ducks in parallel
  const responses = await providerManager.compareDucks(votePrompt, voterNames);

  // Parse votes
  const votes: VoteResult[] = responses.map(response => {
    return consensusService.parseVote(
      response.content,
      response.provider,
      response.nickname,
      options
    );
  });

  // Aggregate results
  const aggregatedResult = consensusService.aggregateVotes(question, options, votes);

  // Format output
  const formattedOutput = consensusService.formatVoteResult(aggregatedResult);

  logger.info(
    `Vote completed: ${aggregatedResult.consensusLevel} consensus, ` +
    `winner: ${aggregatedResult.winner || 'none'}`
  );

  // Build structured data for UI consumption
  const structuredData = {
    question: aggregatedResult.question,
    options: aggregatedResult.options,
    winner: aggregatedResult.winner,
    isTie: aggregatedResult.isTie,
    tally: aggregatedResult.tally,
    confidenceByOption: aggregatedResult.confidenceByOption,
    votes: aggregatedResult.votes.map(v => ({
      voter: v.voter,
      nickname: v.nickname,
      choice: v.choice,
      confidence: v.confidence,
      reasoning: v.reasoning,
    })),
    totalVoters: aggregatedResult.totalVoters,
    validVotes: aggregatedResult.validVotes,
    consensusLevel: aggregatedResult.consensusLevel,
  };

  return {
    content: [
      {
        type: 'text',
        text: formattedOutput,
      },
      {
        type: 'text',
        text: JSON.stringify(structuredData),
      },
    ],
  };
}
