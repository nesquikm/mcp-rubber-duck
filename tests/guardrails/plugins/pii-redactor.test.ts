import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PIIRedactorPlugin } from '../../../src/guardrails/plugins/pii-redactor';
import { PIIDetector } from '../../../src/guardrails/plugins/pii-redactor/detectors';
import { Pseudonymizer } from '../../../src/guardrails/plugins/pii-redactor/pseudonymizer';
import { createGuardrailContext } from '../../../src/guardrails/context';

// Mock logger to avoid console noise during tests
jest.mock('../../../src/utils/logger');

describe('PIIDetector', () => {
  describe('email detection', () => {
    it('should detect email addresses', () => {
      const detector = new PIIDetector({
        detectEmails: true,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Contact me at john.doe@example.com for more info';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('email');
      expect(detections[0].value).toBe('john.doe@example.com');
    });

    it('should detect multiple email addresses', () => {
      const detector = new PIIDetector({
        detectEmails: true,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Email alice@example.com or bob@company.org';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(2);
      expect(detections.map((d) => d.value)).toEqual(['alice@example.com', 'bob@company.org']);
    });

    it('should not detect emails when disabled', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Contact me at john@example.com';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(0);
    });
  });

  describe('phone detection', () => {
    it('should detect US phone numbers with dashes', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: true,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Call me at 555-123-4567';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('phone');
      expect(detections[0].value).toBe('555-123-4567');
    });

    it('should detect phone numbers with parentheses', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: true,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Call me at (555) 123-4567';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('phone');
    });

    it('should detect phone numbers with country code', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: true,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'International: +1-555-123-4567';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('phone');
    });
  });

  describe('SSN detection', () => {
    it('should detect SSN with dashes', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: true,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'SSN: 123-45-6789';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('ssn');
      expect(detections[0].value).toBe('123-45-6789');
    });

    it('should detect SSN with spaces', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: true,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'SSN: 123 45 6789';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('ssn');
    });
  });

  describe('API key detection', () => {
    it('should detect OpenAI API keys (sk-)', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: true,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'API Key: sk-abc123def456ghi789jkl0';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('api_key');
      expect(detections[0].value.startsWith('sk-')).toBe(true);
      expect(detections[0].confidence).toBe(0.95);
    });

    it('should detect Groq API keys (gsk_)', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: true,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Groq key: gsk_abc123def456ghi789jkl0';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('api_key');
      expect(detections[0].value.startsWith('gsk_')).toBe(true);
    });

    it('should detect generic API keys with lower confidence', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: true,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      // Generic API key pattern (api_key + 16+ chars, not sk- or gsk_)
      const text = 'Generic: api_key_abc123def456ghi7';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('api_key');
      // Should have lower confidence (0.7) for generic keys
      expect(detections[0].confidence).toBe(0.7);
    });
  });

  describe('credit card detection', () => {
    it('should detect Visa card numbers', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: true,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Card: 4111111111111111';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('credit_card');
      expect(detections[0].value).toBe('4111111111111111');
    });

    it('should detect Mastercard numbers', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: true,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Card: 5500000000000004';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('credit_card');
    });

    it('should detect American Express numbers', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: true,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Amex: 340000000000009';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('credit_card');
    });
  });

  describe('IP address detection', () => {
    it('should detect IPv4 addresses', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: true,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Server IP: 192.168.1.100';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('ip_address');
      expect(detections[0].value).toBe('192.168.1.100');
    });

    it('should not detect invalid IP addresses', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: true,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Invalid: 999.999.999.999';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(0);
    });
  });

  describe('allowlist', () => {
    it('should not detect allowlisted emails', () => {
      const detector = new PIIDetector({
        detectEmails: true,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: ['support@company.com'],
        allowlistDomains: [],
      });

      const text = 'Contact support@company.com or sales@company.com';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].value).toBe('sales@company.com');
    });

    it('should be case insensitive for allowlist', () => {
      const detector = new PIIDetector({
        detectEmails: true,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: ['SUPPORT@COMPANY.COM'],
        allowlistDomains: [],
      });

      const text = 'Contact support@company.com';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(0);
    });
  });

  describe('domain allowlist', () => {
    it('should not detect emails from allowlisted domains', () => {
      const detector = new PIIDetector({
        detectEmails: true,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: ['company.com'],
      });

      const text = 'Contact anyone@company.com or external@gmail.com';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].value).toBe('external@gmail.com');
    });
  });

  describe('custom patterns', () => {
    it('should detect custom patterns', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [
          { name: 'employee_id', pattern: 'EMP-[0-9]{6}', placeholder: 'EMPLOYEE' },
        ],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Employee ID: EMP-123456';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('custom');
      expect(detections[0].value).toBe('EMP-123456');
    });

    it('should not detect custom patterns that are in allowlist', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [
          { name: 'employee_id', pattern: 'EMP-[0-9]{6}', placeholder: 'EMPLOYEE' },
        ],
        allowlist: ['EMP-123456'], // This employee ID is allowlisted
        allowlistDomains: [],
      });

      const text = 'Employee ID: EMP-123456 and EMP-789012';
      const detections = detector.detect(text);

      // Only EMP-789012 should be detected (EMP-123456 is allowlisted)
      expect(detections).toHaveLength(1);
      expect(detections[0].value).toBe('EMP-789012');
    });

    it('should skip invalid regex patterns', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [
          { name: 'invalid', pattern: '[invalid(regex', placeholder: 'X' },
        ],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Some text';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(0);
    });
  });

  describe('multiple detections', () => {
    it('should detect multiple PII types in same text', () => {
      const detector = new PIIDetector({
        detectEmails: true,
        detectPhones: true,
        detectSSN: true,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = 'Contact john@example.com at 555-123-4567. SSN: 123-45-6789';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(3);
      expect(detections.map((d) => d.type).sort()).toEqual(['email', 'phone', 'ssn']);
    });

    it('should return detections sorted by position', () => {
      const detector = new PIIDetector({
        detectEmails: true,
        detectPhones: true,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [],
        allowlist: [],
        allowlistDomains: [],
      });

      const text = '555-123-4567 and john@example.com';
      const detections = detector.detect(text);

      expect(detections[0].type).toBe('phone');
      expect(detections[1].type).toBe('email');
    });
  });
});

