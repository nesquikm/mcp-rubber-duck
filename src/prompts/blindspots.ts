import { PromptDefinition } from './types.js';

/**
 * Prompt to hunt for missing considerations, gaps, and overlooked risks.
 */
export const blindspotsPrompt: PromptDefinition = {
  name: 'blindspots',
  description:
    'Hunt for missing considerations, overlooked risks, and gaps in a proposal. Acts as a panel of critical reviewers looking for what might be underweighted.',
  arguments: [
    {
      name: 'proposal',
      description: 'The plan, code, design, or proposal to review for blindspots',
      required: true,
    },
    {
      name: 'covered',
      description: 'What you think you have already addressed or considered',
      required: false,
    },
    {
      name: 'risk_tolerance',
      description: 'Your risk tolerance level: low, medium, or high',
      required: false,
    },
  ],
  buildMessages: (args: Record<string, string>) => {
    const { proposal, covered, risk_tolerance } = args;

    if (!proposal) {
      throw new Error('proposal argument is required');
    }

    let messageText = `Act as a panel of critical reviewers looking for blindspots.

**PROPOSAL TO REVIEW:**
${proposal}
`;

    if (covered) {
      messageText += `
**ALREADY CONSIDERED:**
${covered}
`;
    }

    if (risk_tolerance) {
      messageText += `
**RISK TOLERANCE:** ${risk_tolerance}
`;
    }

    messageText += `
**YOUR TASK:**
Each reviewer should identify 2-3 potential blindspots:

1. **Failure modes** - Ways this could fail that aren't being considered
2. **Missing considerations** - Important factors that are overlooked
3. **Edge cases** - Scenarios that might break assumptions
4. **Dependencies** - External factors that could cause problems

For each blindspot:
- Be specific about WHAT the concern is
- Explain WHY it's concerning (impact if it happens)
- Suggest potential mitigations

Look for things that are easy to miss because they seem "obvious" or fall outside the immediate scope. Different reviewers should explore different angles.`;

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
