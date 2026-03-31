/**
 * Verifier Detector Tests
 */

import { describe, it, expect } from 'vitest';
import { detectClaim, canonicalize, isV1Scope } from '../../src/verifier/detector.js';

describe('detectClaim', () => {
  describe('verbatim claims', () => {
    it('detects quoted claims with "I said"', () => {
      const result = detectClaim('I said "I will deliver by Friday"');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('verbatim');
      expect(result.extractedQuote).toBe('I will deliver by Friday');
    });

    it('detects quoted claims with single quotes', () => {
      const result = detectClaim("I said 'the report is ready'");
      expect(result.detected).toBe(true);
      expect(result.type).toBe('verbatim');
    });

    it('detects "my exact words were"', () => {
      const result = detectClaim('My exact words were "we need more time"');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('verbatim');
    });

    it('detects "I told you"', () => {
      const result = detectClaim('I told you "this is important"');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('verbatim');
    });
  });

  describe('summarized claims', () => {
    it('detects "I mentioned that"', () => {
      const result = detectClaim('I mentioned that the deadline was flexible');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('summarized');
    });

    it('detects "I believe I said"', () => {
      const result = detectClaim('I believe I said something about next week');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('summarized');
    });

    it('detects "I think I said"', () => {
      const result = detectClaim('I think I said we could maybe do it');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('summarized');
    });

    it('detects "I recall saying"', () => {
      const result = detectClaim('I recall saying the project was on track');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('summarized');
    });

    it('detects "I said something like"', () => {
      const result = detectClaim('I said something like we need more resources');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('summarized');
    });
  });

  describe('implicit claims (out of v1 scope)', () => {
    it('detects "as discussed"', () => {
      const result = detectClaim('As discussed, the deadline is Friday');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('implicit');
      expect(isV1Scope(result.type)).toBe(false);
    });

    it('detects "per our agreement"', () => {
      const result = detectClaim('Per our agreement, I will send the report');
      expect(result.detected).toBe(true);
      expect(result.type).toBe('implicit');
    });
  });

  describe('out of scope', () => {
    it('returns out_of_scope for regular statements', () => {
      const result = detectClaim('The deadline is Friday');
      expect(result.detected).toBe(false);
      expect(result.type).toBe('out_of_scope');
    });

    it('returns out_of_scope for questions', () => {
      const result = detectClaim('What did you say about the deadline?');
      expect(result.detected).toBe(false);
      expect(result.type).toBe('out_of_scope');
    });
  });
});

describe('canonicalize', () => {
  it('lowercases text', () => {
    expect(canonicalize('I Will DELIVER')).toBe('i will deliver');
  });

  it('expands contractions', () => {
    expect(canonicalize("I'll do it")).toBe('i will do it');
    expect(canonicalize("I won't forget")).toBe('i will not forget');
    expect(canonicalize("I can't help")).toBe('i cannot help');
  });

  it('removes discourse markers', () => {
    expect(canonicalize('Um, I said, like, maybe')).toBe('i said maybe');
  });

  it('normalizes whitespace', () => {
    expect(canonicalize('I   said    yes')).toBe('i said yes');
  });

  it('removes punctuation except sentence boundaries', () => {
    expect(canonicalize('I said: "yes!"')).toBe('i said yes!');
  });
});

describe('isV1Scope', () => {
  it('returns true for verbatim', () => {
    expect(isV1Scope('verbatim')).toBe(true);
  });

  it('returns true for summarized', () => {
    expect(isV1Scope('summarized')).toBe(true);
  });

  it('returns false for implicit', () => {
    expect(isV1Scope('implicit')).toBe(false);
  });

  it('returns false for undeclared', () => {
    expect(isV1Scope('undeclared')).toBe(false);
  });

  it('returns false for out_of_scope', () => {
    expect(isV1Scope('out_of_scope')).toBe(false);
  });
});
