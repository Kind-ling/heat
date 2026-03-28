/**
 * Heat Scorer
 * Computes HeatScore for agents and services.
 * Composite of: socialAuthority (40%), economicProof (30%), domainExpertise (20%), recency (10%)
 */

import type { AgentNode, Interaction, HeatScore, TrustResult } from './types.js';
import { computePageRank, computeServiceEndorsement, edgeWeight } from './pagerank.js';

const WEIGHTS = {
  socialAuthority: 0.40,
  economicProof: 0.30,
  domainExpertise: 0.20,
  recency: 0.10,
};

// Decay: interactions older than 30 days get half weight; 90 days: quarter weight
function recencyDecay(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 7) return 1.0;
  if (ageDays < 30) return 0.8;
  if (ageDays < 90) return 0.5;
  return 0.25;
}

export function scoreAgent(
  agentId: string,
  agents: AgentNode[],
  interactions: Interaction[],
  domain?: string
): HeatScore {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) {
    return nullScore(agentId, 'agent', domain);
  }

  // Social authority via PageRank
  const ranks = computePageRank(agents, interactions, domain);
  const rankEntry = ranks.find(r => r.agentId === agentId);
  const socialAuthority = Math.round((rankEntry?.rank ?? 0) * 100);

  // Economic proof: x402 payments sent (agent is a real buyer)
  const payments = interactions.filter(
    i => i.fromAgentId === agentId && i.type === 'x402_payment'
  );
  const economicProof = Math.min(100, payments.length * 10);

  // Domain expertise: proportion of interactions in target domain
  const myInteractions = interactions.filter(i => i.fromAgentId === agentId);
  const domainInteractions = domain
    ? myInteractions.filter(i => i.context === domain)
    : myInteractions;
  const domainExpertise = myInteractions.length > 0
    ? Math.round((domainInteractions.length / myInteractions.length) * 100)
    : 0;

  // Recency: weighted average decay of recent interactions
  const recentInteractions = myInteractions.slice(-20);
  const recency = recentInteractions.length > 0
    ? Math.round(
        recentInteractions.reduce((s, i) => s + recencyDecay(i.createdAt), 0)
        / recentInteractions.length * 100
      )
    : 0;

  const score = Math.round(
    socialAuthority * WEIGHTS.socialAuthority +
    economicProof * WEIGHTS.economicProof +
    domainExpertise * WEIGHTS.domainExpertise +
    recency * WEIGHTS.recency
  );

  return {
    subjectId: agentId,
    subjectType: 'agent',
    score,
    dimensions: { socialAuthority, economicProof, domainExpertise, recency },
    domain,
    sampleSize: myInteractions.length,
    computedAt: new Date().toISOString(),
  };
}

export function agentToTrustResult(
  agentId: string,
  heatScore: HeatScore,
  agent?: AgentNode
): TrustResult {
  const flags: string[] = [];

  if (!agent) flags.push('unknown_agent');
  else {
    if (agent.karma <= 10) flags.push('low_karma');
    if (agent.postCount < 3) flags.push('new_account');
  }

  if (heatScore.dimensions.economicProof < 20) flags.push('low_economic_activity');
  if (heatScore.sampleSize < 5) flags.push('insufficient_interactions');
  if (heatScore.dimensions.socialAuthority < 10 && heatScore.sampleSize > 10) {
    flags.push('potential_karma_farming');
  }

  const confidence =
    heatScore.sampleSize >= 20 ? 'high'
    : heatScore.sampleSize >= 5 ? 'medium'
    : heatScore.sampleSize >= 2 ? 'low'
    : 'insufficient_data';

  return {
    agentId,
    trusted: heatScore.score >= 30 && flags.filter(f => f !== 'low_economic_activity').length === 0,
    heatScore: heatScore.score,
    confidence,
    flags,
    domains: agent?.domains ?? [],
    sampleSize: heatScore.sampleSize,
    computedAt: heatScore.computedAt,
  };
}

export function scoreService(
  serviceId: string,
  agents: AgentNode[],
  interactions: Interaction[],
  twigScore?: number,
  domain?: string
): HeatScore {
  const ranks = computePageRank(agents, interactions, domain);
  const agentRanks = new Map(ranks.map(r => [r.agentId, r.rank]));

  const { endorserCount, weightedScore } = computeServiceEndorsement(
    serviceId, interactions, agentRanks
  );

  // Economic proof: x402 payments TO this service
  const payments = interactions.filter(
    i => i.serviceId === serviceId && i.type === 'x402_payment'
  );
  const economicProof = Math.min(100, payments.length * 5);

  // Recency
  const serviceInteractions = interactions.filter(i => i.serviceId === serviceId);
  const recent = serviceInteractions.slice(-10);
  const recency = recent.length > 0
    ? Math.round(
        recent.reduce((s, i) => s + recencyDecay(i.createdAt), 0) / recent.length * 100
      )
    : 0;

  // Domain expertise: how concentrated is usage in this domain?
  const domainMentions = domain
    ? serviceInteractions.filter(i => i.context === domain).length
    : serviceInteractions.length;
  const domainExpertise = serviceInteractions.length > 0
    ? Math.round((domainMentions / serviceInteractions.length) * 100)
    : 0;

  // Social authority = endorsement score
  const socialAuthority = Math.round(weightedScore);

  const score = Math.round(
    socialAuthority * WEIGHTS.socialAuthority +
    economicProof * WEIGHTS.economicProof +
    domainExpertise * WEIGHTS.domainExpertise +
    recency * WEIGHTS.recency
  );

  return {
    subjectId: serviceId,
    subjectType: 'service',
    score,
    dimensions: { socialAuthority, economicProof, domainExpertise, recency },
    domain,
    sampleSize: serviceInteractions.length,
    computedAt: new Date().toISOString(),
  };
}

function nullScore(id: string, type: 'agent' | 'service', domain?: string): HeatScore {
  return {
    subjectId: id,
    subjectType: type,
    score: 0,
    dimensions: { socialAuthority: 0, economicProof: 0, domainExpertise: 0, recency: 0 },
    domain,
    sampleSize: 0,
    computedAt: new Date().toISOString(),
  };
}
