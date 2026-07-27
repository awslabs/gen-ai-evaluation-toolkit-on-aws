import { Taxonomy } from '../../src/models';

// Mock the bedrock module
jest.mock('../../src/helpers/bedrock', () => {
  const actual = jest.requireActual('../../src/helpers/bedrock');
  return {
    converseWithRetry: jest.fn(),
    createUserMessage: jest.fn((content: string) => ({ role: 'user', content: [{ text: content }] })),
    extractJsonFromResponse: jest.fn((content: string) => content),
    // Use the real implementation so field-level error formatting is exercised end-to-end.
    parseWithFieldErrors: actual.parseWithFieldErrors,
    safeJsonParse: actual.safeJsonParse,
  };
});

import { sampleScenarios } from '../../src/stages/planner';
import { converseWithRetry } from '../../src/helpers/bedrock';

const mockedConverseWithRetry = converseWithRetry as jest.MockedFunction<typeof converseWithRetry>;

describe('planner', () => {
  const baseTaxonomy: Taxonomy = {
    axes: {
      tools: ['tool_a', 'tool_b'],
      toolCombinations: [['tool_a'], ['tool_b'], ['tool_a', 'tool_b']],
      turnCounts: [1, 2, 3],
      difficulty: ['easy', 'medium', 'hard'],
      topics: ['topic1', 'topic2'],
      outcomes: ['happy_path', 'refusal', 'clarification'],
    },
    gaps: ['edge case 1'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sampleScenarios', () => {
    it('should sample scenarios in single batch for small counts', async () => {
      const mockScenarios = [
        {
          id: 'scenario-001',
          description: 'Test scenario 1',
          type: 'single_turn',
          turns: 1,
          toolsInvolved: ['tool_a'],
          difficulty: 'easy',
          topics: ['topic1'],
          outcome: 'happy_path',
          source: 'gap_fill',
          priority: 5,
        },
        {
          id: 'scenario-002',
          description: 'Test scenario 2',
          type: 'multi_turn',
          turns: 2,
          toolsInvolved: ['tool_a', 'tool_b'],
          difficulty: 'medium',
          topics: ['topic2'],
          outcome: 'refusal',
          source: 'focus_area',
          priority: 2,
        },
      ];

      mockedConverseWithRetry.mockResolvedValue(mockScenarios);

      const scenarios = await sampleScenarios({
        modelId: 'test-model',
        taxonomy: baseTaxonomy,
        totalTestCases: 5,
        focusAreas: undefined,
      });

      expect(mockedConverseWithRetry).toHaveBeenCalledTimes(1);
      expect(scenarios).toHaveLength(2);
      // Should be sorted by priority (focus_area first)
      expect(scenarios[0]!.source).toBe('focus_area');
    });

    it('should sample scenarios in multiple batches for large counts', async () => {
      const createMockScenarios = (startId: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: `scenario-${String(startId + i).padStart(3, '0')}`,
          description: `Test scenario ${startId + i}`,
          type: 'single_turn' as const,
          turns: 1,
          toolsInvolved: ['tool_a'],
          difficulty: 'easy',
          topics: ['topic1'],
          outcome: 'happy_path',
          source: 'gap_fill' as const,
          priority: 5,
        }));

      mockedConverseWithRetry
        .mockResolvedValueOnce(createMockScenarios(1, 15))
        .mockResolvedValueOnce(createMockScenarios(16, 15))
        .mockResolvedValueOnce(createMockScenarios(31, 10));

      const scenarios = await sampleScenarios({
        modelId: 'test-model',
        taxonomy: baseTaxonomy,
        totalTestCases: 40,
        focusAreas: undefined,
      });

      expect(mockedConverseWithRetry).toHaveBeenCalledTimes(3);
      expect(scenarios).toHaveLength(40);
    });

    it('should pass focus areas to prompt builder', async () => {
      mockedConverseWithRetry.mockResolvedValue([
        {
          id: 'scenario-001',
          description: 'Focus area scenario',
          type: 'single_turn',
          turns: 1,
          toolsInvolved: ['tool_a'],
          difficulty: 'easy',
          topics: ['billing'],
          outcome: 'happy_path',
          source: 'focus_area',
          priority: 1,
        },
      ]);

      const scenarios = await sampleScenarios({
        modelId: 'test-model',
        taxonomy: baseTaxonomy,
        totalTestCases: 5,
        focusAreas: ['billing issues', 'refund requests'],
      });

      expect(scenarios).toHaveLength(1);
      expect(scenarios[0]!.source).toBe('focus_area');
    });

    it('should sort scenarios by priority', async () => {
      const mockScenarios = [
        {
          id: 'scenario-001',
          description: 'Low priority',
          type: 'single_turn',
          turns: 1,
          toolsInvolved: ['tool_a'],
          difficulty: 'easy',
          topics: ['topic1'],
          outcome: 'happy_path',
          source: 'gap_fill',
          priority: 7,
        },
        {
          id: 'scenario-002',
          description: 'High priority',
          type: 'single_turn',
          turns: 1,
          toolsInvolved: ['tool_a'],
          difficulty: 'easy',
          topics: ['topic1'],
          outcome: 'happy_path',
          source: 'focus_area',
          priority: 1,
        },
        {
          id: 'scenario-003',
          description: 'Medium priority',
          type: 'single_turn',
          turns: 1,
          toolsInvolved: ['tool_a'],
          difficulty: 'easy',
          topics: ['topic1'],
          outcome: 'happy_path',
          source: 'gap_fill',
          priority: 4,
        },
      ];

      mockedConverseWithRetry.mockResolvedValue(mockScenarios);

      const scenarios = await sampleScenarios({
        modelId: 'test-model',
        taxonomy: baseTaxonomy,
        totalTestCases: 5,
        focusAreas: undefined,
      });

      expect(scenarios[0]!.priority).toBe(1);
      expect(scenarios[1]!.priority).toBe(4);
      expect(scenarios[2]!.priority).toBe(7);
    });

    it('should handle empty scenario response with error', async () => {
      mockedConverseWithRetry.mockImplementation(async (_options: unknown, parseResponse: (content: string) => unknown) => {
        // Simulate the parse function being called with empty array
        // This should throw because empty scenarios are not allowed
        return parseResponse('[]');
      });

      await expect(
        sampleScenarios({
          modelId: 'test-model',
          taxonomy: baseTaxonomy,
          totalTestCases: 5,
          focusAreas: undefined,
        }),
      ).rejects.toThrow(/empty scenarios/);
    });

    it('should validate scenarios against taxonomy', async () => {
      // Scenario with invalid turn count (4 not in [1,2,3])
      mockedConverseWithRetry.mockImplementation(async (_options: unknown, parseResponse: (content: string) => unknown) => {
        // Simulate the parse function being called with invalid data
        // The parseResponse will throw because turns=4 is not in taxonomy
        const invalidScenarios = [
          {
            id: 'scenario-001',
            description: 'Invalid turns',
            type: 'single_turn',
            turns: 4, // Invalid - not in [1,2,3]
            toolsInvolved: ['tool_a'],
            difficulty: 'easy',
            topics: ['topic1'],
            outcome: 'happy_path',
            source: 'gap_fill',
            priority: 5,
          },
        ];
        return parseResponse(JSON.stringify(invalidScenarios));
      });

      await expect(
        sampleScenarios({
          modelId: 'test-model',
          taxonomy: baseTaxonomy,
          totalTestCases: 5,
          focusAreas: undefined,
        }),
      ).rejects.toThrow(/not in taxonomy/);
    });

    it('should detect duplicate tools in scenarios', async () => {
      mockedConverseWithRetry.mockImplementation(async (_options: unknown, parseResponse: (content: string) => unknown) => {
        const duplicateToolScenarios = [
          {
            id: 'scenario-001',
            description: 'Duplicate tools',
            type: 'single_turn',
            turns: 1,
            toolsInvolved: ['tool_a', 'tool_a'], // Duplicate!
            difficulty: 'easy',
            topics: ['topic1'],
            outcome: 'happy_path',
            source: 'gap_fill',
            priority: 5,
          },
        ];
        return parseResponse(JSON.stringify(duplicateToolScenarios));
      });

      await expect(
        sampleScenarios({
          modelId: 'test-model',
          taxonomy: baseTaxonomy,
          totalTestCases: 5,
          focusAreas: undefined,
        }),
      ).rejects.toThrow(/duplicate tools/);
    });
  });
});
