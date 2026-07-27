import {
  MAX_RETRY_ATTEMPTS,
  DEFAULT_CONCURRENCY,
  MIN_CONCURRENCY,
  SCENARIO_BATCH_SIZE,
  DEFAULT_MODEL,
  DEFAULT_TAXONOMY_AXES,
} from '../../src/constants';

describe('constants', () => {
  describe('retry and concurrency constants', () => {
    it('MAX_RETRY_ATTEMPTS should be a positive number', () => {
      expect(MAX_RETRY_ATTEMPTS).toBeGreaterThan(0);
      expect(Number.isInteger(MAX_RETRY_ATTEMPTS)).toBe(true);
    });

    it('DEFAULT_CONCURRENCY should be greater than MIN_CONCURRENCY', () => {
      expect(DEFAULT_CONCURRENCY).toBeGreaterThan(MIN_CONCURRENCY);
    });

    it('MIN_CONCURRENCY should be at least 1', () => {
      expect(MIN_CONCURRENCY).toBeGreaterThanOrEqual(1);
    });

    it('SCENARIO_BATCH_SIZE should be a reasonable batch size', () => {
      expect(SCENARIO_BATCH_SIZE).toBeGreaterThan(0);
      expect(SCENARIO_BATCH_SIZE).toBeLessThanOrEqual(50);
    });
  });

  describe('DEFAULT_MODEL', () => {
    it('should be a valid Bedrock model ID format', () => {
      expect(DEFAULT_MODEL).toMatch(/^anthropic\./);
      expect(DEFAULT_MODEL).toContain('claude');
    });
  });

  describe('DEFAULT_TAXONOMY_AXES', () => {
    it('should have turnCounts array', () => {
      expect(Array.isArray(DEFAULT_TAXONOMY_AXES.turnCounts)).toBe(true);
      expect(DEFAULT_TAXONOMY_AXES.turnCounts.length).toBeGreaterThan(0);
    });

    it('should have difficulty array', () => {
      expect(Array.isArray(DEFAULT_TAXONOMY_AXES.difficulty)).toBe(true);
      expect(DEFAULT_TAXONOMY_AXES.difficulty.length).toBeGreaterThan(0);
    });

    it('should have outcomes array', () => {
      expect(Array.isArray(DEFAULT_TAXONOMY_AXES.outcomes)).toBe(true);
      expect(DEFAULT_TAXONOMY_AXES.outcomes.length).toBeGreaterThan(0);
    });

    it('turnCounts should contain positive integers', () => {
      for (const count of DEFAULT_TAXONOMY_AXES.turnCounts) {
        expect(count).toBeGreaterThan(0);
        expect(Number.isInteger(count)).toBe(true);
      }
    });

    it('should include standard difficulty levels', () => {
      expect(DEFAULT_TAXONOMY_AXES.difficulty).toContain('easy');
      expect(DEFAULT_TAXONOMY_AXES.difficulty).toContain('medium');
      expect(DEFAULT_TAXONOMY_AXES.difficulty).toContain('hard');
    });

    it('should include standard outcomes', () => {
      expect(DEFAULT_TAXONOMY_AXES.outcomes).toContain('happy_path');
      expect(DEFAULT_TAXONOMY_AXES.outcomes).toContain('refusal');
      expect(DEFAULT_TAXONOMY_AXES.outcomes).toContain('clarification');
    });
  });
});
