/**
 * A `TaskStore` implementation with post-terminal retention semantics.
 *
 * Unlike the SDK's `InMemoryTaskStore` — which arms a deletion timer at task
 * creation and evicts the record after `ttl` regardless of status — this store
 * treats `ttl` as a *retention window that starts when the task reaches a
 * terminal state*. Consequences:
 *
 * - A non-terminal task (`submitted`/`working`) is immortal: it has no
 *   `expiresAt` and is never evicted, no matter how much time elapses.
 * - Once a task reaches a terminal state (`completed`/`failed`/`cancelled`),
 *   its retention window opens (`expiresAt = now + ttl`). It stays retrievable
 *   until the window elapses, then is evicted lazily on read or by the periodic
 *   `sweepExpired()` sweep.
 *
 * Method contracts and error-message strings mirror `InMemoryTaskStore` so the
 * only behavioral difference is timer semantics.
 *
 * WARNING: builds on the experimental `@modelcontextprotocol/sdk/experimental`
 * Tasks API, which may change without notice.
 */

/* eslint-disable @typescript-eslint/require-await --
 * The `TaskStore` interface requires every method to return a Promise. This
 * store is backed by a synchronous in-memory Map, but its methods stay `async`
 * to match the interface and the SDK's `InMemoryTaskStore`. Keeping them async
 * (rather than returning `Promise.resolve`) ensures a guard-clause `throw`
 * surfaces as a rejected promise instead of a synchronous throw. */

import { isTerminal } from '@modelcontextprotocol/sdk/experimental';
import type { TaskStore, CreateTaskOptions } from '@modelcontextprotocol/sdk/experimental';
import type { Task, RequestId, Request, Result } from '@modelcontextprotocol/sdk/types.js';
import { randomBytes } from 'node:crypto';
import { logger } from '../utils/logger.js';

/** Internal record wrapping a task with its request context and retention window. */
interface StoredTask {
  task: Task;
  request: Request;
  requestId: RequestId;
  result?: Result;
  /**
   * Epoch milliseconds after which a *terminal* task is evicted. Undefined
   * means the task is non-terminal (immortal) — it has no retention window.
   */
  expiresAt?: number;
}

export class RetentionTaskStore implements TaskStore {
  private tasks: Map<string, StoredTask> = new Map();

  /**
   * @param defaultTtl Retention window (ms) applied when a task is created
   *   without an explicit `ttl`. `null` means unlimited (no eviction).
   */
  constructor(private readonly defaultTtl: number | null = null) {}

  /**
   * Generates a unique task ID (16 random bytes as 32 hex chars), matching
   * `InMemoryTaskStore`.
   */
  private generateTaskId(): string {
    return randomBytes(16).toString('hex');
  }

  /** True when a stored task's retention window has elapsed. */
  private isExpired(stored: StoredTask): boolean {
    return stored.expiresAt !== undefined && Date.now() >= stored.expiresAt;
  }

  /**
   * Evict a task and log a distinct eviction message (never a failure). Logged
   * at `info` so a post-retention `-32602` remains diagnosable under the default
   * `LOG_LEVEL=info` — this is a benign, expected event, not an error.
   */
  private evict(taskId: string): void {
    this.tasks.delete(taskId);
    logger.info(`Evicting task ${taskId}: retention window elapsed`);
  }

  /**
   * Look up a live (non-expired) stored task, lazily evicting it if its
   * retention window has elapsed.
   */
  private getLive(taskId: string): StoredTask | undefined {
    const stored = this.tasks.get(taskId);
    if (!stored) {
      return undefined;
    }
    if (this.isExpired(stored)) {
      this.evict(taskId);
      return undefined;
    }
    return stored;
  }

