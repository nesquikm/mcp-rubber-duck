import { MCPClientManager } from '../services/mcp-client-manager.js';
import { ApprovalService } from '../services/approval.js';
import { FunctionBridge } from '../services/function-bridge.js';

export async function mcpStatusTool(
  mcpManager: MCPClientManager,
  approvalService: ApprovalService,
  functionBridge: FunctionBridge,
  _args: any
) {
  try {
    // Get MCP server status
    const serverStatus = mcpManager.getStatus();
    const connectedServers = mcpManager.getConnectedServers();
    
    // Get available tools
    const allTools = await mcpManager.listAllTools();
    const toolsByServer = allTools.reduce((acc, tool) => {
      if (!acc[tool.serverName]) {
        acc[tool.serverName] = [];
      }
      acc[tool.serverName].push(tool);
      return acc;
    }, {} as Record<string, any[]>);

    // Get approval statistics
    const approvalStats = approvalService.getStats();
    
    // Get function bridge statistics
    const bridgeStats = functionBridge.getStats();

    // Build status report
    const statusLines = [
      '🦆 **MCP Bridge Status**',
      '',
      '📊 **Overview:**',
      `- Connected Servers: ${connectedServers.length}`,
      `- Available Tools: ${allTools.length}`,
      `- Trusted Tools: ${bridgeStats.trustedToolCount}`,
      '',
    ];

    // Server details
    if (Object.keys(serverStatus).length > 0) {
      statusLines.push('🖥️ **MCP Servers:**');
      for (const [serverName, status] of Object.entries(serverStatus)) {
        const toolCount = toolsByServer[serverName]?.length || 0;
        const statusIcon = status.status === 'connected' ? '🟢' : 
                          status.status === 'connecting' ? '🟡' : '🔴';
        
        statusLines.push(`${statusIcon} **${serverName}** (${status.type})`);
        statusLines.push(`   Status: ${status.status}`);
        if (toolCount > 0) {
          statusLines.push(`   Tools: ${toolCount}`);
          
          // Show first few tools as examples
          const tools = toolsByServer[serverName];
          if (tools && tools.length <= 3) {
            statusLines.push(`   Available: ${tools.map(t => t.name).join(', ')}`);
          } else if (tools && tools.length > 3) {
            statusLines.push(`   Available: ${tools.slice(0, 3).map(t => t.name).join(', ')} +${tools.length - 3} more`);
          }
        }
        statusLines.push('');
      }
    } else {
      statusLines.push('🖥️ **No MCP servers configured**');
      statusLines.push('');
    }

    // Approval statistics
    statusLines.push('📋 **Approval Statistics:**');
    statusLines.push(`- Total Requests: ${approvalStats.total}`);
    statusLines.push(`- Pending: ${approvalStats.pending}`);
    statusLines.push(`- Approved: ${approvalStats.approved}`);
    statusLines.push(`- Denied: ${approvalStats.denied}`);
    statusLines.push(`- Expired: ${approvalStats.expired}`);

    // Show pending approvals if any
    if (approvalStats.pending > 0) {
      const pendingApprovals = approvalService.getPendingApprovals();
      statusLines.push('');
      statusLines.push('⏳ **Pending Approvals:**');
      pendingApprovals.forEach(approval => {
        const timeAgo = Math.round((Date.now() - approval.timestamp) / 1000);
        statusLines.push(`- ${approval.duckName} → ${approval.mcpServer}:${approval.toolName} (${timeAgo}s ago)`);
      });
    }

    // Configuration hints
    statusLines.push('');
    statusLines.push('💡 **Commands:**');
    statusLines.push('- `get_pending_approvals` - View pending approval requests');
    statusLines.push('- `approve_mcp_request` - Approve or deny requests');
    statusLines.push('- `ask_duck` - Chat with ducks (MCP functions auto-enabled)');

    return {
      content: [
        {
          type: 'text',
          text: statusLines.join('\n'),
        },
      ],
    };

  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Failed to get MCP status: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}