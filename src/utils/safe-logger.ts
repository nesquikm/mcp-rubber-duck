import { logger } from './logger.js';

// List of fields that should be sanitized in logs
const SENSITIVE_FIELDS = [
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

// List of field patterns to look for
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key$/i,
  /auth/i,
  /cookie/i,
  /session/i,
];

/**
 * Sanitizes an object by redacting sensitive fields
 */
function sanitizeObject(obj: any, maxDepth = 5, currentDepth = 0): any {
  if (currentDepth >= maxDepth) {
    return '[Max depth exceeded]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if the string looks like a sensitive value (e.g., long random strings)
    if (obj.length > 20 && /^[a-zA-Z0-9+/=]{20,}$/.test(obj)) {
      return `[REDACTED:${obj.length}chars]`;
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();
      
      // Check if the field name is sensitive
      const isSensitive = SENSITIVE_FIELDS.includes(keyLower) ||
        SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
      
      if (isSensitive) {
        if (typeof value === 'string' && value.length > 0) {
          sanitized[key] = `[REDACTED:${value.length}chars]`;
        } else {
          sanitized[key] = '[REDACTED]';
        }
      } else {
        sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
      }
    }
    
    return sanitized;
  }

  return obj;
}

/**
 * Safe logger that sanitizes sensitive data before logging
 */
export class SafeLogger {
  static debug(message: string, data?: any): void {
    if (data) {
      const sanitizedData = sanitizeObject(data);
      logger.debug(message, sanitizedData);
    } else {
      logger.debug(message);
    }
  }

  static info(message: string, data?: any): void {
    if (data) {
      const sanitizedData = sanitizeObject(data);
      logger.info(message, sanitizedData);
    } else {
      logger.info(message);
    }
  }

  static warn(message: string, data?: any): void {
    if (data) {
      const sanitizedData = sanitizeObject(data);
      logger.warn(message, sanitizedData);
    } else {
      logger.warn(message);
    }
  }

  static error(message: string, data?: any): void {
    if (data) {
      const sanitizedData = sanitizeObject(data);
      logger.error(message, sanitizedData);
    } else {
      logger.error(message);
    }
  }

  /**
   * Sanitize arguments object specifically for MCP tool calls
   */
  static sanitizeToolArgs(args: any): any {
    const sanitized = sanitizeObject(args);
    
    // Additional sanitization for common patterns in tool arguments
    if (typeof sanitized === 'object' && sanitized !== null) {
      // Sanitize file paths that might contain usernames
      if (sanitized.path && typeof sanitized.path === 'string') {
        sanitized.path = sanitized.path.replace(/\/Users\/[^\/]+/, '/Users/[USER]');
        sanitized.path = sanitized.path.replace(/\\Users\\[^\\]+/, '\\Users\\[USER]');
      }
      
      // Sanitize URLs that might contain credentials
      if (sanitized.url && typeof sanitized.url === 'string') {
        sanitized.url = sanitized.url.replace(
          /(https?:\/\/)([^:]+):([^@]+)@/,
          '$1[USER]:[REDACTED]@'
        );
      }
    }
    
    return sanitized;
  }

  /**
   * Create a safe message for approval requests
   */
  static createApprovalMessage(duckName: string, server: string, tool: string, args: any): string {
    const sanitizedArgs = this.sanitizeToolArgs(args);
    const argsStr = JSON.stringify(sanitizedArgs, null, 2);
    
    return `Duck "${duckName}" wants to call ${server}:${tool} with arguments:\n${argsStr}`;
  }
}

// Export the sanitize function for direct use
export { sanitizeObject };