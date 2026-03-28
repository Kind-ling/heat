/**
 * Heat Graph Store
 * In-process graph snapshot with periodic refresh from Postgres.
 * Starts with file-based JSON for MVP — migrates to DB when data grows.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AgentNode, ServiceNode, Interaction } from '../graph/types.js';

interface GraphSnapshot {
  agents: AgentNode[];
  services: ServiceNode[];
  interactions: Interaction[];
  snapshotAt: string;
}

const DATA_DIR = process.env['HEAT_DATA_DIR'] ?? join(process.env['HOME'] ?? '/tmp', '.heat', 'data');
const SNAPSHOT_FILE = join(DATA_DIR, 'graph.json');
const REFRESH_MS = 5 * 60 * 1000;  // refresh every 5 minutes

let cached: GraphSnapshot | null = null;
let lastRefresh = 0;

function emptyGraph(): GraphSnapshot {
  return {
    agents: [],
    services: [],
    interactions: [],
    snapshotAt: new Date().toISOString(),
  };
}

export async function loadGraph(): Promise<GraphSnapshot> {
  const now = Date.now();
  if (cached && now - lastRefresh < REFRESH_MS) {
    return cached;
  }

  if (existsSync(SNAPSHOT_FILE)) {
    try {
      const raw = readFileSync(SNAPSHOT_FILE, 'utf8');
      cached = JSON.parse(raw) as GraphSnapshot;
      lastRefresh = now;
      return cached;
    } catch {
      // fall through to empty
    }
  }

  cached = emptyGraph();
  lastRefresh = now;
  return cached;
}

export function saveGraph(snapshot: GraphSnapshot): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
  cached = snapshot;
  lastRefresh = Date.now();
}

export function appendInteractions(newInteractions: Interaction[]): void {
  const current = cached ?? emptyGraph();

  // Deduplicate by id
  const existing = new Set(current.interactions.map(i => i.id));
  const fresh = newInteractions.filter(i => !existing.has(i.id));

  const updated: GraphSnapshot = {
    ...current,
    interactions: [...current.interactions, ...fresh],
    snapshotAt: new Date().toISOString(),
  };

  saveGraph(updated);
}

export function upsertAgents(newAgents: AgentNode[]): void {
  const current = cached ?? emptyGraph();
  const agentMap = new Map(current.agents.map(a => [a.id, a]));

  for (const agent of newAgents) {
    agentMap.set(agent.id, agent);
  }

  const updated: GraphSnapshot = {
    ...current,
    agents: Array.from(agentMap.values()),
    snapshotAt: new Date().toISOString(),
  };

  saveGraph(updated);
}

export function upsertServices(newServices: ServiceNode[]): void {
  const current = cached ?? emptyGraph();
  const serviceMap = new Map(current.services.map(s => [s.id, s]));

  for (const service of newServices) {
    serviceMap.set(service.id, service);
  }

  const updated: GraphSnapshot = {
    ...current,
    services: Array.from(serviceMap.values()),
    snapshotAt: new Date().toISOString(),
  };

  saveGraph(updated);
}

export function graphStats(): { agents: number; services: number; interactions: number; snapshotAt: string } {
  const g = cached ?? emptyGraph();
  return {
    agents: g.agents.length,
    services: g.services.length,
    interactions: g.interactions.length,
    snapshotAt: g.snapshotAt,
  };
}
