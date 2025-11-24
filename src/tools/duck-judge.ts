import { ProviderManager } from '../providers/manager.js';
import { DuckResponse, JudgeEvaluation } from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface DuckJudgeArgs {
  responses: DuckResponse[];
  judge?: string;
  criteria?: string[];
  persona?: string;
}

interface ParsedJudgment {
  rankings: Array<{
    provider: string;
    score: number;
    justification: string;
  }>;
  criteria_scores?: Record<string, Record<string, number>>;
  summary: string;
}

const DEFAULT_CRITERIA = ['accuracy', 'completeness', 'clarity'];

export async function duckJudgeTool(
  providerManager: ProviderManager,
  args: Record<string, unknown>
) {
  const {
    responses,
    judge,
    criteria = DEFAULT_CRITERIA,
    persona,
  } = args as unknown as DuckJudgeArgs;

  // Validate inputs
  if (!responses || !Array.isArray(responses) || responses.length === 0) {
    throw new Error('At least one response is required to judge');
  }

  if (responses.length === 1) {
    throw new Error('At least two responses are required for comparison');
  }

  // Determine judge provider
  const judgeProvider = judge || providerManager.getProviderNames()[0];
  if (!judgeProvider) {
    throw new Error('No judge provider available');
  }

  logger.info(`Starting judgment with ${judgeProvider} on ${responses.length} responses`);

  // Build the judgment prompt
  const prompt = buildJudgePrompt(responses, criteria, persona);

  // Get judgment from the judge duck
  const judgeResponse = await providerManager.askDuck(judgeProvider, prompt);

  // Parse the judgment
  const evaluation = parseJudgment(
    judgeResponse.content,
    judgeResponse.provider,
    judgeResponse.nickname,
    responses,
    criteria
  );

  // Format output
  const formattedOutput = formatJudgeResult(evaluation);

  logger.info(
    `Judgment completed by ${judgeProvider}: #1 is ${evaluation.rankings[0]?.provider || 'unknown'}`
  );

  return {
    content: [
      {
        type: 'text',
        text: formattedOutput,
      },
    ],
  };
}

function buildJudgePrompt(
  responses: DuckResponse[],
  criteria: string[],
  persona?: string
): string {
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');

  const responsesText = responses.map((r, i) =>
    `--- Response ${i + 1} (${r.nickname} / ${r.provider}) ---\n${r.content}\n`
  ).join('\n');

  const personaText = persona
    ? `You are a ${persona} evaluating these responses.\n\n`
    : '';

  return `${personaText}You are a judge evaluating ${responses.length} responses to the same prompt.

RESPONSES TO EVALUATE:
${responsesText}

EVALUATION CRITERIA:
${criteriaList}

INSTRUCTIONS:
1. Evaluate each response against ALL criteria
2. Assign a score from 0-100 for each response
3. Rank responses from best to worst
4. Provide a brief justification for each ranking
5. Give a final summary

Respond with ONLY a JSON object in this exact format:
{
  "rankings": [
    {"provider": "<provider name>", "score": <0-100>, "justification": "<brief explanation>"},
    {"provider": "<provider name>", "score": <0-100>, "justification": "<brief explanation>"}
  ],
  "criteria_scores": {
    "<provider>": {"${criteria.join('": <0-100>, "')}":<0-100>}
  },
  "summary": "<overall assessment and recommendation>"
}

IMPORTANT:
- Rankings must be ordered from highest score to lowest
- Use the exact provider names from the responses
- Do NOT include any text before or after the JSON
- Do NOT use markdown code blocks`;
}

function matchProvider(
  judgeProviderName: string,
  originalResponses: DuckResponse[]
): DuckResponse | undefined {
  const nameLower = judgeProviderName.toLowerCase();

  // Try exact match first
  const exactMatch = originalResponses.find(r => r.provider.toLowerCase() === nameLower);
  if (exactMatch) return exactMatch;

  // Try matching by provider name contained in judge's response
  const containsMatch = originalResponses.find(r =>
    nameLower.includes(r.provider.toLowerCase()) ||
    nameLower.includes(r.nickname.toLowerCase())
  );
  if (containsMatch) return containsMatch;

  // Try matching by nickname
  const nicknameMatch = originalResponses.find(r =>
    r.nickname.toLowerCase() === nameLower
  );
  if (nicknameMatch) return nicknameMatch;

  return undefined;
}

