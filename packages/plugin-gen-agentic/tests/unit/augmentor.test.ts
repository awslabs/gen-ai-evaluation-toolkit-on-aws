import { GeneratedTestCase, ToolDefinition, AugmentationStrategy } from '../../src/models';

jest.mock('../../src/helpers/bedrock', () => {
  const actual = jest.requireActual('../../src/helpers/bedrock');
  return {
    converseWithRetry: jest.fn(),
    createUserMessage: jest.fn((content: string) => ({ role: 'user', content: [{ text: content }] })),
    extractJsonFromResponse: jest.fn((content: string) => content),
    parseWithFieldErrors: actual.parseWithFieldErrors,
    safeJsonParse: actual.safeJsonParse,
  };
});

import { augmentTestCases, AugmentationResult } from '../../src/stages/augmentor';
import { converseWithRetry } from '../../src/helpers/bedrock';

const mockedConverseWithRetry = converseWithRetry as jest.MockedFunction<typeof converseWithRetry>;

function makeBaseCase(scenarioId: string, source: 'gap_fill' | 'focus_area' = 'gap_fill'): GeneratedTestCase {
  return {
    input: 'What is the price of laptop-x1?',
    expected: {
      response: 'The laptop-x1 is priced at $999.',
      topics: ['products', 'pricing'],
      toolCalls: [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
    },
    context: {
      provenance: {
        source,
        scenarioId,
        planAxis: 'get_product',
      },
    },
    requiresReview: false,
  };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_product',
    description: 'Get product info',
    parameters: {
      type: 'object',
      properties: { product_id: { type: 'string' } },
      required: ['product_id'],
    },
  },
];

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

