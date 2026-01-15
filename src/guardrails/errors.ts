/**
 * Error thrown when a guardrail blocks a request
 */
export class GuardrailBlockError extends Error {
  public readonly pluginName: string;
  public readonly reason: string;

  constructor(pluginName: string, reason: string) {
    super(`Request blocked by guardrail '${pluginName}': ${reason}`);
    this.name = 'GuardrailBlockError';
    this.pluginName = pluginName;
    this.reason = reason;
  }
}

/**
 * Error thrown when a guardrail plugin fails to initialize
 */
export class GuardrailInitError extends Error {
  public readonly pluginName: string;
  public readonly cause: Error | undefined;

  constructor(pluginName: string, message: string, cause?: Error) {
    super(`Failed to initialize guardrail plugin '${pluginName}': ${message}`);
    this.name = 'GuardrailInitError';
    this.pluginName = pluginName;
    this.cause = cause;
  }
}

/**
 * Error thrown when a guardrail plugin execution fails
 */
export class GuardrailExecutionError extends Error {
  public readonly pluginName: string;
  public readonly phase: string;
  public readonly cause: Error | undefined;

  constructor(pluginName: string, phase: string, message: string, cause?: Error) {
    super(`Guardrail plugin '${pluginName}' failed during '${phase}': ${message}`);
    this.name = 'GuardrailExecutionError';
    this.pluginName = pluginName;
    this.phase = phase;
    this.cause = cause;
  }
}
