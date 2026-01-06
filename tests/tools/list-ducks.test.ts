import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { listDucksTool } from '../../src/tools/list-ducks.js';
import { ProviderManager } from '../../src/providers/manager.js';
import { HealthMonitor } from '../../src/services/health.js';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/providers/manager.js');
jest.mock('../../src/services/health.js');

describe('listDucksTool', () => {
  let mockProviderManager: jest.Mocked<ProviderManager>;
  let mockHealthMonitor: jest.Mocked<HealthMonitor>;

  const mockProviders = [
    {
      name: 'openai',
      info: {
        nickname: 'OpenAI Duck',
        model: 'gpt-4',
        baseURL: 'https://api.openai.com/v1',
        hasApiKey: true,
      },
    },
    {
      name: 'groq',
      info: {
        nickname: 'Groq Duck',
        model: 'llama-3.1-70b',
        baseURL: 'https://api.groq.com/openai/v1',
        hasApiKey: true,
      },
    },
  ];

  beforeEach(() => {
    mockProviderManager = {
      getAllProviders: jest.fn().mockReturnValue(mockProviders),
    } as unknown as jest.Mocked<ProviderManager>;

    mockHealthMonitor = {
      performHealthChecks: jest.fn(),
    } as unknown as jest.Mocked<HealthMonitor>;
  });

  it('should list all ducks without health check', async () => {
    const result = await listDucksTool(mockProviderManager, mockHealthMonitor, {});

    expect(mockProviderManager.getAllProviders).toHaveBeenCalled();
    expect(mockHealthMonitor.performHealthChecks).not.toHaveBeenCalled();

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Found 2 duck(s)');
    expect(result.content[0].text).toContain('OpenAI Duck');
    expect(result.content[0].text).toContain('Groq Duck');
  });

  it('should list ducks with health check when requested', async () => {
    mockHealthMonitor.performHealthChecks.mockResolvedValue([
      {
        provider: 'openai',
        healthy: true,
        latency: 150,
        lastCheck: new Date(),
      },
      {
        provider: 'groq',
        healthy: false,
        lastCheck: new Date(),
        error: 'Connection failed',
      },
    ]);

    const result = await listDucksTool(mockProviderManager, mockHealthMonitor, {
      check_health: true,
    });

    expect(mockHealthMonitor.performHealthChecks).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Healthy');
    expect(result.content[0].text).toContain('Unhealthy');
    expect(result.content[0].text).toContain('150ms');
    expect(result.content[0].text).toContain('Connection failed');
  });

  it('should show unknown status emoji for unchecked providers', async () => {
    const result = await listDucksTool(mockProviderManager, mockHealthMonitor, {
      check_health: false,
    });

    // Without health check, status should be unknown (❓)
    expect(result.content[0].text).toContain('❓');
  });

  it('should show healthy count in summary', async () => {
    mockHealthMonitor.performHealthChecks.mockResolvedValue([
      {
        provider: 'openai',
        healthy: true,
        latency: 150,
        lastCheck: new Date(),
      },
      {
        provider: 'groq',
        healthy: true,
        latency: 80,
        lastCheck: new Date(),
      },
    ]);

    const result = await listDucksTool(mockProviderManager, mockHealthMonitor, {
      check_health: true,
    });

    expect(result.content[0].text).toContain('2/2 ducks are healthy');
  });

  it('should handle empty provider list', async () => {
    mockProviderManager.getAllProviders.mockReturnValue([]);

    const result = await listDucksTool(mockProviderManager, mockHealthMonitor, {});

    expect(result.content[0].text).toContain('Found 0 duck(s)');
    expect(result.content[0].text).toContain('0/0 ducks are healthy');
  });

  it('should display provider without API key correctly', async () => {
    mockProviderManager.getAllProviders.mockReturnValue([
      {
        name: 'ollama',
        info: {
          nickname: 'Ollama Duck',
          model: 'llama3',
          baseURL: 'http://localhost:11434/v1',
          hasApiKey: false,
        },
      },
    ]);

    const result = await listDucksTool(mockProviderManager, mockHealthMonitor, {});

    expect(result.content[0].text).toContain('Not required');
  });
});
