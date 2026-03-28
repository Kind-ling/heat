/**
 * Heat Moltbook Indexer
 * Crawls Moltbook's public API to build the agent interaction graph.
 * Respects rate limits. Designed to run incrementally.
 */

import type { AgentNode, Interaction } from '../graph/types.js';
import { edgeWeight } from '../graph/pagerank.js';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

interface MoltbookPost {
  id: string;
  author_id: string;
  author_name: string;
  author_karma: number;
  content: string;
  upvotes: number;
  submolt: string;
  created_at: string;
  comments?: MoltbookComment[];
}

interface MoltbookComment {
  id: string;
  author_id: string;
  author_name: string;
  author_karma: number;
  content: string;
  upvotes: number;
  created_at: string;
}

interface MoltbookAgent {
  id: string;
  name: string;
  karma: number;
  post_count: number;
  comment_count: number;
  followers_count: number;
}

const SERVICE_PATTERNS = [
  /https?:\/\/[a-z0-9.-]+\.(workers\.dev|vercel\.app|railway\.app|modal\.run|fly\.dev)/gi,
  /https?:\/\/[a-z0-9.-]+\/(?:mcp|api\/v[0-9]|tools)/gi,
];

const DOMAIN_SIGNALS: Record<string, string[]> = {
  'crypto-defi': ['swap', 'token', 'defi', 'dex', 'wallet', 'sol', 'eth', 'usdc', 'on-chain', 'base'],
  'research': ['search', 'news', 'research', 'find', 'web', 'article', 'exa', 'perplexity'],
  'trading': ['alpha', 'signal', 'trade', 'position', 'entry', 'exit', 'chart', 'ta'],
  'code': ['code', 'github', 'deploy', 'build', 'typescript', 'python', 'script'],
  'data-feeds': ['price', 'market', 'feed', 'rate', 'ohlcv', 'ticker'],
};

function inferDomains(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(DOMAIN_SIGNALS)
    .filter(([, signals]) => signals.some(s => lower.includes(s)))
    .map(([domain]) => domain);
}

function extractServiceMentions(content: string): string[] {
  const urls: string[] = [];
  for (const pattern of SERVICE_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      try {
        const url = new URL(match[0]);
        urls.push(url.hostname);
      } catch {
        // ignore malformed URLs
      }
    }
  }
  return [...new Set(urls)];
}

export async function indexHotPosts(
  submolts: string[],
  apiKey: string,
  sinceIso?: string
): Promise<{ agents: AgentNode[]; interactions: Interaction[] }> {
  const agents = new Map<string, AgentNode>();
  const interactions: Interaction[] = [];

  const since = sinceIso ? new Date(sinceIso).getTime() : 0;

  for (const submolt of submolts) {
    try {
      const posts = await fetchPosts(submolt, apiKey);

      for (const post of posts) {
        // Skip old posts
        if (since && new Date(post.created_at).getTime() < since) continue;

        // Upsert author
        upsertAgent(agents, {
          id: post.author_id,
          handle: post.author_name,
          karma: post.author_karma,
          domains: inferDomains(post.content),
        });

        // Extract service mentions
        const services = extractServiceMentions(post.content);
        const context = inferDomains(post.content)[0] ?? 'general';

        for (const serviceId of services) {
          interactions.push({
            id: `mention-${post.id}-${serviceId}`,
            fromAgentId: post.author_id,
            serviceId,
            type: 'mention',
            context,
            weight: edgeWeight(post.author_karma),
            postId: post.id,
            createdAt: post.created_at,
          });
        }

        // Index comments
        if (post.comments) {
          for (const comment of post.comments) {
            if (since && new Date(comment.created_at).getTime() < since) continue;

            upsertAgent(agents, {
              id: comment.author_id,
              handle: comment.author_name,
              karma: comment.author_karma,
              domains: inferDomains(comment.content),
            });

            // Comment = endorsement of the post author
            interactions.push({
              id: `comment-${comment.id}`,
              fromAgentId: comment.author_id,
              toAgentId: post.author_id,
              type: 'comment',
              context: inferDomains(post.content)[0] ?? 'general',
              weight: edgeWeight(comment.author_karma),
              postId: post.id,
              createdAt: comment.created_at,
            });

            // Service mentions in comments
            for (const serviceId of extractServiceMentions(comment.content)) {
              interactions.push({
                id: `comment-mention-${comment.id}-${serviceId}`,
                fromAgentId: comment.author_id,
                serviceId,
                type: 'mention',
                context,
                weight: edgeWeight(comment.author_karma) * 0.7, // comments slightly less weight
                postId: post.id,
                createdAt: comment.created_at,
              });
            }
          }
        }
      }

      // Rate limit: 1 req/sec
      await sleep(1000);
    } catch (e) {
      console.error(`Failed to index ${submolt}:`, e);
    }
  }

  return {
    agents: Array.from(agents.values()),
    interactions,
  };
}

function upsertAgent(
  map: Map<string, AgentNode>,
  data: { id: string; handle: string; karma: number; domains: string[] }
): void {
  const existing = map.get(data.id);
  if (existing) {
    // Merge domains
    existing.domains = [...new Set([...existing.domains, ...data.domains])];
    existing.karma = Math.max(existing.karma, data.karma);
    existing.updatedAt = new Date().toISOString();
  } else {
    map.set(data.id, {
      id: data.id,
      handle: data.handle,
      karma: data.karma,
      postCount: 0,
      commentCount: 0,
      followersCount: 0,
      domains: data.domains,
      indexedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

async function fetchPosts(submolt: string, apiKey: string): Promise<MoltbookPost[]> {
  const res = await fetch(`${MOLTBOOK_API}/submolts/${submolt}/posts?sort=hot&limit=50`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];
  const data = await res.json() as { posts?: MoltbookPost[] };
  return data.posts ?? [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
