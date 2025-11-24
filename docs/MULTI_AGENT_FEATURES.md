# Multi-Agent Consensus & Debate Features

Research-backed multi-agent coordination tools for the MCP Rubber Duck server.

## Research References

- [Multi-Agent Debate for LLM Judges](https://arxiv.org/abs/2510.12697) - Proves debate amplifies correctness vs static ensembles
- [Agent-as-a-Judge Evaluation](https://arxiv.org/html/2508.02994v1) - Multi-agent judges outperform single judges by 10-16%
- [Panel of LLM Evaluators (PoLL)](https://medium.com/@techsachin/replacing-judges-with-juries-llm-generation-evaluations-with-panel-of-llm-evaluators-d1e77dfb521e) - Panel of smaller models is 7x cheaper and more accurate

---

## Phase 1: `duck_vote` ✅ COMPLETED

Have multiple ducks vote on options with reasoning.

### Schema

```typescript
{
  question: string,           // "Best approach for error handling?"
  options: string[],          // ["try-catch", "Result type", "Either monad"]
  voters?: string[],          // Provider names (default: all)
  require_reasoning?: boolean // Force CoT before vote (default: true)
}
```

### Features

- Parallel voting from all configured ducks
- JSON vote parsing with robust fallback
- Consensus detection: unanimous, majority, plurality, split, none
- Tie-breaking by confidence score
- Formatted output with vote tally and reasoning

### Files

- `src/services/consensus.ts` - ConsensusService
- `src/tools/duck-vote.ts` - Tool implementation
- `src/config/types.ts` - VoteResult, AggregatedVote types
- `tests/consensus.test.ts` - 19 tests
- `tests/duck-vote.test.ts` - 10 tests

---

## Phase 2: `duck_judge` ✅ COMPLETED

Have one duck evaluate and rank other ducks' responses.

### Schema

```typescript
{
  responses: DuckResponse[],  // From duck_council output
  judge?: string,             // Provider name or "auto" (default: auto)
  criteria?: string[],        // ["accuracy", "completeness", "clarity"]
  persona?: string            // "senior engineer", "security expert"
}
```

### Features

- Accepts DuckResponse[] from duck_council
- Structured evaluation with criteria rubric
- Score parsing and ranking
- Optional persona for specialized evaluation
- Justifications for each ranking

### Files

- `src/tools/duck-judge.ts` - Tool implementation
- `src/config/types.ts` - JudgeRanking, JudgeEvaluation types
- `tests/duck-judge.test.ts` - 10 tests

---

## Phase 3: `duck_iterate` ✅ COMPLETED

Iterative refinement between two ducks.

### Schema

```typescript
{
  prompt: string,
  iterations?: number,        // Default: 3, max: 10
  providers: [string, string], // Exactly 2 for ping-pong
  mode: "refine" | "critique-improve"
}
```

### Features

- Duck A generates initial response
- Duck B critiques/improves (mode-dependent)
- Loop until max iterations or convergence
- Automatic convergence detection (stops early if responses stabilize)
- Track all iterations with roles
- Return final + full history

### Files

- `src/tools/duck-iterate.ts` - Tool implementation
- `src/config/types.ts` - IterationRound, IterationResult types
- `tests/duck-iterate.test.ts` - 10 tests

---

## Phase 4: `duck_debate` ✅ COMPLETED

Structured multi-round debate between ducks.

### Schema

```typescript
{
  prompt: string,
  rounds?: number,            // Default: 3
  providers?: string[],       // Min 2
  format: "oxford" | "socratic" | "adversarial",
  synthesizer?: string        // Provider for final summary
}
```

### Features

- Position assignment based on format:
  - **Oxford**: Alternating pro/con positions
  - **Socratic**: All participants neutral, question-based exploration
  - **Adversarial**: First duck defends, rest attack
- Multi-round debate with full context from previous rounds
- Format-specific prompting with tailored instructions
- Final synthesis by designated duck (or first provider by default)
- Formatted transcript with emoji indicators and round markers

### Files

- `src/tools/duck-debate.ts` - Tool implementation
- `src/config/types.ts` - DebateFormat, DebatePosition, DebateParticipant, DebateArgument, DebateResult types
- `tests/duck-debate.test.ts` - 11 tests

---

## Implementation Priority

| Phase | Feature | Research Impact | Effort | Status |
|-------|---------|-----------------|--------|--------|
| 1 | `duck_vote` | High | Low | ✅ Done |
| 2 | `duck_judge` | High | Low | ✅ Done |
| 3 | `duck_iterate` | Medium-High | Medium | ✅ Done |
| 4 | `duck_debate` | High | High | ✅ Done |

---

## Usage Examples

### duck_vote

```
Ask: "Best database for this project?"
Options: ["PostgreSQL", "MongoDB", "SQLite"]

Output:
🗳️ Vote Results
Winner: PostgreSQL (unanimous)
- GPT-4: PostgreSQL (85%) - "Relational data with complex queries"
- Gemini: PostgreSQL (90%) - "ACID compliance crucial"
- Groq: PostgreSQL (75%) - "Best for structured data"
```

### duck_judge (planned)

```
Input: duck_council responses about "implement auth"
Judge: openai
Criteria: ["security", "simplicity", "scalability"]

Output:
1. GPT-4 (92/100) - "Most comprehensive security coverage"
2. Gemini (85/100) - "Good but missing rate limiting"
3. Groq (78/100) - "Fast but oversimplified"
```

### duck_iterate (planned)

```
Prompt: "Write a sorting algorithm"
Mode: critique-improve
Iterations: 3

Round 1 (GPT-4): Initial quicksort implementation
Round 2 (Gemini): "Edge case bug on empty arrays" → Fixed version
Round 3 (GPT-4): "Could optimize pivot selection" → Final version
```

### duck_debate (planned)

```
Topic: "Microservices vs Monolith for startup MVP"
Format: oxford
Rounds: 3

Pro (GPT-4): "Microservices enable independent scaling..."
Con (Gemini): "Monolith reduces operational complexity..."
[3 rounds of debate]

Synthesis: "For MVP, monolith recommended. Migrate to microservices at scale."
```
