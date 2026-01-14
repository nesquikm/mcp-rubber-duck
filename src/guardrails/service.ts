import { GuardrailPlugin, GuardrailPhase, GuardrailContext, GuardrailResult, CreateContextOptions } from './types.js';
import { createGuardrailContext } from './context.js';
import { GuardrailsConfig, GuardrailsPluginsConfig } from '../config/types.js';
import { logger } from '../utils/logger.js';

/**
 * Main service that orchestrates guardrail plugins
 */
export class GuardrailsService {
  private plugins: GuardrailPlugin[] = [];
  private config: GuardrailsConfig;
  private enabled: boolean = false;

  constructor(config?: Partial<GuardrailsConfig>) {
    this.config = {
      enabled: config?.enabled ?? false,
      log_violations: config?.log_violations ?? true,
      log_modifications: config?.log_modifications ?? false,
      fail_open: config?.fail_open ?? false,
      plugins: config?.plugins,
    };
    // Start disabled - will be enabled after successful initialization with plugins
    this.enabled = false;
  }

  /**
   * Initialize the service and all configured plugins
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Guardrails disabled in configuration');
      return;
    }

    const pluginConfigs = this.config.plugins || {};

    // Load plugins in order
    await this.loadPluginsFromConfig(pluginConfigs);

    // Sort by priority (lower = runs first)
    this.plugins.sort((a, b) => a.priority - b.priority);

    this.enabled = this.plugins.length > 0;
    logger.info(`Guardrails initialized with ${this.plugins.length} plugins`);
  }

  private async loadPluginsFromConfig(pluginConfigs: Partial<GuardrailsPluginsConfig>): Promise<void> {
    const pluginOrder: Array<[string, unknown]> = [
      ['rate_limiter', pluginConfigs.rate_limiter],
      ['token_limiter', pluginConfigs.token_limiter],
      ['pii_redactor', pluginConfigs.pii_redactor],
      ['pattern_blocker', pluginConfigs.pattern_blocker],
    ];

    for (const [pluginName, pluginConfig] of pluginOrder) {
      if (!pluginConfig || !(pluginConfig as { enabled?: boolean }).enabled) {
        continue;
      }

      try {
        const plugin = await this.loadPlugin(pluginName);
        await plugin.initialize(pluginConfig as Record<string, unknown>);
        if ((pluginConfig as { priority?: number }).priority !== undefined) {
          plugin.priority = (pluginConfig as { priority: number }).priority;
        }
        this.plugins.push(plugin);
        logger.info(`Guardrail plugin '${pluginName}' initialized`);
      } catch (error) {
        logger.error(`Failed to initialize guardrail plugin '${pluginName}':`, error);
      }
    }
  }

  private async loadPlugin(name: string): Promise<GuardrailPlugin> {
    // Dynamic plugin loading
    switch (name) {
      case 'rate_limiter': {
        const { RateLimiterPlugin } = await import('./plugins/rate-limiter.js');
        return new RateLimiterPlugin();
      }
      case 'token_limiter': {
        const { TokenLimiterPlugin } = await import('./plugins/token-limiter.js');
        return new TokenLimiterPlugin();
      }
      case 'pattern_blocker': {
        const { PatternBlockerPlugin } = await import('./plugins/pattern-blocker.js');
        return new PatternBlockerPlugin();
      }
      case 'pii_redactor': {
        const { PIIRedactorPlugin } = await import('./plugins/pii-redactor/index.js');
        return new PIIRedactorPlugin();
      }
      default:
        throw new Error(`Unknown guardrail plugin: ${name}`);
    }
  }

  /**
   * Check if guardrails are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Create a new context for guardrail execution
   */
  createContext(options: CreateContextOptions): GuardrailContext {
    return createGuardrailContext(options);
  }

  /**
   * Execute all relevant plugins for a given phase
   */
  async execute(phase: GuardrailPhase, context: GuardrailContext): Promise<GuardrailResult> {
    if (!this.enabled) {
      return { action: 'allow', context };
    }

    const relevantPlugins = this.plugins.filter(
      (p) => p.enabled && p.phases.includes(phase)
    );

    // Track logged items to avoid duplicates
    let lastViolationCount = 0;
    let lastModificationCount = 0;

    for (const plugin of relevantPlugins) {
      try {
        const result = await plugin.execute(phase, context);

        // Log only NEW violations if configured
        if (this.config.log_violations && context.violations.length > lastViolationCount) {
          for (let i = lastViolationCount; i < context.violations.length; i++) {
            const violation = context.violations[i];
            logger.warn(`Guardrail violation: ${violation.pluginName} - ${violation.message}`, {
              rule: violation.rule,
              severity: violation.severity,
              details: violation.details,
            });
          }
          lastViolationCount = context.violations.length;
        }

        // Log only NEW modifications if configured
        if (this.config.log_modifications && context.modifications.length > lastModificationCount) {
          for (let i = lastModificationCount; i < context.modifications.length; i++) {
            const mod = context.modifications[i];
            logger.info(`Guardrail modification: ${mod.pluginName} - ${mod.reason}`, {
              field: mod.field,
            });
          }
          lastModificationCount = context.modifications.length;
        }

        if (result.action === 'block') {
          logger.warn(`Request blocked by guardrail '${plugin.name}': ${result.blockReason}`);
          return result;
        }

        // Update context for next plugin
        context = result.context;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Guardrail plugin '${plugin.name}' error:`, error);

        if (!this.config.fail_open) {
          return {
            action: 'block',
            context,
            blockedBy: plugin.name,
            blockReason: `Plugin error: ${errorMessage}`,
          };
        }
        // fail_open: continue to next plugin
      }
    }

    return { action: 'allow', context };
  }

  /**
   * Shutdown the service and all plugins
   */
  async shutdown(): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.shutdown();
      } catch (error) {
        logger.error(`Error shutting down plugin '${plugin.name}':`, error);
      }
    }
    this.plugins = [];
    this.enabled = false;
  }

  /**
   * Get list of loaded plugins
   */
  getPlugins(): GuardrailPlugin[] {
    return [...this.plugins];
  }
}
