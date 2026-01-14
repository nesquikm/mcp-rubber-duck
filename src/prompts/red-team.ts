import { PromptDefinition } from './types.js';

/**
 * Prompt for security and risk analysis from multiple attack angles.
 */
export const redTeamPrompt: PromptDefinition = {
  name: 'red_team',
  description:
    'Conduct attack surface analysis from multiple angles. Each reviewer focuses on different risk dimensions (security, privacy, abuse, compliance).',
  arguments: [
    {
      name: 'target',
      description: 'The system, feature, code, or plan to red-team',
      required: true,
    },
    {
      name: 'threat_model',
      description: 'Known threat actors, attack scenarios, or security context',
      required: false,
    },
    {
      name: 'dimensions',
      description:
        'Risk dimensions to focus on (e.g., "security, privacy, abuse, compliance, reputation")',
      required: false,
    },
  ],
  buildMessages: (args: Record<string, string>) => {
    const { target, threat_model, dimensions } = args;

    if (!target) {
      throw new Error('target argument is required');
    }

    let messageText = `Conduct a red-team analysis of this target:

**TARGET:**
${target}
`;

    if (threat_model) {
      messageText += `
**THREAT MODEL/CONTEXT:**
${threat_model}
`;
    }

    if (dimensions) {
      messageText += `
**RISK DIMENSIONS TO FOCUS ON:**
${dimensions}
`;
    } else {
      messageText += `
**RISK DIMENSIONS:**
Consider security, privacy, abuse potential, compliance, and reputation risks.
`;
    }

    messageText += `
**YOUR TASK:**
Each reviewer should focus on a different attack vector or risk dimension:

1. **Identify vulnerabilities or abuse scenarios**
   - How could this be exploited or misused?
   - What could go wrong?

2. **Rate each finding**
   - Severity: How bad if it happens?
   - Likelihood: How likely is exploitation?

3. **Suggest mitigations**
   - How can each risk be reduced or eliminated?
   - What's the cost/benefit of the mitigation?

**PRIORITIZE:**
Identify the top 3 risks that need immediate attention. Explain why these are most critical.

Think adversarially - what would a malicious actor, careless user, or edge case do?`;

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
