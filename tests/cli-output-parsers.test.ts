import { describe, it, expect } from '@jest/globals';
import {
  parseTextOutput,
  parseJsonOutput,
  parseJsonlOutput,
  extractJsonPath,
} from '../src/providers/cli/output-parsers';

describe('extractJsonPath', () => {
  it('should extract nested paths with $. prefix', () => {
    const obj = { foo: { bar: { baz: 'hello' } } };
    expect(extractJsonPath(obj, '$.foo.bar.baz')).toBe('hello');
  });

  it('should extract paths without $. prefix', () => {
    const obj = { foo: { bar: 'hello' } };
    expect(extractJsonPath(obj, 'foo.bar')).toBe('hello');
  });

  it('should return undefined for missing keys', () => {
    const obj = { foo: 'bar' };
    expect(extractJsonPath(obj, '$.missing.key')).toBeUndefined();
  });

  it('should handle array access', () => {
    const obj = { items: ['a', 'b', 'c'] };
    expect(extractJsonPath(obj, '$.items[1]')).toBe('b');
  });

  it('should handle null values gracefully', () => {
    expect(extractJsonPath(null, '$.foo')).toBeUndefined();
    expect(extractJsonPath(undefined, '$.foo')).toBeUndefined();
  });

  it('should handle nested objects in arrays', () => {
    const obj = { data: [{ name: 'first' }, { name: 'second' }] };
    expect(extractJsonPath(obj, '$.data[0].name')).toBe('first');
  });

  it('should return the full object for empty path after $. strip', () => {
    const obj = { result: 'test' };
    expect(extractJsonPath(obj, '$.result')).toBe('test');
  });

  it('should handle $[index] syntax for root-level arrays', () => {
    const arr = ['a', 'b', 'c'];
    expect(extractJsonPath(arr, '$[0]')).toBe('a');
    expect(extractJsonPath(arr, '$[2]')).toBe('c');
  });

  it('should handle out-of-bounds array access', () => {
    const obj = { items: ['a'] };
    expect(extractJsonPath(obj, '$.items[5]')).toBeUndefined();
  });

  it('should return full object for empty path', () => {
    const obj = { a: 1 };
    expect(extractJsonPath(obj, '')).toEqual({ a: 1 });
  });

  it('should access numeric keys on non-array objects', () => {
    const obj = { data: { '0': 'first', '1': 'second' } };
    expect(extractJsonPath(obj, '$.data[0]')).toBe('first');
    expect(extractJsonPath(obj, '$.data[1]')).toBe('second');
  });

  it('should return undefined when traversing through a primitive', () => {
    // Trying to access a property on a number should return undefined
    const obj = { count: 42 };
    expect(extractJsonPath(obj, '$.count.foo')).toBeUndefined();
  });

  it('should handle deeply nested mixed array/object access', () => {
    const obj = { a: [{ b: [1, 2, 3] }] };
    expect(extractJsonPath(obj, '$.a[0].b[2]')).toBe(3);
  });
});

describe('parseTextOutput', () => {
  it('should trim whitespace from output', () => {
    expect(parseTextOutput('  hello world  \n')).toEqual({ content: 'hello world' });
  });

  it('should handle empty output', () => {
    expect(parseTextOutput('')).toEqual({ content: '' });
    expect(parseTextOutput('  \n  ')).toEqual({ content: '' });
  });

  it('should handle multiline output', () => {
    const output = '  Line 1\nLine 2\nLine 3  ';
    expect(parseTextOutput(output)).toEqual({ content: 'Line 1\nLine 2\nLine 3' });
  });
});

