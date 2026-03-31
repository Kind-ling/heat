/**
 * Verifier Drift Scorer Tests
 */

import { describe, it, expect } from 'vitest';
import { detectDrift, calculateSimilarity } from '../../src/verifier/scorer.js';

describe('detectDrift', () => {
  describe('confidence shift', () => {
    it('detects hedging removed', () => {
      const result = detectDrift(
        "I'll try to get it done this week",
        "I will deliver this week"
      );
      expect(result.detected).toBe(true);
      expect(result.categories).toContain('confidence_shift');
    });

    it('detects certainty added', () => {
      const result = detectDrift(
        "I might be able to help",
        "I will definitely help"
      );
      expect(result.detected).toBe(true);
      expect(result.categories).toContain('confidence_shift');
    });

    it('does not flag when both are hedged', () => {
      const result = detectDrift(
        "I'll try to help",
        "I might be able to help"
      );
      // Both are hedged, so not a confidence shift
      expect(result.categories).not.toContain('confidence_shift');
    });
  });

  describe('conditionality removed', () => {
    it('detects "if" condition removed', () => {
      const result = detectDrift(
        "I'll do it if nothing else comes up",
        "I'll do it"
      );
      expect(result.detected).toBe(true);
      expect(result.categories).toContain('conditionality_removed');
    });

    it('detects "unless" condition removed', () => {
      const result = detectDrift(
        "I'll finish unless there are blockers",
        "I'll finish"
      );
      expect(result.detected).toBe(true);
      expect(result.categories).toContain('conditionality_removed');
    });
  });

  describe('temporal shift', () => {
    it('detects precision added to temporal reference', () => {
      const result = detectDrift(
        "I'll do it this week",
        "I'll do it by Friday at 5pm"
      );
      expect(result.detected).toBe(true);
      expect(result.categories).toContain('precision_added');
    });

    it('detects temporal reference added where none existed', () => {
      const result = detectDrift(
        "I'll send the report",
        "I'll send the report by Monday"
      );
      expect(result.detected).toBe(true);
      expect(result.categories).toContain('precision_added');
    });
  });

  describe('scope shift', () => {
    it('detects draft to final', () => {
      const result = detectDrift(
        "I'll send the draft",
        "I'll send the final version"
      );
      expect(result.detected).toBe(true);
      expect(result.categories).toContain('scope_shift');
    });

    it('detects quantity changes', () => {
      const result = detectDrift(
        "I'll review 3 documents",
        "I'll review 5 documents"
      );
      expect(result.detected).toBe(true);
      expect(result.categories).toContain('scope_shift');
    });
  });

  describe('no drift', () => {
    it('returns empty for identical text', () => {
      const result = detectDrift(
        "I'll deliver the report",
        "I'll deliver the report"
      );
      expect(result.detected).toBe(false);
      expect(result.categories).toHaveLength(0);
    });

    it('returns empty for synonym substitution', () => {
      const result = detectDrift(
        "I'll send the document",
        "I'll deliver the document"
      );
      // Synonym, no material drift
      expect(result.categories).not.toContain('scope_shift');
    });
  });

  describe('multiple drift categories', () => {
    it('detects multiple drift types', () => {
      const result = detectDrift(
        "I'll try to send a draft this week if possible",
        "I will definitely send the final by Friday"
      );
      expect(result.detected).toBe(true);
      // Should have multiple categories
      expect(result.categories.length).toBeGreaterThan(1);
    });
  });
});

describe('calculateSimilarity', () => {
  it('returns 1.0 for identical text', () => {
    const sim = calculateSimilarity(
      "I will deliver the report",
      "I will deliver the report"
    );
    expect(sim).toBe(1.0);
  });

  it('returns 1.0 for canonically equivalent text', () => {
    const sim = calculateSimilarity(
      "I'll deliver the report",
      "i will deliver the report"
    );
    expect(sim).toBe(1.0);
  });

  it('returns high similarity for similar text', () => {
    const sim = calculateSimilarity(
      "I will deliver the report by Friday",
      "I will send the report by Friday"
    );
    expect(sim).toBeGreaterThan(0.7);
  });

  it('returns low similarity for different text', () => {
    const sim = calculateSimilarity(
      "I will deliver the report",
      "The weather is nice today"
    );
    expect(sim).toBeLessThan(0.3);
  });
});
