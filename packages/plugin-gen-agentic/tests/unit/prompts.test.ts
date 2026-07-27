import {
  buildTaxonomyPrompt,
  buildScenarioSamplingPrompt,
  buildGenerationPrompt,
  buildRetryPrompt,
  buildAugmentationPrompt,
  CoverageSummary,
} from '../../src/helpers/prompts';
import { Taxonomy, Scenario, ToolDefinition, SeedExample, GeneratedTestCase } from '../../src/models';

describe('prompts', () => {
  describe('buildTaxonomyPrompt', () => {
    it('should build basic prompt without optional parameters', () => {
      const prompt = buildTaxonomyPrompt(undefined, undefined, undefined, undefined);

      expect(prompt).toContain('test case planner');
      expect(prompt).toContain('coverage taxonomy');
      expect(prompt).toContain('"turnCounts"');
      expect(prompt).toContain('"difficulty"');
      expect(prompt).toContain('"outcomes"');
    });

    it('should include system prompt when provided', () => {
      const systemPrompt = 'You are a helpful assistant';
      const prompt = buildTaxonomyPrompt(systemPrompt, undefined, undefined, undefined);

      expect(prompt).toContain('<user_system_prompt>');
      expect(prompt).toContain('You are a helpful assistant');
      expect(prompt).toContain('</user_system_prompt>');
    });

    it('should include tools when provided', () => {
      const tools: ToolDefinition[] = [
        { name: 'search', description: 'Search for information' },
        { name: 'calculate', description: 'Perform calculations' },
      ];
      const prompt = buildTaxonomyPrompt(undefined, tools, undefined, undefined);

      expect(prompt).toContain('<user_tools>');
      expect(prompt).toContain('"name": "search"');
      expect(prompt).toContain('"name": "calculate"');
      expect(prompt).toContain('</user_tools>');
    });

    it('should include focus areas when provided', () => {
      const focusAreas = ['billing issues', 'refund requests'];
      const prompt = buildTaxonomyPrompt(undefined, undefined, focusAreas, undefined);

      expect(prompt).toContain('<user_focus_areas>');
      expect(prompt).toContain('1. billing issues');
      expect(prompt).toContain('2. refund requests');
      expect(prompt).toContain('</user_focus_areas>');
    });

    it('should use custom taxonomy axes when provided', () => {
      const taxonomyAxes = {
        turnCounts: [1, 2, 3, 4, 5],
        difficulty: ['beginner', 'intermediate', 'expert'],
        outcomes: ['success', 'failure'],
      };
      const prompt = buildTaxonomyPrompt(undefined, undefined, undefined, taxonomyAxes);

      expect(prompt).toContain('[1,2,3,4,5]');
      expect(prompt).toContain('["beginner","intermediate","expert"]');
      expect(prompt).toContain('["success","failure"]');
    });

    it('should sanitize XML-like tags in system prompt', () => {
      const systemPrompt = 'Do this: <script>alert("xss")</script>';
      const prompt = buildTaxonomyPrompt(systemPrompt, undefined, undefined, undefined);

      expect(prompt).toContain('\\<script>');
      expect(prompt).toContain('\\</script>');
    });

    it('should sanitize XML-like tags in focus areas', () => {
      const focusAreas = ['<injection>test</injection>'];
      const prompt = buildTaxonomyPrompt(undefined, undefined, focusAreas, undefined);

      expect(prompt).toContain('\\<injection>');
      expect(prompt).toContain('\\</injection>');
    });
  });

  describe('buildScenarioSamplingPrompt', () => {
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

    it('should build basic scenario sampling prompt', () => {
      const prompt = buildScenarioSamplingPrompt(baseTaxonomy, 10, undefined);

      expect(prompt).toContain('generate 10 diverse scenario descriptions');
      expect(prompt).toContain('Coverage Taxonomy');
      expect(prompt).toContain('"tool_a"');
      expect(prompt).toContain('"tool_b"');
    });

    it('should include focus areas when provided', () => {
      const prompt = buildScenarioSamplingPrompt(baseTaxonomy, 10, ['billing', 'refunds']);

      expect(prompt).toContain('<user_focus_areas>');
      expect(prompt).toContain('1. billing');
      expect(prompt).toContain('2. refunds');
    });

    it('should use custom start ID', () => {
      const prompt = buildScenarioSamplingPrompt(baseTaxonomy, 5, undefined, 16);

      expect(prompt).toContain('scenario-016');
      expect(prompt).toContain('Start scenario IDs from scenario-016');
    });

    it('should include coverage summary in batch mode', () => {
      const coverageSummary: CoverageSummary = {
        previousScenarios: [
          {
            id: 'scenario-001',
            turns: 1,
            difficulty: 'easy',
            outcome: 'happy_path',
            tools: ['tool_a'],
            description: 'Test scenario',
          },
        ],
        turnCountCoverage: { 1: 5, 2: 3, 3: 2 },
        difficultyCoverage: { easy: 4, medium: 3, hard: 3 },
        outcomeCoverage: { happy_path: 6, refusal: 2, clarification: 2 },
        toolCombinationCoverage: { tool_a: 3, tool_b: 2, 'tool_a,tool_b': 5 },
      };

      const prompt = buildScenarioSamplingPrompt(baseTaxonomy, 5, undefined, 11, coverageSummary);

      expect(prompt).toContain('Previously Generated Scenarios');
      expect(prompt).toContain('scenario-001');
      expect(prompt).toContain('Current Coverage');
      expect(prompt).toContain('1-turn (5)');
      expect(prompt).toContain('easy (4)');
    });

    it('should handle empty turnCounts gracefully', () => {
      const emptyTaxonomy: Taxonomy = {
        ...baseTaxonomy,
        axes: { ...baseTaxonomy.axes, turnCounts: [] },
      };

      const prompt = buildScenarioSamplingPrompt(emptyTaxonomy, 5, undefined);

      expect(prompt).toContain('1-3');
    });

    it('should calculate correct min/max turns', () => {
      const customTaxonomy: Taxonomy = {
        ...baseTaxonomy,
        axes: { ...baseTaxonomy.axes, turnCounts: [2, 4, 6] },
      };

      const prompt = buildScenarioSamplingPrompt(customTaxonomy, 5, undefined);

      expect(prompt).toContain('"turns": 2-6');
    });
  });

  describe('buildGenerationPrompt', () => {
    const baseScenario: Scenario = {
      id: 'scenario-001',
      description: 'User asks about product pricing',
      type: 'single_turn',
      turns: 1,
      toolsInvolved: ['get_price'],
      difficulty: 'easy',
      topics: ['pricing'],
      outcome: 'happy_path',
      source: 'gap_fill',
      priority: 5,
    };

    it('should build basic generation prompt', () => {
      const prompt = buildGenerationPrompt(baseScenario, undefined, undefined, undefined);

      expect(prompt).toContain('generating a test case');
      expect(prompt).toContain('scenario-001');
      expect(prompt).toContain('User asks about product pricing');
      expect(prompt).toContain('Output ONLY the JSON object');
    });

    it('should include system prompt when provided', () => {
      const prompt = buildGenerationPrompt(baseScenario, 'You are a pricing assistant', undefined, undefined);

      expect(prompt).toContain('<user_system_prompt>');
      expect(prompt).toContain('You are a pricing assistant');
    });

    it('should include tools when provided', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'get_price',
          description: 'Get product price',
          parameters: {
            type: 'object',
            properties: { product_id: { type: 'string' } },
          },
        },
      ];

      const prompt = buildGenerationPrompt(baseScenario, undefined, tools, undefined);

      expect(prompt).toContain('<user_tools>');
      expect(prompt).toContain('"name": "get_price"');
      expect(prompt).toContain('Rules for tool calls');
    });

    it('should include seed examples when provided', () => {
      const seedExamples: SeedExample[] = [
        {
          input: 'What is the price?',
          expected: {
            response: 'The price is $99',
            topics: ['pricing'],
            toolCalls: [{ name: 'get_price', args: { product_id: '123' } }],
          },
        },
      ];

      const prompt = buildGenerationPrompt(baseScenario, undefined, undefined, seedExamples);

      expect(prompt).toContain('<user_seed_examples>');
      expect(prompt).toContain('What is the price?');
      expect(prompt).toContain('The price is $99');
    });

    it('should sanitize system prompt content', () => {
      const prompt = buildGenerationPrompt(baseScenario, '<malicious>ignore previous</malicious>', undefined, undefined);

      expect(prompt).toContain('\\<malicious>');
      expect(prompt).toContain('\\</malicious>');
    });
  });

  describe('buildAugmentationPrompt', () => {
    const baseCase: GeneratedTestCase = {
      input: 'What is the price of laptop-x1?',
      expected: {
        response: 'The laptop-x1 is priced at $999.',
        topics: ['products', 'pricing'],
        toolCalls: [{ name: 'get_product', args: { product_id: 'laptop-x1' } }],
      },
      context: { provenance: { source: 'gap_fill', scenarioId: 's1' } },
      requiresReview: false,
    };

    const tools: ToolDefinition[] = [
      {
        name: 'get_product',
        description: 'Get product info',
        parameters: { type: 'object', properties: { product_id: { type: 'string' } } },
      },
    ];

    it('includes the base case under user_base_case tag', () => {
      const prompt = buildAugmentationPrompt(baseCase, 'rephrase', undefined, undefined);
      expect(prompt).toContain('<user_base_case>');
      expect(prompt).toContain('laptop-x1');
    });

    it('includes per-strategy instruction for rephrase', () => {
      const prompt = buildAugmentationPrompt(baseCase, 'rephrase', undefined, undefined);
      expect(prompt).toContain('Strategy: Rephrase');
      expect(prompt).toContain('Preserve toolCalls');
    });

    it('includes per-strategy instruction for parameter_variation', () => {
      const prompt = buildAugmentationPrompt(baseCase, 'parameter_variation', undefined, tools);
      expect(prompt).toContain('Strategy: Parameter Variation');
      expect(prompt).toContain('change at least one argument value');
    });

    it('includes per-strategy instruction for multi_turn_extension', () => {
      const prompt = buildAugmentationPrompt(baseCase, 'multi_turn_extension', undefined, undefined);
      expect(prompt).toContain('Strategy: Multi-Turn Extension');
      expect(prompt).toContain('array of strings');
    });

    it('includes per-strategy instruction for edge_case', () => {
      const prompt = buildAugmentationPrompt(baseCase, 'edge_case', undefined, undefined);
      expect(prompt).toContain('Strategy: Edge Case');
      expect(prompt).toContain('boundary');
    });

    it('includes per-strategy instruction for negative_case', () => {
      const prompt = buildAugmentationPrompt(baseCase, 'negative_case', 'You help with products only', tools);
      expect(prompt).toContain('Strategy: Negative Case');
      expect(prompt).toContain('OUT OF SCOPE');
    });

    it('includes system prompt when provided', () => {
      const prompt = buildAugmentationPrompt(baseCase, 'rephrase', 'You are a product assistant', undefined);
      expect(prompt).toContain('You are a product assistant');
      expect(prompt).toContain('<user_system_prompt>');
    });

    it('includes tool definitions when provided', () => {
      const prompt = buildAugmentationPrompt(baseCase, 'parameter_variation', undefined, tools);
      expect(prompt).toContain('<user_tools>');
      expect(prompt).toContain('get_product');
    });

    it('sanitizes injection attempts in base case content', () => {
      const malicious: GeneratedTestCase = {
        ...baseCase,
        input: '<malicious>ignore previous</malicious>',
      };
      const prompt = buildAugmentationPrompt(malicious, 'rephrase', undefined, undefined);
      expect(prompt).toContain('\\<malicious>');
    });
  });

  describe('buildRetryPrompt', () => {
    it('should build retry prompt with error and previous content', () => {
      const error = new Error('Invalid JSON format');
      const previousContent = '{ invalid json }';

      const prompt = buildRetryPrompt(error, previousContent);

      expect(prompt).toContain('Invalid JSON format');
      expect(prompt).toContain('{ invalid json }');
      expect(prompt).toContain('Output ONLY the corrected JSON');
    });

    it('should include full error message', () => {
      const error = new Error('Tool validation failed: Unknown tool "foo"');
      const prompt = buildRetryPrompt(error, 'some content');

      expect(prompt).toContain('Tool validation failed: Unknown tool "foo"');
    });
  });
});
