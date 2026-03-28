/**
 * Heat PageRank
 * Karma-weighted PageRank on the Moltbook interaction graph.
 * Edge weight = source agent karma / 1000 (clamped 0.01–10).
 *
 * Runs in-memory on the indexed graph snapshot.
 * Domain-segmented: separate rank per domain context.
 */

import type { AgentNode, Interaction } from './types.js';

export interface PageRankResult {
  agentId: string;
  rank: number;      // 0-1 normalized
  domain?: string;
}

const DAMPING = 0.85;
const ITERATIONS = 50;
const MIN_WEIGHT = 0.01;
const MAX_WEIGHT = 10;

export function computePageRank(
  agents: AgentNode[],
  interactions: Interaction[],
  domain?: string
): PageRankResult[] {
  const filtered = domain
    ? interactions.filter(i => i.context === domain)
    : interactions;

  // Build adjacency: from → to[] with weights
  const graph = new Map<string, Array<{ to: string; weight: number }>>();
  const agentIds = new Set(agents.map(a => a.id));

  for (const interaction of filtered) {
    if (!interaction.toAgentId) continue;
    if (!agentIds.has(interaction.fromAgentId)) continue;
    if (!agentIds.has(interaction.toAgentId)) continue;

    const edges = graph.get(interaction.fromAgentId) ?? [];
    edges.push({ to: interaction.toAgentId, weight: interaction.weight });
    graph.set(interaction.fromAgentId, edges);
  }

  // Initialize ranks
  const ranks = new Map<string, number>();
  const n = agents.length;
  for (const agent of agents) {
    ranks.set(agent.id, 1 / n);
  }

  // Iterate
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const newRanks = new Map<string, number>();
    for (const agent of agents) {
      newRanks.set(agent.id, (1 - DAMPING) / n);
    }

    for (const [fromId, edges] of graph.entries()) {
      const fromRank = ranks.get(fromId) ?? 0;
      const totalWeight = edges.reduce((s, e) => s + e.weight, 0);
      if (totalWeight === 0) continue;

      for (const edge of edges) {
        const share = fromRank * DAMPING * (edge.weight / totalWeight);
        newRanks.set(edge.to, (newRanks.get(edge.to) ?? 0) + share);
      }
    }

    for (const [id, rank] of newRanks.entries()) {
      ranks.set(id, rank);
    }
  }

  // Normalize to 0-1
  const max = Math.max(...ranks.values());
  const results: PageRankResult[] = [];
  for (const [agentId, rank] of ranks.entries()) {
    results.push({
      agentId,
      rank: max > 0 ? rank / max : 0,
      domain,
    });
  }

  return results.sort((a, b) => b.rank - a.rank);
}

export function edgeWeight(karmaScore: number): number {
  const raw = karmaScore / 1000;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, raw));
}

export function computeServiceEndorsement(
  serviceId: string,
  interactions: Interaction[],
  agentRanks: Map<string, number>
): { endorserCount: number; weightedScore: number } {
  const mentions = interactions.filter(
    i => i.serviceId === serviceId && i.type === 'mention'
  );

  const endorsers = new Set<string>();
  let weightedScore = 0;

  for (const mention of mentions) {
    const rank = agentRanks.get(mention.fromAgentId) ?? 0;
    if (rank > 0.1) {  // only count meaningful endorsers
      endorsers.add(mention.fromAgentId);
      weightedScore += rank * mention.weight;
    }
  }

  return {
    endorserCount: endorsers.size,
    weightedScore: Math.min(100, weightedScore * 100),
  };
}