  async createTask(
    taskParams: CreateTaskOptions,
    requestId: RequestId,
    request: Request,
    _sessionId?: string
  ): Promise<Task> {
    const taskId = this.generateTaskId();
    if (this.tasks.has(taskId)) {
      throw new Error(`Task with ID ${taskId} already exists`);
    }

    const actualTtl = taskParams.ttl ?? this.defaultTtl;
    const createdAt = new Date().toISOString();
    const task: Task = {
      taskId,
      status: 'working',
      ttl: actualTtl,
      createdAt,
      lastUpdatedAt: createdAt,
      pollInterval: taskParams.pollInterval ?? 1000,
    };

    // No `expiresAt`: a freshly-created (non-terminal) task is immortal.
    this.tasks.set(taskId, { task, request, requestId });
    return task;
  }

  async getTask(taskId: string, _sessionId?: string): Promise<Task | null> {
    const stored = this.getLive(taskId);
    return stored ? { ...stored.task } : null;
  }

  async storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: Result,
    _sessionId?: string
  ): Promise<void> {
    const stored = this.getLive(taskId);
    if (!stored) {
      throw new Error(`Task with ID ${taskId} not found`);
    }
    if (isTerminal(stored.task.status)) {
      throw new Error(
        `Cannot store result for task ${taskId} in terminal status '${stored.task.status}'. Task results can only be stored once.`
      );
    }

    stored.result = result;
    stored.task.status = status;
    stored.task.lastUpdatedAt = new Date().toISOString();
    // Task just became terminal: open its retention window (if a ttl is set).
    this.openRetentionWindow(stored);
  }

  async getTaskResult(taskId: string, _sessionId?: string): Promise<Result> {
    const stored = this.getLive(taskId);
    if (!stored) {
      throw new Error(`Task with ID ${taskId} not found`);
    }
    if (!stored.result) {
      throw new Error(`Task ${taskId} has no result stored`);
    }
    return stored.result;
  }

  async updateTaskStatus(
    taskId: string,
    status: Task['status'],
    statusMessage?: string,
    _sessionId?: string
  ): Promise<void> {
    const stored = this.getLive(taskId);
    if (!stored) {
      throw new Error(`Task with ID ${taskId} not found`);
    }
    if (isTerminal(stored.task.status)) {
      throw new Error(
        `Cannot update task ${taskId} from terminal status '${stored.task.status}' to '${status}'. Terminal states (completed, failed, cancelled) cannot transition to other states.`
      );
    }

    stored.task.status = status;
    if (statusMessage) {
      stored.task.statusMessage = statusMessage;
    }
    stored.task.lastUpdatedAt = new Date().toISOString();

    if (isTerminal(status)) {
      // Terminal transition: open the retention window.
      this.openRetentionWindow(stored);
    } else {
      // Still non-terminal: remains immortal.
      stored.expiresAt = undefined;
    }
  }

  async listTasks(
    cursor?: string,
    _sessionId?: string
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    // Lazily drop terminal tasks whose retention window has elapsed.
    this.sweepExpired();

    const PAGE_SIZE = 10;
    const allTaskIds = Array.from(this.tasks.keys());
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = allTaskIds.indexOf(cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      } else {
        throw new Error(`Invalid cursor: ${cursor}`);
      }
    }

    const pageTaskIds = allTaskIds.slice(startIndex, startIndex + PAGE_SIZE);
    const tasks = pageTaskIds.map((taskId) => ({ ...this.tasks.get(taskId)!.task }));
    const nextCursor =
      startIndex + PAGE_SIZE < allTaskIds.length
        ? pageTaskIds[pageTaskIds.length - 1]
        : undefined;
    return { tasks, nextCursor };
  }

  /**
   * Evict every terminal task whose retention window has elapsed. Non-terminal
   * (immortal) tasks are always spared. Returns the number of tasks dropped.
   */
  sweepExpired(): number {
    let dropped = 0;
    for (const [taskId, stored] of this.tasks) {
      if (this.isExpired(stored)) {
        this.evict(taskId);
        dropped++;
      }
    }
    return dropped;
  }

  /** Clear all stored tasks (useful for testing or graceful shutdown). */
  cleanup(): void {
    this.tasks.clear();
  }

  /** Open a terminal task's retention window from now, if a ttl is configured. */
  private openRetentionWindow(stored: StoredTask): void {
    if (stored.task.ttl) {
      stored.expiresAt = Date.now() + stored.task.ttl;
    }
  }
}
