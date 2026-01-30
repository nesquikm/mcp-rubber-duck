/**
 * Progress notification service for MCP tools.
 *
 * Provides a lightweight abstraction over MCP's stable `notifications/progress`
 * mechanism. Tool functions accept an optional `ProgressReporter` to emit
 * per-step progress without depending on the full `RequestHandlerExtra` type.
 */

export interface ProgressReporter {
  /** Report that step `current` of `total` is done, with an optional status message. */
  report(current: number, total: number, message?: string): Promise<void>;
  /** Whether the client actually requested progress (sent a progressToken). */
  readonly enabled: boolean;
}

/**
 * Creates a `ProgressReporter` from an MCP tool handler's `extra` parameter.
 *
 * If the client did not include a `progressToken` in `_meta`, the returned
 * reporter is a no-op (`.enabled === false`), so callers can always call
 * `progress.report()` unconditionally.
 *
 * @param progressToken   Value of `extra._meta?.progressToken`
 * @param sendNotification  Value of `extra.sendNotification` — typed loosely to
 *   avoid coupling to SDK's strict discriminated union. At runtime the SDK
 *   accepts any valid JSON-RPC notification including `notifications/progress`.
 */
export function createProgressReporter(
  progressToken: string | number | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendNotification: (notification: any) => Promise<void>
): ProgressReporter {
  if (progressToken === undefined) {
    return {
      enabled: false,
      report: async () => {},
    };
  }

  return {
    enabled: true,
    report: async (current: number, total: number, message?: string) => {
      try {
        await sendNotification({
          method: 'notifications/progress',
          params: {
            progressToken,
            progress: current,
            total,
            ...(message !== undefined ? { message } : {}),
          },
        });
      } catch {
        // Swallow notification errors (e.g., client disconnected).
        // Progress is best-effort — tool execution should continue regardless.
      }
    },
  };
}
