import { ApprovalService } from '../services/approval.js';

export async function approveMCPRequestTool(
  approvalService: ApprovalService,
  args: any
) {
  const { approval_id, decision, reason } = args;

  if (!approval_id || !decision) {
    return {
      content: [
        {
          type: 'text',
          text: '❌ Missing required parameters: approval_id and decision are required',
        },
      ],
      isError: true,
    };
  }

  if (!['approve', 'deny'].includes(decision)) {
    return {
      content: [
        {
          type: 'text',
          text: '❌ Decision must be either "approve" or "deny"',
        },
      ],
      isError: true,
    };
  }

  try {
    // Get the request details before processing
    const request = approvalService.getApprovalRequest(approval_id);
    
    if (!request) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Approval request ${approval_id} not found`,
          },
        ],
        isError: true,
      };
    }

    if (request.status !== 'pending') {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Request ${approval_id} is not pending (status: ${request.status})`,
          },
        ],
        isError: true,
      };
    }

    let success = false;
    let message = '';

    if (decision === 'approve') {
      success = approvalService.approveRequest(approval_id);
      if (success) {
        message = `✅ Approved: ${request.duckName} can now call ${request.mcpServer}:${request.toolName}`;
      } else {
        message = `❌ Failed to approve request ${approval_id}`;
      }
    } else {
      success = approvalService.denyRequest(approval_id, reason);
      if (success) {
        message = `❌ Denied: ${request.duckName} cannot call ${request.mcpServer}:${request.toolName}`;
        if (reason) {
          message += `\nReason: ${reason}`;
        }
      } else {
        message = `❌ Failed to deny request ${approval_id}`;
      }
    }

    // Add request details for context
    const detailsLines = [
      message,
      '',
      '📋 **Request Details:**',
      `- Duck: ${request.duckName}`,
      `- MCP Server: ${request.mcpServer}`,
      `- Tool: ${request.toolName}`,
      `- Arguments: \`${JSON.stringify(request.arguments)}\``,
      `- Request ID: \`${request.id}\``,
    ];

    // Add next steps
    if (decision === 'approve') {
      detailsLines.push('');
      detailsLines.push('💡 The duck can now retry their request with the approval.');
    }

    return {
      content: [
        {
          type: 'text',
          text: detailsLines.join('\n'),
        },
      ],
      isError: !success,
    };

  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error processing approval: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}