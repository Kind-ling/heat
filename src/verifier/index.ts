/**
 * Kindling Verifier — Main Module
 * 
 * Forensic claim-checking for explicit self-referential statements.
 * v1 scope: Verbatim and Summarized claims only.
 */

// Simple UUID generation without external dependency
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
import type {
  ClaimType,
  VerificationOutcome,
  VerifyCheckRequest,
  VerifyCheckResponse,
  VerifyStatusResponse,
  DriftResult,
  MODEL_VERSION,
  SIMILARITY_MODEL,
  SIMILARITY_THRESHOLD_EXACT,
  SIMILARITY_THRESHOLD_PARAPHRASE,
  SIMILARITY_THRESHOLD_NO_MATCH,
  MINIMUM_CLAIMS_FOR_STATS,
} from './types.js';
import {
  detectClaim,
  isV1Scope,
  canonicalize,
} from './detector.js';
import {
  detectDrift,
  calculateSimilarity,
} from './scorer.js';
import {
  searchTranscripts,
  getBestMatch,
  getEvidenceMetadata,
  hasEvidence,
  storeTranscript,
} from './retriever.js';

// Re-export for convenience
export * from './types.js';
export * from './detector.js';
export * from './scorer.js';
export * from './retriever.js';

// ============================================================================
// Verification Result Tracking
// ============================================================================

interface VerificationRecord {
  agent_id: string;
  timestamp: string;
  outcome: VerificationOutcome;
  claim_type: ClaimType;
}

const verificationHistory: Map<string, VerificationRecord[]> = new Map();

function recordVerification(
  agentId: string,
  outcome: VerificationOutcome,
  claimType: ClaimType
): void {
  const record: VerificationRecord = {
    agent_id: agentId,
    timestamp: new Date().toISOString(),
    outcome,
    claim_type: claimType,
  };

  const existing = verificationHistory.get(agentId) ?? [];
  verificationHistory.set(agentId, [...existing, record]);
}

// ============================================================================
// Main Verification Function
// ============================================================================

/**
 * Verify a claim against transcript evidence.
 */
export async function verifyCheck(request: VerifyCheckRequest): Promise<VerifyCheckResponse> {
  const requestId = uuidv4();
  const processedAt = new Date().toISOString();

  // Step 1: Detect claim type if not provided
  let claimType: ClaimType;
  if (request.claim.type) {
    claimType = request.claim.type;
  } else {
    const detection = detectClaim(request.claim.text);
    if (!isV1Scope(detection.type)) {
      // Out of v1 scope — return inconclusive
      return {
        outcome: 'inconclusive:insufficient',
        claim_type: 'verbatim', // Placeholder
        evidence: {
          sources: [],
          coverage: 'none',
          confidence: 0,
          confidence_basis: 'claim_out_of_v1_scope',
        },
        meta: {
          request_id: requestId,
          processed_at: processedAt,
          model_version: 'verifier-v1.0.0',
          similarity_model: 'text-embedding-3-small',
        },
      };
    }
    claimType = detection.type;
  }

  // Step 2: Check if we have evidence
  const agentId = request.subject ?? request.claimant;
  if (!hasEvidence(agentId)) {
    return {
      outcome: 'inconclusive:insufficient',
      claim_type: claimType,
      evidence: {
        sources: [],
        coverage: 'none',
        confidence: 0,
        confidence_basis: 'no_transcript_available',
      },
      meta: {
        request_id: requestId,
        processed_at: processedAt,
        model_version: 'verifier-v1.0.0',
        similarity_model: 'text-embedding-3-small',
      },
    };
  }

  // Step 3: Search for matching transcript
  const bestMatch = getBestMatch(
    agentId,
    request.claim.text,
    request.claim.timestamp
  );

  const evidenceMetadata = getEvidenceMetadata(agentId, request.evidence.transcript_id);

  // Step 4: Determine outcome based on similarity
  let outcome: VerificationOutcome;
  let drift: DriftResult | undefined;

  if (!bestMatch || bestMatch.similarity < 0.50) {
    outcome = 'unsupported:no_match';
  } else if (claimType === 'verbatim' && bestMatch.similarity >= 0.95) {
    outcome = 'supported:exact';
  } else if (bestMatch.similarity >= 0.85) {
    outcome = 'supported:paraphrase';
  } else {
    // Similarity between 0.50 and 0.85 — check for drift
    drift = detectDrift(bestMatch.text, request.claim.text);
    if (drift.detected) {
      outcome = 'unsupported:drift';
    } else {
      // No clear drift detected but similarity not high enough
      outcome = 'supported:paraphrase';
    }
  }

  // Record the verification
  recordVerification(agentId, outcome, claimType);

  // Build response
  const response: VerifyCheckResponse = {
    outcome,
    claim_type: claimType,
    evidence: evidenceMetadata,
    meta: {
      request_id: requestId,
      processed_at: processedAt,
      model_version: 'verifier-v1.0.0',
      similarity_model: 'text-embedding-3-small',
    },
  };

  if (drift && request.options?.return_drift_details !== false) {
    response.drift = drift;
  }

  if (bestMatch && request.options?.return_closest_match !== false) {
    response.closest_match = bestMatch;
  }

  return response;
}

