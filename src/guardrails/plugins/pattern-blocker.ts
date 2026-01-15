import { BaseGuardrailPlugin } from './base-plugin.js';
import { GuardrailPhase, GuardrailContext, GuardrailResult } from '../types.js';
import { PatternBlockerConfig } from '../../config/types.js';

interface PatternMatch {
  pattern: string;
  isRegex: boolean;
  matchedText: string;
  position: number;
}

/**
 * Pattern blocker plugin - blocks or warns on specific patterns
 */
export class PatternBlockerPlugin extends BaseGuardrailPlugin {
  name = 'pattern_blocker';
  phases: GuardrailPhase[] = ['pre_request', 'pre_tool_input'];

  private blockedPatterns: string[] = [];
  private blockedPatternsRegex: RegExp[] = [];
  private caseSensitive: boolean = false;
  private actionOnMatch: 'block' | 'warn' | 'redact' = 'block';

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    const typedConfig = config as Partial<PatternBlockerConfig>;
    this.blockedPatterns = typedConfig.blocked_patterns ?? [];
    this.caseSensitive = typedConfig.case_sensitive ?? false;
    this.actionOnMatch = typedConfig.action_on_match ?? 'block';
    this.priority = typedConfig.priority ?? 30;

    // Compile regex patterns
    this.blockedPatternsRegex = [];
    for (const pattern of typedConfig.blocked_patterns_regex ?? []) {
      try {
        const flags = this.caseSensitive ? 'g' : 'gi';
        this.blockedPatternsRegex.push(new RegExp(pattern, flags));
      } catch (error) {
        // Invalid regex, skip it
      }
    }
  }

  execute(phase: GuardrailPhase, context: GuardrailContext): Promise<GuardrailResult> {
    if (!this.phases.includes(phase)) {
      return Promise.resolve(this.allow(context));
    }

    // Get text to check based on phase
    let textToCheck: string;
    let fieldName: string;

    if (phase === 'pre_request') {
      textToCheck = context.prompt || '';
      fieldName = 'prompt';
    } else if (phase === 'pre_tool_input') {
      textToCheck = JSON.stringify(context.toolArgs || {});
      fieldName = 'toolArgs';
    } else {
      return Promise.resolve(this.allow(context));
    }

    // Find matches
    const matches = this.findMatches(textToCheck);

    if (matches.length === 0) {
      return Promise.resolve(this.allow(context));
    }

    // Handle matches based on action
    const matchSummary = matches.map((m) => m.pattern).join(', ');

    if (this.actionOnMatch === 'block') {
      this.addViolation(
        context,
        phase,
        'blocked_pattern',
        'error',
        `Blocked patterns found: ${matchSummary}`,
        { matches: matches.map((m) => ({ pattern: m.pattern, position: m.position })) }
      );
      return Promise.resolve(this.block(context, `Blocked pattern detected: ${matchSummary}`));
    }

    if (this.actionOnMatch === 'warn') {
      this.addViolation(
        context,
        phase,
        'blocked_pattern_warning',
        'warning',
        `Suspicious patterns found: ${matchSummary}`,
        { matches: matches.map((m) => ({ pattern: m.pattern, position: m.position })) }
      );
      return Promise.resolve(this.allow(context));
    }

    if (this.actionOnMatch === 'redact') {
      // Redact matches from text
      let redactedText = textToCheck;
      for (const match of matches) {
        redactedText = redactedText.replace(
          match.matchedText,
          '[REDACTED]'
        );
      }

      this.addModification(
        context,
        phase,
        fieldName,
        `Redacted ${matches.length} blocked patterns`,
        textToCheck,
        redactedText
      );

      // Update context
      if (phase === 'pre_request') {
        context.prompt = redactedText;
        // Also update last message if present (create new object to avoid mutating original)
        if (context.messages.length > 0) {
          const lastIndex = context.messages.length - 1;
          context.messages[lastIndex] = {
            ...context.messages[lastIndex],
            content: redactedText,
          };
        }
      } else if (phase === 'pre_tool_input') {
        try {
          context.toolArgs = JSON.parse(redactedText) as Record<string, unknown>;
        } catch {
          // If parse fails, leave as is
        }
      }

      return Promise.resolve(this.modify(context));
    }

    return Promise.resolve(this.allow(context));
  }

  /**
   * Find all pattern matches in text
   */
  private findMatches(text: string): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const searchText = this.caseSensitive ? text : text.toLowerCase();

    // Check simple string patterns
    for (const pattern of this.blockedPatterns) {
      const searchPattern = this.caseSensitive ? pattern : pattern.toLowerCase();
      let position = searchText.indexOf(searchPattern);
      while (position !== -1) {
        matches.push({
          pattern,
          isRegex: false,
          matchedText: text.substring(position, position + pattern.length),
          position,
        });
        position = searchText.indexOf(searchPattern, position + 1);
      }
    }

    // Check regex patterns
    for (const regex of this.blockedPatternsRegex) {
      regex.lastIndex = 0; // Reset regex state
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          pattern: regex.source,
          isRegex: true,
          matchedText: match[0],
          position: match.index,
        });
      }
    }

    return matches;
  }

  /**
   * Get configured patterns (for testing)
   */
  getPatterns(): { simple: string[]; regex: string[] } {
    return {
      simple: [...this.blockedPatterns],
      regex: this.blockedPatternsRegex.map((r) => r.source),
    };
  }
}
