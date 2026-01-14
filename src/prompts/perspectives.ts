import { PromptDefinition } from './types.js';

/**
 * Multi-angle analysis prompt that assigns different analytical lenses
 * to each LLM for comprehensive analysis.
 */
export const perspectivesPrompt: PromptDefinition = {
  name: 'perspectives',
  description:
    'Analyze a problem from multiple perspectives. Each LLM adopts a different analytical lens (e.g., security, performance, UX) for comprehensive multi-angle analysis.',
  arguments: [
    {
      name: 'problem',
      description: 'The problem, design, or code to analyze',
      required: true,
    },
    {
      name: 'perspectives',
      description:
        'Comma-separated analytical lenses (e.g., "security, performance, UX, maintainability")',
      required: true,
    },
    {
      name: 'context',
      description: 'Additional background or constraints',
      required: false,
    },
  ],
  buildMessages: (args: Record<string, string>) => {
    const { problem, perspectives, context } = args;

    if (!problem) {
      throw new Error('problem argument is required');
    }
    if (!perspectives) {
      throw new Error('perspectives argument is required');
    }

    let messageText = `I need multi-perspective analysis of this problem:

**PROBLEM:**
${problem}
`;

    if (context) {
      messageText += `
**CONTEXT:**
${context}
`;
    }

    messageText += `
**PERSPECTIVES TO ANALYZE:**
${perspectives}

Please analyze from these perspectives, with each LLM adopting ONE lens. Each perspective should provide:
1. Specific observations from that viewpoint
2. Potential concerns or issues
3. Recommendations aligned with that perspective

Aim for productive disagreement - different lenses may have conflicting priorities, and that's valuable.`;

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
