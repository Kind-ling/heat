/**
 * Heat Composer
 * /heat/compose — workflow intelligence.
 *
 * Given an intent + context, returns an ordered tool chain
 * with confidence, expected cost, and attribution.
 *
 * This is NOT tool selection. It's workflow generation:
 *   (intent, context) → [agent cluster] → [tool chain] → outcome score
 *
 * The unit of truth is workflow success under context,
 * not individual tool calls.
 */

import type { AgentNode, ServiceNode, Interaction } from '../graph/types.js';
import { routeQuery } from './router.js';

export interface ComposeQuery {
  intent: string;           // "evaluate token", "research a protocol", "execute a trade"
  context?: {
    latency?: 'low' | 'medium' | 'high';   // low = <500ms per step
    budget?: string;                        // max total USDC, e.g. "0.05"
    domain?: string;
    callerAgentId?: string;
  };
}

export interface WorkflowStep {
  serviceId: string;
  name: string;
  url: string;
  purpose: string;          // "price lookup", "sentiment analysis", etc.
  estimatedCost: string;    // USDC
  estimatedLatencyMs: number;
  heatScore: number;
  required: boolean;        // false = optional enrichment step
}

export interface ComposeResult {
  intent: string;
  domain: string;
  workflow: WorkflowStep[];
  confidence: number;        // 0-1: how well this workflow matches observed successful patterns
  expectedCostUSDC: string;
  expectedLatencyMs: number;
  successRate?: number;      // from historical workflow outcomes (null if no data)
  similarWorkflows: number;  // how many observed workflows matched this pattern
  rationale: string;
}

// Workflow templates: intent patterns → ordered step types
// These are seeded from observed high-karma agent workflows on Moltbook.
// Over time, these templates are replaced by learned patterns from /compose traffic.

interface WorkflowTemplate {
  intentPatterns: string[];
  domain: string;
  steps: Array<{
    purpose: string;
    serviceCategory: string;    // maps to ServiceNode.category or a tag
    required: boolean;
    estimatedCostUSDC: number;
    estimatedLatencyMs: number;
  }>;
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    intentPatterns: ['evaluate token', 'token analysis', 'should i buy', 'token research'],
    domain: 'crypto-defi',
    steps: [
      { purpose: 'price & market data', serviceCategory: 'data-feeds', required: true, estimatedCostUSDC: 0.001, estimatedLatencyMs: 200 },
      { purpose: 'on-chain activity', serviceCategory: 'crypto-defi', required: true, estimatedCostUSDC: 0.002, estimatedLatencyMs: 400 },
      { purpose: 'sentiment analysis', serviceCategory: 'research', required: false, estimatedCostUSDC: 0.005, estimatedLatencyMs: 800 },
      { purpose: 'risk scoring', serviceCategory: 'computation', required: false, estimatedCostUSDC: 0.003, estimatedLatencyMs: 300 },
    ],
  },
  {
    intentPatterns: ['research protocol', 'due diligence', 'protocol analysis', 'audit'],
    domain: 'research',
    steps: [
      { purpose: 'web research', serviceCategory: 'research', required: true, estimatedCostUSDC: 0.01, estimatedLatencyMs: 1000 },
      { purpose: 'social sentiment', serviceCategory: 'research', required: true, estimatedCostUSDC: 0.005, estimatedLatencyMs: 500 },
      { purpose: 'on-chain verification', serviceCategory: 'crypto-defi', required: false, estimatedCostUSDC: 0.002, estimatedLatencyMs: 300 },
    ],
  },
  {
    intentPatterns: ['execute trade', 'swap', 'buy token', 'sell token'],
    domain: 'crypto-defi',
    steps: [
      { purpose: 'price quote', serviceCategory: 'crypto-defi', required: true, estimatedCostUSDC: 0.001, estimatedLatencyMs: 150 },
      { purpose: 'liquidity check', serviceCategory: 'crypto-defi', required: true, estimatedCostUSDC: 0.001, estimatedLatencyMs: 150 },
      { purpose: 'execution', serviceCategory: 'crypto-defi', required: true, estimatedCostUSDC: 0.002, estimatedLatencyMs: 500 },
    ],
  },
  {
    intentPatterns: ['generate content', 'write post', 'create image', 'produce media'],
    domain: 'media',
    steps: [
      { purpose: 'research / context', serviceCategory: 'research', required: false, estimatedCostUSDC: 0.005, estimatedLatencyMs: 800 },
      { purpose: 'generation', serviceCategory: 'media', required: true, estimatedCostUSDC: 0.02, estimatedLatencyMs: 2000 },
    ],
  },
  {
    intentPatterns: ['answer question', 'fact check', 'verify claim', 'research'],
    domain: 'research',
    steps: [
      { purpose: 'web search', serviceCategory: 'research', required: true, estimatedCostUSDC: 0.01, estimatedLatencyMs: 800 },
      { purpose: 'synthesis', serviceCategory: 'computation', required: false, estimatedCostUSDC: 0.005, estimatedLatencyMs: 500 },
    ],
  },
];

