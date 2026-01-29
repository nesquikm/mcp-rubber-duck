import { UsageService } from '../services/usage.js';
import { UsageTimePeriod } from '../config/types.js';
import { duckArt } from '../utils/ascii-art.js';
import { logger } from '../utils/logger.js';

const VALID_PERIODS: UsageTimePeriod[] = ['today', '7d', '30d', 'all'];

export function getUsageStatsTool(
  usageService: UsageService,
  args: Record<string, unknown>
) {
  const { period = 'today' } = args as { period?: string };

  // Validate period
  if (!VALID_PERIODS.includes(period as UsageTimePeriod)) {
    throw new Error(`Invalid period "${period}". Valid options: ${VALID_PERIODS.join(', ')}`);
  }

  const stats = usageService.getStats(period as UsageTimePeriod);

  // Format output
  let output = `${duckArt.panel}\n\n`;
  output += `📊 Usage Statistics: ${formatPeriodLabel(period as UsageTimePeriod)}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `Period: ${stats.startDate} to ${stats.endDate}\n\n`;

  // Totals section
  output += `📈 TOTALS\n`;
  output += `─────────────────────\n`;
  output += `Requests: ${stats.totals.requests.toLocaleString()}\n`;
  output += `Prompt Tokens: ${stats.totals.promptTokens.toLocaleString()}\n`;
  output += `Completion Tokens: ${stats.totals.completionTokens.toLocaleString()}\n`;
  output += `Total Tokens: ${(stats.totals.promptTokens + stats.totals.completionTokens).toLocaleString()}\n`;
  output += `Cache Hits: ${stats.totals.cacheHits.toLocaleString()}\n`;
  output += `Errors: ${stats.totals.errors.toLocaleString()}\n`;

  if (stats.totals.estimatedCostUSD !== undefined) {
    output += `💰 Estimated Cost: $${formatCost(stats.totals.estimatedCostUSD)} USD\n`;
  }

  // Per-provider breakdown
  const providers = Object.keys(stats.usage);
  if (providers.length > 0) {
    output += `\n🦆 BY PROVIDER\n`;
    output += `─────────────────────\n`;

    for (const provider of providers) {
      const models = stats.usage[provider];
      output += `\n**${provider}**\n`;

      for (const [model, modelStats] of Object.entries(models)) {
        output += `  ${model}:\n`;
        output += `    Requests: ${modelStats.requests.toLocaleString()}\n`;
        output += `    Tokens: ${modelStats.promptTokens.toLocaleString()} in / ${modelStats.completionTokens.toLocaleString()} out\n`;
        if (modelStats.cacheHits > 0) {
          output += `    Cache Hits: ${modelStats.cacheHits.toLocaleString()}\n`;
        }
        if (modelStats.errors > 0) {
          output += `    Errors: ${modelStats.errors.toLocaleString()}\n`;
        }
      }

      if (stats.costByProvider && stats.costByProvider[provider] !== undefined) {
        output += `  💰 Provider Cost: $${formatCost(stats.costByProvider[provider])}\n`;
      }
    }
  } else {
    output += `\nNo usage data for this period.\n`;
  }

  // Footer note about cost
  if (stats.totals.estimatedCostUSD === undefined && stats.totals.requests > 0) {
    output += `\n💡 Cost estimates not available. Configure pricing in config.json or update to latest version.\n`;
  }

  logger.info(`Retrieved usage stats for period: ${period}`);

  // Build structured data for UI consumption
  const structuredData = {
    period: stats.period,
    startDate: stats.startDate,
    endDate: stats.endDate,
    totals: stats.totals,
    usage: stats.usage,
    costByProvider: stats.costByProvider,
  };

  return {
    content: [
      {
        type: 'text',
        text: output,
      },
      {
        type: 'text',
        text: JSON.stringify(structuredData),
      },
    ],
  };
}

function formatPeriodLabel(period: UsageTimePeriod): string {
  switch (period) {
    case 'today':
      return 'Today';
    case '7d':
      return 'Last 7 Days';
    case '30d':
      return 'Last 30 Days';
    case 'all':
      return 'All Time';
  }
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return cost.toFixed(6);
  } else if (cost < 1) {
    return cost.toFixed(4);
  } else {
    return cost.toFixed(2);
  }
}
