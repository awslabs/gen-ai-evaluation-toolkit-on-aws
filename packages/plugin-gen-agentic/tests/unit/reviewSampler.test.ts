import { applyReviewSampling } from '../../src/stages/reviewSampler';
import { GeneratedTestCase, ProvenanceSourceEnum } from '../../src/models';
import { z } from 'zod';

type ProvenanceSource = z.infer<typeof ProvenanceSourceEnum>;

function makeTestCase(source: ProvenanceSource, scenarioId: string): GeneratedTestCase {
  return {
    input: 'q',
    expected: { response: 'r', topics: ['t'] },
    context: { provenance: { source, scenarioId } },
    requiresReview: false,
  };
}

function makeBatch(source: ProvenanceSource, count: number): GeneratedTestCase[] {
  return Array.from({ length: count }, (_, i) => makeTestCase(source, `${source}-${i}`));
}

describe('reviewSampler', () => {
  describe('applyReviewSampling', () => {
    it('returns empty result for empty input', () => {
      const { testCases, stats } = applyReviewSampling([], 0.5);
      expect(testCases).toEqual([]);
      expect(stats).toEqual({ total: 0, flagged: 0, bySource: {} });
    });

    it('flags zero cases when rate is 0', () => {
      const cases = [...makeBatch('gap_fill', 10), ...makeBatch('focus_area', 5)];
      const { testCases, stats } = applyReviewSampling(cases, 0);

      expect(testCases.every((tc) => tc.requiresReview === false)).toBe(true);
      expect(stats.flagged).toBe(0);
      expect(stats.bySource['gap_fill']).toEqual({ total: 10, flagged: 0 });
      expect(stats.bySource['focus_area']).toEqual({ total: 5, flagged: 0 });
    });

    it('flags every case when rate is 1', () => {
      const cases = [...makeBatch('gap_fill', 7), ...makeBatch('failure_pattern', 3)];
      const { testCases, stats } = applyReviewSampling(cases, 1);

      expect(testCases.every((tc) => tc.requiresReview === true)).toBe(true);
      expect(stats.flagged).toBe(10);
    });

    it('stratifies independently per source', () => {
      // 20 gap_fill, 4 focus_area, 2 failure_pattern. rate 0.25.
      // ceil(0.25*20)=5, ceil(0.25*4)=1, ceil(0.25*2)=1.
      const cases = [
        ...makeBatch('gap_fill', 20),
        ...makeBatch('focus_area', 4),
        ...makeBatch('failure_pattern', 2),
      ];
      const { stats } = applyReviewSampling(cases, 0.25);

      expect(stats.bySource['gap_fill']).toEqual({ total: 20, flagged: 5 });
      expect(stats.bySource['focus_area']).toEqual({ total: 4, flagged: 1 });
      expect(stats.bySource['failure_pattern']).toEqual({ total: 2, flagged: 1 });
      expect(stats.flagged).toBe(7);
    });

    it('uses ceil rounding so rate>0 always flags at least one per non-empty source', () => {
      // Single case per source at low rate would round to 0 with floor; ceil keeps it 1.
      const cases = [makeTestCase('gap_fill', 'a'), makeTestCase('focus_area', 'b')];
      const { stats } = applyReviewSampling(cases, 0.01);

      expect(stats.bySource['gap_fill']!.flagged).toBe(1);
      expect(stats.bySource['focus_area']!.flagged).toBe(1);
    });

    it('caps flag count at group size', () => {
      // rate>1 is impossible per schema, but defensive: ceil never exceeds groupSize.
      const cases = makeBatch('gap_fill', 3);
      const { stats } = applyReviewSampling(cases, 1);
      expect(stats.bySource['gap_fill']!.flagged).toBe(3);
    });

    it('does not mutate the input array', () => {
      const cases = makeBatch('gap_fill', 5);
      const snapshot = cases.map((c) => ({ ...c }));

      applyReviewSampling(cases, 1);

      expect(cases).toEqual(snapshot);
      expect(cases.every((c) => c.requiresReview === false)).toBe(true);
    });

    it('preserves all non-review fields on output cases', () => {
      const cases = makeBatch('gap_fill', 3);
      const { testCases } = applyReviewSampling(cases, 1);

      for (let i = 0; i < cases.length; i++) {
        expect(testCases[i]!.input).toBe(cases[i]!.input);
        expect(testCases[i]!.expected).toEqual(cases[i]!.expected);
        expect(testCases[i]!.context).toEqual(cases[i]!.context);
      }
    });

    it('flags exactly the stratified count and nothing more', () => {
      const cases = [...makeBatch('gap_fill', 10), ...makeBatch('focus_area', 10)];
      const { testCases, stats } = applyReviewSampling(cases, 0.3);

      const flaggedCount = testCases.filter((tc) => tc.requiresReview).length;
      expect(flaggedCount).toBe(stats.flagged);
      // ceil(0.3*10) = 3 per group, so 6 total
      expect(flaggedCount).toBe(6);
    });

    it('selects different cases across runs (randomness sanity check)', () => {
      // Run twice with rate that flags some-but-not-all; selections should differ
      // at least once across many runs. Probabilistic but with 20 trials of
      // C(10,3)=120 possible selections, the chance of all-equal is ~0.
      const cases = makeBatch('gap_fill', 10);
      const flaggedSets = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const { testCases } = applyReviewSampling(cases, 0.3);
        const flaggedIds = testCases
          .map((tc, idx) => (tc.requiresReview ? idx : -1))
          .filter((x) => x !== -1)
          .join(',');
        flaggedSets.add(flaggedIds);
      }
      // Very likely > 1 distinct selection
      expect(flaggedSets.size).toBeGreaterThan(1);
    });

    it('handles a single source with full input', () => {
      const cases = makeBatch('failure_pattern', 8);
      const { testCases, stats } = applyReviewSampling(cases, 0.5);

      expect(stats.bySource['failure_pattern']).toEqual({ total: 8, flagged: 4 });
      expect(testCases.filter((tc) => tc.requiresReview).length).toBe(4);
    });
  });
});
