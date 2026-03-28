/**
 * Heat Router
 * /heat/route — ranked service list for a capability query.
 * Combined rank: 70% Heat score + 30% Twig description score.
 */

import type { AgentNode, ServiceNode, Interaction, RouteResult } from '../graph/types.js';
import { scoreService } from '../graph/scorer.js';
import { computePageRank } from '../graph/pagerank.js';

export interface RouteQuery {
  capability: string;     // "swap tokens on solana", "search recent news", etc.
  domain?: string;        // caller-specified or inferred from capability
  limit?: number;         // default 5
  callerAgentId?: string; // for personalized ranking (future)
}

const HEAT_WEIGHT = 0.70;
const TWIG_WEIGHT = 0.30;

// Simple domain inference from capability query
function inferDomain(capability: string): string {
  const text = capability.toLowerCase();
  if (/swap|token|defi|dex|wallet|sol|eth|usdc|bridge/.test(text)) return 'crypto-defi';
  if (/search|news|research|find|web|article/.test(text)) return 'research';
  if (/price|market|feed|rate|ticker/.test(text)) return 'data-feeds';
  if (/image|video|audio|generate|media/.test(text)) return 'media';
  if (/compute|run|execute|calculate|code/.test(text)) return 'computation';
  if (/email|message|send|notify/.test(text)) return 'communication';
  return 'general';
}

export function routeQuery(
  query: RouteQuery,
  services: ServiceNode[],
  agents: AgentNode[],
  interactions: Interaction[]
): RouteResult[] {
  const domain = query.domain ?? inferDomain(query.capability);
  const limit = query.limit ?? 5;

  // Filter services to relevant domain
  const candidates = services.filter(s =>
    !s.category || s.category === domain || s.category === 'general'
  );

  if (candidates.length === 0) {
    return [];
  }

  const agentRanks = new Map(
    computePageRank(agents, interactions, domain).map(r => [r.agentId, r.rank])
  );

  const results: RouteResult[] = candidates.map(service => {
    const heatScore = scoreService(
      service.id, agents, interactions, service.twigScore, domain
    );

    const twigScore = service.twigScore ?? 50;  // default 50 if unscored
    const combinedRank = Math.round(
      heatScore.score * HEAT_WEIGHT + twigScore * TWIG_WEIGHT
    );

    const serviceInteractions = interactions.filter(i => i.serviceId === service.id);
    const recentPayments = serviceInteractions.filter(
      i => i.type === 'x402_payment' &&
      Date.now() - new Date(i.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000
    ).length;

    // Count distinct high-karma endorsers
    const endorsers = new Set(
      serviceInteractions
        .filter(i => i.type === 'mention')
        .filter(i => (agentRanks.get(i.fromAgentId) ?? 0) > 0.1)
        .map(i => i.fromAgentId)
    );

    const rationale = buildRationale(heatScore.score, twigScore, endorsers.size, recentPayments, domain);

    return {
      serviceId: service.id,
      name: service.name,
      url: service.url,
      heatScore: heatScore.score,
      twigScore: service.twigScore,
      combinedRank,
      endorserCount: endorsers.size,
      recentCalls: recentPayments,
      rationale,
    };
  });

  return results
    .sort((a, b) => b.combinedRank - a.combinedRank)
    .slice(0, limit);
}

function buildRationale(
  heatScore: number,
  twigScore: number,
  endorsers: number,
  recentCalls: number,
  domain: string
): string {
  const parts: string[] = [];

  if (endorsers >= 5) parts.push(`endorsed by ${endorsers} high-karma ${domain} agents`);
  else if (endorsers > 0) parts.push(`${endorsers} agent endorsement${endorsers > 1 ? 's' : ''} in ${domain}`);

  if (recentCalls >= 10) parts.push(`${recentCalls} paid calls in last 30 days`);
  else if (recentCalls > 0) parts.push(`${recentCalls} recent x402 transaction${recentCalls > 1 ? 's' : ''}`);

  if (twigScore >= 70) parts.push('well-described tool');
  else if (twigScore < 40) parts.push('description needs work');

  if (parts.length === 0) {
    if (heatScore >= 60) return 'established service with solid graph presence';
    if (heatScore >= 30) return 'emerging service, limited graph data';
    return 'minimal data — use with caution';
  }

  return parts.join('; ');
}
