import { duckArt, getRandomDuckMessage } from './ascii-art.js';

/**
 * Print the welcome banner to STDERR.
 *
 * The server always communicates over stdio, where stdout carries framed
 * JSON-RPC. Writing the banner to stderr keeps stdout clean in every mode.
 */
export function printWelcomeBanner(): void {
  console.error(duckArt.welcome);
  console.error('\n' + getRandomDuckMessage('startup'));
}
