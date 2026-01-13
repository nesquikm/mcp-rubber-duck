import { PromptDefinition } from './types.js';

/**
 * Prompt for structured architecture and design reviews.
 */
export const architecturePrompt: PromptDefinition = {
  name: 'architecture',
  description:
    'Structured architecture or design review from multiple engineering perspectives. Each reviewer focuses on different cross-cutting concerns.',
  arguments: [
    {
      name: 'design',
      description: 'Description of the architecture, system design, or technical approach',
      required: true,
    },
    {
      name: 'workloads',
      description: 'Key use cases, workloads, or scenarios the design must handle',
      required: true,
    },
    {
      name: 'priorities',
      description:
        'Non-functional priorities (e.g., "latency, cost, simplicity, observability")',
      required: true,
    },
    {
      name: 'uncertainties',
      description: 'Areas where you feel most unsure or want extra scrutiny',
      required: false,
    },
  ],
  buildMessages: (args: Record<string, string>) => {
    const { design, workloads, priorities, uncertainties } = args;

    if (!design) {
      throw new Error('design argument is required');
    }
    if (!workloads) {
      throw new Error('workloads argument is required');
    }
    if (!priorities) {
      throw new Error('priorities argument is required');
    }

    let messageText = `Review this architecture from multiple engineering perspectives:

**DESIGN:**
${design}

**KEY WORKLOADS/USE CASES:**
${workloads}

**PRIORITIES:**
${priorities}
`;

    if (uncertainties) {
      messageText += `
**AREAS OF UNCERTAINTY (extra scrutiny needed):**
${uncertainties}
`;
    }

    messageText += `
**YOUR TASK:**
Each reviewer should focus on a different cross-cutting concern:

1. **Scalability & Performance**
   - Can this handle the stated workloads?
   - Where are the bottlenecks?
   - How does it scale (vertically/horizontally)?

2. **Reliability & Failure Modes**
   - What happens when components fail?
   - Are there single points of failure?
   - How is state handled during failures?

3. **Operational Complexity**
   - How hard is this to deploy, monitor, and debug?
   - What operational burden does this create?
   - How observable is the system?

4. **Developer Experience**
   - How easy is this to understand and modify?
   - What's the learning curve?
   - How testable is this design?

5. **Cost Efficiency**
   - What are the cost drivers?
   - Are there cheaper alternatives that meet requirements?
   - How do costs scale with load?

**For each concern:**
- Identify specific issues or risks
- Suggest improvements aligned with the stated priorities
- Note trade-offs (improving one area may hurt another)

Focus on actionable feedback, not generic advice.`;

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
