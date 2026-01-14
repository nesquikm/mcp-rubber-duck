import { PromptDefinition } from './types.js';

/**
 * Prompt to surface and challenge hidden assumptions in a plan or design.
 */
export const assumptionsPrompt: PromptDefinition = {
  name: 'assumptions',
  description:
    'Surface and challenge hidden assumptions in a plan, design, or idea. Identifies implicit premises that could be risky if wrong.',
  arguments: [
    {
      name: 'plan',
      description: 'The plan, design, or idea to analyze for hidden assumptions',
      required: true,
    },
    {
      name: 'constraints',
      description: 'Known hard constraints that are definitely true',
      required: false,
    },
    {
      name: 'concerns',
      description: 'Areas where you feel uncertain or worried',
      required: false,
    },
  ],
  buildMessages: (args: Record<string, string>) => {
    const { plan, constraints, concerns } = args;

    if (!plan) {
      throw new Error('plan argument is required');
    }

    let messageText = `Please analyze the hidden assumptions in this plan:

**PLAN/DESIGN/IDEA:**
${plan}
`;

    if (constraints) {
      messageText += `
**KNOWN CONSTRAINTS (definitely true):**
${constraints}
`;
    }

    if (concerns) {
      messageText += `
**MY CONCERNS/UNCERTAINTIES:**
${concerns}
`;
    }

    messageText += `
**YOUR TASK:**
Identify the implicit assumptions underlying this plan. For each assumption:

1. **State it explicitly** - What is being assumed without being stated?
2. **Criticality** (high/medium/low) - How important is this assumption to the plan's success?
3. **Fragility** (high/medium/low) - How likely is this assumption to be wrong?
4. **Validation** - How could we test or verify this assumption?

Focus on assumptions that:
- Are easy to overlook
- Would cause significant problems if wrong
- Others analyzing this might miss

Each LLM should try to find assumptions the others might not catch.`;

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
