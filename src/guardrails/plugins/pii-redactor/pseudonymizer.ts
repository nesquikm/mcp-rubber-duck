import { PIIDetection, PIIType } from './detectors.js';

/**
 * Pseudonymizer - replaces PII with numbered placeholders
 * and supports optional restoration
 */
export class Pseudonymizer {
  private counters: Map<PIIType, number> = new Map();

  /**
   * Pseudonymize text by replacing PII with placeholders
   * Returns the modified text and a mapping for restoration
   */
  pseudonymize(
    text: string,
    detections: PIIDetection[]
  ): { text: string; mappings: Map<string, string> } {
    const mappings = new Map<string, string>();
    let result = text;
    let offset = 0;

    // Reset counters for consistent numbering
    this.counters.clear();

    for (const detection of detections) {
      const placeholder = this.generatePlaceholder(detection.type);
      mappings.set(placeholder, detection.value);

      // Replace in text (accounting for previous replacements)
      const start = detection.startIndex + offset;
      const end = detection.endIndex + offset;
      result = result.substring(0, start) + placeholder + result.substring(end);

      // Adjust offset for next replacement
      offset += placeholder.length - detection.value.length;
    }

    return { text: result, mappings };
  }

  /**
   * Restore placeholders in text with original values
   */
  restore(text: string, mappings: Map<string, string>): string {
    let result = text;

    for (const [placeholder, original] of mappings) {
      // Use global replace to handle multiple occurrences
      result = result.replace(
        new RegExp(this.escapeRegex(placeholder), 'g'),
        original
      );
    }

    return result;
  }

  /**
   * Generate a placeholder for a PII type
   */
  private generatePlaceholder(type: PIIType): string {
    const count = (this.counters.get(type) || 0) + 1;
    this.counters.set(type, count);

    const typeLabels: Record<PIIType, string> = {
      email: 'EMAIL',
      phone: 'PHONE',
      ssn: 'SSN',
      api_key: 'API_KEY',
      credit_card: 'CARD',
      ip_address: 'IP',
      custom: 'REDACTED',
    };

    return `[${typeLabels[type]}_${count}]`;
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Reset counters (for testing)
   */
  reset(): void {
    this.counters.clear();
  }
}
