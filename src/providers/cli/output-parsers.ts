/**
 * Extract a value from an object using a simple JSONPath-like dotted path.
 * Supports paths like "$.foo.bar", "$.items[0].name", "foo.bar".
 */
export function extractJsonPath(obj: unknown, path: string): unknown {
  // Normalize: strip leading "$." or "$[" prefix
  let normalized = path;
  if (normalized.startsWith('$.')) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('$[')) {
    normalized = normalized.slice(1);
  }

  // Split on dots and bracket notation
  const segments = normalized.split(/\.|\[(\d+)\]/).filter(s => s !== '' && s !== undefined);

  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      // Check if segment is a numeric index
      const index = /^\d+$/.test(segment) ? parseInt(segment, 10) : undefined;
      if (index !== undefined && Array.isArray(current)) {
        current = current[index];
      } else {
        current = (current as Record<string, unknown>)[segment];
      }
    } else {
      return undefined;
    }
  }

  return current;
}

export interface ParsedOutput {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Parse plain text output — trim whitespace, return raw text.
 */
export function parseTextOutput(stdout: string): ParsedOutput {
  return { content: stdout.trim() };
}

/**
 * Parse JSON output, extracting content via an optional JSONPath.
 */
export function parseJsonOutput(
  stdout: string,
  responsePath?: string,
  usagePath?: string
): ParsedOutput {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { content: '' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // If JSON parse fails, treat as plain text
    return { content: trimmed };
  }

  let content: string;
  if (responsePath) {
    const extracted = extractJsonPath(parsed, responsePath);
    if (extracted === undefined || extracted === null) {
      // Path not found — fall through to stringify the full object
      content = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    } else {
      content = typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
    }
  } else if (typeof parsed === 'object' && parsed !== null) {
    // Try common fields
    const obj = parsed as Record<string, unknown>;
    content = typeof obj.result === 'string' ? obj.result
      : typeof obj.response === 'string' ? obj.response
      : typeof obj.content === 'string' ? obj.content
      : typeof obj.message === 'string' ? obj.message
      : JSON.stringify(parsed);
  } else {
    content = String(parsed);
  }

  let usage: ParsedOutput['usage'];
  if (usagePath) {
    const usageData = extractJsonPath(parsed, usagePath);
    if (usageData && typeof usageData === 'object') {
      const u = usageData as Record<string, unknown>;
      const promptTokens = Number(u.prompt_tokens ?? u.promptTokens ?? u.input_tokens ?? 0);
      const completionTokens = Number(u.completion_tokens ?? u.completionTokens ?? u.output_tokens ?? 0);
      usage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
    }
  }

  return { content, usage };
}

/**
 * Parse JSONL (newline-delimited JSON) output.
 * Finds the last line containing a result/message event.
 */
export function parseJsonlOutput(
  stdout: string,
  responsePath?: string
): ParsedOutput {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { content: '' };
  }

  const lines = trimmed.split('\n').filter(line => line.trim());

  // Try to parse each line as JSON, collect successfully parsed objects
  const parsed: unknown[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line.trim()));
    } catch {
      // Skip non-JSON lines
    }
  }

  if (parsed.length === 0) {
    // No valid JSON found, return raw text
    return { content: trimmed };
  }

  // Look for the last object with result/message/content, searching from end
  for (let i = parsed.length - 1; i >= 0; i--) {
    const obj = parsed[i];
    if (obj && typeof obj === 'object') {
      const record = obj as Record<string, unknown>;

      if (responsePath) {
        const extracted = extractJsonPath(record, responsePath);
        if (extracted !== undefined && extracted !== null) {
          return {
            content: typeof extracted === 'string' ? extracted : JSON.stringify(extracted),
          };
        }
      }

      // Try common fields
      for (const field of ['result', 'message', 'content', 'response', 'text']) {
        if (typeof record[field] === 'string' && record[field]) {
          return { content: record[field] };
        }
      }
    }
  }

  // Fallback: stringify the last parsed object
  const last = parsed[parsed.length - 1];
  return {
    content: typeof last === 'string' ? last : JSON.stringify(last),
  };
}
