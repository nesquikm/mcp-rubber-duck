import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { RetentionTaskStore } from '../../src/services/retention-task-store.js';
import { logger } from '../../src/utils/logger.js';
import type { CallToolResult, Result } from '@modelcontextprotocol/sdk/types.js';

// A minimal request object mirroring the shape used in task-manager.test.ts.
const REQUEST = { method: 'tools/call', params: { name: 'test', arguments: {} } };

function makeResult(text: string): Result {
  return { content: [{ type: 'text', text }] } as CallToolResult as Result;
}

// Under this repo's ESM Jest config (ts-jest default-esm, isolatedModules),
// `jest.mock(path, factory)` is a no-op — the statically-imported `logger` stays
// the real winston singleton. So we spy on the singleton's methods directly and
// read genuine `mock.calls` for the eviction-log assertions. Spying across every
// level also silences winston output during the run.
let debugSpy: ReturnType<typeof jest.spyOn>;
let infoSpy: ReturnType<typeof jest.spyOn>;
let warnSpy: ReturnType<typeof jest.spyOn>;
let errorSpy: ReturnType<typeof jest.spyOn>;

/** Flatten every logged call (all levels) into single-line strings. */
function collectLoggedMessages(): string[] {
  const spies = [debugSpy, infoSpy, warnSpy, errorSpy];
  const messages: string[] = [];
  for (const spy of spies) {
    for (const call of spy.mock.calls) {
      messages.push((call as unknown[]).map((a) => String(a)).join(' '));
    }
  }
  return messages;
}

/** Only the error-level logged lines, as single-line strings. */
function collectErrorMessages(): string[] {
  return errorSpy.mock.calls.map((call) =>
    (call as unknown[]).map((a) => String(a)).join(' ')
  );
}

