import {
  toDdbConditionExpression,
  toDdbCondition,
  assertAnnotationConditionValidity,
} from '@datastore/api/helpers/annotationFilter';
import { AnnotationSchemaDdbItem } from '@datastore/api/types';
import { getAnnotationSchema } from '@datastore/api/helpers';
import {
  AnnotationConditionExpression,
  NumericLogicalComparator,
  StringEnumLogicalComparator,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DdbConditionalOperators } from '@common/dynamoUtils';

//Mock the getAnnotationSchema function
jest.mock('@datastore/api/helpers/getEntityHelpers');
const mockGetAnnotationSchema = getAnnotationSchema as jest.MockedFunction<typeof getAnnotationSchema>;

describe('assertAnnotationConditionValidity', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should throw error when unknown annotation condition is provided', async () => {
    await expect(
      assertAnnotationConditionValidity({
        $unknown: ['someKey', {}],
      }),
    ).rejects.toThrow('Unknown annotation condition');
  });

  it('should throw error when numeric condition is expected but not provided', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      valueType: {
        number: {},
      },
    } as AnnotationSchemaDdbItem);

    await expect(
      assertAnnotationConditionValidity({
        stringEnumCondition: {
          name: 'testAnnotation',
          comparator: StringEnumLogicalComparator.EQUAL_TO,
          value: 'someValue',
        },
      }),
    ).rejects.toThrow("Invalid condition for annotation 'testAnnotation': Expected a numeric value condition.");
  });

  it('should throw error when string enum condition is expected but not provided', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      valueType: {
        string: {
          enum: ['validValue1', 'validValue2'],
        },
      },
    } as AnnotationSchemaDdbItem);

    await expect(
      assertAnnotationConditionValidity({
        numericCondition: {
          name: 'testAnnotation',
          comparator: StringEnumLogicalComparator.EQUAL_TO,
          value: 5,
        },
      }),
    ).rejects.toThrow(
      "Invalid condition for annotation 'testAnnotation': The value must be one of the following: [validValue1, validValue2].",
    );
  });

  it('should throw error when string enum value is invalid', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      valueType: {
        string: {
          enum: ['validValue1', 'validValue2'],
        },
      },
    } as AnnotationSchemaDdbItem);

    await expect(
      assertAnnotationConditionValidity({
        stringEnumCondition: {
          name: 'testAnnotation',
          comparator: StringEnumLogicalComparator.EQUAL_TO,
          value: 'invalidValue',
        },
      }),
    ).rejects.toThrow(
      "Invalid condition for annotation 'testAnnotation': The value must be one of the following: [validValue1, validValue2].",
    );
  });

  it('should pass validation for valid numeric condition', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      valueType: {
        number: {},
      },
    } as AnnotationSchemaDdbItem);

    await expect(
      assertAnnotationConditionValidity({
        numericCondition: {
          name: 'testAnnotation',
          comparator: NumericLogicalComparator.EQUAL_TO,
          value: 42,
        },
      }),
    ).resolves.not.toThrow();
  });

  it('should pass validation for valid string enum condition', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      valueType: {
        string: {
          enum: ['validValue1', 'validValue2'],
        },
      },
    } as AnnotationSchemaDdbItem);

    await expect(
      assertAnnotationConditionValidity({
        stringEnumCondition: {
          name: 'testAnnotation',
          comparator: StringEnumLogicalComparator.EQUAL_TO,
          value: 'validValue1',
        },
      }),
    ).resolves.not.toThrow();
  });
});

