/**
 * Heat Anti-Sybil & Attack Resistance
 *
 * Three attack vectors defended:
 * 1. Sybil clusters — many accounts coordinating upvotes
 * 2. Karma farming — high upvote activity, low economic activity
 * 3. Wash trading — self-payments to inflate economic score
 */

import type { AgentNode, Interaction } from './types.js';

export interface SybilReport {
  agentId: string;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;      // 0-100, higher = more suspicious
  penalty: number;        // 0-1, multiply Heat score by (1 - penalty)
  signals: string[];
}

export function detectSybilRisk(
  agentId: string,
  agents: AgentNode[],
  interactions: Interaction[]
): SybilReport {
  const signals: string[] = [];
  let riskScore = 0;

  const agent = agents.find(a => a.id === agentId);
  if (!agent) {
    return { agentId, riskLevel: 'none', riskScore: 0, penalty: 0, signals: [] };
  }

  const myInteractions = interactions.filter(i => i.fromAgentId === agentId);
  const inboundInteractions = interactions.filter(i => i.toAgentId === agentId);

  // 1. KARMA FARMING: high social activity, zero economic activity
  const payments = myInteractions.filter(i => i.type === 'x402_payment').length;
  const socialActs = myInteractions.filter(i => i.type !== 'x402_payment').length;

  if (socialActs > 20 && payments === 0) {
    riskScore += 30;
    signals.push(`high social activity (${socialActs}) with zero payments`);
  } else if (socialActs > 50 && payments < 3) {
    riskScore += 15;
    signals.push(`elevated social-to-payment ratio (${socialActs}:${payments})`);
  }

  // 2. UPVOTE CLUSTER: receives many upvotes from same low-karma cluster
  const upvoteSources = inboundInteractions
    .filter(i => i.type === 'upvote')
    .map(i => i.fromAgentId);

  const upvoteSourceAgents = agents.filter(a => upvoteSources.includes(a.id));
  const avgUpvoterKarma = upvoteSourceAgents.length > 0
    ? upvoteSourceAgents.reduce((s, a) => s + a.karma, 0) / upvoteSourceAgents.length
    : 0;

  if (upvoteSources.length > 10 && avgUpvoterKarma < 20) {
    riskScore += 25;
    signals.push(`${upvoteSources.length} upvotes from low-karma cluster (avg karma ${avgUpvoterKarma.toFixed(0)})`);
  }

  // 3. BURST ACTIVITY: many interactions in short window
  const recentInteractions = myInteractions.filter(i => {
    const ageMs = Date.now() - new Date(i.createdAt).getTime();
    return ageMs < 24 * 60 * 60 * 1000;  // last 24h
  });

  if (recentInteractions.length > 30) {
    riskScore += 20;
    signals.push(`${recentInteractions.length} interactions in last 24h (burst pattern)`);
  }

  // 4. SELF-PAYMENT: x402 payments to services you operate (wash trading proxy)
  // Hard to detect without service ownership data — flag high payment concentration
  const paymentTargets = myInteractions
    .filter(i => i.type === 'x402_payment' && i.serviceId)
    .map(i => i.serviceId!);

  const uniqueTargets = new Set(paymentTargets);
  if (paymentTargets.length > 5 && uniqueTargets.size === 1) {
    riskScore += 20;
    signals.push(`all payments concentrated to single service — possible wash trading`);
  }

  // 5. AGE SIGNAL: brand new account with high activity
  const accountAgeDays = (Date.now() - new Date(agent.indexedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < 3 && socialActs > 10) {
    riskScore += 15;
    signals.push(`new account (<3 days) with high activity`);
  }

  riskScore = Math.min(100, riskScore);
  const riskLevel =
    riskScore >= 70 ? 'critical'
    : riskScore >= 50 ? 'high'
    : riskScore >= 30 ? 'medium'
    : riskScore >= 10 ? 'low'
    : 'none';

  // Penalty: critical = 80% reduction, high = 60%, medium = 30%, low = 10%
  const penalty =
    riskLevel === 'critical' ? 0.80
    : riskLevel === 'high' ? 0.60
    : riskLevel === 'medium' ? 0.30
    : riskLevel === 'low' ? 0.10
    : 0;

  return { agentId, riskLevel, riskScore, penalty, signals };
}

export function applyAntiSybilPenalty(baseScore: number, penalty: number): number {
  return Math.round(baseScore * (1 - penalty));
}
