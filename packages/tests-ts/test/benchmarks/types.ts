export enum BenchmarkId {
  EmptyWorkFlow = 'empty-work-flow',
  GenerationPlugin = 'generation-plugin',
  LlmAsJudgePlugin = 'llm-as-judge-plugin',
  ExportPlugin = 'export-plugin',
}

export type BenchmarkResult = {
  id: BenchmarkId | string;
  timestamp: string;
  context?: Record<string, unknown>;
  comment?: string;
  results: {
    min: number;
    max: number;
    average: number;
    median: number;
    p90: number;
    p99: number;
  };
};

export enum DimensionName {
  METRICS = 'metrics',
  TEST_CASES = 'test-cases',
}

// Result: an object that contains exactly 1 element of given enum E, and value of V
type OneEnumKey<E extends string | number | symbol, V = unknown> = { [K in E]: Record<K, V> }[E];

export type Dimension = OneEnumKey<DimensionName, unknown[]>;

export type DimensionPoint = Partial<Record<DimensionName, unknown>>;
