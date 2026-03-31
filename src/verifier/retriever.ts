/**
 * Kindling Verifier — Transcript Retriever
 * 
 * Retrieves and searches transcript evidence for claim verification.
 * v1: Self-attestation only. Platform integration is Phase 5.
 */

import type {
  TranscriptChunk,
  TranscriptMatch,
  EvidenceMetadata,
  EvidenceSource,
} from './types.js';
import { calculateSimilarity } from './scorer.js';
import { SIMILARITY_THRESHOLD_NO_MATCH } from './types.js';

// ============================================================================
// Transcript Storage (In-Memory for v1)
// ============================================================================

/**
 * In-memory transcript store.
 * TODO: Replace with persistent storage (PostgreSQL, etc.)
 */
const transcriptStore: Map<string, TranscriptChunk[]> = new Map();

/**
 * Store transcript chunks for an agent.
 */
export function storeTranscript(
  agentId: string,
  transcriptId: string,
  content: string,
  timestamp: string,
  options?: {
    sessionId?: string;
    counterpartyId?: string;
  }
): TranscriptChunk[] {
  const chunks = chunkTranscript(content, transcriptId, agentId, timestamp, options);
  
  const existing = transcriptStore.get(agentId) ?? [];
  transcriptStore.set(agentId, [...existing, ...chunks]);
  
  return chunks;
}

/**
 * Chunk transcript into searchable pieces.
 * Window: 500 tokens, Overlap: 100 tokens, sentence-aligned.
 */
function chunkTranscript(
  content: string,
  transcriptId: string,
  agentId: string,
  timestamp: string,
  options?: {
    sessionId?: string;
    counterpartyId?: string;
  }
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  const sentences = content.split(/(?<=[.!?])\s+/);
  
  const APPROX_TOKENS_PER_SENTENCE = 20;
  const TARGET_CHUNK_TOKENS = 500;
  const OVERLAP_SENTENCES = Math.floor(100 / APPROX_TOKENS_PER_SENTENCE);
  
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = sentence.split(/\s+/).length;

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;

    if (currentTokens >= TARGET_CHUNK_TOKENS || i === sentences.length - 1) {
      chunks.push({
        chunk_id: `${transcriptId}_chunk_${chunkIndex}`,
        transcript_id: transcriptId,
        agent_id: agentId,
        content: currentChunk.join(' '),
        timestamp,
        session_id: options?.sessionId,
        counterparty_id: options?.counterpartyId,
        hash: computeHash(currentChunk.join(' ')),
      });

      // Overlap: keep last N sentences for next chunk
      if (i < sentences.length - 1) {
        currentChunk = currentChunk.slice(-OVERLAP_SENTENCES);
        currentTokens = currentChunk.join(' ').split(/\s+/).length;
      } else {
        currentChunk = [];
        currentTokens = 0;
      }
      chunkIndex++;
    }
  }

  return chunks;
}

/**
 * Simple hash for tamper evidence.
 * TODO: Use crypto.subtle or node:crypto for SHA-256.
 */
function computeHash(content: string): string {
  // Simple hash for now
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `simple_${Math.abs(hash).toString(16)}`;
}

// ============================================================================
// Transcript Retrieval
// ============================================================================

/**
 * Search transcripts for content matching a claim.
 */
export function searchTranscripts(
  agentId: string,
  query: string,
  options?: {
    maxResults?: number;
    minSimilarity?: number;
    beforeTimestamp?: string;
  }
): TranscriptMatch[] {
  const chunks = transcriptStore.get(agentId) ?? [];
  const maxResults = options?.maxResults ?? 5;
  const minSimilarity = options?.minSimilarity ?? SIMILARITY_THRESHOLD_NO_MATCH;

  // Filter by timestamp if specified
  let relevantChunks = chunks;
  if (options?.beforeTimestamp) {
    const cutoff = new Date(options.beforeTimestamp).getTime();
    relevantChunks = chunks.filter(c => new Date(c.timestamp).getTime() < cutoff);
  }

  // Calculate similarity for each chunk
  const scored = relevantChunks.map(chunk => ({
    chunk,
    similarity: calculateSimilarity(query, chunk.content),
  }));

  // Sort by similarity, filter by threshold, take top N
  return scored
    .filter(s => s.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults)
    .map(s => ({
      text: s.chunk.content,
      similarity: s.similarity,
      timestamp: s.chunk.timestamp,
      chunk_id: s.chunk.chunk_id,
      source: 'self_attestation' as EvidenceSource,
    }));
}

/**
 * Get the best matching transcript chunk for a claim.
 */
export function getBestMatch(
  agentId: string,
  claim: string,
  beforeTimestamp?: string
): TranscriptMatch | null {
  const matches = searchTranscripts(agentId, claim, {
    maxResults: 1,
    beforeTimestamp,
  });

  return matches[0] ?? null;
}

// ============================================================================
// Evidence Metadata
// ============================================================================

/**
 * Calculate evidence metadata for an agent.
 */
export function getEvidenceMetadata(
  agentId: string,
  transcriptId?: string
): EvidenceMetadata {
  const chunks = transcriptStore.get(agentId) ?? [];

  if (chunks.length === 0) {
    return {
      sources: [],
      coverage: 'none',
      confidence: 0,
      confidence_basis: 'no_evidence',
    };
  }

  // Check coverage (simple heuristic based on chunk count)
  const relevantChunks = transcriptId
    ? chunks.filter(c => c.transcript_id === transcriptId)
    : chunks;

  const coverage = relevantChunks.length > 10 ? 'complete' :
                   relevantChunks.length > 0 ? 'partial' : 'none';

  return {
    sources: ['self_attestation'],
    coverage,
    transcript_hash: relevantChunks[0]?.hash,
    confidence: coverage === 'complete' ? 0.75 : coverage === 'partial' ? 0.50 : 0,
    confidence_basis: 'single_source_self_attestation',
  };
}

/**
 * Check if we have sufficient evidence for an agent.
 */
export function hasEvidence(agentId: string): boolean {
  const chunks = transcriptStore.get(agentId) ?? [];
  return chunks.length > 0;
}

/**
 * Get transcript coverage window for an agent.
 */
export function getCoverageWindow(agentId: string): { start: string; end: string } | null {
  const chunks = transcriptStore.get(agentId) ?? [];
  if (chunks.length === 0) return null;

  const timestamps = chunks.map(c => new Date(c.timestamp).getTime());
  return {
    start: new Date(Math.min(...timestamps)).toISOString(),
    end: new Date(Math.max(...timestamps)).toISOString(),
  };
}

// ============================================================================
// Admin Functions
// ============================================================================

/**
 * Clear all transcripts for an agent.
 */
export function clearTranscripts(agentId: string): void {
  transcriptStore.delete(agentId);
}

/**
 * Get transcript count for an agent.
 */
export function getTranscriptCount(agentId: string): number {
  return transcriptStore.get(agentId)?.length ?? 0;
}
