import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../src/utils/logger');

import { TaskManager } from '../../src/services/task-manager.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('TaskManager', () => {
  let taskManager: TaskManager;

  beforeEach(() => {
    taskManager = new TaskManager({
      cleanupInterval: 600_000, // long interval to avoid noise
    });
  });

  afterEach(() => {
    taskManager.shutdown();
  });

  describe('constructor', () => {
    it('should use default config values when none provided', () => {
      const tm = new TaskManager();
      try {
        expect(tm.config.defaultTtl).toBe(300_000);
        expect(tm.config.pollInterval).toBe(2_000);
        expect(tm.config.maxQueueSize).toBe(100);
        expect(tm.config.cleanupInterval).toBe(60_000);
      } finally {
        tm.shutdown();
      }
    });

    it('should allow partial config overrides', () => {
      const tm = new TaskManager({ defaultTtl: 60_000 });
      try {
        expect(tm.config.defaultTtl).toBe(60_000);
        expect(tm.config.pollInterval).toBe(2_000); // default preserved
      } finally {
        tm.shutdown();
      }
    });

    it('should provide a task store and message queue', () => {
      expect(taskManager.taskStore).toBeDefined();
      expect(taskManager.taskMessageQueue).toBeDefined();
    });
  });

  describe('startBackground', () => {
    it('should execute work and store a completed result', async () => {
      // Create a task first (need requestId and request)
      const task = await taskManager.taskStore.createTask(
        { ttl: 60_000 },
        'req-1',
        { method: 'tools/call', params: { name: 'test', arguments: {} } }
      );

      const expectedResult: CallToolResult = {
        content: [{ type: 'text', text: 'done!' }],
      };

      taskManager.startBackground(task.taskId, async () => {
        return expectedResult;
      });

      // Wait for the background work to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      const storedTask = await taskManager.taskStore.getTask(task.taskId);
      expect(storedTask?.status).toBe('completed');

      const result = await taskManager.taskStore.getTaskResult(task.taskId);
      expect(result).toEqual(expectedResult);
    });

    it('should store a failed result when work throws', async () => {
      const task = await taskManager.taskStore.createTask(
        { ttl: 60_000 },
        'req-2',
        { method: 'tools/call', params: { name: 'test', arguments: {} } }
      );

      taskManager.startBackground(task.taskId, async () => {
        throw new Error('Something went wrong');
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const storedTask = await taskManager.taskStore.getTask(task.taskId);
      expect(storedTask?.status).toBe('failed');

      const result = await taskManager.taskStore.getTaskResult(task.taskId);
      expect((result as CallToolResult).isError).toBe(true);
      expect((result as CallToolResult).content[0]).toEqual(
        expect.objectContaining({ type: 'text', text: expect.stringContaining('Something went wrong') })
      );
    });

    it('should mark task as cancelled when work is aborted', async () => {
      const task = await taskManager.taskStore.createTask(
        { ttl: 60_000 },
        'req-3',
        { method: 'tools/call', params: { name: 'test', arguments: {} } }
      );

      taskManager.startBackground(task.taskId, async (signal) => {
        // Simulate long-running work that checks the signal
        return new Promise<CallToolResult>((resolve, reject) => {
          const interval = setInterval(() => {
            if (signal.aborted) {
              clearInterval(interval);
              reject(new Error('aborted'));
            }
          }, 10);
        });
      });

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 20));

      // Cancel it
      const cancelled = taskManager.cancel(task.taskId);
      expect(cancelled).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 50));

      const storedTask = await taskManager.taskStore.getTask(task.taskId);
      expect(storedTask?.status).toBe('cancelled');
    });

    it('should mark task as cancelled when work succeeds but signal was already aborted', async () => {
      const task = await taskManager.taskStore.createTask(
        { ttl: 60_000 },
        'req-abort-success',
        { method: 'tools/call', params: { name: 'test', arguments: {} } }
      );

      // Simulate: work succeeds, but the abort signal fires during the last step.
      // The work function returns normally (no throw), yet signal.aborted is true.
      taskManager.startBackground(task.taskId, async (signal) => {
        // Pretend we're doing multi-step work; abort happens during the last step
        // but the function still returns a result instead of throwing.
        const controller = (taskManager as any).activeControllers.get(task.taskId) as AbortController;
        controller.abort(); // abort mid-execution
        // Return successfully despite abort
        return { content: [{ type: 'text', text: 'completed despite abort' }] };
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const storedTask = await taskManager.taskStore.getTask(task.taskId);
      // Should be cancelled, NOT completed or stuck in 'working'
      expect(storedTask?.status).toBe('cancelled');
    });

    it('should clean up the AbortController after work completes', async () => {
      const task = await taskManager.taskStore.createTask(
        { ttl: 60_000 },
        'req-4',
        { method: 'tools/call', params: { name: 'test', arguments: {} } }
      );

      taskManager.startBackground(task.taskId, async () => {
        return { content: [{ type: 'text', text: 'ok' }] };
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(taskManager.activeCount).toBe(0);
    });
  });

  describe('cancel', () => {
    it('should return false if the task is not active', () => {
      expect(taskManager.cancel('nonexistent')).toBe(false);
    });

    it('should return true and abort the signal for an active task', async () => {
      const task = await taskManager.taskStore.createTask(
        { ttl: 60_000 },
        'req-5',
        { method: 'tools/call', params: { name: 'test', arguments: {} } }
      );

      let signalAborted = false;
      taskManager.startBackground(task.taskId, async (signal) => {
        return new Promise<CallToolResult>((resolve, reject) => {
          signal.addEventListener('abort', () => {
            signalAborted = true;
            reject(new Error('aborted'));
          });
        });
      });

      await new Promise(resolve => setTimeout(resolve, 20));
      expect(taskManager.cancel(task.taskId)).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(signalAborted).toBe(true);
    });
  });

  describe('activeCount', () => {
    it('should track the number of running tasks', async () => {
      expect(taskManager.activeCount).toBe(0);

      const task1 = await taskManager.taskStore.createTask(
        { ttl: 60_000 },
        'req-a',
        { method: 'tools/call', params: { name: 'test', arguments: {} } }
      );
      const task2 = await taskManager.taskStore.createTask(
        { ttl: 60_000 },
        'req-b',
        { method: 'tools/call', params: { name: 'test', arguments: {} } }
      );

      let resolve1: () => void;
      let resolve2: () => void;
      const p1 = new Promise<void>(r => { resolve1 = r; });
      const p2 = new Promise<void>(r => { resolve2 = r; });

      taskManager.startBackground(task1.taskId, async () => {
        await p1;
        return { content: [{ type: 'text', text: '1' }] };
      });
      taskManager.startBackground(task2.taskId, async () => {
        await p2;
        return { content: [{ type: 'text', text: '2' }] };
      });

      await new Promise(resolve => setTimeout(resolve, 20));
      expect(taskManager.activeCount).toBe(2);

      resolve1!();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(taskManager.activeCount).toBe(1);

      resolve2!();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(taskManager.activeCount).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should cancel all active tasks', async () => {
      const task = await taskManager.taskStore.createTask(
        { ttl: 60_000 },
        'req-s',
        { method: 'tools/call', params: { name: 'test', arguments: {} } }
      );

      let aborted = false;
      taskManager.startBackground(task.taskId, async (signal) => {
        return new Promise<CallToolResult>((resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        });
      });

      await new Promise(resolve => setTimeout(resolve, 20));
      expect(taskManager.activeCount).toBe(1);

      taskManager.shutdown();

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(aborted).toBe(true);
      expect(taskManager.activeCount).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      taskManager.shutdown();
      taskManager.shutdown();
      // No error thrown
    });
  });

  describe('TTL edge cases', () => {
    it('should handle task TTL expiry during background work without crashing', async () => {
      // Use a very short TTL so the task entry is cleaned up before work completes
      const shortTtlManager = new TaskManager({
        cleanupInterval: 600_000,
      });

      try {
        const task = await shortTtlManager.taskStore.createTask(
          { ttl: 50 },  // 50ms TTL — very short
          'req-ttl',
          { method: 'tools/call', params: { name: 'test', arguments: {} } }
        );

        shortTtlManager.startBackground(task.taskId, async () => {
          // Simulate slow work that exceeds the TTL
          await new Promise(resolve => setTimeout(resolve, 150));
          return { content: [{ type: 'text', text: 'finished after TTL' }] };
        });

        // Wait for both TTL cleanup and work to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // The task entry should have been cleaned up by TTL
        const storedTask = await shortTtlManager.taskStore.getTask(task.taskId);
        expect(storedTask).toBeNull();

        // Critically: no uncaught errors should have occurred.
        // The startBackground catch handler gracefully handles "Task not found" errors
        // from storeTaskResult when the TTL has already cleaned up the entry.
        expect(shortTtlManager.activeCount).toBe(0);
      } finally {
        shortTtlManager.shutdown();
      }
    });

    it('should handle task TTL expiry during failed background work without crashing', async () => {
      const shortTtlManager = new TaskManager({
        cleanupInterval: 600_000,
      });

      try {
        const task = await shortTtlManager.taskStore.createTask(
          { ttl: 50 },
          'req-ttl-fail',
          { method: 'tools/call', params: { name: 'test', arguments: {} } }
        );

        shortTtlManager.startBackground(task.taskId, async () => {
          await new Promise(resolve => setTimeout(resolve, 150));
          throw new Error('Work failed after TTL expired');
        });

        await new Promise(resolve => setTimeout(resolve, 300));

        const storedTask = await shortTtlManager.taskStore.getTask(task.taskId);
        expect(storedTask).toBeNull();
        expect(shortTtlManager.activeCount).toBe(0);
      } finally {
        shortTtlManager.shutdown();
      }
    });
  });
});
