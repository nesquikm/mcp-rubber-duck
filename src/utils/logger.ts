import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const logLevel = process.env.LOG_LEVEL || 'info';
const isMCP = process.env.MCP_SERVER === 'true' || process.argv.includes('--mcp');

// Determine logs directory based on environment and execution context
function getLogsDirectory(): string {
  // Allow custom logs directory via environment variable
  if (process.env.LOGS_DIR) {
    return process.env.LOGS_DIR;
  }

  try {
    // Try to use project directory when possible (development/direct execution)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const projectRoot = join(__dirname, '..', '..');
    const projectLogsDir = join(projectRoot, 'logs');
    
    // Check if we can write to project directory
    if (existsSync(projectRoot)) {
      return projectLogsDir;
    }
  } catch (_error) {
    // Fall through to user directory if project root detection fails
  }

  // Fallback to user directory for MCP server or when project root isn't writable
  return join(homedir(), '.mcp-rubber-duck', 'logs');
}

// Ensure logs directory exists
const logsDir = getLogsDirectory();
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Use simpler format for MCP to avoid interfering with JSON communication
const consoleFormat = isMCP 
  ? winston.format.simple()
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    );

// File format with more details for debugging crashes
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${String(timestamp)} [${String(level).toUpperCase()}]: ${String(message)}`;
    if (stack && typeof stack === 'string') {
      log += `\nStack: ${stack}`;
    }
    if (Object.keys(meta).length > 0) {
      log += `\nMeta: ${JSON.stringify(meta, null, 2)}`;
    }
    return log;
  })
);

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      silent: isMCP, // Always silence console logs in MCP mode to avoid interfering with JSON-RPC
    }),
  ],
});

// Always add file logging for better crash diagnosis
const filePrefix = isMCP ? 'mcp' : 'server';

// Error log
logger.add(
  new winston.transports.File({
    filename: join(logsDir, `${filePrefix}-error.log`),
    level: 'error',
    format: fileFormat,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
  })
);

// Combined log
logger.add(
  new winston.transports.File({
    filename: join(logsDir, `${filePrefix}-combined.log`),
    format: fileFormat,
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 3,
  })
);

// Crash log for fatal errors
logger.add(
  new winston.transports.File({
    filename: join(logsDir, `${filePrefix}-crash.log`),
    level: 'error',
    format: fileFormat,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
  })
);