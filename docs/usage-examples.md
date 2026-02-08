# Usage Examples

<p align="center">
  <img src="../assets/docs-usage-examples.jpg" alt="Usage examples cooking show" width="600">
</p>

## Basic Query
```javascript
// Ask the default duck
await ask_duck({
  prompt: "Explain async/await in JavaScript"
});
```

## Conversation
```javascript
// Start a conversation
await chat_with_duck({
  conversation_id: "learning-session",
  message: "What is TypeScript?"
});

// Continue the conversation
await chat_with_duck({
  conversation_id: "learning-session",
  message: "How does it differ from JavaScript?"
});
```

## Compare Responses
```javascript
// Get different perspectives
await compare_ducks({
  prompt: "What's the best way to handle errors in Node.js?",
  providers: ["openai", "groq", "ollama"]
});
```

## Duck Council
```javascript
// Convene the council for important decisions
await duck_council({
  prompt: "Should I use REST or GraphQL for my API?"
});
```

## Multi-Agent Voting
```javascript
// Have ducks vote on a decision
await duck_vote({
  question: "Best database for a real-time chat app?",
  options: ["PostgreSQL", "MongoDB", "Redis", "Cassandra"]
});
// Returns: Winner with consensus level (unanimous/majority/split)
```

## Judge Responses
```javascript
// First, get responses from council
const responses = await duck_council({
  prompt: "Implement a rate limiter"
});

// Then have a duck judge them
await duck_judge({
  responses: responses,
  criteria: ["correctness", "efficiency", "readability"],
  persona: "senior backend engineer"
});
```

## Iterative Refinement
```javascript
// Two ducks collaborate to improve a solution
await duck_iterate({
  prompt: "Write a TypeScript function to deep clone objects",
  providers: ["openai", "gemini"],
  mode: "critique-improve",
  iterations: 3
});
```

## Structured Debate
```javascript
// Oxford-style debate on architecture
await duck_debate({
  prompt: "Monorepo vs polyrepo for a growing startup",
  format: "oxford",
  rounds: 3
});
```

## Check Usage Stats
```javascript
// See today's usage
await get_usage_stats({ period: "today" });

// See last 7 days with cost breakdown
await get_usage_stats({ period: "7d" });
```
