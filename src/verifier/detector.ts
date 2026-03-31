/**
 * Kindling Verifier — Claim Detector
 * 
 * Detects explicit memory claims (Verbatim, Summarized) using pattern matching.
 * Implicit and Undeclared detection is out of v1 scope.
 */

import type { ClaimType, ClaimTypeExtended, ClaimDetectionResult } from './types.js';

// ============================================================================
// Verbatim Patterns
// ============================================================================

/**
 * Patterns that indicate the agent is claiming to quote exactly.
 * Must include quotation marks or strong exactness markers.
 */
const VERBATIM_PATTERNS: RegExp[] = [
  // Direct quotes with attribution
  /\bi said ['"](.+?)['"]/i,
  /\bi stated ['"](.+?)['"]/i,
  /\bi told (?:you|them|her|him) ['"](.+?)['"]/i,
  /\bmy exact words were ['"](.+?)['"]/i,
  /\bmy exact words: ['"](.+?)['"]/i,
  /\bi specifically said ['"](.+?)['"]/i,
  /\bwhat i said was ['"](.+?)['"]/i,
  /\bi wrote ['"](.+?)['"]/i,
  /\bi replied ['"](.+?)['"]/i,
  /\bi responded ['"](.+?)['"]/i,
  
  // Quote attribution without "I"
  /\bto quote myself: ['"](.+?)['"]/i,
  /\bquote: ['"](.+?)['"]/i,
];

// ============================================================================
// Summarized Patterns
// ============================================================================

/**
 * Patterns that indicate the agent is paraphrasing prior content.
 * Hedging language or explicit paraphrase markers.
 */
const SUMMARIZED_PATTERNS: RegExp[] = [
  // Explicit paraphrase markers
  /\bi mentioned that\b/i,
  /\bi said something like\b/i,
  /\bi believe i said\b/i,
  /\bi think i said\b/i,
  /\bi recall saying\b/i,
  /\bi remember saying\b/i,
  /\bi indicated that\b/i,
  /\bi suggested that\b/i,
  /\bi noted that\b/i,
  /\bi pointed out that\b/i,
  /\bi explained that\b/i,
  /\bi expressed that\b/i,
  /\bi communicated that\b/i,
  
  // Hedged recall
  /\bif i recall correctly,? i\b/i,
  /\bas i recall,? i\b/i,
  /\bi'm pretty sure i said\b/i,
  /\bi'm fairly certain i\b/i,
  /\bi probably said\b/i,
  /\bi may have said\b/i,
  /\bi might have said\b/i,
  /\bi could have said\b/i,
  /\bfrom what i remember,? i\b/i,
  
  // Approximate/rough markers
  /\bi said something (?:along the lines of|to the effect of)\b/i,
  /\broughly,? i said\b/i,
  /\bbasically,? i said\b/i,
  /\bin essence,? i said\b/i,
  /\bessentially,? i said\b/i,
];

// ============================================================================
// Implicit Patterns (Out of v1 scope, detected for classification only)
// ============================================================================

/**
 * Patterns that imply memory reference without explicit memory markers.
 * Detected but NOT verified in v1.
 */
const IMPLICIT_PATTERNS: RegExp[] = [
  /\bas discussed\b/i,
  /\bas we discussed\b/i,
  /\bper our (?:conversation|discussion|agreement)\b/i,
  /\bas agreed\b/i,
  /\bas we agreed\b/i,
  /\bas i committed\b/i,
  /\baccording to our\b/i,
  /\bfollowing up on\b/i,
  /\bper our last\b/i,
  /\bas previously\b/i,
];

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect if a text contains an explicit memory claim and classify it.
 */
export function detectClaim(text: string): ClaimDetectionResult {
  // Check Verbatim first (higher specificity)
  for (const pattern of VERBATIM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        detected: true,
        type: 'verbatim',
        confidence: 0.95,
        matchedPattern: pattern.source,
        extractedQuote: match[1] || undefined,
      };
    }
  }

  // Check Summarized
  for (const pattern of SUMMARIZED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type: 'summarized',
        confidence: 0.90,
        matchedPattern: pattern.source,
      };
    }
  }

  // Check Implicit (detected but out of v1 scope)
  for (const pattern of IMPLICIT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type: 'implicit',
        confidence: 0.75,
        matchedPattern: pattern.source,
      };
    }
  }

  // No memory claim detected
  return {
    detected: false,
    type: 'out_of_scope',
    confidence: 0.80,
  };
}

/**
 * Check if a detected claim type is within v1 scope.
 */
export function isV1Scope(type: ClaimTypeExtended): type is ClaimType {
  return type === 'verbatim' || type === 'summarized';
}

/**
 * Extract all memory claims from a longer text.
 * Returns array of detected claims with their positions.
 */
export function extractClaims(text: string): Array<{
  claim: string;
  detection: ClaimDetectionResult;
  start: number;
  end: number;
}> {
  const results: Array<{
    claim: string;
    detection: ClaimDetectionResult;
    start: number;
    end: number;
  }> = [];

  // Split into sentences (simple heuristic)
  const sentences = text.split(/(?<=[.!?])\s+/);
  let position = 0;

  for (const sentence of sentences) {
    const detection = detectClaim(sentence);
    if (detection.detected) {
      results.push({
        claim: sentence,
        detection,
        start: position,
        end: position + sentence.length,
      });
    }
    position += sentence.length + 1; // +1 for space
  }

  return results;
}

// ============================================================================
// Canonicalization
// ============================================================================

/**
 * Canonicalize text for comparison.
 * Per spec: lowercase, remove punctuation, normalize whitespace, expand contractions.
 */
export function canonicalize(text: string): string {
  let result = text.toLowerCase();

  // Expand common contractions
  const contractions: Record<string, string> = {
    "i'll": "i will",
    "i'd": "i would",
    "i've": "i have",
    "i'm": "i am",
    "we'll": "we will",
    "we'd": "we would",
    "we've": "we have",
    "we're": "we are",
    "you'll": "you will",
    "you'd": "you would",
    "you've": "you have",
    "you're": "you are",
    "they'll": "they will",
    "they'd": "they would",
    "they've": "they have",
    "they're": "they are",
    "it'll": "it will",
    "it'd": "it would",
    "it's": "it is",
    "that's": "that is",
    "there's": "there is",
    "here's": "here is",
    "what's": "what is",
    "who's": "who is",
    "won't": "will not",
    "wouldn't": "would not",
    "can't": "cannot",
    "couldn't": "could not",
    "shouldn't": "should not",
    "don't": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
    "weren't": "were not",
    "hasn't": "has not",
    "haven't": "have not",
    "hadn't": "had not",
  };

  for (const [contraction, expansion] of Object.entries(contractions)) {
    result = result.replace(new RegExp(`\\b${contraction}\\b`, 'gi'), expansion);
  }

  // Remove discourse markers
  const fillers = ['um', 'uh', 'like', 'you know', 'i mean', 'well', 'so', 'basically'];
  for (const filler of fillers) {
    result = result.replace(new RegExp(`\\b${filler}\\b,?\\s*`, 'gi'), '');
  }

  // Remove punctuation except sentence boundaries
  result = result.replace(/[^\w\s.!?]/g, '');

  // Normalize whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}
