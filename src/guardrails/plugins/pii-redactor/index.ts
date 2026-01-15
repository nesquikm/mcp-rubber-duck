import { BaseGuardrailPlugin } from '../base-plugin.js';
import { GuardrailPhase, GuardrailContext, GuardrailResult } from '../../types.js';
import { PIIRedactorConfig } from '../../../config/types.js';
import { PIIDetector, PIIDetectorConfig } from './detectors.js';
import { Pseudonymizer } from './pseudonymizer.js';
import { logger } from '../../../utils/logger.js';

/**
 * PII Redactor plugin - detects and redacts sensitive data
 */
export class PIIRedactorPlugin extends BaseGuardrailPlugin {
  name = 'pii_redactor';
  phases: GuardrailPhase[] = ['pre_request', 'post_response', 'pre_tool_input', 'post_tool_output'];

  private detector!: PIIDetector;
  private pseudonymizer!: Pseudonymizer;
  private restoreOnResponse: boolean = false;
  private logDetections: boolean = true;

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    const typedConfig = config as Partial<PIIRedactorConfig>;

    const detectorConfig: PIIDetectorConfig = {
      detectEmails: typedConfig.detect_emails ?? true,
      detectPhones: typedConfig.detect_phones ?? true,
      detectSSN: typedConfig.detect_ssn ?? true,
      detectAPIKeys: typedConfig.detect_api_keys ?? true,
      detectCreditCards: typedConfig.detect_credit_cards ?? true,
      detectIPAddresses: typedConfig.detect_ip_addresses ?? false,
      customPatterns: typedConfig.custom_patterns ?? [],
      allowlist: typedConfig.allowlist ?? [],
      allowlistDomains: typedConfig.allowlist_domains ?? [],
    };

    this.detector = new PIIDetector(detectorConfig);
    this.pseudonymizer = new Pseudonymizer();
    this.restoreOnResponse = typedConfig.restore_on_response ?? false;
    this.logDetections = typedConfig.log_detections ?? true;
    this.priority = typedConfig.priority ?? 25;
  }

  async execute(phase: GuardrailPhase, context: GuardrailContext): Promise<GuardrailResult> {
    switch (phase) {
      case 'pre_request':
      case 'pre_tool_input':
        return this.redactPII(context, phase);

      case 'post_response':
      case 'post_tool_output':
        if (this.restoreOnResponse) {
          return this.restorePII(context, phase);
        }
        return this.allow(context);

      default:
        return this.allow(context);
    }
  }

  private redactPII(
    context: GuardrailContext,
    phase: GuardrailPhase
  ): Promise<GuardrailResult> {
    let textToScan: string;
    let field: string;

    if (phase === 'pre_request') {
      textToScan = context.prompt || '';
      field = 'prompt';
    } else {
      textToScan = JSON.stringify(context.toolArgs || {});
      field = 'toolArgs';
    }

    if (!textToScan) {
      return Promise.resolve(this.allow(context));
    }

    const detections = this.detector.detect(textToScan);

    if (detections.length === 0) {
      return Promise.resolve(this.allow(context));
    }

    // Log detections
    if (this.logDetections) {
      logger.info(`PII detected in ${field}:`, {
        requestId: context.requestId,
        types: [...new Set(detections.map((d) => d.type))],
        count: detections.length,
      });
    }

    // Pseudonymize
    const { text: redactedText, mappings } = this.pseudonymizer.pseudonymize(
      textToScan,
      detections
    );

    // Store mappings for potential restoration
    context.metadata.set('pii_mappings', mappings);

    // Record modification
    this.addModification(
      context,
      phase,
      field,
      `Redacted ${detections.length} PII items: ${[...new Set(detections.map((d) => d.type))].join(', ')}`,
      undefined, // Don't store original (contains PII)
      undefined  // Don't store new (would expose placeholder patterns)
    );

    // Apply modification
    if (phase === 'pre_request') {
      context.prompt = redactedText;
      // Also update the last message if present
      if (context.messages.length > 0) {
        const lastIndex = context.messages.length - 1;
        context.messages[lastIndex] = {
          ...context.messages[lastIndex],
          content: redactedText,
        };
      }
    } else {
      try {
        context.toolArgs = JSON.parse(redactedText) as Record<string, unknown>;
      } catch {
        // If parse fails, store as string
        context.toolArgs = { _redacted: redactedText };
      }
    }

    return Promise.resolve(this.modify(context));
  }

  private restorePII(
    context: GuardrailContext,
    phase: GuardrailPhase
  ): Promise<GuardrailResult> {
    const mappings = context.metadata.get('pii_mappings') as Map<string, string> | undefined;

    if (!mappings || mappings.size === 0) {
      return Promise.resolve(this.allow(context));
    }

    let textToRestore: string;

    if (phase === 'post_response') {
      textToRestore = context.response || '';
    } else {
      textToRestore =
        typeof context.toolResult === 'string'
          ? context.toolResult
          : JSON.stringify(context.toolResult);
    }

    if (!textToRestore) {
      return Promise.resolve(this.allow(context));
    }

    const restoredText = this.pseudonymizer.restore(textToRestore, mappings);

    // Only modify if something changed
    if (restoredText === textToRestore) {
      return Promise.resolve(this.allow(context));
    }

    this.addModification(
      context,
      phase,
      phase === 'post_response' ? 'response' : 'toolResult',
      `Restored ${mappings.size} PII placeholders`
    );

    if (phase === 'post_response') {
      context.response = restoredText;
    } else {
      try {
        context.toolResult = JSON.parse(restoredText) as unknown;
      } catch {
        context.toolResult = restoredText;
      }
    }

    return Promise.resolve(this.modify(context));
  }

  /**
   * Get detector for testing
   */
  getDetector(): PIIDetector {
    return this.detector;
  }

  /**
   * Get pseudonymizer for testing
   */
  getPseudonymizer(): Pseudonymizer {
    return this.pseudonymizer;
  }
}
