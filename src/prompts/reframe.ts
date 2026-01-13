import { PromptDefinition } from './types.js';

/**
 * Prompt for problem reframing at different abstraction levels and angles.
 */
export const reframePrompt: PromptDefinition = {
  name: 'reframe',
  description:
    'Reframe a problem from multiple angles and abstraction levels. Helps break out of mental ruts by viewing the problem differently.',
  arguments: [
    {
      name: 'problem',
      description: 'The current problem statement or challenge',
      required: true,
    },
    {
      name: 'stuck_on',
      description: 'What specifically you are stuck on or frustrated by',
      required: false,
    },
  ],
  buildMessages: (args: Record<string, string>) => {
    const { problem, stuck_on } = args;

    if (!problem) {
      throw new Error('problem argument is required');
    }

    let messageText = `Help me reframe this problem from multiple angles:

**CURRENT PROBLEM:**
${problem}
`;

    if (stuck_on) {
      messageText += `
**WHAT I'M STUCK ON:**
${stuck_on}
`;
    }

    messageText += `
**YOUR TASK:**
Provide three distinct reframings of this problem:

1. **HIGHER ABSTRACTION**
   - What's the core human need or job-to-be-done here?
   - What problem behind the problem are we really solving?
   - How might we phrase this as a "How might we...?" question?

2. **INVERSION**
   - What if we wanted this problem to occur? How would we cause it?
   - What's the opposite of what we're trying to achieve?
   - What would make this problem impossible to solve?

3. **SIMPLIFICATION**
   - How would you explain this to a non-expert?
   - What's the simplest version of this problem?
   - What would a child ask about this?

For each reframing:
- State the new problem formulation clearly
- Explain what new solution directions this opens up
- Note what aspects of the original problem this highlights or de-emphasizes

The goal is to break out of the current mental frame and see new possibilities.`;

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
