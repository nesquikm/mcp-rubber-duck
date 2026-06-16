import { describe, it, expect } from '@jest/globals';
import { canonicalJSONStringify } from '../src/utils/canonical-json';

/**
 * canonicalJSONStringify underpins two security-critical behaviors:
 *  - AC-R5S9MH.1: deep-equality of cleaned args against the approved args
 *    (an approval ID must not be replayable with different args).
 *  - AC-R5S9MH.2: the normalized-args-hash component of a session-approval key.
 *
 * The load-bearing property is key-order independence: structurally-equal
 * objects must canonicalize to the same string regardless of key insertion
 * order, while any value difference must produce a different string.
 */
describe('canonicalJSONStringify', () => {
  it('produces identical output for objects differing only in key order', () => {
    expect(canonicalJSONStringify({ a: 1, b: 2 })).toBe(canonicalJSONStringify({ b: 2, a: 1 }));
  });

  it('sorts nested object keys recursively', () => {
    const a = { outer: { z: 1, a: 2 }, list: [{ y: 1, x: 2 }] };
    const b = { list: [{ x: 2, y: 1 }], outer: { a: 2, z: 1 } };
    expect(canonicalJSONStringify(a)).toBe(canonicalJSONStringify(b));
    // And the canonical string actually has keys in sorted order.
    expect(canonicalJSONStringify({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it('preserves array element order (arrays are sequences, not sets)', () => {
    expect(canonicalJSONStringify([1, 2, 3])).toBe('[1,2,3]');
    expect(canonicalJSONStringify([3, 2, 1])).not.toBe(canonicalJSONStringify([1, 2, 3]));
  });

  it('distinguishes different values', () => {
    expect(canonicalJSONStringify({ path: '/a.txt' })).not.toBe(
      canonicalJSONStringify({ path: '/etc/shadow' })
    );
  });

  it('distinguishes a present-valued key from an absent one', () => {
    expect(canonicalJSONStringify({ a: 1, b: 2 })).not.toBe(canonicalJSONStringify({ a: 1 }));
  });

  it('treats an explicitly-undefined value as absent (JSON.stringify semantics)', () => {
    // An arg passed as `undefined` is equivalent to not passing it — both must
    // hash/compare identically so approval binding is not fooled either way.
    expect(canonicalJSONStringify({ a: 1, b: undefined })).toBe(canonicalJSONStringify({ a: 1 }));
  });

  it('round-trips primitives and null', () => {
    expect(canonicalJSONStringify('s')).toBe('"s"');
    expect(canonicalJSONStringify(42)).toBe('42');
    expect(canonicalJSONStringify(true)).toBe('true');
    expect(canonicalJSONStringify(null)).toBe('null');
  });

  it('handles empty containers', () => {
    expect(canonicalJSONStringify({})).toBe('{}');
    expect(canonicalJSONStringify([])).toBe('[]');
  });
});
