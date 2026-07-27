import { validateToolCalls, validateToolName } from '../../src/validation/toolValidator';
import { ToolDefinition, ToolCall } from '../../src/models';

describe('toolValidator', () => {
  const toolDefinitions: ToolDefinition[] = [
    {
      name: 'get_product_info',
      description: 'Get information about a product',
      parameters: {
        type: 'object',
        properties: {
          product_type: {
            type: 'string',
            enum: ['laptops', 'tablets', 'smartphones'],
          },
        },
        required: ['product_type'],
      },
    },
    {
      name: 'get_return_policy',
      description: 'Get return policy for a product category',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
          },
        },
        required: ['category'],
      },
    },
    {
      name: 'check_stock',
      description: 'Check stock availability',
    },
  ];

  describe('validateToolCalls', () => {
    it('should return no errors for valid tool calls', () => {
      const toolCalls: ToolCall[] = [
        { name: 'get_product_info', args: { product_type: 'laptops' } },
        { name: 'get_return_policy', args: { category: 'electronics' } },
      ];

      const errors = validateToolCalls(toolCalls, toolDefinitions);
      expect(errors).toHaveLength(0);
    });

    it('should return error for unknown tool', () => {
      const toolCalls: ToolCall[] = [{ name: 'unknown_tool', args: {} }];

      const errors = validateToolCalls(toolCalls, toolDefinitions);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Unknown tool');
    });

    it('should return error for invalid enum value', () => {
      const toolCalls: ToolCall[] = [{ name: 'get_product_info', args: { product_type: 'invalid' } }];

      const errors = validateToolCalls(toolCalls, toolDefinitions);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should return error for missing required parameter', () => {
      const toolCalls: ToolCall[] = [{ name: 'get_product_info', args: {} }];

      const errors = validateToolCalls(toolCalls, toolDefinitions);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should allow tool calls to tools without parameters', () => {
      const toolCalls: ToolCall[] = [{ name: 'check_stock', args: {} }];

      const errors = validateToolCalls(toolCalls, toolDefinitions);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateToolName', () => {
    it('should return true for valid tool name', () => {
      expect(validateToolName('get_product_info', toolDefinitions)).toBe(true);
    });

    it('should return false for invalid tool name', () => {
      expect(validateToolName('invalid_tool', toolDefinitions)).toBe(false);
    });
  });
});