// ============================================================================
// Status Function
// ============================================================================

/**
 * Get verification status/statistics for an agent.
 */
export function verifyStatus(agentId: string): VerifyStatusResponse {
  const records = verificationHistory.get(agentId) ?? [];

  // Calculate outcome counts
  const counts = {
    supported_exact: 0,
    supported_paraphrase: 0,
    unsupported_drift: 0,
    unsupported_no_match: 0,
    inconclusive: 0,
  };

  for (const record of records) {
    switch (record.outcome) {
      case 'supported:exact':
        counts.supported_exact++;
        break;
      case 'supported:paraphrase':
        counts.supported_paraphrase++;
        break;
      case 'unsupported:drift':
        counts.unsupported_drift++;
        break;
      case 'unsupported:no_match':
        counts.unsupported_no_match++;
        break;
      default:
        counts.inconclusive++;
    }
  }

  const total = records.length;
  const minimumMet = total >= 10;

  // Calculate rates with confidence intervals (Wilson score interval)
  const calculateRateWithCI = (successes: number, n: number): { value: number; ci_95: [number, number] } => {
    if (n === 0) return { value: 0, ci_95: [0, 0] };

    const p = successes / n;
    const z = 1.96; // 95% CI
    const denominator = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denominator;
    const spread = (z / denominator) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));

    return {
      value: Math.round(p * 1000) / 1000,
      ci_95: [
        Math.max(0, Math.round((center - spread) * 1000) / 1000),
        Math.min(1, Math.round((center + spread) * 1000) / 1000),
      ],
    };
  };

  const supported = counts.supported_exact + counts.supported_paraphrase;
  const drifted = counts.unsupported_drift;
  const withEvidence = total - counts.inconclusive;

  return {
    agent_id: agentId,
    observation_window_days: 30, // TODO: Calculate from actual data
    claims_evaluated: total,
    minimum_met: minimumMet,
    outcomes: counts,
    rates: {
      support_rate: calculateRateWithCI(supported, withEvidence),
      drift_rate: calculateRateWithCI(drifted, withEvidence),
      coverage_rate: calculateRateWithCI(withEvidence, total),
    },
    data_quality: {
      source: 'self_attestation_only',
      reliability: 'medium',
    },
  };
}

// ============================================================================
// Convenience Exports
// ============================================================================

export {
  detectClaim,
  isV1Scope,
  canonicalize,
  detectDrift,
  calculateSimilarity,
  storeTranscript,
  searchTranscripts,
  getBestMatch,
  getEvidenceMetadata,
  hasEvidence,
};
