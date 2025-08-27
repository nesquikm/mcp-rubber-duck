#!/usr/bin/env node

import { RubberDuckServer } from './server.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    const server = new RubberDuckServer();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    // Start the server
    await server.start();
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});