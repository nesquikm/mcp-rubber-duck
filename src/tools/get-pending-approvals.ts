import { ApprovalService } from '../services/approval.js';

export function getPendingApprovalsTool(
  approvalService: ApprovalService,
  args: Record<string, unknown>
) {
  const { duck } = args as {
    duck?: string;
  };

  try {
    let approvals = approvalService.getPendingApprovals();

    // Filter by duck if specified
    if (duck) {
      approvals = approvals.filter(approval => approval.duckName === duck);
    }

    if (approvals.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: '✅ No pending MCP tool approvals',
          },
        ],
      };
    }

    // Format approvals for display
    const formattedApprovals = approvals.map(approval => {
      const timeAgo = Math.round((Date.now() - approval.timestamp) / 1000);
      const expiresIn = Math.round((approval.expiresAt - Date.now()) / 1000);
      
      return {
        id: approval.id,
        duck: approval.duckName,
        server: approval.mcpServer,
        tool: approval.toolName,
        arguments: approval.arguments,
        requestedAgo: `${timeAgo}s ago`,
        expiresIn: expiresIn > 0 ? `${expiresIn}s` : 'expired',
      };
    });

    // Create summary text
    const summaryLines = [
      `🔔 ${approvals.length} pending MCP approval${approvals.length === 1 ? '' : 's'}:`,
      '',
    ];

    formattedApprovals.forEach((approval, index) => {
      summaryLines.push(`${index + 1}. **${approval.duck}** wants to call \`${approval.server}:${approval.tool}\``);
      summaryLines.push(`   ID: \`${approval.id}\``);
      
      // Show arguments if they exist and are reasonably sized
      const argsStr = JSON.stringify(approval.arguments);
      if (argsStr.length < 100) {
        summaryLines.push(`   Args: \`${argsStr}\``);
      } else {
        summaryLines.push(`   Args: [${Object.keys(approval.arguments).length} parameters]`);
      }
      
      summaryLines.push(`   Requested: ${approval.requestedAgo}, Expires: ${approval.expiresIn}`);
      summaryLines.push('');
    });

    summaryLines.push('💡 Use `approve_mcp_request` to approve or deny requests');

    return {
      content: [
        {
          type: 'text',
          text: summaryLines.join('\n'),
        },
      ],
    };

  } catch (error: unknown) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Failed to get pending approvals: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}