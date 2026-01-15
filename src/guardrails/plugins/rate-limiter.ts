import { BaseGuardrailPlugin } from './base-plugin.js';
import { GuardrailPhase, GuardrailContext, GuardrailResult } from '../types.js';
import { RateLimiterConfig } from '../../config/types.js';

interface RequestRecord {
  timestamp: number;
}

/**
 * Rate limiter plugin - limits requests per minute/hour
 */
export class RateLimiterPlugin extends BaseGuardrailPlugin {
  name = 'rate_limiter';
  phases: GuardrailPhase[] = ['pre_request'];

  private requestsPerMinute: number = 60;
  private requestsPerHour: number = 1000;
  private perProvider: boolean = false;
  private burstAllowance: number = 5;

  // Request history: key is provider (or 'global'), value is array of timestamps
  private requestHistory: Map<string, RequestRecord[]> = new Map();

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    const typedConfig = config as Partial<RateLimiterConfig>;
    this.requestsPerMinute = typedConfig.requests_per_minute ?? 60;
    this.requestsPerHour = typedConfig.requests_per_hour ?? 1000;
    this.perProvider = typedConfig.per_provider ?? false;
    this.burstAllowance = typedConfig.burst_allowance ?? 5;
    this.priority = typedConfig.priority ?? 10;
  }

  execute(phase: GuardrailPhase, context: GuardrailContext): Promise<GuardrailResult> {
    if (phase !== 'pre_request') {
      return Promise.resolve(this.allow(context));
    }

    const key = this.perProvider ? context.provider : 'global';
    const now = Date.now();

    // Get or create request history for this key
    let history = this.requestHistory.get(key);
    if (!history) {
      history = [];
      this.requestHistory.set(key, history);
    }

    // Clean up old entries (older than 1 hour)
    const oneHourAgo = now - 60 * 60 * 1000;
    history = history.filter((r) => r.timestamp > oneHourAgo);

    // Remove empty keys to prevent unbounded Map growth with perProvider mode
    if (history.length === 0) {
      this.requestHistory.delete(key);
      history = [];
    } else {
      this.requestHistory.set(key, history);
    }

    // Count requests in last minute and last hour
    const oneMinuteAgo = now - 60 * 1000;
    const requestsLastMinute = history.filter((r) => r.timestamp > oneMinuteAgo).length;
    const requestsLastHour = history.length;

    // Check rate limits (with burst allowance)
    const effectiveMinuteLimit = this.requestsPerMinute + this.burstAllowance;
    const effectiveHourLimit = this.requestsPerHour + this.burstAllowance;

    if (requestsLastMinute >= effectiveMinuteLimit) {
      this.addViolation(
        context,
        phase,
        'requests_per_minute',
        'error',
        `Rate limit exceeded: ${requestsLastMinute} requests in the last minute (limit: ${this.requestsPerMinute})`,
        { requestsLastMinute, limit: this.requestsPerMinute }
      );
      return Promise.resolve(this.block(
        context,
        `Rate limit exceeded: ${requestsLastMinute}/${this.requestsPerMinute} requests per minute`
      ));
    }

    if (requestsLastHour >= effectiveHourLimit) {
      this.addViolation(
        context,
        phase,
        'requests_per_hour',
        'error',
        `Rate limit exceeded: ${requestsLastHour} requests in the last hour (limit: ${this.requestsPerHour})`,
        { requestsLastHour, limit: this.requestsPerHour }
      );
      return Promise.resolve(this.block(
        context,
        `Rate limit exceeded: ${requestsLastHour}/${this.requestsPerHour} requests per hour`
      ));
    }

    // Log warning if approaching limit
    if (requestsLastMinute >= this.requestsPerMinute * 0.8) {
      this.addViolation(
        context,
        phase,
        'requests_per_minute_warning',
        'warning',
        `Approaching rate limit: ${requestsLastMinute}/${this.requestsPerMinute} requests per minute`,
        { requestsLastMinute, limit: this.requestsPerMinute }
      );
    }

    // Record this request
    history.push({ timestamp: now });
    // Ensure history is stored in Map (needed after empty cleanup)
    this.requestHistory.set(key, history);

    return Promise.resolve(this.allow(context));
  }

  /**
   * Get current request counts (for testing/monitoring)
   */
  getRequestCounts(key: string = 'global'): { lastMinute: number; lastHour: number } {
    const now = Date.now();
    const history = this.requestHistory.get(key) || [];
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    return {
      lastMinute: history.filter((r) => r.timestamp > oneMinuteAgo).length,
      lastHour: history.filter((r) => r.timestamp > oneHourAgo).length,
    };
  }

  /**
   * Reset request history (for testing)
   */
  reset(): void {
    this.requestHistory.clear();
  }
}