function matchTemplate(intent: string): WorkflowTemplate | null {
  const lower = intent.toLowerCase();
  let best: WorkflowTemplate | null = null;
  let bestScore = 0;

  for (const template of WORKFLOW_TEMPLATES) {
    for (const pattern of template.intentPatterns) {
      const words = pattern.split(' ');
      const matches = words.filter(w => lower.includes(w)).length;
      const score = matches / words.length;
      if (score > bestScore) {
        bestScore = score;
        best = template;
      }
    }
  }

  return bestScore >= 0.4 ? best : null;
}

export function composeWorkflow(
  query: ComposeQuery,
  services: ServiceNode[],
  agents: AgentNode[],
  interactions: Interaction[]
): ComposeResult {
  const intent = query.intent;
  const budget = query.context?.budget ? parseFloat(query.context.budget) : Infinity;
  const lowLatency = query.context?.latency === 'low';

  const template = matchTemplate(intent);
  if (!template) {
    return fallbackWorkflow(intent, services, agents, interactions, query);
  }

  const steps: WorkflowStep[] = [];
  let totalCost = 0;
  let totalLatency = 0;

  for (const step of template.steps) {
    // Skip optional steps if budget is tight
    if (!step.required && totalCost + step.estimatedCostUSDC > budget * 0.8) continue;
    // Skip high-latency optional steps if low-latency requested
    if (!step.required && lowLatency && step.estimatedLatencyMs > 500) continue;

    // Find best service for this step category via router
    const candidates = routeQuery(
      { capability: step.purpose, domain: template.domain, limit: 1 },
      services.filter(s => s.category === step.serviceCategory || s.category === template.domain),
      agents,
      interactions
    );

    if (candidates.length === 0) {
      // No services for this step — skip optional, fail if required
      if (step.required) {
        return {
          intent,
          domain: template.domain,
          workflow: [],
          confidence: 0,
          expectedCostUSDC: '0',
          expectedLatencyMs: 0,
          similarWorkflows: 0,
          rationale: `Cannot compose: no services found for required step "${step.purpose}" in category "${step.serviceCategory}"`,
        };
      }
      continue;
    }

    const svc = candidates[0]!;
    steps.push({
      serviceId: svc.serviceId,
      name: svc.name,
      url: svc.url,
      purpose: step.purpose,
      estimatedCost: step.estimatedCostUSDC.toFixed(4),
      estimatedLatencyMs: step.estimatedLatencyMs,
      heatScore: svc.heatScore,
      required: step.required,
    });

    totalCost += step.estimatedCostUSDC;
    totalLatency += step.estimatedLatencyMs;
  }

  // Confidence: how well the template matched + data density
  const templateMatch = template.intentPatterns.some(p =>
    p.split(' ').every(w => intent.toLowerCase().includes(w))
  );
  const dataConfidence = Math.min(1, interactions.length / 100);
  const confidence = parseFloat(((templateMatch ? 0.7 : 0.5) + dataConfidence * 0.3).toFixed(2));

  return {
    intent,
    domain: template.domain,
    workflow: steps,
    confidence,
    expectedCostUSDC: totalCost.toFixed(4),
    expectedLatencyMs: totalLatency,
    similarWorkflows: countSimilarWorkflows(template.domain, interactions),
    rationale: buildComposeRationale(steps, confidence, template.domain),
  };
}

function fallbackWorkflow(
  intent: string,
  services: ServiceNode[],
  agents: AgentNode[],
  interactions: Interaction[],
  query: ComposeQuery
): ComposeResult {
  // Best-effort: infer domain, route single tool
  const candidates = routeQuery(
    { capability: intent, limit: 3 },
    services, agents, interactions
  );

  if (candidates.length === 0) {
    return {
      intent, domain: 'general', workflow: [],
      confidence: 0, expectedCostUSDC: '0', expectedLatencyMs: 0,
      similarWorkflows: 0,
      rationale: 'No matching services found for this intent.',
    };
  }

  const steps: WorkflowStep[] = candidates.slice(0, 2).map(c => ({
    serviceId: c.serviceId,
    name: c.name,
    url: c.url,
    purpose: intent,
    estimatedCost: '0.001',
    estimatedLatencyMs: 500,
    heatScore: c.heatScore,
    required: true,
  }));

  return {
    intent, domain: 'general',
    workflow: steps,
    confidence: 0.3,
    expectedCostUSDC: (steps.length * 0.001).toFixed(4),
    expectedLatencyMs: steps.length * 500,
    similarWorkflows: 0,
    rationale: 'No matching workflow template. Best-effort routing applied.',
  };
}

function countSimilarWorkflows(domain: string, interactions: Interaction[]): number {
  // Proxy: count distinct x402 payment chains in the domain
  return interactions.filter(i => i.type === 'x402_payment' && i.context === domain).length;
}

function buildComposeRationale(steps: WorkflowStep[], confidence: number, domain: string): string {
  const required = steps.filter(s => s.required).length;
  const optional = steps.filter(s => !s.required).length;
  const topScore = steps[0]?.heatScore ?? 0;

  return [
    `${steps.length}-step workflow (${required} required, ${optional} optional)`,
    `confidence ${(confidence * 100).toFixed(0)}%`,
    topScore > 50 ? `lead service Heat-scored ${topScore}` : 'limited Heat data for this domain',
  ].join('; ');
}
