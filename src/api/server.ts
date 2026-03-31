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

const MCP_TOOLS = [
  {
    name: 'score',
    description: 'Score an agent or service by its on-chain/off-chain reputation. Returns a Heat score and trust dimensions. Free.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Agent or service ID' },
        type: { type: 'string', enum: ['agent', 'service'], description: 'Entity type' },
        domain: { type: 'string', description: 'Optional domain filter (e.g. crypto-defi, search)' },
      },
      required: ['id', 'type'],
    },
  },
  {
    name: 'route',
    description: 'Route a capability query to the highest-signal agents/services. Returns ranked list with scores.',
    inputSchema: {
      type: 'object',
      properties: {
        capability: { type: 'string', description: 'The capability or task to route (e.g. "summarize text", "price lookup")' },
        domain: { type: 'string', description: 'Optional domain hint' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['capability'],
    },
  },
  {
    name: 'trust',
    description: 'Get the full trust profile for an agent including reputation dimensions.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Agent ID' },
        domain: { type: 'string', description: 'Optional domain context' },
      },
      required: ['id'],
    },
  },
];

const MCP_SERVER_CARD = JSON.stringify({
  name: 'heat',
  title: 'Heat by Kind-ling',
  description: 'Signal indexing and trust scoring for the agent economy.',
  version: '0.1.0',
  homepage: 'https://kind-ling.com',
  tools: MCP_TOOLS,
}, null, 2);

async function handleMCP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  await new Promise(resolve => req.on('end', resolve));

  let rpc: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
  try {
    rpc = JSON.parse(body) as typeof rpc;
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
    return;
  }

  const { id, method, params } = rpc;

  const reply = (result: unknown) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  };
  const replyError = (code: number, message: string) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
  };

  if (method === 'initialize') {
    reply({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'heat', version: '0.1.0' } });
    return;
  }
  if (method === 'notifications/initialized') {
    res.writeHead(204); res.end(); return;
  }
  if (method === 'tools/list') {
    reply({ tools: MCP_TOOLS }); return;
  }
  if (method === 'tools/call') {
    const toolName = (params as { name?: string })?.name;
    const args = (params as { arguments?: Record<string, unknown> })?.arguments ?? {};
    const { agents, interactions, services } = await loadGraph();

    if (toolName === 'score') {
      const { id: agentId, type, domain } = args as { id: string; type: 'agent' | 'service'; domain?: string };
      if (!agentId || !type) { replyError(-32602, 'id and type required'); return; }
      const score = type === 'agent'
        ? scoreAgent(agentId, agents, interactions, domain)
        : scoreService(agentId, agents, interactions, undefined, domain);
      reply({ content: [{ type: 'text', text: JSON.stringify({ score, powered_by: 'Kindling Heat' }, null, 2) }] });
      return;
    }
    if (toolName === 'route') {
      const { capability, domain, limit } = args as { capability: string; domain?: string; limit?: number };
      if (!capability) { replyError(-32602, 'capability required'); return; }
      const results = routeQuery({ capability, domain, limit }, services, agents, interactions);
      reply({ content: [{ type: 'text', text: JSON.stringify({ results, count: results.length, powered_by: 'Kindling Heat' }, null, 2) }] });
      return;
    }
    if (toolName === 'trust') {
      const { id: agentId, domain } = args as { id: string; domain?: string };
      if (!agentId) { replyError(-32602, 'id required'); return; }
      const heatScore = scoreAgent(agentId, agents, interactions, domain);
      const agent = agents.find(a => a.id === agentId);
      const trust = agentToTrustResult(agentId, heatScore, agent);
      reply({ content: [{ type: 'text', text: JSON.stringify({ trust, powered_by: 'Kindling Heat' }, null, 2) }] });
      return;
    }
    replyError(-32601, `Unknown tool: ${toolName as string}`); return;
  }

  replyError(-32601, `Method not found: ${method}`);
}

const AGENT_JSON = JSON.stringify({
  name: 'Heat',
  description: 'Signal indexing and trust scoring for the agent economy. Route tasks to proven agents, verify callers, compose multi-agent workflows.',
  url: 'https://heat.kind-ling.com',
  provider: { organization: 'Kind-ling', url: 'https://kind-ling.com' },
  version: '0.1.0',
  capabilities: ['agent-scoring', 'trust-verification', 'query-routing', 'workflow-composition'],
  endpoints: [
    { path: '/heat/score', method: 'GET', description: 'Score an agent or service', price: 'free', params: { id: 'string', type: 'agent|service', domain: 'string?' } },
    { path: '/heat/route', method: 'POST', description: 'Route query to highest-signal agent', price: '$0.001 USDC on Base', input: { capability: 'string', domain: 'string?', limit: 'number?' } },
    { path: '/heat/trust', method: 'GET', description: 'Get trust profile for an agent', price: '$0.001 USDC on Base', params: { id: 'string' } },
    { path: '/heat/compose', method: 'POST', description: 'Compose multi-agent workflow', price: '$0.005 USDC on Base', input: { goal: 'string', agents: 'string[]?' } },
  ],
  x402: { supported: true, chain: 'base', token: 'USDC', payment_address: X402_WALLET },
  tags: ['agent-routing', 'trust-scoring', 'mcp', 'agent-economy', 'x402'],
}, null, 2);

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    res.end();
    return;
  }

  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;

    if (path === '/mcp' && req.method === 'POST') {
      await handleMCP(req, res);
    } else if (path === '/.well-known/mcp/server-card.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(MCP_SERVER_CARD);
    } else if (path === '/.well-known/agent.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(AGENT_JSON);
    } else if (path === '/health') {
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
