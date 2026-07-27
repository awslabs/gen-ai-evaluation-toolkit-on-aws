import { Scenario, ToolDefinition } from '../../src/models';

// Mock the bedrock module
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

import { generateTestCases, GenerationResult } from '../../src/stages/generator';
import { converseWithRetry } from '../../src/helpers/bedrock';

const mockedConverseWithRetry = converseWithRetry as jest.MockedFunction<typeof converseWithRetry>;

describe('generator', () => {
  const baseScenario: Scenario = {
    id: 'scenario-001',
    description: 'User asks about product',
    type: 'single_turn',
    turns: 1,
    toolsInvolved: ['get_product'],
    difficulty: 'easy',
    topics: ['products'],
    outcome: 'happy_path',
    source: 'gap_fill',
    priority: 5,
  };

  const tools: ToolDefinition[] = [
    {
      name: 'get_product',
      description: 'Get product information',
      parameters: {
        type: 'object',
        properties: { product_id: { type: 'string' } },
        required: ['product_id'],
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateTestCases', () => {
    it('should generate test cases for scenarios', async () => {
      mockedConverseWithRetry.mockResolvedValue({
        input: 'What product is this?',
        expected: {
          response: 'This is product ABC',
          topics: ['products'],
          toolCalls: [{ name: 'get_product', args: { product_id: 'ABC' } }],
        },
      });

      const results: GenerationResult[] = [];
      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [baseScenario],
        systemPrompt: undefined,
        tools,
        seedExamples: undefined,
      })) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      expect(results[0]!.testCase.input).toBe('What product is this?');
      expect(results[0]!.testCase.context.provenance.scenarioId).toBe('scenario-001');
    });

    it('should handle multiple scenarios', async () => {
      const scenario2: Scenario = { ...baseScenario, id: 'scenario-002' };

      mockedConverseWithRetry.mockResolvedValue({
        input: 'Query',
        expected: {
          response: 'Response',
          topics: ['products'],
          toolCalls: [{ name: 'get_product', args: { product_id: '123' } }],
        },
      });

      const results: GenerationResult[] = [];
      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [baseScenario, scenario2],
        systemPrompt: undefined,
        tools,
        seedExamples: undefined,
        concurrency: 2,
      })) {
        results.push(result);
      }

      expect(results).toHaveLength(2);
    });

    it('should call onProgress callback', async () => {
      mockedConverseWithRetry.mockResolvedValue({
        input: 'Query',
        expected: {
          response: 'Response',
          topics: ['products'],
          toolCalls: [{ name: 'get_product', args: { product_id: '123' } }],
        },
      });

      const onProgress = jest.fn();
      const results: GenerationResult[] = [];

      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [baseScenario],
        systemPrompt: undefined,
        tools,
        seedExamples: undefined,
        onProgress,
      })) {
        results.push(result);
      }

      expect(onProgress).toHaveBeenCalledWith(1, 1);
    });

    it('should handle generation errors gracefully', async () => {
      mockedConverseWithRetry.mockRejectedValue(new Error('LLM error'));

      const results: GenerationResult[] = [];
      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [baseScenario],
        systemPrompt: undefined,
        tools,
        seedExamples: undefined,
      })) {
        results.push(result);
      }

      // Should not yield any results on error
      expect(results).toHaveLength(0);
    });

    it('should handle throttling errors with retry', async () => {
      let callCount = 0;
      mockedConverseWithRetry.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('ThrottlingException: Rate exceeded');
        }
        return {
          input: 'Query',
          expected: {
            response: 'Response',
            topics: ['products'],
            toolCalls: [{ name: 'get_product', args: { product_id: '123' } }],
          },
        };
      });

      const results: GenerationResult[] = [];
      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [baseScenario],
        systemPrompt: undefined,
        tools,
        seedExamples: undefined,
        concurrency: 1,
      })) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      expect(callCount).toBe(2);
    });

    it('should set provenance correctly', async () => {
      mockedConverseWithRetry.mockResolvedValue({
        input: 'Query',
        expected: {
          response: 'Response',
          topics: ['products'],
          toolCalls: [{ name: 'get_product', args: { product_id: '123' } }],
        },
      });

      const focusAreaScenario: Scenario = {
        ...baseScenario,
        source: 'focus_area',
        toolsInvolved: ['tool_a', 'tool_b'],
      };

      const results: GenerationResult[] = [];
      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [focusAreaScenario],
        systemPrompt: undefined,
        tools: [
          { name: 'tool_a', description: 'Tool A' },
          { name: 'tool_b', description: 'Tool B' },
        ],
        seedExamples: undefined,
      })) {
        results.push(result);
      }

      expect(results[0]!.testCase.context.provenance.source).toBe('focus_area');
      expect(results[0]!.testCase.context.provenance.planAxis).toBe('tool_a,tool_b');
    });

    it('should handle scenario without tools', async () => {
      const noToolsScenario: Scenario = {
        ...baseScenario,
        toolsInvolved: [],
      };

      mockedConverseWithRetry.mockResolvedValue({
        input: 'Simple question',
        expected: {
          response: 'Simple answer',
          topics: ['general'],
        },
      });

      const results: GenerationResult[] = [];
      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [noToolsScenario],
        systemPrompt: undefined,
        tools: undefined,
        seedExamples: undefined,
      })) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      expect(results[0]!.testCase.expected.toolCalls).toBeUndefined();
    });

    it('should use traceExampleFinder for trace-grounded generation', async () => {
      const traceExampleFinder = jest.fn().mockReturnValue([
        {
          input: 'Example query from trace',
          expected: { response: 'Example response', toolCalls: [{ name: 'get_product', args: { id: 'trace-1' } }] },
        },
      ]);

      mockedConverseWithRetry.mockResolvedValue({
        input: 'Generated query',
        expected: {
          response: 'Generated response',
          topics: ['products'],
          toolCalls: [{ name: 'get_product', args: { product_id: 'GEN-1' } }],
        },
      });

      const results: GenerationResult[] = [];
      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [baseScenario],
        systemPrompt: undefined,
        tools,
        seedExamples: undefined,
        traceExampleFinder,
      })) {
        results.push(result);
      }

      // Should call traceExampleFinder with scenario's tools and outcome
      expect(traceExampleFinder).toHaveBeenCalledWith(['get_product'], 'happy_path');
      expect(results).toHaveLength(1);
    });

    it('should call traceExampleFinder for tool-less scenarios', async () => {
      const noToolsScenario: Scenario = {
        ...baseScenario,
        toolsInvolved: [],
      };

      const traceExampleFinder = jest.fn().mockReturnValue([
        { input: 'Tool-less trace example', expected: { response: 'Trace response' } },
      ]);

      mockedConverseWithRetry.mockResolvedValue({
        input: 'Query',
        expected: {
          response: 'Response',
          topics: ['general'],
        },
      });

      const results: GenerationResult[] = [];
      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [noToolsScenario],
        systemPrompt: undefined,
        tools: undefined,
        seedExamples: [{ input: 'Fallback example', expected: { response: 'Fallback' } }],
        traceExampleFinder,
      })) {
        results.push(result);
      }

      // Should call traceExampleFinder even for tool-less scenarios
      expect(traceExampleFinder).toHaveBeenCalledWith([], 'happy_path');
      expect(results).toHaveLength(1);
    });

    it('should fall back to seedExamples when traceExampleFinder returns empty', async () => {
      const scenario: Scenario = {
        ...baseScenario,
        toolsInvolved: ['get_product'],
      };

      const traceExampleFinder = jest.fn().mockReturnValue([]); // Returns empty

      mockedConverseWithRetry.mockResolvedValue({
        input: 'Query',
        expected: {
          response: 'Response',
          topics: ['general'],
          toolCalls: [{ name: 'get_product', args: { id: '123' } }],
        },
      });

      const fallbackExamples = [{ input: 'Fallback example', expected: { response: 'Fallback' } }];

      const results: GenerationResult[] = [];
      for await (const result of generateTestCases({
        modelId: 'test-model',
        scenarios: [scenario],
        systemPrompt: undefined,
        tools: [{ name: 'get_product', description: 'Get product' }],
        seedExamples: fallbackExamples,
        traceExampleFinder,
      })) {
        results.push(result);
      }

      // traceExampleFinder was called but returned empty, so fallback is used
      expect(traceExampleFinder).toHaveBeenCalledWith(['get_product'], 'happy_path');
      expect(results).toHaveLength(1);
    });
  });
});
