import { describe, it, expect } from '@jest/globals';
import { getPrompts, getPrompt, PROMPTS } from '../src/prompts/index.js';

describe('Prompts', () => {
  describe('getPrompts', () => {
    it('should return all 8 prompts', () => {
      const prompts = getPrompts();
      expect(prompts).toHaveLength(8);
    });

    it('should return prompts with required fields', () => {
      const prompts = getPrompts();
      for (const prompt of prompts) {
        expect(prompt).toHaveProperty('name');
        expect(prompt).toHaveProperty('description');
        expect(typeof prompt.name).toBe('string');
        expect(typeof prompt.description).toBe('string');
        expect(prompt.name.length).toBeGreaterThan(0);
        expect(prompt.description.length).toBeGreaterThan(0);
      }
    });

    it('should return prompts with arguments array', () => {
      const prompts = getPrompts();
      for (const prompt of prompts) {
        expect(Array.isArray(prompt.arguments)).toBe(true);
      }
    });

    it('should not expose buildMessages function', () => {
      const prompts = getPrompts();
      for (const prompt of prompts) {
        expect(prompt).not.toHaveProperty('buildMessages');
      }
    });

    it('should have unique prompt names', () => {
      const prompts = getPrompts();
      const names = prompts.map((p) => p.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('getPrompt', () => {
    it('should throw for unknown prompt', () => {
      expect(() => getPrompt('nonexistent', {})).toThrow('Unknown prompt: nonexistent');
    });

    it('should return description and messages', () => {
      const result = getPrompt('reframe', { problem: 'Test problem' });
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('messages');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should throw for missing required arguments', () => {
      expect(() => getPrompt('perspectives', {})).toThrow();
      expect(() => getPrompt('perspectives', { problem: 'test' })).toThrow(); // missing perspectives
    });

    it('should wrap errors with prompt context', () => {
      try {
        getPrompt('perspectives', {});
        fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toMatch(/^Failed to build prompt "perspectives":/);
        expect((e as Error).message).toContain('problem argument is required');
      }
    });

    it('should handle empty string arguments as missing', () => {
      expect(() => getPrompt('perspectives', { problem: '', perspectives: 'test' })).toThrow(
        'problem argument is required'
      );
    });

    it('should handle whitespace-only arguments as valid', () => {
      // Whitespace is truthy in JS, so it passes validation (this is intentional)
      const result = getPrompt('perspectives', { problem: '   ', perspectives: 'test' });
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('perspectives prompt', () => {
    it('should require problem and perspectives arguments', () => {
      expect(() => getPrompt('perspectives', {})).toThrow('problem argument is required');
      expect(() => getPrompt('perspectives', { problem: 'test' })).toThrow(
        'perspectives argument is required'
      );
    });

    it('should build valid messages with required args', () => {
      const result = getPrompt('perspectives', {
        problem: 'Test problem',
        perspectives: 'security, performance',
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toHaveProperty('type', 'text');
    });

    it('should include optional context in message', () => {
      const result = getPrompt('perspectives', {
        problem: 'Test problem',
        perspectives: 'security',
        context: 'Additional context',
      });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('Additional context');
    });
  });

  describe('assumptions prompt', () => {
    it('should require plan argument', () => {
      expect(() => getPrompt('assumptions', {})).toThrow('plan argument is required');
    });

    it('should build valid messages', () => {
      const result = getPrompt('assumptions', { plan: 'Test plan' });
      expect(result.messages).toHaveLength(1);
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('Test plan');
    });

    it('should include optional constraints and concerns', () => {
      const result = getPrompt('assumptions', {
        plan: 'Test plan',
        constraints: 'Must be fast',
        concerns: 'Worried about scale',
      });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('Must be fast');
      expect(text).toContain('Worried about scale');
    });
  });

  describe('blindspots prompt', () => {
    it('should require proposal argument', () => {
      expect(() => getPrompt('blindspots', {})).toThrow('proposal argument is required');
    });

    it('should build valid messages', () => {
      const result = getPrompt('blindspots', { proposal: 'Test proposal' });
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('tradeoffs prompt', () => {
    it('should require options and criteria arguments', () => {
      expect(() => getPrompt('tradeoffs', {})).toThrow('options argument is required');
      expect(() => getPrompt('tradeoffs', { options: 'A, B' })).toThrow(
        'criteria argument is required'
      );
    });

    it('should build valid messages with required args', () => {
      const result = getPrompt('tradeoffs', {
        options: 'Option A, Option B',
        criteria: 'cost, speed',
      });
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('red_team prompt', () => {
    it('should require target argument', () => {
      expect(() => getPrompt('red_team', {})).toThrow('target argument is required');
    });

    it('should build valid messages', () => {
      const result = getPrompt('red_team', { target: 'Test system' });
      expect(result.messages).toHaveLength(1);
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('Test system');
    });
  });

  describe('reframe prompt', () => {
    it('should require problem argument', () => {
      expect(() => getPrompt('reframe', {})).toThrow('problem argument is required');
    });

    it('should include three reframing types', () => {
      const result = getPrompt('reframe', { problem: 'Test problem' });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('HIGHER ABSTRACTION');
      expect(text).toContain('INVERSION');
      expect(text).toContain('SIMPLIFICATION');
    });
  });

  describe('architecture prompt', () => {
    it('should require design, workloads, and priorities arguments', () => {
      expect(() => getPrompt('architecture', {})).toThrow('design argument is required');
      expect(() => getPrompt('architecture', { design: 'test' })).toThrow(
        'workloads argument is required'
      );
      expect(() => getPrompt('architecture', { design: 'test', workloads: 'test' })).toThrow(
        'priorities argument is required'
      );
    });

    it('should build valid messages with all required args', () => {
      const result = getPrompt('architecture', {
        design: 'Microservices',
        workloads: '1000 req/s',
        priorities: 'latency, cost',
      });
      expect(result.messages).toHaveLength(1);
    });

    it('should include cross-cutting concerns', () => {
      const result = getPrompt('architecture', {
        design: 'test',
        workloads: 'test',
        priorities: 'test',
      });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('Scalability');
      expect(text).toContain('Reliability');
      expect(text).toContain('Operational Complexity');
      expect(text).toContain('Developer Experience');
      expect(text).toContain('Cost Efficiency');
    });
  });

  describe('diverge_converge prompt', () => {
    it('should require challenge argument', () => {
      expect(() => getPrompt('diverge_converge', {})).toThrow('challenge argument is required');
    });

    it('should include diverge and converge phases', () => {
      const result = getPrompt('diverge_converge', { challenge: 'Test challenge' });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('PHASE 1: DIVERGE');
      expect(text).toContain('PHASE 2: CONVERGE');
    });

    it('should use default width and criteria when not provided', () => {
      const result = getPrompt('diverge_converge', { challenge: 'Test challenge' });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain('balanced');
      expect(text).toContain('feasibility, impact, and effort required');
    });
  });

  describe('PROMPTS registry', () => {
    it('should have all expected prompts', () => {
      const expectedNames = [
        'perspectives',
        'assumptions',
        'blindspots',
        'tradeoffs',
        'red_team',
        'reframe',
        'architecture',
        'diverge_converge',
      ];
      for (const name of expectedNames) {
        expect(PROMPTS).toHaveProperty(name);
      }
    });

    it('should have buildMessages function for all prompts', () => {
      for (const [name, prompt] of Object.entries(PROMPTS)) {
        expect(typeof prompt.buildMessages).toBe('function');
        expect(prompt.name).toBe(name);
      }
    });
  });

  describe('MCP spec compliance', () => {
    it('should return messages with valid role (user or assistant)', () => {
      const result = getPrompt('reframe', { problem: 'test' });
      for (const message of result.messages) {
        expect(['user', 'assistant']).toContain(message.role);
      }
    });

    it('should return messages with valid content type', () => {
      const result = getPrompt('reframe', { problem: 'test' });
      for (const message of result.messages) {
        const content = message.content as { type: string; text?: string };
        expect(['text', 'image', 'resource']).toContain(content.type);
        if (content.type === 'text') {
          expect(typeof content.text).toBe('string');
        }
      }
    });

    it('should preserve user input in generated messages', () => {
      const userInput = 'Special chars: <>&"\' and unicode: 日本語';
      const result = getPrompt('reframe', { problem: userInput });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain(userInput);
    });

    it('should handle very long inputs without truncation', () => {
      const longInput = 'x'.repeat(50000);
      const result = getPrompt('reframe', { problem: longInput });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain(longInput);
    });

    it('should handle inputs with newlines and special whitespace', () => {
      const multilineInput = 'Line 1\nLine 2\n\tTabbed line\r\nWindows line';
      const result = getPrompt('reframe', { problem: multilineInput });
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain(multilineInput);
    });
  });
});
