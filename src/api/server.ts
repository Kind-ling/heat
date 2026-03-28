/**
 * Heat API Server
 * Three endpoints:
 *   GET  /heat/score?id=<agentId|serviceId>&type=agent|service&domain=<domain>
 *   POST /heat/route  { capability, domain?, limit? }
 *   GET  /heat/trust?id=<agentId>
 *
 * /heat/score  — free (rate-limited at 10/min/IP)
 * /heat/route  — x402-gated ($0.001 USDC on Base)
 * /heat/trust  — x402-gated ($0.001 USDC on Base)
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { scoreAgent, scoreService, agentToTrustResult } from '../graph/scorer.js';
import { routeQuery } from '../oracle/router.js';
import { composeWorkflow } from '../oracle/composer.js';
import { loadGraph } from './store.js';

const PORT = parseInt(process.env['PORT'] ?? '3001');
const X402_WALLET = process.env['X402_WALLET'] ?? '0xB1e55EdD3176Ce9C9aF28F15b79e0c0eb8Fe51AA';
const RATE_LIMIT_MS = 6000;  // 10/min = 1 per 6s per IP

const rateLimits = new Map<string, number>();

function rateLimit(ip: string): boolean {
  const last = rateLimits.get(ip) ?? 0;
  if (Date.now() - last < RATE_LIMIT_MS) return false;
  rateLimits.set(ip, Date.now());
  return true;
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function payment402(res: ServerResponse, endpoint: string): void {
  res.writeHead(402, {
    'Content-Type': 'application/json',
    'X-Payment-Required': `x402; amount=1000; asset=USDC; chain=base; payTo=${X402_WALLET}`,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({
    error: 'Payment Required',
    x402: {
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: '1000',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: X402_WALLET,
      description: `Heat oracle: ${endpoint}`,
      disclosure: 'Kindling Heat oracle. First-party: Permanent Upper Class. No referral splits on routing decisions.',
    },
  }));
}

async function handleScore(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!rateLimit(ip)) {
    json(res, 429, { error: 'Rate limit: 10 requests/minute for free /heat/score' });
    return;
  }

  const id = url.searchParams.get('id');
  const type = url.searchParams.get('type') as 'agent' | 'service' | null;
  const domain = url.searchParams.get('domain') ?? undefined;

  if (!id || !type) {
    json(res, 400, { error: 'Required: ?id=<id>&type=agent|service' });
    return;
  }

  const { agents, interactions, services } = await loadGraph();

  if (type === 'agent') {
    const score = scoreAgent(id, agents, interactions, domain);
    json(res, 200, { score, endpoint: '/heat/score', powered_by: 'Kindling Heat' });
  } else {
    const service = services.find(s => s.id === id);
    const score = scoreService(id, agents, interactions, service?.twigScore, domain);
    json(res, 200, { score, endpoint: '/heat/score', powered_by: 'Kindling Heat' });
  }
}

async function handleRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Check x402 payment header
  const payment = req.headers['x-payment'] ?? req.headers['x-payment-proof'];
  if (!payment) {
    payment402(res, '/heat/route');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  await new Promise(resolve => req.on('end', resolve));

  let query: { capability?: string; domain?: string; limit?: number };
  try {
    query = JSON.parse(body) as typeof query;
  } catch {
    json(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (!query.capability) {
    json(res, 400, { error: 'Required: { capability: string }' });
    return;
  }

  const { agents, interactions, services } = await loadGraph();
  const results = routeQuery(
    { capability: query.capability, domain: query.domain, limit: query.limit },
    services, agents, interactions
  );

  json(res, 200, {
    results,
    capability: query.capability,
    domain: query.domain ?? 'auto-detected',
    count: results.length,
    powered_by: 'Kindling Heat',
  });
}

async function handleTrust(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const payment = req.headers['x-payment'] ?? req.headers['x-payment-proof'];
  if (!payment) {
    payment402(res, '/heat/trust');
    return;
  }

  const agentId = url.searchParams.get('id');
  const domain = url.searchParams.get('domain') ?? undefined;

  if (!agentId) {
    json(res, 400, { error: 'Required: ?id=<agentId>' });
    return;
  }

  const { agents, interactions } = await loadGraph();
  const heatScore = scoreAgent(agentId, agents, interactions, domain);
  const agent = agents.find(a => a.id === agentId);
  const trust = agentToTrustResult(agentId, heatScore, agent);

  json(res, 200, { trust, powered_by: 'Kindling Heat' });
}

async function handleCompose(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Paid: $0.005 per compose query (higher value than route/trust)
  const payment = req.headers['x-payment'] ?? req.headers['x-payment-proof'];
  if (!payment) {
    res.writeHead(402, {
      'Content-Type': 'application/json',
      'X-Payment-Required': `x402; amount=5000; asset=USDC; chain=base; payTo=${X402_WALLET}`,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({
      error: 'Payment Required',
      x402: {
        scheme: 'exact',
        network: 'base',
        maxAmountRequired: '5000',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        payTo: X402_WALLET,
        description: 'Heat oracle: /heat/compose — workflow intelligence',
        disclosure: 'Kindling Heat oracle. First-party: Permanent Upper Class. No referral splits on routing decisions.',
      },
    }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  await new Promise(resolve => req.on('end', resolve));

  let query: { intent?: string; context?: { latency?: string; budget?: string; domain?: string } };
  try {
    query = JSON.parse(body) as typeof query;
  } catch {
    json(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (!query.intent) {
    json(res, 400, { error: 'Required: { intent: string }' });
    return;
  }

  const { agents, interactions, services } = await loadGraph();
  const result = composeWorkflow(
    { intent: query.intent, context: query.context as Parameters<typeof composeWorkflow>[0]['context'] },
    services, agents, interactions
  );

  json(res, 200, { ...result, powered_by: 'Kindling Heat' });
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    res.end();
    return;
  }

  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;

    if (path === '/health') {
      json(res, 200, { status: 'ok', service: 'heat', version: '0.1.0' });
    } else if (path === '/heat/score' && req.method === 'GET') {
      await handleScore(req, res, url);
    } else if (path === '/heat/route' && req.method === 'POST') {
      await handleRoute(req, res);
    } else if (path === '/heat/trust' && req.method === 'GET') {
      await handleTrust(req, res, url);
    } else if (path === '/heat/compose' && req.method === 'POST') {
      await handleCompose(req, res);
    } else {
      json(res, 404, { error: 'Not found', endpoints: ['/heat/score', '/heat/route', '/heat/trust', '/heat/compose'] });
    }
  } catch (e) {
    console.error(e);
    json(res, 503, { error: 'Service temporarily unavailable' });
  }
});

server.listen(PORT, () => {
  console.log(`Heat oracle running on :${PORT}`);
});
