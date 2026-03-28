import { describe, it, expect } from 'vitest';
import { routeQuery } from '../src/oracle/router.js';
import type { AgentNode, ServiceNode, Interaction } from '../src/graph/types.js';

const agents: AgentNode[] = [
  { id: 'a1', handle: 'alpha', karma: 500, postCount: 50, commentCount: 200, followersCount: 100, domains: ['crypto-defi'], indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'a2', handle: 'beta', karma: 200, postCount: 20, commentCount: 80, followersCount: 40, domains: ['crypto-defi'], indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const services: ServiceNode[] = [
  { id: 'jupiter.ag', name: 'Jupiter', url: 'https://jup.ag', category: 'crypto-defi', twigScore: 72, indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'raydium.io', name: 'Raydium', url: 'https://raydium.io', category: 'crypto-defi', twigScore: 45, indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'exa.ai', name: 'Exa', url: 'https://exa.ai', category: 'research', twigScore: 60, indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const now = new Date().toISOString();

const interactions: Interaction[] = [
  { id: 'i1', fromAgentId: 'a1', serviceId: 'jupiter.ag', type: 'mention', context: 'crypto-defi', weight: 0.5, createdAt: now },
  { id: 'i2', fromAgentId: 'a2', serviceId: 'jupiter.ag', type: 'mention', context: 'crypto-defi', weight: 0.2, createdAt: now },
  { id: 'i3', fromAgentId: 'a1', serviceId: 'jupiter.ag', type: 'x402_payment', context: 'crypto-defi', weight: 0.5, createdAt: now },
  { id: 'i4', fromAgentId: 'a1', serviceId: 'raydium.io', type: 'mention', context: 'crypto-defi', weight: 0.5, createdAt: now },
];

describe('routeQuery', () => {
  it('returns ranked services for a capability query', () => {
    const results = routeQuery(
      { capability: 'swap tokens on solana' },
      services, agents, interactions
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('serviceId');
    expect(results[0]).toHaveProperty('combinedRank');
    expect(results[0]).toHaveProperty('heatScore');
    expect(results[0]).toHaveProperty('rationale');
  });

  it('ranks jupiter above raydium (more endorsements + payments + better twig)', () => {
    const results = routeQuery(
      { capability: 'swap tokens on solana' },
      services, agents, interactions
    );
    const jupiterIdx = results.findIndex(r => r.serviceId === 'jupiter.ag');
    const raydiumIdx = results.findIndex(r => r.serviceId === 'raydium.io');
    if (jupiterIdx !== -1 && raydiumIdx !== -1) {
      expect(jupiterIdx).toBeLessThan(raydiumIdx);
    }
  });

  it('respects domain filtering — exa should not appear for defi query', () => {
    const results = routeQuery(
      { capability: 'swap tokens on solana', domain: 'crypto-defi' },
      services, agents, interactions
    );
    const exaResult = results.find(r => r.serviceId === 'exa.ai');
    expect(exaResult).toBeUndefined();
  });

  it('respects limit parameter', () => {
    const results = routeQuery(
      { capability: 'swap tokens', limit: 1 },
      services, agents, interactions
    );
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('returns empty array when no services match domain', () => {
    const results = routeQuery(
      { capability: 'send email', domain: 'communication' },
      services, agents, interactions
    );
    expect(results.length).toBe(0);
  });

  it('combined rank is 70% heat + 30% twig', () => {
    const results = routeQuery(
      { capability: 'swap tokens' },
      services, agents, interactions
    );
    for (const r of results) {
      const expected = Math.round(r.heatScore * 0.7 + (r.twigScore ?? 50) * 0.3);
      expect(r.combinedRank).toBe(expected);
    }
  });
});
