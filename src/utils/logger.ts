import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const isMCP = process.env.MCP_SERVER === 'true' || process.argv.includes('--mcp');

// Use simpler format for MCP to avoid interfering with JSON communication
const consoleFormat = isMCP 
  ? winston.format.simple()
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
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
      silent: isMCP && logLevel !== 'debug', // Silence logs in MCP mode unless debugging
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'combined.log',
    })
  );
}