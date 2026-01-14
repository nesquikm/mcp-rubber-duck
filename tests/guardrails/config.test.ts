import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ConfigManager } from '../../src/config/config';

// Mock logger to avoid console noise during tests
jest.mock('../../src/utils/logger');

describe('ConfigManager - Guardrails Config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear guardrails env vars
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('GUARDRAILS_')) delete process.env[key];
    });
    // Ensure at least one provider exists
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('basic guardrails config', () => {
    it('should not have guardrails by default', () => {
      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails).toBeUndefined();
    });

    it('should enable guardrails when GUARDRAILS_ENABLED=true', () => {
      process.env.GUARDRAILS_ENABLED = 'true';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.enabled).toBe(true);
    });

    it('should disable guardrails when GUARDRAILS_ENABLED=false', () => {
      process.env.GUARDRAILS_ENABLED = 'false';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails).toBeUndefined();
    });

    it('should set log_violations from environment', () => {
      process.env.GUARDRAILS_ENABLED = 'true';
      process.env.GUARDRAILS_LOG_VIOLATIONS = 'false';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.log_violations).toBe(false);
    });

    it('should set log_modifications from environment', () => {
      process.env.GUARDRAILS_ENABLED = 'true';
      process.env.GUARDRAILS_LOG_MODIFICATIONS = 'true';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.log_modifications).toBe(true);
    });

    it('should set fail_open from environment', () => {
      process.env.GUARDRAILS_ENABLED = 'true';
      process.env.GUARDRAILS_FAIL_OPEN = 'true';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.fail_open).toBe(true);
    });
  });

  describe('rate limiter config', () => {
    it('should configure rate limiter from environment', () => {
      process.env.GUARDRAILS_RATE_LIMITER_ENABLED = 'true';
      process.env.GUARDRAILS_RATE_LIMITER_REQUESTS_PER_MINUTE = '30';
      process.env.GUARDRAILS_RATE_LIMITER_REQUESTS_PER_HOUR = '500';

      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      expect(config.guardrails?.enabled).toBe(true);
      expect(config.guardrails?.plugins?.rate_limiter?.enabled).toBe(true);
      expect(config.guardrails?.plugins?.rate_limiter?.requests_per_minute).toBe(30);
      expect(config.guardrails?.plugins?.rate_limiter?.requests_per_hour).toBe(500);
    });

    it('should configure per_provider setting', () => {
      process.env.GUARDRAILS_RATE_LIMITER_ENABLED = 'true';
      process.env.GUARDRAILS_RATE_LIMITER_PER_PROVIDER = 'true';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.rate_limiter?.per_provider).toBe(true);
    });

    it('should configure burst_allowance setting', () => {
      process.env.GUARDRAILS_RATE_LIMITER_ENABLED = 'true';
      process.env.GUARDRAILS_RATE_LIMITER_BURST_ALLOWANCE = '10';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.rate_limiter?.burst_allowance).toBe(10);
    });
  });

  describe('token limiter config', () => {
    it('should configure token limiter from environment', () => {
      process.env.GUARDRAILS_TOKEN_LIMITER_ENABLED = 'true';
      process.env.GUARDRAILS_TOKEN_LIMITER_MAX_INPUT_TOKENS = '4096';

      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      expect(config.guardrails?.enabled).toBe(true);
      expect(config.guardrails?.plugins?.token_limiter?.enabled).toBe(true);
      expect(config.guardrails?.plugins?.token_limiter?.max_input_tokens).toBe(4096);
    });

    it('should configure max_output_tokens setting', () => {
      process.env.GUARDRAILS_TOKEN_LIMITER_ENABLED = 'true';
      process.env.GUARDRAILS_TOKEN_LIMITER_MAX_OUTPUT_TOKENS = '2048';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.token_limiter?.max_output_tokens).toBe(2048);
    });

    it('should configure warn_at_percentage setting', () => {
      process.env.GUARDRAILS_TOKEN_LIMITER_ENABLED = 'true';
      process.env.GUARDRAILS_TOKEN_LIMITER_WARN_AT_PERCENTAGE = '90';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.token_limiter?.warn_at_percentage).toBe(90);
    });
  });

  describe('pattern blocker config', () => {
    it('should configure pattern blocker from environment', () => {
      process.env.GUARDRAILS_PATTERN_BLOCKER_ENABLED = 'true';
      process.env.GUARDRAILS_PATTERN_BLOCKER_PATTERNS = 'password,secret,api_key';

      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      expect(config.guardrails?.enabled).toBe(true);
      expect(config.guardrails?.plugins?.pattern_blocker?.enabled).toBe(true);
      expect(config.guardrails?.plugins?.pattern_blocker?.blocked_patterns).toEqual([
        'password',
        'secret',
        'api_key',
      ]);
    });

    it('should configure regex patterns', () => {
      process.env.GUARDRAILS_PATTERN_BLOCKER_ENABLED = 'true';
      process.env.GUARDRAILS_PATTERN_BLOCKER_PATTERNS_REGEX = 'pass.*word,secret\\d+';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.pattern_blocker?.blocked_patterns_regex).toEqual([
        'pass.*word',
        'secret\\d+',
      ]);
    });

    it('should configure case_sensitive setting', () => {
      process.env.GUARDRAILS_PATTERN_BLOCKER_ENABLED = 'true';
      process.env.GUARDRAILS_PATTERN_BLOCKER_CASE_SENSITIVE = 'true';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.pattern_blocker?.case_sensitive).toBe(true);
    });

    it('should configure action_on_match setting', () => {
      process.env.GUARDRAILS_PATTERN_BLOCKER_ENABLED = 'true';
      process.env.GUARDRAILS_PATTERN_BLOCKER_ACTION = 'redact';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.pattern_blocker?.action_on_match).toBe('redact');
    });
  });

  describe('PII redactor config', () => {
    it('should configure PII redactor from environment', () => {
      process.env.GUARDRAILS_PII_REDACTOR_ENABLED = 'true';

      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      expect(config.guardrails?.enabled).toBe(true);
      expect(config.guardrails?.plugins?.pii_redactor?.enabled).toBe(true);
    });

    it('should configure detection types', () => {
      process.env.GUARDRAILS_PII_REDACTOR_ENABLED = 'true';
      process.env.GUARDRAILS_PII_REDACTOR_DETECT_EMAILS = 'false';
      process.env.GUARDRAILS_PII_REDACTOR_DETECT_PHONES = 'true';
      process.env.GUARDRAILS_PII_REDACTOR_DETECT_SSN = 'false';
      process.env.GUARDRAILS_PII_REDACTOR_DETECT_API_KEYS = 'true';
      process.env.GUARDRAILS_PII_REDACTOR_DETECT_CREDIT_CARDS = 'false';
      process.env.GUARDRAILS_PII_REDACTOR_DETECT_IP_ADDRESSES = 'true';

      const configManager = new ConfigManager();
      const piiConfig = configManager.getConfig().guardrails?.plugins?.pii_redactor;

      expect(piiConfig?.detect_emails).toBe(false);
      expect(piiConfig?.detect_phones).toBe(true);
      expect(piiConfig?.detect_ssn).toBe(false);
      expect(piiConfig?.detect_api_keys).toBe(true);
      expect(piiConfig?.detect_credit_cards).toBe(false);
      expect(piiConfig?.detect_ip_addresses).toBe(true);
    });

    it('should configure allowlist', () => {
      process.env.GUARDRAILS_PII_REDACTOR_ENABLED = 'true';
      process.env.GUARDRAILS_PII_REDACTOR_ALLOWLIST = 'test@example.com,support@company.com';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.pii_redactor?.allowlist).toEqual([
        'test@example.com',
        'support@company.com',
      ]);
    });

    it('should configure allowlist_domains', () => {
      process.env.GUARDRAILS_PII_REDACTOR_ENABLED = 'true';
      process.env.GUARDRAILS_PII_REDACTOR_ALLOWLIST_DOMAINS = 'company.com,internal.org';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.pii_redactor?.allowlist_domains).toEqual([
        'company.com',
        'internal.org',
      ]);
    });

    it('should configure restore_on_response', () => {
      process.env.GUARDRAILS_PII_REDACTOR_ENABLED = 'true';
      process.env.GUARDRAILS_PII_REDACTOR_RESTORE_ON_RESPONSE = 'true';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.pii_redactor?.restore_on_response).toBe(true);
    });

    it('should configure log_detections', () => {
      process.env.GUARDRAILS_PII_REDACTOR_ENABLED = 'true';
      process.env.GUARDRAILS_PII_REDACTOR_LOG_DETECTIONS = 'false';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.plugins?.pii_redactor?.log_detections).toBe(false);
    });
  });

  describe('auto-enable behavior', () => {
    it('should auto-enable guardrails when a plugin is enabled', () => {
      // Don't set GUARDRAILS_ENABLED, but enable a plugin
      process.env.GUARDRAILS_RATE_LIMITER_ENABLED = 'true';

      const configManager = new ConfigManager();
      expect(configManager.getConfig().guardrails?.enabled).toBe(true);
    });

    it('should auto-enable with multiple plugins', () => {
      process.env.GUARDRAILS_RATE_LIMITER_ENABLED = 'true';
      process.env.GUARDRAILS_PII_REDACTOR_ENABLED = 'true';

      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      expect(config.guardrails?.enabled).toBe(true);
      expect(config.guardrails?.plugins?.rate_limiter?.enabled).toBe(true);
      expect(config.guardrails?.plugins?.pii_redactor?.enabled).toBe(true);
    });
  });
});
