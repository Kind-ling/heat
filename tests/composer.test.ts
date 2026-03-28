import { describe, it, expect } from 'vitest';
import { composeWorkflow } from '../src/oracle/composer.js';
import type { AgentNode, ServiceNode, Interaction } from '../src/graph/types.js';

const agents: AgentNode[] = [
  { id: 'a1', handle: 'alpha', karma: 500, postCount: 50, commentCount: 200, followersCount: 100, domains: ['crypto-defi', 'trading'], indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'a2', handle: 'beta', karma: 200, postCount: 20, commentCount: 80, followersCount: 40, domains: ['research'], indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const services: ServiceNode[] = [
  { id: 'coingecko', name: 'CoinGecko', url: 'https://coingecko.com', category: 'data-feeds', twigScore: 75, indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'jupiter', name: 'Jupiter', url: 'https://jup.ag', category: 'crypto-defi', twigScore: 72, indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'exa', name: 'Exa', url: 'https://exa.ai', category: 'research', twigScore: 60, indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'gpu-bridge', name: 'GPU Bridge', url: 'https://gpubridge.io', category: 'computation', twigScore: 40, indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const now = new Date().toISOString();
const interactions: Interaction[] = [
  { id: 'i1', fromAgentId: 'a1', serviceId: 'coingecko', type: 'mention', context: 'crypto-defi', weight: 0.5, createdAt: now },
  { id: 'i2', fromAgentId: 'a1', serviceId: 'coingecko', type: 'x402_payment', context: 'crypto-defi', weight: 0.5, createdAt: now },
  { id: 'i3', fromAgentId: 'a2', serviceId: 'exa', type: 'mention', context: 'research', weight: 0.2, createdAt: now },
  { id: 'i4', fromAgentId: 'a1', serviceId: 'jupiter', type: 'mention', context: 'crypto-defi', weight: 0.5, createdAt: now },
  { id: 'i5', fromAgentId: 'a1', serviceId: 'jupiter', type: 'x402_payment', context: 'crypto-defi', weight: 0.5, createdAt: now },
];

describe('composeWorkflow', () => {
  it('returns a workflow for token evaluation intent', () => {
    const result = composeWorkflow(
      { intent: 'evaluate token', context: { budget: '0.05' } },
      services, agents, interactions
    );
    expect(result.workflow.length).toBeGreaterThan(0);
    expect(result.domain).toBe('crypto-defi');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('workflow steps have required fields', () => {
    const result = composeWorkflow(
      { intent: 'evaluate token' },
      services, agents, interactions
    );
    for (const step of result.workflow) {
      expect(step).toHaveProperty('serviceId');
      expect(step).toHaveProperty('purpose');
      expect(step).toHaveProperty('estimatedCost');
      expect(step).toHaveProperty('heatScore');
      expect(step).toHaveProperty('required');
    }
  });

  it('respects budget constraint — skips optional expensive steps', () => {
    const tight = composeWorkflow(
      { intent: 'evaluate token', context: { budget: '0.002' } },
      services, agents, interactions
    );
    const loose = composeWorkflow(
      { intent: 'evaluate token', context: { budget: '0.10' } },
      services, agents, interactions
    );
    // tight budget should have fewer or equal steps
    expect(tight.workflow.length).toBeLessThanOrEqual(loose.workflow.length);
  });

  it('low latency drops optional slow steps', () => {
    const lowLat = composeWorkflow(
      { intent: 'evaluate token', context: { latency: 'low' } },
      services, agents, interactions
    );
    // All steps should be either required or <500ms
    for (const step of lowLat.workflow) {
      if (!step.required) {
        expect(step.estimatedLatencyMs).toBeLessThanOrEqual(500);
      }
    }
  });

  it('returns expected cost and latency', () => {
    const result = composeWorkflow(
      { intent: 'evaluate token' },
      services, agents, interactions
    );
    expect(parseFloat(result.expectedCostUSDC)).toBeGreaterThan(0);
    expect(result.expectedLatencyMs).toBeGreaterThan(0);
  });

  it('handles unknown intent gracefully', () => {
    const result = composeWorkflow(
      { intent: 'do something completely unknown xyz123' },
      services, agents, interactions
    );
    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('confidence');
    expect(result.workflow).toBeDefined();
  });

  it('research intent uses research services', () => {
    const result = composeWorkflow(
      { intent: 'research protocol' },
      services, agents, interactions
    );
    expect(result.domain).toBe('research');
    const hasResearch = result.workflow.some(s => s.serviceId === 'exa');
    expect(hasResearch).toBe(true);
  });

  it('confidence is between 0 and 1', () => {
    const result = composeWorkflow(
      { intent: 'evaluate token' },
      services, agents, interactions
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
