import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SafeLogger, sanitizeObject } from '../src/utils/safe-logger.js';
import { logger } from '../src/utils/logger.js';

// Mock the logger module before it's used
jest.mock('../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('sanitizeObject', () => {
  describe('primitive types', () => {
    it('should return null as-is', () => {
      expect(sanitizeObject(null)).toBe(null);
    });

    it('should return undefined as-is', () => {
      expect(sanitizeObject(undefined)).toBe(undefined);
    });

    it('should return numbers as-is', () => {
      expect(sanitizeObject(42)).toBe(42);
      expect(sanitizeObject(0)).toBe(0);
      expect(sanitizeObject(-1.5)).toBe(-1.5);
    });

    it('should return booleans as-is', () => {
      expect(sanitizeObject(true)).toBe(true);
      expect(sanitizeObject(false)).toBe(false);
    });

    it('should return regular strings as-is', () => {
      expect(sanitizeObject('hello world')).toBe('hello world');
      expect(sanitizeObject('')).toBe('');
    });

    it('should redact long base64-like strings', () => {
      // Pattern matches: alphanumeric + base64 chars (+/=), length > 20
      const sensitiveString = 'abcdefghijklmnopqrstuvwxyz123456789ABCD';
      const result = sanitizeObject(sensitiveString);
      expect(result).toMatch(/\[REDACTED:\d+chars\]/);
    });

    it('should not redact normal long strings', () => {
      const normalLongString = 'This is a normal sentence that is longer than 20 characters.';
      expect(sanitizeObject(normalLongString)).toBe(normalLongString);
    });
  });

  describe('arrays', () => {
    it('should recursively sanitize array elements', () => {
      const input = ['hello', { apiKey: 'secret123' }, 42];
      const result = sanitizeObject(input) as unknown[];

      expect(result[0]).toBe('hello');
      expect((result[1] as Record<string, unknown>).apiKey).toMatch(/\[REDACTED/);
      expect(result[2]).toBe(42);
    });

    it('should handle empty arrays', () => {
      expect(sanitizeObject([])).toEqual([]);
    });

    it('should handle nested arrays', () => {
      const input = [[{ password: 'secret' }]];
      const result = sanitizeObject(input) as unknown[][];

      expect((result[0][0] as Record<string, unknown>).password).toMatch(/\[REDACTED/);
    });
  });

  describe('objects', () => {
    it('should redact sensitive fields', () => {
      const sensitiveFields = [
        'password',
        'apiKey',
        'api_key',
        'token',
        'secret',
        'auth',
        'authorization',
        'cookie',
        'session',
        'private_key',
        'privateKey',
        'client_secret',
        'clientSecret',
      ];

      for (const field of sensitiveFields) {
        const input = { [field]: 'sensitive_value' };
        const result = sanitizeObject(input) as Record<string, unknown>;
        expect(result[field]).toMatch(/\[REDACTED/);
      }
    });

    it('should redact fields matching patterns', () => {
      const input = {
        userPassword: 'secret',
        awsSecretAccessKey: 'key123',
        authToken: 'tok123',
        sessionCookie: 'cookie123',
      };

      const result = sanitizeObject(input) as Record<string, unknown>;

      expect(result.userPassword).toMatch(/\[REDACTED/);
      expect(result.awsSecretAccessKey).toMatch(/\[REDACTED/);
      expect(result.authToken).toMatch(/\[REDACTED/);
      expect(result.sessionCookie).toMatch(/\[REDACTED/);
    });

    it('should not redact non-sensitive fields', () => {
      const input = {
        username: 'john',
        email: 'john@example.com',
        id: 123,
      };

      const result = sanitizeObject(input) as Record<string, unknown>;

      expect(result.username).toBe('john');
      expect(result.email).toBe('john@example.com');
      expect(result.id).toBe(123);
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          credentials: {
            password: 'secret',
          },
        },
      };

      const result = sanitizeObject(input) as Record<string, unknown>;
      const nested = (result.user as Record<string, unknown>).credentials as Record<string, unknown>;

      expect(nested.password).toMatch(/\[REDACTED/);
    });

    it('should include length for string sensitive values', () => {
      const input = { password: 'secret123' };
      const result = sanitizeObject(input) as Record<string, unknown>;

      expect(result.password).toBe('[REDACTED:9chars]');
    });

    it('should use simple REDACTED for non-string sensitive values', () => {
      const input = { password: 12345, apiKey: null, token: undefined };
      const result = sanitizeObject(input) as Record<string, unknown>;

      expect(result.password).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
    });

    it('should use simple REDACTED for empty string sensitive values', () => {
      const input = { password: '' };
      const result = sanitizeObject(input) as Record<string, unknown>;

      expect(result.password).toBe('[REDACTED]');
    });
  });

  describe('max depth handling', () => {
    it('should stop at max depth and return placeholder', () => {
      const deepObject = {
        l1: { l2: { l3: { l4: { l5: { l6: 'too deep' } } } } },
      };

      const result = sanitizeObject(deepObject) as Record<string, unknown>;
      const l5 = (
        (((result.l1 as Record<string, unknown>).l2 as Record<string, unknown>).l3 as Record<string, unknown>)
          .l4 as Record<string, unknown>
      ).l5 as string;

      expect(l5).toBe('[Max depth exceeded]');
    });

    it('should respect custom max depth', () => {
      const object = { l1: { l2: { l3: 'value' } } };

      const result = sanitizeObject(object, 2) as Record<string, unknown>;
      const l2 = (result.l1 as Record<string, unknown>).l2 as string;

      expect(l2).toBe('[Max depth exceeded]');
    });
  });

  describe('edge cases', () => {
    it('should handle functions (return as-is)', () => {
      const fn = () => 'test';
      expect(sanitizeObject(fn)).toBe(fn);
    });

    it('should handle symbols (return as-is)', () => {
      const sym = Symbol('test');
      expect(sanitizeObject(sym)).toBe(sym);
    });
  });
});

describe('SafeLogger', () => {
  // The SafeLogger methods internally call the logger and sanitizeObject
  // We test the sanitization logic separately; here we just ensure the methods don't throw

  describe('logging methods', () => {
    it('should call debug without throwing', () => {
      expect(() => SafeLogger.debug('test message')).not.toThrow();
      expect(() => SafeLogger.debug('test', { data: 'value' })).not.toThrow();
    });

    it('should call info without throwing', () => {
      expect(() => SafeLogger.info('info message')).not.toThrow();
      expect(() => SafeLogger.info('info', { data: 'value' })).not.toThrow();
    });

    it('should call warn without throwing', () => {
      expect(() => SafeLogger.warn('warning message')).not.toThrow();
      expect(() => SafeLogger.warn('warning', { data: 'value' })).not.toThrow();
    });

    it('should call error without throwing', () => {
      expect(() => SafeLogger.error('error message')).not.toThrow();
      expect(() => SafeLogger.error('error', { data: 'value' })).not.toThrow();
    });
  });
});

describe('SafeLogger.sanitizeToolArgs', () => {
  it('should sanitize regular sensitive fields', () => {
    const args = { password: 'secret', query: 'SELECT *' };
    const result = SafeLogger.sanitizeToolArgs(args) as Record<string, unknown>;

    expect(result.password).toMatch(/\[REDACTED/);
    expect(result.query).toBe('SELECT *');
  });

  it('should sanitize Unix file paths with usernames', () => {
    const args = { path: '/Users/johndoe/Documents/file.txt' };
    const result = SafeLogger.sanitizeToolArgs(args) as Record<string, unknown>;

    expect(result.path).toBe('/Users/[USER]/Documents/file.txt');
  });

  it('should sanitize Windows file paths with usernames', () => {
    const args = { path: '\\Users\\johndoe\\Documents\\file.txt' };
    const result = SafeLogger.sanitizeToolArgs(args) as Record<string, unknown>;

    expect(result.path).toBe('\\Users\\[USER]\\Documents\\file.txt');
  });

  it('should sanitize URLs with credentials', () => {
    const args = { url: 'https://admin:password123@api.example.com/data' };
    const result = SafeLogger.sanitizeToolArgs(args) as Record<string, unknown>;

    expect(result.url).toBe('https://[USER]:[REDACTED]@api.example.com/data');
  });

  it('should handle URLs without credentials', () => {
    const args = { url: 'https://api.example.com/data' };
    const result = SafeLogger.sanitizeToolArgs(args) as Record<string, unknown>;

    expect(result.url).toBe('https://api.example.com/data');
  });

  it('should handle non-object input', () => {
    expect(SafeLogger.sanitizeToolArgs('string')).toBe('string');
    expect(SafeLogger.sanitizeToolArgs(123)).toBe(123);
    expect(SafeLogger.sanitizeToolArgs(null)).toBe(null);
  });

  it('should handle object without path or url', () => {
    const args = { query: 'SELECT * FROM users' };
    const result = SafeLogger.sanitizeToolArgs(args) as Record<string, unknown>;

    expect(result.query).toBe('SELECT * FROM users');
  });
});

describe('SafeLogger.createApprovalMessage', () => {
  it('should create approval message with sanitized args', () => {
    const message = SafeLogger.createApprovalMessage(
      'TestDuck',
      'filesystem',
      'read_file',
      { path: '/Users/john/document.txt', password: 'mysecretpassword' }
    );

    expect(message).toContain('TestDuck');
    expect(message).toContain('filesystem:read_file');
    expect(message).toContain('[USER]');
    expect(message).toContain('[REDACTED');
    expect(message).not.toContain('john');
    expect(message).not.toContain('mysecretpassword');
  });

  it('should format args as JSON', () => {
    const message = SafeLogger.createApprovalMessage(
      'Duck',
      'server',
      'tool',
      { simple: 'value' }
    );

    expect(message).toContain('"simple"');
    expect(message).toContain('"value"');
  });
});