describe('parseJsonOutput', () => {
  it('should extract field via path', () => {
    const json = JSON.stringify({ result: 'hello world' });
    const result = parseJsonOutput(json, '$.result');
    expect(result.content).toBe('hello world');
  });

  it('should handle missing response path by trying common fields', () => {
    const json = JSON.stringify({ result: 'found it' });
    const result = parseJsonOutput(json);
    expect(result.content).toBe('found it');
  });

  it('should try "response" field as fallback', () => {
    const json = JSON.stringify({ response: 'from response field' });
    const result = parseJsonOutput(json);
    expect(result.content).toBe('from response field');
  });

  it('should try "content" field as fallback', () => {
    const json = JSON.stringify({ content: 'from content field' });
    const result = parseJsonOutput(json);
    expect(result.content).toBe('from content field');
  });

  it('should handle invalid JSON by returning raw text', () => {
    const result = parseJsonOutput('not valid json');
    expect(result.content).toBe('not valid json');
  });

  it('should handle empty output', () => {
    const result = parseJsonOutput('');
    expect(result.content).toBe('');
  });

  it('should extract usage stats via usage path', () => {
    const json = JSON.stringify({
      result: 'hello',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
      },
    });
    const result = parseJsonOutput(json, '$.result', '$.usage');
    expect(result.content).toBe('hello');
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it('should handle usage with alternative field names', () => {
    const json = JSON.stringify({
      result: 'hello',
      stats: {
        input_tokens: 5,
        output_tokens: 15,
      },
    });
    const result = parseJsonOutput(json, '$.result', '$.stats');
    expect(result.usage).toEqual({
      promptTokens: 5,
      completionTokens: 15,
      totalTokens: 20,
    });
  });

  it('should stringify non-string extracted values', () => {
    const json = JSON.stringify({ data: { nested: true } });
    const result = parseJsonOutput(json, '$.data');
    expect(result.content).toBe('{"nested":true}');
  });

  it('should return full JSON when responsePath points to nonexistent field', () => {
    const obj = { result: 'hello', other: 'data' };
    const json = JSON.stringify(obj);
    const result = parseJsonOutput(json, '$.nonexistent');
    // Should fall back to stringifying the full object, not return "undefined"
    expect(result.content).toBe(json);
  });

  it('should return full JSON when responsePath points to null value', () => {
    const obj = { result: null, other: 'data' };
    const json = JSON.stringify(obj);
    const result = parseJsonOutput(json, '$.result');
    expect(result.content).toBe(json);
  });

  it('should handle JSON primitive values without response path', () => {
    // JSON.parse('42') gives number 42, not an object
    const result = parseJsonOutput('42');
    expect(result.content).toBe('42');

    const result2 = parseJsonOutput('"just a string"');
    expect(result2.content).toBe('just a string');

    const result3 = parseJsonOutput('true');
    expect(result3.content).toBe('true');
  });

  it('should handle numeric extracted values', () => {
    const json = JSON.stringify({ count: 42 });
    const result = parseJsonOutput(json, '$.count');
    expect(result.content).toBe('42');
  });

  it('should handle boolean extracted values', () => {
    const json = JSON.stringify({ success: true });
    const result = parseJsonOutput(json, '$.success');
    expect(result.content).toBe('true');
  });
});

describe('parseJsonlOutput', () => {
  it('should extract content from last line with result field', () => {
    const lines = [
      JSON.stringify({ type: 'start', id: '1' }),
      JSON.stringify({ type: 'progress', message: 'working' }),
      JSON.stringify({ type: 'result', result: 'final answer' }),
    ].join('\n');

    const result = parseJsonlOutput(lines);
    expect(result.content).toBe('final answer');
  });

  it('should extract via custom response path', () => {
    const lines = [
      JSON.stringify({ event: 'done', data: { answer: 'custom path' } }),
    ].join('\n');

    const result = parseJsonlOutput(lines, '$.data.answer');
    expect(result.content).toBe('custom path');
  });

  it('should handle single-line JSONL', () => {
    const line = JSON.stringify({ message: 'single line response' });
    const result = parseJsonlOutput(line);
    expect(result.content).toBe('single line response');
  });

  it('should handle empty stream', () => {
    const result = parseJsonlOutput('');
    expect(result.content).toBe('');
  });

  it('should skip non-JSON lines', () => {
    const lines = 'not json\n' + JSON.stringify({ content: 'valid' }) + '\nalso not json';
    const result = parseJsonlOutput(lines);
    expect(result.content).toBe('valid');
  });

  it('should use last matching field when multiple lines have content', () => {
    const lines = [
      JSON.stringify({ message: 'first' }),
      JSON.stringify({ message: 'second' }),
      JSON.stringify({ message: 'last' }),
    ].join('\n');

    const result = parseJsonlOutput(lines);
    expect(result.content).toBe('last');
  });

  it('should fall back to raw text when no JSON is found', () => {
    const result = parseJsonlOutput('just plain text');
    expect(result.content).toBe('just plain text');
  });

  it('should stringify last object when responsePath finds nothing in any line', () => {
    const lines = [
      JSON.stringify({ type: 'progress', data: 1 }),
      JSON.stringify({ type: 'done', data: 2 }),
    ].join('\n');

    const result = parseJsonlOutput(lines, '$.nonexistent.path');
    // Falls back to stringifying the last parsed object
    expect(result.content).toBe(JSON.stringify({ type: 'done', data: 2 }));
  });

  it('should extract content from "text" field', () => {
    const line = JSON.stringify({ text: 'from text field' });
    const result = parseJsonlOutput(line);
    expect(result.content).toBe('from text field');
  });

  it('should handle JSONL line that is a bare JSON string', () => {
    const lines = '"just a string"';
    const result = parseJsonlOutput(lines);
    expect(result.content).toBe('just a string');
  });

  it('should stringify last object when no common fields are present', () => {
    const lines = [
      JSON.stringify({ foo: 'bar', baz: 123 }),
    ].join('\n');

    const result = parseJsonlOutput(lines);
    expect(result.content).toBe(JSON.stringify({ foo: 'bar', baz: 123 }));
  });
});
