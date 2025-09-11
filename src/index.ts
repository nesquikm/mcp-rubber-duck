#!/usr/bin/env node

import { RubberDuckServer } from './server.js';
import { logger } from './utils/logger.js';

// Global error handlers for crash diagnosis
process.on('uncaughtException', (error) => {
  logger.error('FATAL: Uncaught Exception', {
    error: error.message,
    stack: error.stack,
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  logger.error('FATAL: Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: '[Promise object]',
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
  process.exit(1);
});

async function main() {
  logger.info('Starting MCP Rubber Duck Server', {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    argv: process.argv,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      MCP_SERVER: process.env.MCP_SERVER,
      MCP_BRIDGE_ENABLED: process.env.MCP_BRIDGE_ENABLED,
      MCP_APPROVAL_MODE: process.env.MCP_APPROVAL_MODE,
    }
  });

  try {
    const server = new RubberDuckServer();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      void (async () => {
        logger.info('Received SIGINT, shutting down gracefully...', {
          pid: process.pid,
          uptime: process.uptime(),
        });
        try {
          await server.stop();
          logger.info('Server stopped gracefully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      })();
    });

    process.on('SIGTERM', () => {
      void (async () => {
        logger.info('Received SIGTERM, shutting down gracefully...', {
          pid: process.pid,
          uptime: process.uptime(),
        });
        try {
          await server.stop();
          logger.info('Server stopped gracefully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      })();
    });

    // Start the server
    logger.info('Initializing server...');
    await server.start();
    logger.info('Server started successfully', {
      pid: process.pid,
      memory: process.memoryUsage(),
    });
  } catch (error) {
    logger.error('Failed to start server:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    });
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  logger.error('Unhandled error in main:', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
  process.exit(1);
});