import {
  ToolDefinitionModel,
  ToolCallModel,
  SeedExampleModel,
  TaxonomyAxesModel,
  TaxonomyModel,
  ScenarioModel,
  ProvenanceModel,
  GeneratedTestCaseModel,
  S3UriModel,
  isS3Reference,
  parseS3Uri,
} from '../../src/models';

describe('models', () => {
  describe('S3UriModel', () => {
    it('should validate valid S3 URI', () => {
      const s3Ref = { s3: 's3://my-bucket/path/to/file.json' };
      const result = S3UriModel.parse(s3Ref);

      expect(result).toEqual(s3Ref);
    });

    it('should reject invalid S3 URI without bucket', () => {
      expect(() => S3UriModel.parse({ s3: 's3:///path/to/file.json' })).toThrow();
    });

    it('should reject invalid S3 URI without key', () => {
      expect(() => S3UriModel.parse({ s3: 's3://my-bucket' })).toThrow();
    });

    it('should reject non-S3 URI', () => {
      expect(() => S3UriModel.parse({ s3: 'https://example.com/file.json' })).toThrow();
    });
  });

  describe('isS3Reference', () => {
    it('should return true for S3 reference object', () => {
      expect(isS3Reference({ s3: 's3://bucket/key' })).toBe(true);
    });

    it('should return false for string', () => {
      expect(isS3Reference('plain string')).toBe(false);
    });

    it('should return false for array', () => {
      expect(isS3Reference(['item1', 'item2'])).toBe(false);
    });

    it('should return false for null', () => {
      expect(isS3Reference(null)).toBe(false);
    });

    it('should return false for object without s3 key', () => {
      expect(isS3Reference({ bucket: 'test', key: 'path' })).toBe(false);
    });
  });

  describe('parseS3Uri', () => {
    it('should parse valid S3 URI', () => {
      const result = parseS3Uri('s3://my-bucket/path/to/file.json');

      expect(result).toEqual({ bucket: 'my-bucket', key: 'path/to/file.json' });
    });

    it('should parse S3 URI with nested path', () => {
      const result = parseS3Uri('s3://bucket/a/b/c/d.txt');

      expect(result).toEqual({ bucket: 'bucket', key: 'a/b/c/d.txt' });
    });

    it('should throw for invalid S3 URI', () => {
      expect(() => parseS3Uri('https://bucket/key')).toThrow('Invalid S3 URI');
    });

    it('should throw for malformed S3 URI', () => {
      expect(() => parseS3Uri('s3://bucket-only')).toThrow('Invalid S3 URI');
    });
  });

  describe('ToolDefinitionModel', () => {
    it('should validate tool with name and description', () => {
      const tool = { name: 'search', description: 'Search for items' };
      const result = ToolDefinitionModel.parse(tool);

      expect(result).toEqual(tool);
    });

    it('should validate tool with parameters', () => {
      const tool = {
        name: 'search',
        description: 'Search for items',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
        },
      };
      const result = ToolDefinitionModel.parse(tool);

      expect(result.parameters).toBeDefined();
    });

    it('should reject tool without name', () => {
      expect(() => ToolDefinitionModel.parse({ description: 'test' })).toThrow();
    });

    it('should reject tool without description', () => {
      expect(() => ToolDefinitionModel.parse({ name: 'test' })).toThrow();
    });
  });

  describe('ToolCallModel', () => {
    it('should validate tool call with name and args', () => {
      const toolCall = { name: 'search', args: { query: 'test' } };
      const result = ToolCallModel.parse(toolCall);

      expect(result).toEqual(toolCall);
    });

    it('should accept empty args', () => {
      const toolCall = { name: 'list_all', args: {} };
      const result = ToolCallModel.parse(toolCall);

      expect(result.args).toEqual({});
    });

    it('should reject tool call without name', () => {
      expect(() => ToolCallModel.parse({ args: {} })).toThrow();
    });

    it('should reject tool call without args', () => {
      expect(() => ToolCallModel.parse({ name: 'test' })).toThrow();
    });
  });

  describe('SeedExampleModel', () => {
    it('should validate single-turn example', () => {
      const example = {
        input: 'What is the weather?',
        expected: {
          response: 'The weather is sunny.',
          topics: ['weather'],
        },
      };
      const result = SeedExampleModel.parse(example);

      expect(result.input).toBe('What is the weather?');
    });

    it('should validate multi-turn example', () => {
      const example = {
        input: ['First message', 'Second message'],
        expected: {
          response: 'Final response',
          topics: ['topic1'],
          toolCalls: [{ name: 'tool1', args: {} }],
        },
      };
      const result = SeedExampleModel.parse(example);

      expect(result.input).toHaveLength(2);
    });

    it('should accept example without topics', () => {
      const example = {
        input: 'Question',
        expected: { response: 'Answer' },
      };
      const result = SeedExampleModel.parse(example);

      expect(result.expected.topics).toBeUndefined();
    });

    it('should accept example without toolCalls', () => {
      const example = {
        input: 'Question',
        expected: { response: 'Answer', topics: [] },
      };
      const result = SeedExampleModel.parse(example);

      expect(result.expected.toolCalls).toBeUndefined();
    });
  });

  describe('TaxonomyAxesModel', () => {
    it('should validate full taxonomy axes', () => {
      const axes = {
        turnCounts: [1, 2, 3],
        difficulty: ['easy', 'hard'],
        outcomes: ['success', 'failure'],
      };
      const result = TaxonomyAxesModel.parse(axes);

      expect(result).toEqual(axes);
    });

    it('should accept partial taxonomy axes', () => {
      const axes = { turnCounts: [1, 2] };
      const result = TaxonomyAxesModel.parse(axes);

      expect(result.turnCounts).toEqual([1, 2]);
      expect(result.difficulty).toBeUndefined();
    });

    it('should accept empty object', () => {
      const result = TaxonomyAxesModel.parse({});

      expect(result).toEqual({});
    });
  });

  describe('TaxonomyModel', () => {
    it('should validate complete taxonomy', () => {
      const taxonomy = {
        axes: {
          tools: ['tool1', 'tool2'],
          toolCombinations: [['tool1'], ['tool1', 'tool2']],
          turnCounts: [1, 2],
          difficulty: ['easy', 'medium'],
          topics: ['topic1'],
          outcomes: ['happy_path'],
        },
        gaps: ['gap1'],
      };
      const result = TaxonomyModel.parse(taxonomy);

      expect(result.axes.tools).toHaveLength(2);
      expect(result.gaps).toHaveLength(1);
    });

    it('should accept taxonomy without gaps', () => {
      const taxonomy = {
        axes: {
          tools: [],
          toolCombinations: [],
          turnCounts: [1],
          difficulty: ['easy'],
          topics: ['general'],
          outcomes: ['happy_path'],
        },
      };
      const result = TaxonomyModel.parse(taxonomy);

      expect(result.gaps).toBeUndefined();
    });
  });

  describe('ScenarioModel', () => {
    it('should validate single_turn scenario', () => {
      const scenario = {
        id: 'scenario-001',
        description: 'User asks a question',
        type: 'single_turn',
        turns: 1,
        toolsInvolved: ['search'],
        difficulty: 'easy',
        topics: ['general'],
        outcome: 'happy_path',
        source: 'gap_fill',
        priority: 5,
      };
      const result = ScenarioModel.parse(scenario);

      expect(result.type).toBe('single_turn');
    });

    it('should validate multi_turn scenario', () => {
      const scenario = {
        id: 'scenario-002',
        description: 'Multi-step conversation',
        type: 'multi_turn',
        turns: 3,
        toolsInvolved: ['search', 'book'],
        difficulty: 'hard',
        topics: ['booking'],
        outcome: 'clarification',
        source: 'focus_area',
        priority: 2,
      };
      const result = ScenarioModel.parse(scenario);

      expect(result.type).toBe('multi_turn');
      expect(result.turns).toBe(3);
    });

    it('should reject invalid type', () => {
      const scenario = {
        id: 'scenario-001',
        description: 'Test',
        type: 'invalid_type',
        turns: 1,
        toolsInvolved: [],
        difficulty: 'easy',
        topics: [],
        outcome: 'happy_path',
        source: 'gap_fill',
        priority: 1,
      };

      expect(() => ScenarioModel.parse(scenario)).toThrow();
    });

    it('should reject invalid source', () => {
      const scenario = {
        id: 'scenario-001',
        description: 'Test',
        type: 'single_turn',
        turns: 1,
        toolsInvolved: [],
        difficulty: 'easy',
        topics: [],
        outcome: 'happy_path',
        source: 'invalid_source',
        priority: 1,
      };

      expect(() => ScenarioModel.parse(scenario)).toThrow();
    });
  });

  describe('ProvenanceModel', () => {
    it('should validate provenance with all fields', () => {
      const provenance = {
        source: 'focus_area',
        scenarioId: 'scenario-001',
        planAxis: 'tool1,tool2',
      };
      const result = ProvenanceModel.parse(provenance);

      expect(result).toEqual(provenance);
    });

    it('should accept provenance without planAxis', () => {
      const provenance = {
        source: 'gap_fill',
        scenarioId: 'scenario-002',
      };
      const result = ProvenanceModel.parse(provenance);

      expect(result.planAxis).toBeUndefined();
    });

    it('should reject invalid source', () => {
      expect(() =>
        ProvenanceModel.parse({
          source: 'invalid',
          scenarioId: 'test',
        }),
      ).toThrow();
    });
  });

  describe('GeneratedTestCaseModel', () => {
    it('should validate single-turn test case', () => {
      const testCase = {
        input: 'What is the price?',
        expected: {
          response: 'The price is $99',
          topics: ['pricing'],
          toolCalls: [{ name: 'get_price', args: { id: '123' } }],
        },
        context: {
          provenance: {
            source: 'gap_fill',
            scenarioId: 'scenario-001',
          },
        },
      };
      const result = GeneratedTestCaseModel.parse(testCase);

      expect(typeof result.input).toBe('string');
    });

    it('should validate multi-turn test case with flat toolCalls', () => {
      const testCase = {
        input: ['First question', 'Follow up'],
        expected: {
          response: 'Final answer',
          topics: ['topic1', 'topic2'],
        },
        context: {
          provenance: {
            source: 'focus_area',
            scenarioId: 'scenario-002',
            planAxis: 'tool1',
          },
        },
      };
      const result = GeneratedTestCaseModel.parse(testCase);

      expect(Array.isArray(result.input)).toBe(true);
      expect(result.input).toHaveLength(2);
    });

    it('should validate multi-turn test case with per-turn toolCalls (array of arrays)', () => {
      const testCase = {
        input: ['What products do you have?', 'What is the return policy?'],
        expected: {
          response: 'Final answer covering both queries',
          topics: ['products', 'returns'],
          toolCalls: [
            [{ name: 'get_products', args: { category: 'all' } }],
            [{ name: 'get_return_policy', args: {} }],
          ],
        },
        context: {
          provenance: {
            source: 'focus_area',
            scenarioId: 'scenario-003',
            planAxis: 'get_products,get_return_policy',
          },
        },
      };
      const result = GeneratedTestCaseModel.parse(testCase);

      expect(Array.isArray(result.input)).toBe(true);
      expect(result.input).toHaveLength(2);
      expect(Array.isArray(result.expected.toolCalls)).toBe(true);
      expect(result.expected.toolCalls).toHaveLength(2);
      expect(Array.isArray(result.expected.toolCalls![0])).toBe(true);
    });

    it('should accept test case without toolCalls', () => {
      const testCase = {
        input: 'Simple question',
        expected: {
          response: 'Simple answer',
          topics: [],
        },
        context: {
          provenance: {
            source: 'gap_fill',
            scenarioId: 'scenario-001',
          },
        },
      };
      const result = GeneratedTestCaseModel.parse(testCase);

      expect(result.expected.toolCalls).toBeUndefined();
    });

    it('should reject test case without response', () => {
      const testCase = {
        input: 'Question',
        expected: {
          topics: [],
        },
        context: {
          provenance: {
            source: 'gap_fill',
            scenarioId: 'scenario-001',
          },
        },
      };

      expect(() => GeneratedTestCaseModel.parse(testCase)).toThrow();
    });
  });
});
