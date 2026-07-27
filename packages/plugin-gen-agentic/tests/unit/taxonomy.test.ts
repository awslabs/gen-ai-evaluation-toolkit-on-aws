import { buildDefaultTaxonomy } from '../../src/stages/taxonomy';
import { ToolDefinition } from '../../src/models';

describe('taxonomy', () => {
  describe('buildDefaultTaxonomy', () => {
    it('should build taxonomy with default axes when no inputs provided', () => {
      const taxonomy = buildDefaultTaxonomy(undefined, undefined, undefined);

      expect(taxonomy.axes.tools).toEqual([]);
      expect(taxonomy.axes.toolCombinations).toEqual([[]]);
      expect(taxonomy.axes.turnCounts).toEqual([1, 2, 3]);
      expect(taxonomy.axes.difficulty).toEqual(['easy', 'medium', 'hard']);
      expect(taxonomy.axes.outcomes).toEqual(['happy_path', 'refusal', 'clarification']);
      expect(taxonomy.axes.topics).toEqual(['general']);
      expect(taxonomy.gaps).toEqual([]);
    });

    it('should include tool names from provided tools', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool_a', description: 'Tool A' },
        { name: 'tool_b', description: 'Tool B' },
        { name: 'tool_c', description: 'Tool C' },
      ];

      const taxonomy = buildDefaultTaxonomy(undefined, tools, undefined);

      expect(taxonomy.axes.tools).toEqual(['tool_a', 'tool_b', 'tool_c']);
    });

    it('should generate single-tool combinations', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool_a', description: 'Tool A' },
        { name: 'tool_b', description: 'Tool B' },
      ];

      const taxonomy = buildDefaultTaxonomy(undefined, tools, undefined);

      expect(taxonomy.axes.toolCombinations).toContainEqual(['tool_a']);
      expect(taxonomy.axes.toolCombinations).toContainEqual(['tool_b']);
    });

    it('should generate two-tool combinations', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool_a', description: 'Tool A' },
        { name: 'tool_b', description: 'Tool B' },
        { name: 'tool_c', description: 'Tool C' },
      ];

      const taxonomy = buildDefaultTaxonomy(undefined, tools, undefined);

      expect(taxonomy.axes.toolCombinations).toContainEqual(['tool_a', 'tool_b']);
      expect(taxonomy.axes.toolCombinations).toContainEqual(['tool_a', 'tool_c']);
      expect(taxonomy.axes.toolCombinations).toContainEqual(['tool_b', 'tool_c']);
    });

    it('should use focus areas as topics when provided', () => {
      const focusAreas = ['billing', 'shipping', 'returns'];

      const taxonomy = buildDefaultTaxonomy(undefined, undefined, focusAreas);

      expect(taxonomy.axes.topics).toContain('billing');
      expect(taxonomy.axes.topics).toContain('shipping');
      expect(taxonomy.axes.topics).toContain('returns');
    });

    it('should limit topics to first 5 focus areas', () => {
      const focusAreas = ['topic1', 'topic2', 'topic3', 'topic4', 'topic5', 'topic6', 'topic7'];

      const taxonomy = buildDefaultTaxonomy(undefined, undefined, focusAreas);

      expect(taxonomy.axes.topics).toHaveLength(5);
      expect(taxonomy.axes.topics).not.toContain('topic6');
      expect(taxonomy.axes.topics).not.toContain('topic7');
    });

    it('should use "general" topic when no focus areas provided', () => {
      const taxonomy = buildDefaultTaxonomy(undefined, undefined, undefined);

      expect(taxonomy.axes.topics).toEqual(['general']);
    });

    it('should use "general" topic when empty focus areas provided', () => {
      const taxonomy = buildDefaultTaxonomy(undefined, undefined, []);

      expect(taxonomy.axes.topics).toEqual(['general']);
    });

    it('should handle single tool correctly', () => {
      const tools: ToolDefinition[] = [{ name: 'only_tool', description: 'The only tool' }];

      const taxonomy = buildDefaultTaxonomy(undefined, tools, undefined);

      expect(taxonomy.axes.tools).toEqual(['only_tool']);
      expect(taxonomy.axes.toolCombinations).toEqual([['only_tool']]);
    });

    it('should generate correct number of combinations for 4 tools', () => {
      const tools: ToolDefinition[] = [
        { name: 'a', description: 'A' },
        { name: 'b', description: 'B' },
        { name: 'c', description: 'C' },
        { name: 'd', description: 'D' },
      ];

      const taxonomy = buildDefaultTaxonomy(undefined, tools, undefined);

      // 4 single + 6 pairs (4 choose 2) = 10 combinations
      expect(taxonomy.axes.toolCombinations).toHaveLength(10);
    });

    it('should ignore system prompt (unused parameter)', () => {
      const taxonomy1 = buildDefaultTaxonomy('System prompt 1', undefined, undefined);
      const taxonomy2 = buildDefaultTaxonomy('System prompt 2', undefined, undefined);

      expect(taxonomy1).toEqual(taxonomy2);
    });
  });
});
