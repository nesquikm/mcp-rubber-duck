import { PromptDefinition } from './types.js';

/**
 * Prompt for divergent exploration followed by convergence.
 */
export const divergeConvergePrompt: PromptDefinition = {
  name: 'diverge_converge',
  description:
    'Structure divergent thinking (explore many options) followed by convergence (evaluate and select). Maximizes creative exploration before narrowing down.',
  arguments: [
    {
      name: 'challenge',
      description: 'The problem or challenge to solve',
      required: true,
    },
    {
      name: 'width',
      description: 'Exploration width: "wild" for creative/unconventional, "focused" for practical',
      required: false,
    },
    {
      name: 'convergence_criteria',
      description: 'What makes a solution "good" - criteria for evaluating options',
      required: false,
    },
  ],
  buildMessages: (args: Record<string, string>) => {
    const { challenge, width, convergence_criteria } = args;

    if (!challenge) {
      throw new Error('challenge argument is required');
    }

    const explorationMode = width || 'balanced';
    const criteria = convergence_criteria || 'feasibility, impact, and effort required';

    let messageText = `Let's use divergent-then-convergent thinking:

**CHALLENGE:**
${challenge}

**EXPLORATION MODE:** ${explorationMode}
**SUCCESS CRITERIA:** ${criteria}

---

## PHASE 1: DIVERGE

Each LLM should propose 2-3 **substantially DIFFERENT** approaches. The goal is diversity, not agreement.

Guidelines:
- Maximize variety in your proposals
- Include at least one unconventional or surprising idea
- Don't self-censor "crazy" ideas yet
- Brief descriptions are fine - we'll evaluate later
`;

    if (explorationMode === 'wild') {
      messageText += `- Push boundaries - what would you suggest if there were no constraints?
`;
    } else if (explorationMode === 'focused') {
      messageText += `- Stay practical - focus on implementable solutions
`;
    }

    messageText += `
---

## PHASE 2: CONVERGE

After all options are on the table, evaluate them against the success criteria:

1. **Quick assessment** of each option against: ${criteria}
2. **Identify top 2-3 candidates** that best meet the criteria
3. **Hybrid opportunities** - can elements from different approaches be combined?
4. **Recommendation** - which approach (or combination) should we pursue?

---

Start with Phase 1 - generate diverse options first, then we'll converge.`;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: messageText,
        },
      },
    ];
  },
};
