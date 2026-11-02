#!/usr/bin/env node

// Test script for MCP Rubber Duck functionality
import 'dotenv/config';
import { RubberDuckServer } from './dist/server.js';
import { ConfigManager } from './dist/config/config.js';
import { ProviderManager } from './dist/providers/manager.js';
import { ConversationManager } from './dist/services/conversation.js';
import { HealthMonitor } from './dist/services/health.js';

// Import tools
import { askDuckTool } from './dist/tools/ask-duck.js';
import { listDucksTool } from './dist/tools/list-ducks.js';
import { listModelsTool } from './dist/tools/list-models.js';
import { compareDucksTool } from './dist/tools/compare-ducks.js';
import { duckCouncilTool } from './dist/tools/duck-council.js';
import { chatDuckTool } from './dist/tools/chat-duck.js';

console.log('🦆 Testing MCP Rubber Duck Functionality\n');
console.log('API Keys loaded from .env:');
console.log(`- OpenAI: ${process.env.OPENAI_API_KEY ? '✅ Found' : '❌ Missing'}`);
console.log(`- Gemini: ${process.env.GEMINI_API_KEY ? '✅ Found' : '❌ Missing'}\n`);

async function runTests() {
  try {
    // Initialize managers
    const configManager = new ConfigManager();
    const providerManager = new ProviderManager(configManager);
    const conversationManager = new ConversationManager();
    const healthMonitor = new HealthMonitor(providerManager);

    // Test 1: List all ducks
    console.log('📋 Test 1: List all ducks');
    const ducksResult = await listDucksTool(providerManager, healthMonitor, { check_health: false });
    console.log(ducksResult.content[0].text);
    console.log('\n---\n');

    // Test 2: Check health of all ducks
    console.log('🏥 Test 2: Health check');
    await healthMonitor.performHealthChecks();
    const healthyProviders = healthMonitor.getHealthyProviders();
    console.log(`Healthy providers: ${healthyProviders.join(', ')}`);
    console.log('\n---\n');

    // Test 3: List models for all providers
    console.log('📚 Test 3: List available models');
    const modelsResult = await listModelsTool(providerManager, {});
    console.log(modelsResult.content[0].text);
    console.log('\n---\n');

    // Test 4: Ask OpenAI
    console.log('🦆 Test 4: Ask OpenAI');
    try {
      const openaiResult = await askDuckTool(providerManager, {
        prompt: 'What is 2+2? Answer in one word.',
        provider: 'openai'
      });
      console.log(openaiResult.content[0].text);
    } catch (error) {
      console.error(`OpenAI error: ${error.message}`);
    }
    console.log('\n---\n');

    // Test 5: Ask Gemini
    console.log('🦆 Test 5: Ask Gemini');
    try {
      const geminiResult = await askDuckTool(providerManager, {
        prompt: 'What is 3+3? Answer in one word.',
        provider: 'google'
      });
      console.log(geminiResult.content[0].text);
    } catch (error) {
      console.error(`Gemini error: ${error.message}`);
    }
    console.log('\n---\n');

    // Test 6: Compare ducks
    console.log('🔍 Test 6: Compare ducks');
    try {
      const compareResult = await compareDucksTool(providerManager, {
        prompt: 'What is the capital of France? Answer in one word.'
      });
      console.log(compareResult.content[0].text);
    } catch (error) {
      console.error(`Compare error: ${error.message}`);
    }
    console.log('\n---\n');

    // Test 7: Duck council
    console.log('🏛️ Test 7: Duck council');
    try {
      const councilResult = await duckCouncilTool(providerManager, {
        prompt: 'What is the meaning of life? Answer in exactly 5 words.'
      });
      console.log(councilResult.content[0].text);
    } catch (error) {
      console.error(`Council error: ${error.message}`);
    }
    console.log('\n---\n');

    // Test 8: Chat with context
    console.log('💬 Test 8: Chat with context');
    try {
      // First message
      await chatDuckTool(providerManager, conversationManager, {
        conversation_id: 'test-chat',
        message: 'My name is Alice.',
        provider: 'openai'
      });
      
      // Second message using context
      const chatResult = await chatDuckTool(providerManager, conversationManager, {
        conversation_id: 'test-chat',
        message: 'What is my name?'
      });
      console.log(chatResult.content[0].text);
    } catch (error) {
      console.error(`Chat error: ${error.message}`);
    }
    console.log('\n---\n');

    // Test 9: Test specific model
    console.log('🎯 Test 9: Test specific model');
    try {
      const modelResult = await askDuckTool(providerManager, {
        prompt: 'Say hello',
        provider: 'openai',
        model: 'gpt-5.4-mini'
      });
      console.log(modelResult.content[0].text);
    } catch (error) {
      console.error(`Model test error: ${error.message}`);
    }

    console.log('\n✅ All tests completed!');

  } catch (error) {
    console.error('Fatal error:', error);
  }
  
  process.exit(0);
}

// Run tests
runTests().catch(console.error);