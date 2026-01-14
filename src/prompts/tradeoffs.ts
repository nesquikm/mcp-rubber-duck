import { PromptDefinition } from './types.js';

/**
 * Prompt for structured comparison of options with explicit criteria.
 */
export const tradeoffsPrompt: PromptDefinition = {
  name: 'tradeoffs',
  description:
    'Compare options with explicit criteria and trade-off analysis. Provides structured evaluation to help make informed decisions.',
  arguments: [
    {
      name: 'options',
      description: 'The options to compare (comma-separated list or detailed descriptions)',
      required: true,
    },
    {
      name: 'criteria',
      description: 'Evaluation criteria (comma-separated, e.g., "cost, complexity, performance")',
      required: true,
    },
    {
      name: 'context',
      description: 'Decision context, constraints, or background',
      required: false,
    },
    {
      name: 'weights',
      description: 'Which criteria matter most (priority order or weights)',
      required: false,
    },
  ],
  buildMessages: (args: Record<string, string>) => {
    const { options, criteria, context, weights } = args;

    if (!options) {
      throw new Error('options argument is required');
    }
    if (!criteria) {
      throw new Error('criteria argument is required');
    }

    let messageText = `Provide a structured trade-off analysis:

**OPTIONS TO COMPARE:**
${options}

**EVALUATION CRITERIA:**
${criteria}
`;

    if (context) {
      messageText += `
**CONTEXT/CONSTRAINTS:**
${context}
`;
    }

    if (weights) {
      messageText += `
**PRIORITY CRITERIA:**
${weights}
`;
    }

    messageText += `
**YOUR TASK:**
1. **Assess each option** against each criterion
   - Use concrete ratings or descriptions, not vague terms
   - Note specific strengths and weaknesses

2. **Identify trade-offs**
   - Where do options excel vs struggle?
   - What do you gain/lose with each choice?

3. **Highlight disagreements**
   - Where might reasonable people disagree?
   - What depends on assumptions or preferences?

4. **Recommendation**
   - Given the stated priorities, which option fits best?
   - Under what conditions might a different option be better?

Present this as a structured analysis that helps decision-making, not just a list of pros/cons.`;

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
