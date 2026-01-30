/**
 * Task lifecycle adapter wrapping the MCP SDK's experimental Tasks API.
 *
 * This module isolates all direct usage of `@modelcontextprotocol/sdk/experimental`
 * behind a single adapter class so that future breaking changes in the experimental
 * API only require updates here.
 */

import {
  InMemoryTaskStore,
  InMemoryTaskMessageQueue,
} from '@modelcontextprotocol/sdk/experimental';
import type {
  TaskStore,
  TaskMessageQueue,
} from '@modelcontextprotocol/sdk/experimental';
import type { CallToolResult, Result } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';

export interface TaskManagerConfig {
  /** Time-to-live for completed task results (milliseconds). */
  defaultTtl: number;
  /** Suggested interval between client polls (milliseconds). */
  pollInterval: number;
  /** Maximum messages per task queue (prevents unbounded growth). */
  maxQueueSize: number;
  /** Interval for cleanup/monitoring sweep (milliseconds). */
  cleanupInterval: number;
}

const DEFAULT_CONFIG: TaskManagerConfig = {
  defaultTtl: 300_000,       // 5 minutes
  pollInterval: 2_000,       // 2 seconds
  maxQueueSize: 100,
  cleanupInterval: 60_000,   // 1 minute
};

/**
 * Manages MCP task lifecycle: creation, background execution, cancellation, and cleanup.
 *
 * - Provides `InMemoryTaskStore` and `InMemoryTaskMessageQueue` instances for
 *   `McpServer`'s `ProtocolOptions`.
 * - Tracks active background work via `AbortController` per task for cancellation.
 * - Handles graceful shutdown (cancels active tasks, clears timers).
 */
export class TaskManager {
  readonly taskStore: TaskStore;
  readonly taskMessageQueue: TaskMessageQueue;
  readonly config: TaskManagerConfig;

  /** Maps taskId → AbortController for active background work. */
  private activeControllers: Map<string, AbortController> = new Map();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config?: Partial<TaskManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.taskStore = new InMemoryTaskStore();
    this.taskMessageQueue = new InMemoryTaskMessageQueue();
    this.startCleanup();
  }

  /**
   * Start background work for a task.
   *
   * This is fire-and-forget: the returned promise resolves immediately.
   * The `work` function runs asynchronously; its result is stored in the
   * task store on completion. On error the task is marked `failed`.
   * On abort (cancellation) the task is marked `cancelled`.
   *
   * @param taskId    ID of the task (from `taskStore.createTask`)
   * @param work      Async function receiving an `AbortSignal` and returning a `CallToolResult`
   */
  startBackground(
    taskId: string,
    work: (signal: AbortSignal) => Promise<CallToolResult>
  ): void {
    const controller = new AbortController();
    this.activeControllers.set(taskId, controller);

    void (async () => {
      try {
        await this.taskStore.updateTaskStatus(taskId, 'working');
        const result = await work(controller.signal);

        if (!controller.signal.aborted) {
          await this.taskStore.storeTaskResult(taskId, 'completed', result as Result);
        } else {
          // Work completed but cancellation was requested mid-execution.
          // Mark as cancelled so the task doesn't stay stuck in 'working'.
          try {
            await this.taskStore.updateTaskStatus(taskId, 'cancelled', 'Task was cancelled');
          } catch {
            // Task may already be in a terminal state
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          try {
            await this.taskStore.updateTaskStatus(taskId, 'cancelled', 'Task was cancelled');
          } catch {
            // Task may already be in a terminal state
          }
        } else {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Task ${taskId} failed:`, message);
          try {
            await this.taskStore.storeTaskResult(taskId, 'failed', {
              content: [{ type: 'text', text: `Error: ${message}` }],
              isError: true,
            } as Result);
          } catch {
            // Task store may have already cleaned up (TTL)
          }
        }
      } finally {
        this.activeControllers.delete(taskId);
      }
    })();
  }

  /** Cancel a running task by aborting its AbortController. */
  cancel(taskId: string): boolean {
    const controller = this.activeControllers.get(taskId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /** Number of currently active background tasks. */
  get activeCount(): number {
    return this.activeControllers.size;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      logger.debug(`Active background tasks: ${this.activeControllers.size}`);
    }, this.config.cleanupInterval);
    // Allow the process to exit even if the timer is still running
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /** Graceful shutdown: cancel all active tasks and clear timers. */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    for (const [taskId, controller] of this.activeControllers) {
      logger.info(`Cancelling active task ${taskId} during shutdown`);
      controller.abort();
    }
    this.activeControllers.clear();

    // Clear InMemoryTaskStore internal TTL timers
    (this.taskStore as InMemoryTaskStore).cleanup();
  }
}
