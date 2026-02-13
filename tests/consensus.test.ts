import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConsensusService } from '../src/services/consensus';
import { VoteResult } from '../src/config/types';

describe('ConsensusService', () => {
  let service: ConsensusService;

  beforeEach(() => {
    service = new ConsensusService();
  });

  describe('buildVotePrompt', () => {
    it('should build a vote prompt with reasoning', () => {
      const prompt = service.buildVotePrompt(
        'Best programming language?',
        ['Python', 'JavaScript', 'Rust'],
        true
      );

      expect(prompt).toContain('Best programming language?');
      expect(prompt).toContain('1. Python');
      expect(prompt).toContain('2. JavaScript');
      expect(prompt).toContain('3. Rust');
      expect(prompt).toContain('"reasoning"');
    });

    it('should build a vote prompt without reasoning', () => {
      const prompt = service.buildVotePrompt(
        'Best color?',
        ['Red', 'Blue'],
        false
      );

      expect(prompt).toContain('Best color?');
      expect(prompt).toContain('1. Red');
      expect(prompt).toContain('2. Blue');
      expect(prompt).not.toContain('"reasoning"');
    });
  });

  describe('parseVote', () => {
    const options = ['Option A', 'Option B', 'Option C'];

    it('should parse valid JSON vote with all fields', () => {
      const response = JSON.stringify({
        choice: 'Option A',
        confidence: 85,
        reasoning: 'It is the best option because...',
      });

      const result = service.parseVote(response, 'test-provider', 'Test Duck', options);

      expect(result.choice).toBe('Option A');
      expect(result.confidence).toBe(85);
      expect(result.reasoning).toBe('It is the best option because...');
      expect(result.voter).toBe('test-provider');
      expect(result.nickname).toBe('Test Duck');
    });

    it('should parse vote with extra text around JSON', () => {
      const response = `Here is my vote:
      {"choice": "Option B", "confidence": 70, "reasoning": "Good choice"}
      Thank you!`;

      const result = service.parseVote(response, 'provider1', 'Duck 1', options);

      expect(result.choice).toBe('Option B');
      expect(result.confidence).toBe(70);
    });

    it('should clamp confidence to 0-100 range', () => {
      const response = JSON.stringify({
        choice: 'Option A',
        confidence: 150,
      });

      const result = service.parseVote(response, 'provider1', 'Duck 1', options);
      expect(result.confidence).toBe(100);

      const response2 = JSON.stringify({
        choice: 'Option A',
        confidence: -20,
      });

      const result2 = service.parseVote(response2, 'provider1', 'Duck 1', options);
      expect(result2.confidence).toBe(0);
    });

    it('should handle case-insensitive choice matching', () => {
      const response = JSON.stringify({
        choice: 'option a',
        confidence: 80,
      });

      const result = service.parseVote(response, 'provider1', 'Duck 1', options);
      expect(result.choice).toBe('Option A');
    });

    it('should handle partial/fuzzy choice matching', () => {
      const response = JSON.stringify({
        choice: 'A',
        confidence: 80,
      });

      const result = service.parseVote(response, 'provider1', 'Duck 1', options);
      expect(result.choice).toBe('Option A');
    });

    it('should fallback parse when JSON is invalid', () => {
      const response = 'I think Option C is the best because it has great features.';

      const result = service.parseVote(response, 'provider1', 'Duck 1', options);
      expect(result.choice).toBe('Option C');
      expect(result.confidence).toBe(50); // Default fallback confidence
    });

    it('should return empty choice when no match found', () => {
      const response = 'I cannot decide on any of these options.';

      const result = service.parseVote(response, 'provider1', 'Duck 1', options);
      expect(result.choice).toBe('');
    });

    it('should handle malformed JSON that looks like JSON', () => {
      // This matches the JSON regex but fails JSON.parse
      const response = '{"choice": Option A, confidence: 80}'; // Invalid JSON - missing quotes

      const result = service.parseVote(response, 'provider1', 'Duck 1', options);
      // Should fallback and try to extract from text
      expect(result.choice).toBe('Option A');
      expect(result.confidence).toBe(50); // Default fallback confidence
    });

    it('should parse string confidence values', () => {
      const response = JSON.stringify({
        choice: 'Option A',
        confidence: '75',
      });

      const result = service.parseVote(response, 'provider1', 'Duck 1', options);
      expect(result.confidence).toBe(75);
    });
  });

  describe('aggregateVotes', () => {
    const question = 'Best framework?';
    const options = ['React', 'Vue', 'Angular'];

    it('should aggregate votes and determine winner', () => {
      const votes: VoteResult[] = [
        { voter: 'p1', nickname: 'D1', choice: 'React', confidence: 80, reasoning: 'R1', rawResponse: '' },
        { voter: 'p2', nickname: 'D2', choice: 'React', confidence: 90, reasoning: 'R2', rawResponse: '' },
        { voter: 'p3', nickname: 'D3', choice: 'Vue', confidence: 70, reasoning: 'R3', rawResponse: '' },
      ];

      const result = service.aggregateVotes(question, options, votes);

      expect(result.winner).toBe('React');
      expect(result.tally['React']).toBe(2);
      expect(result.tally['Vue']).toBe(1);
      expect(result.tally['Angular']).toBe(0);
      expect(result.isTie).toBe(false);
      expect(result.consensusLevel).toBe('majority');
      expect(result.validVotes).toBe(3);
    });

    it('should detect unanimous consensus', () => {
      const votes: VoteResult[] = [
        { voter: 'p1', nickname: 'D1', choice: 'React', confidence: 80, reasoning: '', rawResponse: '' },
        { voter: 'p2', nickname: 'D2', choice: 'React', confidence: 90, reasoning: '', rawResponse: '' },
        { voter: 'p3', nickname: 'D3', choice: 'React', confidence: 85, reasoning: '', rawResponse: '' },
      ];

      const result = service.aggregateVotes(question, options, votes);

      expect(result.winner).toBe('React');
      expect(result.consensusLevel).toBe('unanimous');
    });

    it('should break tie by confidence', () => {
      const votes: VoteResult[] = [
        { voter: 'p1', nickname: 'D1', choice: 'React', confidence: 60, reasoning: '', rawResponse: '' },
        { voter: 'p2', nickname: 'D2', choice: 'Vue', confidence: 90, reasoning: '', rawResponse: '' },
      ];

      const result = service.aggregateVotes(question, options, votes);

      expect(result.isTie).toBe(true);
      expect(result.winner).toBe('Vue'); // Higher confidence
      expect(result.consensusLevel).toBe('split');
    });

    it('should handle no valid votes', () => {
      const votes: VoteResult[] = [
        { voter: 'p1', nickname: 'D1', choice: '', confidence: 0, reasoning: '', rawResponse: '' },
        { voter: 'p2', nickname: 'D2', choice: 'InvalidOption', confidence: 50, reasoning: '', rawResponse: '' },
      ];

      const result = service.aggregateVotes(question, options, votes);

      expect(result.winner).toBeNull();
      expect(result.validVotes).toBe(0);
      expect(result.consensusLevel).toBe('none');
    });

    it('should calculate average confidence per option', () => {
      const votes: VoteResult[] = [
        { voter: 'p1', nickname: 'D1', choice: 'React', confidence: 80, reasoning: '', rawResponse: '' },
        { voter: 'p2', nickname: 'D2', choice: 'React', confidence: 60, reasoning: '', rawResponse: '' },
        { voter: 'p3', nickname: 'D3', choice: 'Vue', confidence: 90, reasoning: '', rawResponse: '' },
      ];

      const result = service.aggregateVotes(question, options, votes);

      // Verify averages are computed correctly (not just sum or count)
      expect(result.confidenceByOption['React']).toBe(70); // (80+60)/2
      expect(result.confidenceByOption['Vue']).toBe(90);   // 90/1
      // All options from the original list should be tracked, even with 0 votes
      expect(Object.keys(result.confidenceByOption)).toEqual(expect.arrayContaining(options));
      expect(result.confidenceByOption['Angular']).toBe(0);
      // Verify tally matches
      expect(result.tally['React']).toBe(2);
      expect(result.tally['Vue']).toBe(1);
      expect(result.tally['Angular']).toBe(0);
    });

    it('should detect plurality consensus', () => {
      const votes: VoteResult[] = [
        { voter: 'p1', nickname: 'D1', choice: 'React', confidence: 80, reasoning: '', rawResponse: '' },
        { voter: 'p2', nickname: 'D2', choice: 'React', confidence: 70, reasoning: '', rawResponse: '' },
        { voter: 'p3', nickname: 'D3', choice: 'Vue', confidence: 90, reasoning: '', rawResponse: '' },
        { voter: 'p4', nickname: 'D4', choice: 'Angular', confidence: 60, reasoning: '', rawResponse: '' },
        { voter: 'p5', nickname: 'D5', choice: 'Angular', confidence: 50, reasoning: '', rawResponse: '' },
      ];

      const result = service.aggregateVotes(question, options, votes);

      // React has 2, Angular has 2, Vue has 1 - it's a tie
      // But if we modify to have clear plurality:
      const votes2: VoteResult[] = [
        { voter: 'p1', nickname: 'D1', choice: 'React', confidence: 80, reasoning: '', rawResponse: '' },
        { voter: 'p2', nickname: 'D2', choice: 'React', confidence: 70, reasoning: '', rawResponse: '' },
        { voter: 'p3', nickname: 'D3', choice: 'Vue', confidence: 90, reasoning: '', rawResponse: '' },
        { voter: 'p4', nickname: 'D4', choice: 'Angular', confidence: 60, reasoning: '', rawResponse: '' },
      ];

      const result2 = service.aggregateVotes(question, options, votes2);
      expect(result2.winner).toBe('React');
      expect(result2.consensusLevel).toBe('plurality'); // 2/4 = 50%, not majority
    });
  });

  describe('formatVoteResult', () => {
    it('should format vote results with winner', () => {
      const votes: VoteResult[] = [
        { voter: 'p1', nickname: 'Duck 1', choice: 'Option A', confidence: 85, reasoning: 'Best choice', rawResponse: '' },
        { voter: 'p2', nickname: 'Duck 2', choice: 'Option A', confidence: 75, reasoning: 'Agreed', rawResponse: '' },
      ];

      const aggregated = service.aggregateVotes('Test question?', ['Option A', 'Option B'], votes);
      const formatted = service.formatVoteResult(aggregated);

      expect(formatted).toContain('Vote Results');
      expect(formatted).toContain('Test question?');
      expect(formatted).toContain('Winner');
      expect(formatted).toContain('Option A');
      expect(formatted).toContain('unanimous');
      expect(formatted).toContain('Duck 1');
      expect(formatted).toContain('Duck 2');
      expect(formatted).toContain('Best choice');
      expect(formatted).toContain('2/2 valid votes');
    });

    it('should format results with invalid votes', () => {
      const votes: VoteResult[] = [
        { voter: 'p1', nickname: 'Duck 1', choice: '', confidence: 0, reasoning: '', rawResponse: '' },
      ];

      const aggregated = service.aggregateVotes('Test?', ['A', 'B'], votes);
      const formatted = service.formatVoteResult(aggregated);

      expect(formatted).toContain('No valid votes');
      expect(formatted).toContain('Invalid vote');
      expect(formatted).toContain('0/1 valid votes');
    });

    it('should indicate tie-breaker when applicable', () => {
      const votes: VoteResult[] = [
        { voter: 'p1', nickname: 'D1', choice: 'A', confidence: 60, reasoning: '', rawResponse: '' },
        { voter: 'p2', nickname: 'D2', choice: 'B', confidence: 90, reasoning: '', rawResponse: '' },
      ];

      const aggregated = service.aggregateVotes('Test?', ['A', 'B'], votes);
      const formatted = service.formatVoteResult(aggregated);

      expect(formatted).toContain('tie-breaker');
    });
  });
});
