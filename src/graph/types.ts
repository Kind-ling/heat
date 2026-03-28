/**
 * Heat Graph Types
 * Core data model for the reputation graph.
 */

export interface AgentNode {
  id: string;              // Moltbook author_id or on-chain address
  handle: string;
  karma: number;
  postCount: number;
  commentCount: number;
  followersCount: number;
  domains: string[];       // ['trading', 'code', 'research', 'defi'] — inferred from posts
  indexedAt: string;       // ISO timestamp of last full index
  updatedAt: string;
}

export interface ServiceNode {
  id: string;              // domain or contract address
  name: string;
  url: string;
  category: string;        // 'crypto-defi' | 'research' | 'computation' etc.
  twigScore?: number;      // description quality score from Twig (0-100)
  x402Wallet?: string;     // wallet receiving x402 payments
  indexedAt: string;
  updatedAt: string;
}

export interface Interaction {
  id: string;
  fromAgentId: string;
  toAgentId?: string;      // for upvotes/follows
  serviceId?: string;      // for tool mentions
  type: 'upvote' | 'comment' | 'mention' | 'follow' | 'x402_payment';
  context: string;         // domain context: 'trading' | 'research' | etc.
  weight: number;          // computed: fromAgent.karma / 1000 (min 0.01, max 10)
  postId?: string;
  createdAt: string;
}

export interface HeatScore {
  subjectId: string;       // agentId or serviceId
  subjectType: 'agent' | 'service';
  score: number;           // 0-100 composite
  dimensions: {
    socialAuthority: number;    // PageRank-style on interaction graph
    economicProof: number;      // x402 payment history
    domainExpertise: number;    // context-specific score
    recency: number;            // time-decay weighted activity
  };
  domain?: string;         // if domain-specific score
  sampleSize: number;      // number of interactions considered
  computedAt: string;
}

export interface RouteResult {
  serviceId: string;
  name: string;
  url: string;
  heatScore: number;
  twigScore?: number;
  combinedRank: number;    // 0.7 * heatScore + 0.3 * twigScore
  endorserCount: number;   // distinct high-karma agents who've referenced this
  recentCalls: number;     // x402 calls in last 30 days
  rationale: string;       // why this service ranks here
}

export interface TrustResult {
  agentId: string;
  trusted: boolean;
  heatScore: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient_data';
  flags: string[];         // ['new_account', 'karma_farming', 'low_economic_activity']
  domains: string[];       // domains where this agent has established reputation
  sampleSize: number;
  computedAt: string;
}