function parseJudgment(
  response: string,
  judgeProvider: string,
  judgeNickname: string,
  originalResponses: DuckResponse[],
  criteria: string[]
): JudgeEvaluation {
  const evaluation: JudgeEvaluation = {
    judge: judgeProvider,
    judgeNickname: judgeNickname,
    prompt: '', // Will be filled by caller if needed
    criteria,
    rankings: [],
    criteriaScores: {},
    summary: '',
    rawResponse: response,
  };

  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn(`No JSON found in judge response from ${judgeProvider}`);
      return createFallbackEvaluation(evaluation, originalResponses, response);
    }

    const parsed = JSON.parse(jsonMatch[0]) as ParsedJudgment;
    const matchedProviders = new Set<string>();

    // Parse rankings
    if (Array.isArray(parsed.rankings)) {
      for (const [index, r] of parsed.rankings.entries()) {
        const matched = matchProvider(r.provider, originalResponses);
        if (matched && !matchedProviders.has(matched.provider)) {
          matchedProviders.add(matched.provider);
          evaluation.rankings.push({
            provider: matched.provider,
            nickname: matched.nickname,
            rank: index + 1,
            score: typeof r.score === 'number' ? Math.max(0, Math.min(100, r.score)) : 0,
            justification: r.justification?.toString() || '',
          });
        }
      }
    }

    // Parse criteria scores
    if (parsed.criteria_scores && typeof parsed.criteria_scores === 'object') {
      evaluation.criteriaScores = parsed.criteria_scores;
    }

    // Parse summary
    if (parsed.summary) {
      evaluation.summary = parsed.summary.toString();
    }

  } catch (error) {
    logger.warn(`Failed to parse JSON judgment from ${judgeProvider}:`, error);
    return createFallbackEvaluation(evaluation, originalResponses, response);
  }

  // Ensure all original responses are represented
  const rankedProviders = new Set(evaluation.rankings.map(r => r.provider));
  for (const resp of originalResponses) {
    if (!rankedProviders.has(resp.provider)) {
      evaluation.rankings.push({
        provider: resp.provider,
        nickname: resp.nickname,
        rank: evaluation.rankings.length + 1,
        score: 0,
        justification: 'Not evaluated by judge',
      });
    }
  }

  return evaluation;
}

function createFallbackEvaluation(
  evaluation: JudgeEvaluation,
  originalResponses: DuckResponse[],
  rawResponse: string
): JudgeEvaluation {
  // Create a basic evaluation when parsing fails
  evaluation.rankings = originalResponses.map((r, index) => ({
    provider: r.provider,
    nickname: r.nickname,
    rank: index + 1,
    score: 50,
    justification: 'Unable to parse judge response',
  }));
  evaluation.summary = `Judge evaluation parsing failed. Raw response available for review.`;
  evaluation.rawResponse = rawResponse;
  return evaluation;
}

function formatJudgeResult(evaluation: JudgeEvaluation): string {
  let output = `⚖️ **Judge Evaluation**\n`;
  output += `═══════════════════════════════════════\n\n`;
  output += `**Judge:** ${evaluation.judgeNickname} (${evaluation.judge})\n`;
  output += `**Criteria:** ${evaluation.criteria.join(', ')}\n\n`;

  // Rankings
  output += `**Rankings:**\n`;
  output += `─────────────────────────────────────\n`;

  for (const ranking of evaluation.rankings) {
    const medal = ranking.rank === 1 ? '🥇' : ranking.rank === 2 ? '🥈' : ranking.rank === 3 ? '🥉' : '  ';
    const bar = '█'.repeat(Math.floor(ranking.score / 10));
    const emptyBar = '░'.repeat(10 - Math.floor(ranking.score / 10));

    output += `${medal} **#${ranking.rank} ${ranking.nickname}** (${ranking.provider})\n`;
    output += `   Score: ${bar}${emptyBar} ${ranking.score}/100\n`;
    output += `   💭 "${ranking.justification}"\n\n`;
  }

  // Criteria breakdown if available
  if (Object.keys(evaluation.criteriaScores).length > 0) {
    output += `**Criteria Breakdown:**\n`;
    output += `─────────────────────────────────────\n`;

    for (const [provider, scores] of Object.entries(evaluation.criteriaScores)) {
      output += `📊 **${provider}:**\n`;
      for (const [criterion, score] of Object.entries(scores)) {
        const criterionScore = typeof score === 'number' ? score : 0;
        output += `   • ${criterion}: ${criterionScore}/100\n`;
      }
      output += `\n`;
    }
  }

  // Summary
  if (evaluation.summary) {
    output += `**Summary:**\n`;
    output += `─────────────────────────────────────\n`;
    output += `${evaluation.summary}\n\n`;
  }

  output += `═══════════════════════════════════════\n`;
  output += `📋 Evaluated ${evaluation.rankings.length} responses\n`;

  return output;
}