describe('Pseudonymizer', () => {
  let pseudonymizer: Pseudonymizer;

  beforeEach(() => {
    pseudonymizer = new Pseudonymizer();
  });

  describe('pseudonymize', () => {
    it('should replace PII with numbered placeholders', () => {
      const detections = [
        { type: 'email' as const, value: 'john@example.com', startIndex: 0, endIndex: 16, confidence: 0.9 },
      ];

      const result = pseudonymizer.pseudonymize('john@example.com', detections);

      expect(result.text).toBe('[EMAIL_1]');
      expect(result.mappings.get('[EMAIL_1]')).toBe('john@example.com');
    });

    it('should number multiple instances of same type', () => {
      const detections = [
        { type: 'email' as const, value: 'a@b.com', startIndex: 0, endIndex: 7, confidence: 0.9 },
        { type: 'email' as const, value: 'c@d.com', startIndex: 12, endIndex: 19, confidence: 0.9 },
      ];

      const result = pseudonymizer.pseudonymize('a@b.com and c@d.com', detections);

      expect(result.text).toBe('[EMAIL_1] and [EMAIL_2]');
      expect(result.mappings.get('[EMAIL_1]')).toBe('a@b.com');
      expect(result.mappings.get('[EMAIL_2]')).toBe('c@d.com');
    });

    it('should handle different PII types', () => {
      const detections = [
        { type: 'email' as const, value: 'john@x.com', startIndex: 0, endIndex: 10, confidence: 0.9 },
        { type: 'phone' as const, value: '555-1234', startIndex: 15, endIndex: 23, confidence: 0.85 },
      ];

      const result = pseudonymizer.pseudonymize('john@x.com and 555-1234', detections);

      expect(result.text).toBe('[EMAIL_1] and [PHONE_1]');
    });

    it('should create correct placeholders for all types', () => {
      const types = ['email', 'phone', 'ssn', 'api_key', 'credit_card', 'ip_address', 'custom'] as const;
      const expectedLabels = ['EMAIL', 'PHONE', 'SSN', 'API_KEY', 'CARD', 'IP', 'REDACTED'];

      types.forEach((type, i) => {
        pseudonymizer.reset();
        const detections = [
          { type, value: 'test', startIndex: 0, endIndex: 4, confidence: 0.9 },
        ];

        const result = pseudonymizer.pseudonymize('test', detections);
        expect(result.text).toBe(`[${expectedLabels[i]}_1]`);
      });
    });
  });

  describe('restore', () => {
    it('should restore placeholders to original values', () => {
      const mappings = new Map<string, string>([
        ['[EMAIL_1]', 'john@example.com'],
      ]);

      const result = pseudonymizer.restore('Contact [EMAIL_1] for help', mappings);

      expect(result).toBe('Contact john@example.com for help');
    });

    it('should restore multiple occurrences of same placeholder', () => {
      const mappings = new Map<string, string>([
        ['[EMAIL_1]', 'john@example.com'],
      ]);

      const result = pseudonymizer.restore('From [EMAIL_1] to [EMAIL_1]', mappings);

      expect(result).toBe('From john@example.com to john@example.com');
    });

    it('should restore multiple different placeholders', () => {
      const mappings = new Map<string, string>([
        ['[EMAIL_1]', 'john@x.com'],
        ['[PHONE_1]', '555-1234'],
      ]);

      const result = pseudonymizer.restore('[EMAIL_1] at [PHONE_1]', mappings);

      expect(result).toBe('john@x.com at 555-1234');
    });

    it('should return original text if no mappings match', () => {
      const mappings = new Map<string, string>([
        ['[EMAIL_1]', 'john@example.com'],
      ]);

      const result = pseudonymizer.restore('No placeholders here', mappings);

      expect(result).toBe('No placeholders here');
    });
  });
});

