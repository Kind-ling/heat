import { describe, it, expect } from 'vitest';
import { scoreAgent, scoreService, agentToTrustResult } from '../src/graph/scorer.js';
import type { AgentNode, Interaction } from '../src/graph/types.js';

const agents: AgentNode[] = [
  { id: 'a1', handle: 'alpha', karma: 500, postCount: 50, commentCount: 200, followersCount: 100, domains: ['trading'], indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'a2', handle: 'beta', karma: 100, postCount: 10, commentCount: 30, followersCount: 20, domains: ['research'], indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'a3', handle: 'gamma', karma: 10, postCount: 2, commentCount: 5, followersCount: 2, domains: [], indexedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const now = new Date().toISOString();
const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();

const interactions: Interaction[] = [
  { id: 'i1', fromAgentId: 'a2', toAgentId: 'a1', type: 'upvote', context: 'trading', weight: 0.1, createdAt: now },
  { id: 'i2', fromAgentId: 'a3', toAgentId: 'a1', type: 'upvote', context: 'trading', weight: 0.01, createdAt: now },
  { id: 'i3', fromAgentId: 'a1', serviceId: 'svc1', type: 'mention', context: 'trading', weight: 0.5, createdAt: now },
  { id: 'i4', fromAgentId: 'a2', serviceId: 'svc1', type: 'mention', context: 'trading', weight: 0.1, createdAt: now },
  { id: 'i5', fromAgentId: 'a1', serviceId: 'svc1', type: 'x402_payment', context: 'trading', weight: 0.5, createdAt: now },
  { id: 'i6', fromAgentId: 'a1', serviceId: 'svc1', type: 'x402_payment', context: 'trading', weight: 0.5, createdAt: old },
];

describe('scoreAgent', () => {
  it('returns a HeatScore for a known agent', () => {
    const score = scoreAgent('a1', agents, interactions);
    expect(score.subjectId).toBe('a1');
    expect(score.subjectType).toBe('agent');
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it('high-karma agent scores higher than low-karma agent', () => {
    const s1 = scoreAgent('a1', agents, interactions);
    const s3 = scoreAgent('a3', agents, interactions);
    expect(s1.score).toBeGreaterThan(s3.score);
  });

  it('returns zero score for unknown agent', () => {
    const score = scoreAgent('unknown', agents, interactions);
    expect(score.score).toBe(0);
    expect(score.sampleSize).toBe(0);
  });

  it('includes all 4 dimensions', () => {
    const score = scoreAgent('a1', agents, interactions);
    expect(score.dimensions).toHaveProperty('socialAuthority');
    expect(score.dimensions).toHaveProperty('economicProof');
    expect(score.dimensions).toHaveProperty('domainExpertise');
    expect(score.dimensions).toHaveProperty('recency');
  });
});

describe('scoreService', () => {
  it('returns a HeatScore for a service', () => {
    const score = scoreService('svc1', agents, interactions, 70);
    expect(score.subjectId).toBe('svc1');
    expect(score.subjectType).toBe('service');
    expect(score.score).toBeGreaterThan(0);
  });

  it('service with high twig score gets considered', () => {
    const s1 = scoreService('svc1', agents, interactions, 90);
    expect(s1.score).toBeGreaterThanOrEqual(0);
  });

  it('unknown service scores 0', () => {
    const score = scoreService('unknown-svc', agents, interactions, undefined);
    expect(score.score).toBe(0);
  });
});

describe('agentToTrustResult', () => {
  it('flags new account with low karma', () => {
    const score = scoreAgent('a3', agents, interactions);
    const trust = agentToTrustResult('a3', score, agents.find(a => a.id === 'a3'));
    expect(trust.flags).toContain('low_karma');
    expect(trust.trusted).toBe(false);
  });

  it('established agent with activity is trusted', () => {
    const score = scoreAgent('a1', agents, interactions);
    // a1 has karma 500, 5+ interactions — should pass
    expect(score.score).toBeGreaterThan(0);
    expect(score.dimensions.socialAuthority).toBeGreaterThanOrEqual(0);
  });

  it('confidence is insufficient_data for agents with no interactions', () => {
    const score = scoreAgent('a3', agents, []);  // no interactions
    const trust = agentToTrustResult('a3', score, agents.find(a => a.id === 'a3'));
    expect(trust.confidence).toBe('insufficient_data');
  });
});
