import { conditionExpressionSchema } from '@src/schemas/conditionExpression';

describe('conditionExpressionSchema', () => {
  test('accepts leaf conditions (stringEnum and numeric)', () => {
    const stringLeaf = {
      condition: { stringEnumCondition: { name: 'QUALITY_TIER', value: 'HIGH', comparator: '=' } },
    };
    const numericLeaf = {
      condition: { numericCondition: { name: 'SCORE', value: 8, comparator: '>=' } },
    };
    expect(() => conditionExpressionSchema.parse(stringLeaf)).not.toThrow();
    expect(() => conditionExpressionSchema.parse(numericLeaf)).not.toThrow();
  });

  test('accepts nested AND/OR/NOT', () => {
    const input = {
      and: [
        { condition: { stringEnumCondition: { name: 'TIER', value: 'HIGH', comparator: '=' } } },
        {
          or: [
            { condition: { numericCondition: { name: 'SCORE', value: 8, comparator: '>=' } } },
            { not: { condition: { numericCondition: { name: 'ACCURACY', value: 6, comparator: '<' } } } },
          ],
        },
      ],
    };
    expect(() => conditionExpressionSchema.parse(input)).not.toThrow();
  });

  test('rejects malformed input', () => {
    expect(() => conditionExpressionSchema.parse({ invalid: 'data' })).toThrow();
    expect(() => conditionExpressionSchema.parse({ condition: {} })).toThrow();
    expect(() => conditionExpressionSchema.parse('string')).toThrow();
  });

  test('rejects comparators outside the allowed enums', () => {
    const badNumeric = {
      condition: { numericCondition: { name: 'SCORE', value: 8, comparator: 'LIKE' } },
    };
    // stringEnum conditions only permit equality operators (= / !=)
    const badStringEnum = {
      condition: { stringEnumCondition: { name: 'TIER', value: 'HIGH', comparator: '>' } },
    };
    expect(() => conditionExpressionSchema.parse(badNumeric)).toThrow();
    expect(() => conditionExpressionSchema.parse(badStringEnum)).toThrow();
  });
});
