#!/usr/bin/env node

// Test script for MCP interface (simulates Claude Desktop communication)
import 'dotenv/config';
import { spawn } from 'child_process';
import { Readable, Writable } from 'stream';

console.log('🦆 Testing MCP Rubber Duck via MCP Interface\n');

class MCPClient {
  constructor() {
    this.messageId = 0;
    this.responses = new Map();
  }

  start() {
    return new Promise((resolve, reject) => {
      // Spawn the MCP server as Claude Desktop would
      this.process = spawn('node', ['dist/index.js'], {
        env: {
          ...process.env,
          MCP_SERVER: 'true',
          LOG_LEVEL: 'error'
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error(`Server error: ${data}`);
      });

      this.process.on('error', reject);
      this.process.on('exit', (code) => {
        console.log(`Server exited with code ${code}`);
      });

      // Set up JSON-RPC communication
      this.setupCommunication();
      
      // Initialize the connection
      setTimeout(() => {
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }).then(resolve).catch(reject);
      }, 100);
    });
  }

  setupCommunication() {
    let buffer = '';
    
    this.process.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (e) {
            console.error('Failed to parse message:', line);
          }
        }
      }
    });
  }

  handleMessage(message) {
    if (message.id && this.responses.has(message.id)) {
      const { resolve, reject } = this.responses.get(message.id);
      this.responses.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = `msg_${++this.messageId}`;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      
      this.responses.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(request) + '\n');
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.responses.has(id)) {
          this.responses.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  async callTool(toolName, args) {
    return this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
  }

  async listTools() {
    return this.sendRequest('tools/list');
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

async function runMCPTests() {
  const client = new MCPClient();
  
  try {
    // Initialize connection
    console.log('📡 Initializing MCP connection...');
    const initResult = await client.start();
    console.log('✅ Connected to MCP server');
    console.log(`   Protocol version: ${initResult.protocolVersion}`);
    console.log(`   Server: ${initResult.serverInfo?.name || 'Unknown'} v${initResult.serverInfo?.version || 'Unknown'}\n`);

    // Test 1: List available tools
    console.log('📋 Test 1: List available tools');
    const toolsResult = await client.listTools();
    console.log(`Found ${toolsResult.tools.length} tools:`);
    for (const tool of toolsResult.tools) {
      console.log(`  - ${tool.name}: ${tool.description}`);
    }
    console.log();

    // Test 2: List ducks
    console.log('🦆 Test 2: List ducks via MCP');
    const ducksResult = await client.callTool('list_ducks', {
      check_health: false
    });
    console.log('Response received (truncated):', 
      ducksResult.content[0].text.substring(0, 200) + '...\n');

    // Test 3: Ask a duck
    console.log('💬 Test 3: Ask OpenAI via MCP');
    const askResult = await client.callTool('ask_duck', {
      prompt: 'What is MCP? Answer in one sentence.',
      provider: 'openai'
    });
    console.log('Response:', askResult.content[0].text.split('\n')[0] + '\n');

    // Test 4: List models
    console.log('📚 Test 4: List models via MCP');
    const modelsResult = await client.callTool('list_models', {
      provider: 'openai'
    });
    const modelLines = modelsResult.content[0].text.split('\n').slice(0, 10);
    console.log('First few models:', modelLines.join('\n') + '...\n');

    // Test 5: Compare ducks
    console.log('🔍 Test 5: Compare ducks via MCP');
    const compareResult = await client.callTool('compare_ducks', {
      prompt: 'Is water wet? Answer yes or no.'
    });
    console.log('Comparison started (truncated):', 
      compareResult.content[0].text.substring(0, 300) + '...\n');

    // Test 6: Error handling
    console.log('❌ Test 6: Error handling');
    try {
      await client.callTool('nonexistent_tool', {});
      console.log('ERROR: Should have thrown an error!');
    } catch (error) {
      console.log('✅ Correctly handled invalid tool error:', error.message);
    }
    console.log();

    // Test 7: Chat with context
    console.log('💬 Test 7: Stateful conversation via MCP');
    await client.callTool('chat_with_duck', {
      conversation_id: 'mcp-test',
      message: 'Remember this number: 42',
      provider: 'openai'
    });
    
    const chatResult = await client.callTool('chat_with_duck', {
      conversation_id: 'mcp-test',
      message: 'What number did I ask you to remember?'
    });
    console.log('Context test:', chatResult.content[0].text.split('\n')[0] + '\n');

    console.log('✅ All MCP interface tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    client.stop();
    process.exit(0);
  }
}

// Add timeout to prevent hanging
setTimeout(() => {
  console.error('Test timeout - forcefully exiting');
  process.exit(1);
}, 30000);

// Run the tests
runMCPTests().catch(console.error);