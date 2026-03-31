/**
 * Kindling Verifier — Drift Scorer
 * 
 * Detects material drift between a claim and its source transcript.
 * Rule-based detection per the Material Drift Rubric.
 */

import type { DriftCategory, DriftDetail, DriftResult } from './types.js';
import { canonicalize } from './detector.js';

// ============================================================================
// Drift Detection Patterns
// ============================================================================

/**
 * Confidence/hedging markers
 */
const HEDGING_MARKERS = [
  'try', 'try to', 'attempt', 'might', 'maybe', 'perhaps',
  'possibly', 'probably', 'hopefully', 'if possible',
  'if i can', 'if nothing comes up', 'if time permits',
  'should be able to', 'plan to', 'intend to', 'hope to',
  'aim to', 'looking to', 'thinking about', 'considering',
];

const CERTAINTY_MARKERS = [
  'will', 'definitely', 'certainly', 'absolutely', 'guaranteed',
  'for sure', 'without doubt', 'committed to', 'promise',
  'i commit', 'i guarantee', 'count on it', 'you can expect',
];

/**
 * Temporal markers
 */
const TEMPORAL_PATTERNS: Array<{ pattern: RegExp; specificity: number }> = [
  { pattern: /\btoday\b/i, specificity: 1 },
  { pattern: /\btomorrow\b/i, specificity: 1 },
  { pattern: /\bmonday|tuesday|wednesday|thursday|friday|saturday|sunday\b/i, specificity: 2 },
  { pattern: /\bthis week\b/i, specificity: 3 },
  { pattern: /\bnext week\b/i, specificity: 3 },
  { pattern: /\bthis month\b/i, specificity: 4 },
  { pattern: /\bby \w+day\b/i, specificity: 2 },
  { pattern: /\bby end of (?:day|week|month)\b/i, specificity: 3 },
  { pattern: /\b\d{1,2}(?:st|nd|rd|th)?\b/i, specificity: 1 },
  { pattern: /\b\d{1,2}:\d{2}\b/i, specificity: 0.5 },
  { pattern: /\b(?:am|pm)\b/i, specificity: 0.5 },
];

/**
 * Conditionality markers
 */
const CONDITION_MARKERS = [
  'if', 'unless', 'provided that', 'assuming', 'as long as',
  'in case', 'should', 'when possible', 'if possible',
  'depending on', 'contingent on', 'subject to',
];

// ============================================================================
// Drift Detection Functions
// ============================================================================

/**
 * Detect confidence shift: hedging removed or certainty added
 */
function detectConfidenceShift(source: string, claim: string): DriftDetail | null {
  const sourceLower = source.toLowerCase();
  const claimLower = claim.toLowerCase();

  // Check if source has hedging that claim lacks
  for (const hedge of HEDGING_MARKERS) {
    if (sourceLower.includes(hedge) && !claimLower.includes(hedge)) {
      // Check if claim has certainty markers instead
      const hasCertainty = CERTAINTY_MARKERS.some(c => claimLower.includes(c));
      if (hasCertainty || !HEDGING_MARKERS.some(h => claimLower.includes(h))) {
        return {
          category: 'confidence_shift',
          source: hedge,
          claim: hasCertainty ? CERTAINTY_MARKERS.find(c => claimLower.includes(c)) || null : null,
          description: `Hedging "${hedge}" removed from source`,
        };
      }
    }
  }

  // Check if claim adds certainty that source lacks
  for (const cert of CERTAINTY_MARKERS) {
    if (claimLower.includes(cert) && !sourceLower.includes(cert)) {
      const sourceHasHedge = HEDGING_MARKERS.some(h => sourceLower.includes(h));
      if (sourceHasHedge) {
        return {
          category: 'confidence_shift',
          source: HEDGING_MARKERS.find(h => sourceLower.includes(h)) || null,
          claim: cert,
          description: `Certainty "${cert}" added; source was hedged`,
        };
      }
    }
  }

  return null;
}

/**
 * Detect conditionality removed
 */
function detectConditionalityRemoved(source: string, claim: string): DriftDetail | null {
  const sourceLower = source.toLowerCase();
  const claimLower = claim.toLowerCase();

  for (const condition of CONDITION_MARKERS) {
    if (sourceLower.includes(condition) && !claimLower.includes(condition)) {
      // Extract the conditional clause
      const conditionRegex = new RegExp(`${condition}[^,.]*`, 'i');
      const match = source.match(conditionRegex);
      return {
        category: 'conditionality_removed',
        source: match ? match[0] : condition,
        claim: null,
        description: `Condition "${condition}" present in source but absent in claim`,
      };
    }
  }

  return null;
}

/**
 * Detect temporal shift
 */
