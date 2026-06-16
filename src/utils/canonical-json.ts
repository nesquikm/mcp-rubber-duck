/**
 * Produce a canonical (deterministic) JSON string for a value by recursively
 * sorting object keys. Arrays preserve their order; only object key order is
 * normalized. Useful for stable deep-equality comparison and hashing of
 * structurally-equal values regardless of key insertion order.
 */
export function canonicalJSONStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalize(obj[key]);
  }
  return sorted;
}