describe('augmentor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('augmentTestCases', () => {
    it('returns nothing when baseCases is empty', async () => {
      const results = await collect(
        augmentTestCases({
          modelId: 'm',
          baseCases: [],
          strategies: ['rephrase'],
          systemPrompt: undefined,
          tools: undefined,
        }),
      );
      expect(results).toHaveLength(0);
      expect(mockedConverseWithRetry).not.toHaveBeenCalled();
    });

    it('returns nothing when strategies is empty', async () => {
      const results = await collect(
        augmentTestCases({
          modelId: 'm',
          baseCases: [makeBaseCase('s1')],
          strategies: [],
          systemPrompt: undefined,
          tools: undefined,
        }),
      );
      expect(results).toHaveLength(0);
      expect(mockedConverseWithRetry).not.toHaveBeenCalled();
    });

    it('produces one case per (baseCase, strategy) pair', async () => {
      mockedConverseWithRetry.mockResolvedValue({
        input: 'Variant question',
        expected: {
          response: 'Variant answer',
          topics: ['products'],
          toolCalls: [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
        },
      });

      const baseCases = [makeBaseCase('s1'), makeBaseCase('s2')];
      const strategies: AugmentationStrategy[] = ['rephrase', 'edge_case'];

      const results = await collect(
        augmentTestCases({
          modelId: 'm',
          baseCases,
          strategies,
          systemPrompt: 'you are helpful',
          tools: TOOLS,
        }),
      );

      // 2 baseCases × 2 strategies = 4 LLM calls
      expect(mockedConverseWithRetry).toHaveBeenCalledTimes(4);
      expect(results).toHaveLength(4);
    });

    it('tags provenance with source=augmentation, augmentationStrategy, parentScenarioId', async () => {
      mockedConverseWithRetry.mockResolvedValue({
        input: 'Variant',
        expected: {
          response: 'Variant answer',
          topics: ['products'],
          toolCalls: [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
        },
      });

      const results = await collect(
        augmentTestCases({
          modelId: 'm',
          baseCases: [makeBaseCase('scenario-001', 'focus_area')],
          strategies: ['rephrase'],
          systemPrompt: 'you are helpful',
          tools: TOOLS,
        }),
      );

      expect(results).toHaveLength(1);
      const provenance = results[0]!.testCase.context.provenance;
      expect(provenance.source).toBe('augmentation');
      expect(provenance.augmentationStrategy).toBe('rephrase');
      expect(provenance.parentScenarioId).toBe('scenario-001');
      expect(provenance.scenarioId).toBe('scenario-001-rephrase');
      // planAxis preserved from parent
      expect(provenance.planAxis).toBe('get_product');
    });

    it('returns parentCase and strategy in the result', async () => {
      mockedConverseWithRetry.mockResolvedValue({
        input: 'Variant',
        expected: {
          response: 'Variant answer',
          topics: ['products'],
          toolCalls: [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
        },
      });

      const base = makeBaseCase('s1');
      const results: AugmentationResult[] = await collect(
        augmentTestCases({
          modelId: 'm',
          baseCases: [base],
          strategies: ['rephrase'],
          systemPrompt: undefined,
          tools: undefined,
        }),
      );

      expect(results[0]!.parentCase).toBe(base);
      expect(results[0]!.strategy).toBe('rephrase');
    });

    it('accepts negative_case output with empty toolCalls', async () => {
      mockedConverseWithRetry.mockResolvedValue({
        input: 'Tell me a joke',
        expected: {
          response: "I can't help with that — I'm a product assistant.",
          topics: ['refusal'],
          toolCalls: [],
        },
      });

      const results = await collect(
        augmentTestCases({
          modelId: 'm',
          baseCases: [makeBaseCase('s1')],
          strategies: ['negative_case'],
          systemPrompt: 'you are a product assistant',
          tools: TOOLS,
        }),
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.testCase.expected.toolCalls).toEqual([]);
    });

    it('skips a case when LLM call fails (continues with others)', async () => {
      mockedConverseWithRetry
        .mockResolvedValueOnce({
          input: 'Variant 1',
          expected: {
            response: 'Answer 1',
            topics: ['products'],
            toolCalls: [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
          },
        })
        .mockRejectedValueOnce(new Error('LLM exploded'))
        .mockResolvedValueOnce({
          input: 'Variant 3',
          expected: {
            response: 'Answer 3',
            topics: ['products'],
            toolCalls: [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
          },
        });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const results = await collect(
        augmentTestCases({
          modelId: 'm',
          baseCases: [makeBaseCase('s1'), makeBaseCase('s2'), makeBaseCase('s3')],
          strategies: ['rephrase'],
          systemPrompt: undefined,
          tools: TOOLS,
        }),
      );

      expect(results).toHaveLength(2);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('preserves multi-turn shape (input array, per-turn toolCalls) on multi_turn_extension output', async () => {
      mockedConverseWithRetry.mockResolvedValue({
        input: ['Find me a laptop', 'What about battery life?'],
        expected: {
          response: 'The laptop has 12-hour battery life.',
          topics: ['products', 'laptops'],
          toolCalls: [
            [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
            [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
          ],
        },
      });

      const results = await collect(
        augmentTestCases({
          modelId: 'm',
          baseCases: [makeBaseCase('s1')],
          strategies: ['multi_turn_extension'],
          systemPrompt: 'you are helpful',
          tools: TOOLS,
        }),
      );

      expect(results).toHaveLength(1);
      const augmented = results[0]!.testCase;
      expect(Array.isArray(augmented.input)).toBe(true);
      expect(augmented.input).toEqual(['Find me a laptop', 'What about battery life?']);
      const toolCalls = augmented.expected.toolCalls;
      expect(Array.isArray(toolCalls)).toBe(true);
      expect(Array.isArray((toolCalls as unknown[])[0])).toBe(true);
      expect(toolCalls).toHaveLength(2);
    });

    it('reports progress', async () => {
      mockedConverseWithRetry.mockResolvedValue({
        input: 'Variant',
        expected: {
          response: 'Answer',
          topics: ['products'],
          toolCalls: [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
        },
      });

      const onProgress = jest.fn();

      await collect(
        augmentTestCases({
          modelId: 'm',
          baseCases: [makeBaseCase('s1'), makeBaseCase('s2')],
          strategies: ['rephrase', 'edge_case'],
          systemPrompt: undefined,
          tools: undefined,
          onProgress,
        }),
      );

      // Called at least once with the final total of 4
      const calls = onProgress.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const finalCall = calls[calls.length - 1];
      expect(finalCall?.[1]).toBe(4);
    });
  });
});
