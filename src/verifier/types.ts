/**
 * Kindling Verifier Types
 * 
 * Decision semantics, claim classification, and drift categories
 * per Kindling Verifier Schema v1.0
 */

// ============================================================================
// Claim Classification
// ============================================================================

/**
 * v1 supports only explicit memory claims: Verbatim and Summarized
 * Implicit and Undeclared are Phase 2+ / Research
 */
export type ClaimType = 'verbatim' | 'summarized';

export type ClaimTypeExtended = ClaimType | 'implicit' | 'undeclared' | 'out_of_scope';

export interface ClaimDetectionResult {
  detected: boolean;
  type: ClaimTypeExtended;
  confidence: number;
  matchedPattern?: string;
  extractedQuote?: string;  // For verbatim claims, the quoted portion
}

// ============================================================================
// Decision Semantics
// ============================================================================

/**
 * Six-outcome decision semantics
 */
export type VerificationOutcome =
  | 'supported:exact'
  | 'supported:paraphrase'
  | 'unsupported:drift'
  | 'unsupported:no_match'
  | 'inconclusive:insufficient'
  | 'inconclusive:conflict';

export function isSupported(outcome: VerificationOutcome): boolean {
  return outcome.startsWith('supported:');
}

export function isUnsupported(outcome: VerificationOutcome): boolean {
  return outcome.startsWith('unsupported:');
}

export function isInconclusive(outcome: VerificationOutcome): boolean {
  return outcome.startsWith('inconclusive:');
}

// ============================================================================
// Material Drift Categories
// ============================================================================

/**
 * Material drift categories per the rubric
 * These describe WHAT changed, not WHETHER it matters
 */
export type DriftCategory =
  | 'temporal_shift'       // Deadline/timeframe changed
  | 'confidence_shift'     // Hedging removed or certainty added
  | 'scope_shift'          // Quantity or deliverable changed
  | 'conditionality_removed' // Conditions present in source absent in claim
  | 'precision_added'      // Specifics added beyond source
  | 'actor_shift';         // Speaker or addressee changed

export interface DriftDetail {
  category: DriftCategory;
  source: string | null;   // What was in the original
  claim: string | null;    // What was in the claim
  description?: string;    // Human-readable explanation
}

export interface DriftResult {
  detected: boolean;
  categories: DriftCategory[];
  details: DriftDetail[];
}

// ============================================================================
// Transcript / Evidence
// ============================================================================

export type EvidenceSource = 'self_attestation' | 'cooperative' | 'platform';

export interface TranscriptChunk {
  chunk_id: string;
  transcript_id: string;
  agent_id: string;
  content: string;
  timestamp: string;  // ISO 8601
  session_id?: string;
  counterparty_id?: string;
  hash?: string;  // SHA-256 for tamper evidence
}

export interface TranscriptMatch {
  text: string;
  similarity: number;
  timestamp: string;
  chunk_id: string;
  source: EvidenceSource;
}

export interface EvidenceMetadata {
  sources: EvidenceSource[];
  coverage: 'complete' | 'partial' | 'none';
  transcript_hash?: string;
  confidence: number;
  confidence_basis: string;
}

// ============================================================================
// API Request / Response
// ============================================================================

export interface VerifyCheckRequest {
  claim: {
    text: string;
    type?: ClaimType;  // If not provided, will be detected
    timestamp: string;
  };
  claimant: string;
  subject?: string;  // Defaults to claimant
  context?: string;  // Session or conversation ID
  evidence: {
    source: EvidenceSource;
    transcript_id: string;
  };
  options?: {
    return_closest_match?: boolean;
    return_drift_details?: boolean;
  };
}

export interface VerifyCheckResponse {
  outcome: VerificationOutcome;
  claim_type: ClaimType;
  drift?: DriftResult;
  closest_match?: TranscriptMatch;
  evidence: EvidenceMetadata;
  meta: {
    request_id: string;
    processed_at: string;
    model_version: string;
    similarity_model: string;
  };
}

export interface VerifyStatusRequest {
  agent_id: string;
}

export interface OutcomeCounts {
  supported_exact: number;
  supported_paraphrase: number;
  unsupported_drift: number;
  unsupported_no_match: number;
  inconclusive: number;
}

export interface RateWithCI {
  value: number;
  ci_95: [number, number];
}

export interface VerifyStatusResponse {
  agent_id: string;
  observation_window_days: number;
  claims_evaluated: number;
  minimum_met: boolean;  // At least 10 claims required
  outcomes: OutcomeCounts;
  rates: {
    support_rate: RateWithCI;
    drift_rate: RateWithCI;
    coverage_rate: RateWithCI;
  };
  data_quality: {
    source: string;
    reliability: 'low' | 'medium' | 'high';
  };
}

// ============================================================================
// Constants
// ============================================================================

export const MINIMUM_CLAIMS_FOR_STATS = 10;
export const SIMILARITY_THRESHOLD_EXACT = 0.95;
export const SIMILARITY_THRESHOLD_PARAPHRASE = 0.85;
export const SIMILARITY_THRESHOLD_NO_MATCH = 0.50;
export const MODEL_VERSION = 'verifier-v1.0.0';
export const SIMILARITY_MODEL = 'text-embedding-3-small';