describe('PIIRedactorPlugin', () => {
  let plugin: PIIRedactorPlugin;

  beforeEach(async () => {
    plugin = new PIIRedactorPlugin();
  });

  describe('initialization', () => {
    it('should initialize with default values', async () => {
      await plugin.initialize({ enabled: true });

      expect(plugin.enabled).toBe(true);
      expect(plugin.name).toBe('pii_redactor');
      expect(plugin.phases).toContain('pre_request');
      expect(plugin.phases).toContain('post_response');
    });

    it('should initialize detector with config', async () => {
      await plugin.initialize({
        enabled: true,
        detect_emails: true,
        detect_phones: false,
        detect_ssn: false,
        detect_api_keys: false,
        detect_credit_cards: false,
      });

      const detector = plugin.getDetector();
      const text = 'Email: test@example.com, Phone: 555-123-4567';
      const detections = detector.detect(text);

      // Should only detect email, not phone
      expect(detections).toHaveLength(1);
      expect(detections[0].type).toBe('email');
    });

    it('should configure allowlist', async () => {
      await plugin.initialize({
        enabled: true,
        detect_emails: true,
        allowlist: ['allowed@example.com'],
      });

      const detector = plugin.getDetector();
      const detections = detector.detect('Contact allowed@example.com or other@example.com');

      expect(detections).toHaveLength(1);
      expect(detections[0].value).toBe('other@example.com');
    });
  });

  describe('pre_request phase', () => {
    it('should redact PII in prompt', async () => {
      await plugin.initialize({
        enabled: true,
        detect_emails: true,
        detect_phones: false,
        detect_ssn: false,
        detect_api_keys: false,
        detect_credit_cards: false,
        detect_ip_addresses: false,
      });

      const context = createGuardrailContext({
        prompt: 'Contact john@example.com for help',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('modify');
      expect(context.prompt).toBe('Contact [EMAIL_1] for help');
      expect(context.metadata.get('pii_mappings')).toBeDefined();
    });

    it('should allow prompts without PII', async () => {
      await plugin.initialize({
        enabled: true,
        detect_emails: true,
      });

      const context = createGuardrailContext({
        prompt: 'Hello world, no sensitive data here',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('allow');
    });

    it('should record modifications', async () => {
      await plugin.initialize({
        enabled: true,
        detect_emails: true,
        detect_phones: true,
        detect_ssn: false,
        detect_api_keys: false,
        detect_credit_cards: false,
        detect_ip_addresses: false,
      });

      const context = createGuardrailContext({
        prompt: 'Email: a@b.com, Phone: 555-123-4567',
      });
      await plugin.execute('pre_request', context);

      expect(context.modifications.length).toBeGreaterThan(0);
      expect(context.modifications[0].pluginName).toBe('pii_redactor');
    });

    it('should update last message when present', async () => {
      await plugin.initialize({
        enabled: true,
        detect_emails: true,
        detect_phones: false,
        detect_ssn: false,
        detect_api_keys: false,
        detect_credit_cards: false,
        detect_ip_addresses: false,
      });

      const context = createGuardrailContext({
        prompt: 'Email: test@example.com',
        messages: [
          { role: 'user', content: 'Email: test@example.com', timestamp: new Date() },
        ],
      });
      await plugin.execute('pre_request', context);

      expect(context.messages[0].content).toBe('Email: [EMAIL_1]');
    });
  });

  describe('pre_tool_input phase', () => {
    it('should redact PII in tool arguments', async () => {
      await plugin.initialize({
        enabled: true,
        detect_emails: true,
        detect_phones: false,
        detect_ssn: false,
        detect_api_keys: false,
        detect_credit_cards: false,
        detect_ip_addresses: false,
      });

      const context = createGuardrailContext({
        toolName: 'send_email',
        toolArgs: { to: 'john@example.com', subject: 'Hello' },
      });
      const result = await plugin.execute('pre_tool_input', context);

      expect(result.action).toBe('modify');
      expect(JSON.stringify(context.toolArgs)).toContain('[EMAIL_1]');
    });
  });

  describe('post_response phase', () => {
    it('should not restore by default', async () => {
      await plugin.initialize({
        enabled: true,
        restore_on_response: false,
      });

      const context = createGuardrailContext({
        response: 'Contact [EMAIL_1] for help',
      });
      context.metadata.set('pii_mappings', new Map([['[EMAIL_1]', 'john@example.com']]));

      const result = await plugin.execute('post_response', context);

      expect(result.action).toBe('allow');
      expect(context.response).toBe('Contact [EMAIL_1] for help');
    });

    it('should restore when configured', async () => {
      await plugin.initialize({
        enabled: true,
        restore_on_response: true,
      });

      const context = createGuardrailContext({
        response: 'Contact [EMAIL_1] for help',
      });
      context.metadata.set('pii_mappings', new Map([['[EMAIL_1]', 'john@example.com']]));

      const result = await plugin.execute('post_response', context);

      expect(result.action).toBe('modify');
      expect(context.response).toBe('Contact john@example.com for help');
    });

    it('should not modify if no mappings exist', async () => {
      await plugin.initialize({
        enabled: true,
        restore_on_response: true,
      });

      const context = createGuardrailContext({
        response: 'Contact [EMAIL_1] for help',
      });
      // No mappings set

      const result = await plugin.execute('post_response', context);

      expect(result.action).toBe('allow');
    });
  });

  describe('post_tool_output phase', () => {
    it('should restore PII in tool result when configured', async () => {
      await plugin.initialize({
        enabled: true,
        restore_on_response: true,
      });

      const context = createGuardrailContext({
        toolResult: 'User email is [EMAIL_1]',
      });
      context.metadata.set('pii_mappings', new Map([['[EMAIL_1]', 'john@example.com']]));

      const result = await plugin.execute('post_tool_output', context);

      expect(result.action).toBe('modify');
      expect(context.toolResult).toBe('User email is john@example.com');
    });
  });

  describe('edge cases', () => {
    it('should handle empty prompt', async () => {
      await plugin.initialize({ enabled: true });

      const context = createGuardrailContext({
        prompt: '',
      });
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('allow');
    });

    it('should handle undefined prompt', async () => {
      await plugin.initialize({ enabled: true });

      const context = createGuardrailContext({});
      const result = await plugin.execute('pre_request', context);

      expect(result.action).toBe('allow');
    });

    it('should handle unrecognized phase', async () => {
      await plugin.initialize({ enabled: true });

      const context = createGuardrailContext({});
      const result = await plugin.execute('unknown_phase' as any, context);

      expect(result.action).toBe('allow');
    });

    it('should handle JSON parse error gracefully when redacting toolArgs', async () => {
      await plugin.initialize({
        enabled: true,
        detect_emails: true,
      });

      // Create context with toolArgs that become invalid JSON after redaction
      // When the email is replaced with placeholder, the JSON structure might break
      const context = createGuardrailContext({
        toolName: 'send_email',
        toolArgs: { to: 'user@example.com' },
      });

      const result = await plugin.execute('pre_tool_input', context);

      // Should still modify and store result appropriately
      expect(result.action).toBe('modify');
      expect(context.toolArgs).toBeDefined();
    });

    it('should handle empty response when restoring', async () => {
      await plugin.initialize({
        enabled: true,
        restore_on_response: true,
      });

      const context = createGuardrailContext({
        response: '',
      });
      context.metadata.set('pii_mappings', new Map([['[EMAIL_1]', 'test@test.com']]));

      const result = await plugin.execute('post_response', context);

      // Empty response should just allow
      expect(result.action).toBe('allow');
    });

    it('should handle no placeholders found during restore', async () => {
      await plugin.initialize({
        enabled: true,
        restore_on_response: true,
      });

      const context = createGuardrailContext({
        response: 'The user has been notified.',
      });
      // Mappings exist but placeholders are not in the response
      context.metadata.set('pii_mappings', new Map([['[EMAIL_1]', 'test@test.com']]));

      const result = await plugin.execute('post_response', context);

      // No changes to make, should allow
      expect(result.action).toBe('allow');
      expect(context.response).toBe('The user has been notified.');
    });

    it('should expose getPseudonymizer for testing', async () => {
      await plugin.initialize({ enabled: true });

      const pseudonymizer = plugin.getPseudonymizer();
      expect(pseudonymizer).toBeDefined();
      expect(typeof pseudonymizer.pseudonymize).toBe('function');
      expect(typeof pseudonymizer.restore).toBe('function');
    });

    it('should expose getDetector for testing', async () => {
      await plugin.initialize({ enabled: true });

      const detector = plugin.getDetector();
      expect(detector).toBeDefined();
      expect(typeof detector.detect).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle tool args that become invalid JSON after redaction', async () => {
      await plugin.initialize({
        enabled: true,
        detect_emails: true,
      });

      // Create a context where toolArgs will have PII redacted in a way that
      // could produce invalid JSON if not handled properly
      const context = createGuardrailContext({
        toolName: 'test_tool',
        toolArgs: {
          email: 'test@example.com',
          nested: { value: 'data' },
        },
      });

      const result = await plugin.execute('pre_tool_input', context);

      expect(result.action).toBe('modify');
      expect(context.toolArgs).toBeDefined();
      // The redacted args should be valid (either parsed JSON or fallback)
      expect(typeof context.toolArgs).toBe('object');
    });

    it('should return default confidence for unknown PII types', () => {
      const detector = new PIIDetector({
        detectEmails: false,
        detectPhones: false,
        detectSSN: false,
        detectAPIKeys: false,
        detectCreditCards: false,
        detectIPAddresses: false,
        customPatterns: [
          { name: 'custom_unknown_type', pattern: '\\bTEST\\d+\\b', placeholder: '[CUSTOM]' },
        ],
        allowlist: [],
        allowlistDomains: [],
      });

      const detections = detector.detect('Found TEST123 here');
      expect(detections.length).toBe(1);
      // Custom patterns get default confidence
      expect(detections[0].confidence).toBeGreaterThanOrEqual(0.7);
    });
  });
});