describe('toDdbCondition', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should convert numeric condition correctly', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      valueType: {
        number: {},
      },
    } as AnnotationSchemaDdbItem);

    const result = await toDdbCondition({
      numericCondition: {
        name: 'score',
        comparator: NumericLogicalComparator.GREATER_THAN,
        value: 90,
      },
    });

    expect(result).toEqual({
      key: 'annotations.score.value.numericValue',
      operator: DdbConditionalOperators.GREATER_THAN,
      values: [90],
    });
  });

  it('should handle zero values in numeric conditions', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      valueType: {
        number: {},
      },
    } as AnnotationSchemaDdbItem);

    const result = await toDdbCondition({
      numericCondition: {
        name: 'count',
        comparator: NumericLogicalComparator.EQUAL_TO,
        value: 0,
      },
    });

    expect(result).toEqual({
      key: 'annotations.count.value.numericValue',
      operator: DdbConditionalOperators.EQUAL_TO,
      values: [0],
    });
  });

  it('should convert string enum condition correctly', async () => {
    mockGetAnnotationSchema.mockResolvedValue({
      valueType: {
        string: {
          enum: ['ACTIVE'],
        },
      },
    } as AnnotationSchemaDdbItem);

    const result = await toDdbCondition({
      stringEnumCondition: {
        name: 'status',
        comparator: StringEnumLogicalComparator.EQUAL_TO,
        value: 'ACTIVE',
      },
    });

    expect(result).toEqual({
      key: 'annotations.status.value.stringValue',
      operator: DdbConditionalOperators.EQUAL_TO,
      values: ['ACTIVE'],
    });
  });
});

describe('toDdbConditionExpression', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should handle single condition expression', async () => {
    mockGetAnnotationSchema.mockResolvedValueOnce({
      valueType: {
        string: {
          enum: ['ACTIVE'],
        },
      },
    } as AnnotationSchemaDdbItem);

    const result = await toDdbConditionExpression({
      condition: {
        stringEnumCondition: {
          name: 'status',
          comparator: StringEnumLogicalComparator.EQUAL_TO,
          value: 'ACTIVE',
        },
      },
    });

    expect(result).toStrictEqual({
      condition: {
        key: 'annotations.status.value.stringValue',
        operator: DdbConditionalOperators.EQUAL_TO,
        values: ['ACTIVE'],
      },
    });
  });

  it('should handle nested conditions', async () => {
    const input: AnnotationConditionExpression = {
      and: [
        {
          or: [
            {
              condition: {
                numericCondition: {
                  name: 'accuracy',
                  comparator: NumericLogicalComparator.GREATER_THAN,
                  value: 0.4,
                },
              },
            },
            {
              condition: {
                numericCondition: {
                  name: 'accuracy',
                  comparator: NumericLogicalComparator.LESS_THAN_OR_EQUAL,
                  value: 0.8,
                },
              },
            },
          ],
        },
        {
          not: {
            condition: {
              stringEnumCondition: {
                name: 'riskLevel',
                comparator: StringEnumLogicalComparator.EQUAL_TO,
                value: 'HIGH',
              },
            },
          },
        },
      ],
    };

    mockGetAnnotationSchema
      .mockResolvedValueOnce({
        valueType: {
          number: {},
        },
      } as AnnotationSchemaDdbItem)
      .mockResolvedValueOnce({
        valueType: {
          number: {},
        },
      } as AnnotationSchemaDdbItem)
      .mockResolvedValueOnce({
        valueType: {
          string: {
            enum: ['HIGH', 'LOW'],
          },
        },
      } as AnnotationSchemaDdbItem);

    const result = await toDdbConditionExpression(input);

    expect(result).toStrictEqual({
      and: [
        {
          or: [
            {
              condition: {
                key: 'annotations.accuracy.value.numericValue',
                operator: DdbConditionalOperators.GREATER_THAN,
                values: [0.4],
              },
            },
            {
              condition: {
                key: 'annotations.accuracy.value.numericValue',
                operator: DdbConditionalOperators.LESS_THAN_OR_EQUAL_TO,
                values: [0.8],
              },
            },
          ],
        },
        {
          not: {
            condition: {
              key: 'annotations.riskLevel.value.stringValue',
              operator: DdbConditionalOperators.EQUAL_TO,
              values: ['HIGH'],
            },
          },
        },
      ],
    });
  });

  it('should throw error for unknown condition expression', async () => {
    await expect(
      toDdbConditionExpression({
        $unknown: ['someKey', {}],
      }),
    ).rejects.toThrow();
  });
});
