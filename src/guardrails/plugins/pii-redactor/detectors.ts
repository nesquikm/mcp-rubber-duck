export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'api_key'
  | 'credit_card'
  | 'ip_address'
  | 'custom';

export interface PIIDetection {
  type: PIIType;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface PIIDetectorConfig {
  detectEmails: boolean;
  detectPhones: boolean;
  detectSSN: boolean;
  detectAPIKeys: boolean;
  detectCreditCards: boolean;
  detectIPAddresses: boolean;
  customPatterns: Array<{ name: string; pattern: string; placeholder: string }>;
  allowlist: string[];
  allowlistDomains: string[];
}

/**
 * PII detector using regex patterns
 */
export class PIIDetector {
  private patterns: Map<PIIType, RegExp> = new Map();
  private allowlist: Set<string>;
  private allowlistDomains: Set<string>;
  private customPatterns: Array<{ name: string; regex: RegExp; placeholder: string }> = [];

  constructor(config: PIIDetectorConfig) {
    this.allowlist = new Set(config.allowlist.map((a) => a.toLowerCase()));
    this.allowlistDomains = new Set(config.allowlistDomains.map((d) => d.toLowerCase()));

    // Initialize built-in patterns
    if (config.detectEmails) {
      this.patterns.set(
        'email',
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
      );
    }

    if (config.detectPhones) {
      // Handles multiple phone formats: US, international, with/without country code
      this.patterns.set(
        'phone',
        /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g
      );
    }

    if (config.detectSSN) {
      // US SSN format: XXX-XX-XXXX or XXXXXXXXX
      this.patterns.set(
        'ssn',
        /\b[0-9]{3}[-\s]?[0-9]{2}[-\s]?[0-9]{4}\b/g
      );
    }

    if (config.detectAPIKeys) {
      // Common API key patterns
      this.patterns.set(
        'api_key',
        /\b(sk-[a-zA-Z0-9]{20,}|gsk_[a-zA-Z0-9]{20,}|api[_-]?key[_-]?[a-zA-Z0-9]{16,})\b/gi
      );
    }

    if (config.detectCreditCards) {
      // Credit card patterns (Visa, Mastercard, Amex, Discover)
      // Simplified - doesn't validate Luhn, just matches format
      this.patterns.set(
        'credit_card',
        /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g
      );
    }

    if (config.detectIPAddresses) {
      // IPv4 addresses
      this.patterns.set(
        'ip_address',
        /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g
      );
    }

    // Custom patterns
    for (const custom of config.customPatterns) {
      try {
        this.customPatterns.push({
          name: custom.name,
          regex: new RegExp(custom.pattern, 'g'),
          placeholder: custom.placeholder,
        });
      } catch {
        // Invalid regex, skip it
      }
    }
  }

  /**
   * Detect PII in text
   */
  detect(text: string): PIIDetection[] {
    const detections: PIIDetection[] = [];

    // Check built-in patterns
    for (const [type, pattern] of this.patterns) {
      pattern.lastIndex = 0; // Reset regex state
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[0];

        // Check allowlist
        if (this.isAllowlisted(value, type)) {
          continue;
        }

        detections.push({
          type,
          value,
          startIndex: match.index,
          endIndex: match.index + value.length,
          confidence: this.calculateConfidence(type, value),
        });
      }
    }

    // Check custom patterns
    for (const custom of this.customPatterns) {
      custom.regex.lastIndex = 0;
      let match;
      while ((match = custom.regex.exec(text)) !== null) {
        const value = match[0];

        if (this.allowlist.has(value.toLowerCase())) {
          continue;
        }

        detections.push({
          type: 'custom',
          value,
          startIndex: match.index,
          endIndex: match.index + value.length,
          confidence: 0.9,
        });
      }
    }

    // Sort by position (for consistent pseudonymization)
    return detections.sort((a, b) => a.startIndex - b.startIndex);
  }

  private isAllowlisted(value: string, type: PIIType): boolean {
    const lowerValue = value.toLowerCase();

    if (this.allowlist.has(lowerValue)) {
      return true;
    }

    // For emails, check domain allowlist
    if (type === 'email') {
      const domain = lowerValue.split('@')[1];
      if (domain && this.allowlistDomains.has(domain)) {
        return true;
      }
    }

    return false;
  }

  private calculateConfidence(type: PIIType, value: string): number {
    // Simple confidence scoring based on format strictness
    switch (type) {
      case 'ssn':
        return 0.95; // High confidence for strict format
      case 'credit_card':
        return 0.95; // High confidence for strict format
      case 'email':
        return 0.9;
      case 'phone':
        return 0.85;
      case 'api_key':
        // Higher confidence for longer keys or known prefixes
        if (value.startsWith('sk-') || value.startsWith('gsk_')) {
          return 0.95;
        }
        return 0.7; // Lower confidence due to possible false positives
      case 'ip_address':
        return 0.8;
      default:
        return 0.8;
    }
  }
}
