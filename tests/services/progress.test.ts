import { describe, it, expect, jest } from '@jest/globals';
import { createProgressReporter } from '../../src/services/progress.js';
import type { ProgressReporter } from '../../src/services/progress.js';

describe('createProgressReporter', () => {
  it('should return a disabled no-op reporter when progressToken is undefined', () => {
    const sendNotification = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reporter = createProgressReporter(undefined, sendNotification);

    expect(reporter.enabled).toBe(false);
  });

  it('should not call sendNotification when progressToken is undefined', async () => {
    const sendNotification = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reporter = createProgressReporter(undefined, sendNotification);

    await reporter.report(1, 10, 'test');

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('should return an enabled reporter when progressToken is a string', () => {
    const sendNotification = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reporter = createProgressReporter('token-123', sendNotification);

    expect(reporter.enabled).toBe(true);
  });

  it('should return an enabled reporter when progressToken is a number', () => {
    const sendNotification = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reporter = createProgressReporter(42, sendNotification);

    expect(reporter.enabled).toBe(true);
  });

  it('should send a progress notification with correct method and params', async () => {
    const sendNotification = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reporter = createProgressReporter('my-token', sendNotification);

    await reporter.report(3, 10, 'Processing step 3');

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: {
        progressToken: 'my-token',
        progress: 3,
        total: 10,
        message: 'Processing step 3',
      },
    });
  });

  it('should omit message field when message is undefined', async () => {
    const sendNotification = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reporter = createProgressReporter('tok', sendNotification);

    await reporter.report(1, 5);

    expect(sendNotification).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: {
        progressToken: 'tok',
        progress: 1,
        total: 5,
      },
    });
  });

  it('should send multiple progress notifications for successive reports', async () => {
    const sendNotification = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reporter = createProgressReporter('tok', sendNotification);

    await reporter.report(1, 3, 'A done');
    await reporter.report(2, 3, 'B done');
    await reporter.report(3, 3, 'C done');

    expect(sendNotification).toHaveBeenCalledTimes(3);

    // Verify increasing progress values
    const calls = sendNotification.mock.calls as unknown as Array<[{ params: { progress: number } }]>;
    expect(calls[0][0].params.progress).toBe(1);
    expect(calls[1][0].params.progress).toBe(2);
    expect(calls[2][0].params.progress).toBe(3);
  });

  it('should use a numeric progressToken correctly', async () => {
    const sendNotification = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reporter = createProgressReporter(99, sendNotification);

    await reporter.report(1, 1);

    expect(sendNotification).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: {
        progressToken: 99,
        progress: 1,
        total: 1,
      },
    });
  });

  it('should swallow sendNotification errors without throwing', async () => {
    const sendNotification = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('client disconnected'));
    const reporter = createProgressReporter('tok', sendNotification);

    // Should NOT throw — progress is best-effort
    await expect(reporter.report(1, 5, 'step')).resolves.toBeUndefined();
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('should continue reporting after a notification error', async () => {
    const sendNotification = jest.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('transient error'))
      .mockResolvedValueOnce(undefined);
    const reporter = createProgressReporter('tok', sendNotification);

    await reporter.report(1, 2, 'first');
    await reporter.report(2, 2, 'second');

    expect(sendNotification).toHaveBeenCalledTimes(2);
  });
});

describe('ProgressReporter interface', () => {
  it('should be easy to create a mock for testing tools', async () => {
    // This tests the pattern tool tests will use
    const mockReporter: ProgressReporter = {
      enabled: true,
      report: jest.fn<ProgressReporter['report']>().mockResolvedValue(undefined),
    };

    await mockReporter.report(1, 3, 'step 1');

    expect(mockReporter.report).toHaveBeenCalledWith(1, 3, 'step 1');
  });
});
