import { GeneratedTestCase } from '../models';

export interface ReviewSamplingStats {
  total: number;
  flagged: number;
  bySource: Record<string, { total: number; flagged: number }>;
}

export interface ReviewSamplingResult {
  testCases: GeneratedTestCase[];
  stats: ReviewSamplingStats;
}

/**
 * Tag a fraction of test cases with requiresReview=true, stratified by
 * provenance.source so low-volume sources (e.g. failure_pattern) aren't
 * under-sampled by uniform random. Per HLD §2.7.6.
 *
 * Uses ceil rounding per group: at rate>0, every non-empty source group
 * gets at least one flagged case. At rate=0, none are flagged.
 *
 * Returns a new array; input cases are not mutated.
 */
export function applyReviewSampling(testCases: GeneratedTestCase[], rate: number): ReviewSamplingResult {
  const stats: ReviewSamplingStats = {
    total: testCases.length,
    flagged: 0,
    bySource: {},
  };

  if (testCases.length === 0) {
    return { testCases: [], stats };
  }

  // Group indices by provenance source so we can stratify.
  const indicesBySource = new Map<string, number[]>();
  for (let i = 0; i < testCases.length; i++) {
    const source = testCases[i]!.context.provenance.source;
    const existing = indicesBySource.get(source) ?? [];
    existing.push(i);
    indicesBySource.set(source, existing);
  }

  const flaggedSet = new Set<number>();

  for (const [source, indices] of indicesBySource) {
    const groupSize = indices.length;
    const flagCount = rate <= 0 ? 0 : Math.min(groupSize, Math.ceil(rate * groupSize));

    if (flagCount > 0) {
      const shuffled = shuffle(indices);
      for (let i = 0; i < flagCount; i++) {
        flaggedSet.add(shuffled[i]!);
      }
    }

    stats.bySource[source] = { total: groupSize, flagged: flagCount };
    stats.flagged += flagCount;
  }

  const result = testCases.map((tc, i) => ({
    ...tc,
    requiresReview: flaggedSet.has(i),
  }));

  return { testCases: result, stats };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