describe('RetentionTaskStore', () => {
  let store: RetentionTaskStore;

  beforeEach(() => {
    debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => logger as never);
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger as never);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger as never);
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger as never);
    jest.useFakeTimers();
    store = new RetentionTaskStore();
  });

  afterEach(() => {
    store.cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // AC-XNJKNA.1 — a non-terminal (working) task is never evicted, no matter how
  // much time passes. The old InMemoryTaskStore armed a deletion timer at creation
  // and would have deleted this record after `ttl`; the retention store must not.
  it('AC-XNJKNA.1: keeps a non-terminal task alive past defaultTtl (running tasks are immortal)', async () => {
    const task = await store.createTask({ ttl: 1_800_000 }, 'req-1', REQUEST);
    expect(task.status).toBe('working');

    // Advance well past the retention window with NO terminal transition.
    jest.advanceTimersByTime(1_800_000 + 60_000);

    const stored = await store.getTask(task.taskId);
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('working');
  });

  // AC-XNJKNA.2 — ttl is a post-terminal retention window, not a lifetime-from-creation
  // wall: the completed result is retrievable at ttl-1 and evicted at ttl+1.
  it('AC-XNJKNA.2: retains a completed result until ttl, then evicts it', async () => {
    const ttl = 1_800_000;
    const task = await store.createTask({ ttl }, 'req-2', REQUEST);
    const result = makeResult('debate complete');

    await store.storeTaskResult(task.taskId, 'completed', result);

    // Just before the retention boundary: result still retrievable.
    jest.advanceTimersByTime(ttl - 1);
    const stillThere = await store.getTaskResult(task.taskId);
    expect(stillThere).toEqual(result);

    // At exactly t = ttl the window has elapsed. `isExpired` uses `now >= expiresAt`,
    // so the entry is evicted at the boundary itself (parity with the SDK store's
    // `setTimeout(ttl)` deletion) — a `>` implementation would wrongly keep it here.
    jest.advanceTimersByTime(1);

    expect(await store.getTask(task.taskId)).toBeNull();
    await expect(store.getTaskResult(task.taskId)).rejects.toThrow(
      `Task with ID ${task.taskId} not found`
    );
  });

  // listTasks lazy filter — terminal tasks past their window are filtered out;
  // a still-working task and a not-yet-expired terminal remain.
  it('listTasks lazily filters out terminal tasks whose retention window elapsed', async () => {
    const ttl = 1_800_000;
    const working = await store.createTask({ ttl }, 'req-working', REQUEST);
    const doneOld = await store.createTask({ ttl }, 'req-old', REQUEST);
    const doneRecent = await store.createTask({ ttl }, 'req-recent', REQUEST);

    await store.storeTaskResult(doneOld.taskId, 'completed', makeResult('old'));

    // Let the old terminal task's window fully elapse.
    jest.advanceTimersByTime(ttl + 1);

    // A fresh terminal task, well within its own window.
    await store.storeTaskResult(doneRecent.taskId, 'completed', makeResult('recent'));

    const { tasks } = await store.listTasks();
    const ids = tasks.map((t) => t.taskId);

    expect(ids).toContain(working.taskId); // working never expires
    expect(ids).toContain(doneRecent.taskId); // within retention window
    expect(ids).not.toContain(doneOld.taskId); // lazily evicted
  });

  // sweepExpired — drops expired terminal entries, returns the drop count, and
  // leaves working tasks untouched (called by TaskManager's 60s sweep).
  it('sweepExpired() drops expired terminal entries and returns their count, sparing working tasks', async () => {
    const ttl = 1_800_000;
    const working = await store.createTask({ ttl }, 'req-w', REQUEST);
    const done = await store.createTask({ ttl }, 'req-d', REQUEST);
    await store.storeTaskResult(done.taskId, 'completed', makeResult('x'));

    jest.advanceTimersByTime(ttl + 1);

    const dropped = store.sweepExpired();
    expect(dropped).toBe(1);

    // The working task survives the sweep.
    expect(await store.getTask(working.taskId)).not.toBeNull();
    // The swept terminal task is gone.
    expect(await store.getTask(done.taskId)).toBeNull();
  });

  // Terminal-overwrite rejection — updateTaskStatus out of a terminal state throws,
  // and storeTaskResult over a terminal task throws (matching InMemoryTaskStore).
  it('rejects transitions out of, and result-stores over, a terminal task', async () => {
    const task = await store.createTask({ ttl: 1_800_000 }, 'req-term', REQUEST);
    await store.storeTaskResult(task.taskId, 'completed', makeResult('done'));

    await expect(store.updateTaskStatus(task.taskId, 'working')).rejects.toThrow(
      /Cannot update task .* from terminal status/
    );

    await expect(
      store.storeTaskResult(task.taskId, 'failed', makeResult('nope'))
    ).rejects.toThrow('Cannot store result for task');
  });

  // AC-XNJKNA.5 (store side) — when a terminal task is lazily evicted on read, a
  // distinct eviction message is logged that is NOT conflated with a task failure.
  it('AC-XNJKNA.5 (store): logs a distinct eviction message (not a failure) on lazy eviction', async () => {
    const ttl = 1_800_000;
    const task = await store.createTask({ ttl }, 'req-evict', REQUEST);
    // Use a *completed* task so any "failed" wording can only come from wrongly
    // conflating eviction with failure — not from the task's own status.
    await store.storeTaskResult(task.taskId, 'completed', makeResult('done'));

    jest.advanceTimersByTime(ttl + 1);

    // Trigger lazy eviction on read.
    expect(await store.getTask(task.taskId)).toBeNull();

    const evictionLog = collectLoggedMessages().find((msg) => /evict/i.test(msg));
    expect(evictionLog).toBeDefined(); // an eviction message was logged
    expect(evictionLog).not.toMatch(/failed/i); // and it is distinct from a failure

    // No error-level "failed" line for an ordinary retention eviction.
    expect(collectErrorMessages().filter((msg) => /failed/i.test(msg))).toHaveLength(0);
  });
});