function detectTemporalShift(source: string, claim: string): DriftDetail | null {
  const sourceLower = source.toLowerCase();
  const claimLower = claim.toLowerCase();

  // Find temporal markers in both
  const sourceTemporals: Array<{ marker: string; specificity: number }> = [];
  const claimTemporals: Array<{ marker: string; specificity: number }> = [];

  for (const { pattern, specificity } of TEMPORAL_PATTERNS) {
    const sourceMatch = sourceLower.match(pattern);
    const claimMatch = claimLower.match(pattern);

    if (sourceMatch) {
      sourceTemporals.push({ marker: sourceMatch[0], specificity });
    }
    if (claimMatch) {
      claimTemporals.push({ marker: claimMatch[0], specificity });
    }
  }

  // Check for precision added (claim more specific than source)
  if (sourceTemporals.length > 0 && claimTemporals.length > 0) {
    const sourceMin = Math.min(...sourceTemporals.map(t => t.specificity));
    const claimMin = Math.min(...claimTemporals.map(t => t.specificity));

    if (claimMin < sourceMin) {
      // Claim is more specific
      return {
        category: 'precision_added',
        source: sourceTemporals[0]?.marker ?? null,
        claim: claimTemporals[0]?.marker ?? null,
        description: 'Claim adds temporal precision not in source',
      };
    }

    // Check for different temporal references (actual shift)
    const sourceMarker = sourceTemporals[0]?.marker ?? null;
    const claimMarker = claimTemporals[0]?.marker ?? null;
    if (sourceMarker && claimMarker && sourceMarker !== claimMarker) {
      return {
        category: 'temporal_shift',
        source: sourceMarker,
        claim: claimMarker,
        description: 'Temporal reference changed',
      };
    }
  }

  // Claim has temporals that source lacks entirely
  if (sourceTemporals.length === 0 && claimTemporals.length > 0) {
    return {
      category: 'precision_added',
      source: null,
      claim: claimTemporals[0]?.marker ?? null,
      description: 'Claim adds temporal specificity not in source',
    };
  }

  return null;
}

/**
 * Detect scope shift (quantity, deliverable changes)
 */
function detectScopeShift(source: string, claim: string): DriftDetail | null {
  const sourceLower = source.toLowerCase();
  const claimLower = claim.toLowerCase();

  // Check for scope-related term changes
  const scopeTerms = [
    ['draft', 'final'],
    ['part', 'all'],
    ['some', 'all'],
    ['section', 'document'],
    ['outline', 'complete'],
    ['rough', 'polished'],
    ['initial', 'final'],
    ['first', 'full'],
  ];

  for (const [lesser, greater] of scopeTerms) {
    if (sourceLower.includes(lesser) && claimLower.includes(greater)) {
      return {
        category: 'scope_shift',
        source: lesser,
        claim: greater,
        description: `Scope expanded from "${lesser}" to "${greater}"`,
      };
    }
  }

  // Check for quantity changes (numbers)
  const sourceNumbers = source.match(/\b\d+\b/g) || [];
  const claimNumbers = claim.match(/\b\d+\b/g) || [];

  if (sourceNumbers.length > 0 && claimNumbers.length > 0) {
    const sourceNum = parseInt(sourceNumbers[0], 10);
    const claimNum = parseInt(claimNumbers[0], 10);
    if (sourceNum !== claimNum) {
      return {
        category: 'scope_shift',
        source: sourceNumbers[0],
        claim: claimNumbers[0],
        description: 'Quantity changed',
      };
    }
  }

  return null;
}

/**
 * Detect actor shift (speaker/addressee changed)
 */
function detectActorShift(source: string, claim: string): DriftDetail | null {
  const sourceLower = source.toLowerCase();
  const claimLower = claim.toLowerCase();

  // Simple heuristic: "I said" vs "you said" mismatch
  const sourceHasI = /\bi said\b|\bi told\b|\bi mentioned\b/i.test(source);
  const sourceHasYou = /\byou said\b|\byou told\b|\byou mentioned\b/i.test(source);
  const claimHasI = /\bi said\b|\bi told\b|\bi mentioned\b/i.test(claim);
  const claimHasYou = /\byou said\b|\byou told\b|\byou mentioned\b/i.test(claim);

  if ((sourceHasI && claimHasYou) || (sourceHasYou && claimHasI)) {
    return {
      category: 'actor_shift',
      source: sourceHasI ? 'I' : 'you',
      claim: claimHasI ? 'I' : 'you',
      description: 'Speaker attribution changed',
    };
  }

  return null;
}

// ============================================================================
// Main Drift Detection
// ============================================================================

/**
 * Detect all material drift between source and claim.
 */
export function detectDrift(source: string, claim: string): DriftResult {
  const details: DriftDetail[] = [];

  // Run all detectors
  const confidenceShift = detectConfidenceShift(source, claim);
  if (confidenceShift) details.push(confidenceShift);

  const conditionalityRemoved = detectConditionalityRemoved(source, claim);
  if (conditionalityRemoved) details.push(conditionalityRemoved);

  const temporalShift = detectTemporalShift(source, claim);
  if (temporalShift) details.push(temporalShift);

  const scopeShift = detectScopeShift(source, claim);
  if (scopeShift) details.push(scopeShift);

  const actorShift = detectActorShift(source, claim);
  if (actorShift) details.push(actorShift);

  return {
    detected: details.length > 0,
    categories: details.map(d => d.category),
    details,
  };
}

/**
 * Calculate similarity between two texts.
 * For now, uses simple Levenshtein-based metric.
 * TODO: Replace with embedding-based similarity in Phase 2.
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const s1 = canonicalize(text1);
  const s2 = canonicalize(text2);

  if (s1 === s2) return 1.0;

  // Simple word overlap for now
  const words1 = new Set(s1.split(' '));
  const words2 = new Set(s2.split(' '));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  // Jaccard similarity
  return intersection.size / union.size;
}
