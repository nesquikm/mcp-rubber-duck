---
description: Update LLM pricing data for all providers
allowed-tools: Task, Read, Edit, Write, Glob, Grep, WebFetch, WebSearch, Bash
---

Use the **pricing-updater** subagent to update the LLM pricing data in `src/data/default-pricing.ts`.

The agent should:
1. Research current pricing from all provider websites (OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, Together AI)
2. Discover and add models that are **actually listed** on pricing pages - do NOT add speculative/future models
3. Update any prices that have changed
4. Remove models that are no longer available or deprecated
5. Update the `DEFAULT_PRICING_LAST_UPDATED` timestamp to today's date
6. Run `npm run typecheck` and `npm test -- tests/pricing.test.ts` to verify changes

**Important guidelines:**
- Only add models with explicit pricing on official provider pages
- Do not invent or extrapolate pricing for unannounced models
- When uncertain about a price, skip the model rather than guess
- Cross-reference model names exactly as they appear in API documentation

$ARGUMENTS
