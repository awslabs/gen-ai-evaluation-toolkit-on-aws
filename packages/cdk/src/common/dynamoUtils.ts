import { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';

export enum DdbConditionalOperators {
  EQUAL_TO = '=',
  NOT_EQUAL_TO = '<>',
  LESS_THAN_OR_EQUAL_TO = '<=',
  LESS_THAN = '<',
  GREATER_THAN_OR_EQUAL_TO = '>=',
  GREATER_THAN = '>',
  BETWEEN = 'BETWEEN',
  IN = 'IN',
  ATTRIBUTE_EXISTS = 'attribute_exists',
  ATTRIBUTE_NOT_EXISTS = 'attribute_not_exists',
  BEGINS_WITH = 'begins_with',
  CONTAINS = 'contains',
}

export type DdbCondition =
  | {
      operator: DdbConditionalOperators.ATTRIBUTE_EXISTS | DdbConditionalOperators.ATTRIBUTE_NOT_EXISTS;
      key: string;
      values?: never; // values are not required for these operations
    }
  | {
      operator: DdbConditionalOperators.BETWEEN;
      key: string;
      values: [NativeAttributeValue, NativeAttributeValue]; // Only two values are accepted
    }
  | {
      operator: DdbConditionalOperators.IN;
      key: string;
      values: NativeAttributeValue[]; // A list of values are accepted
    }
  | {
      operator: Exclude<
        DdbConditionalOperators,
        | DdbConditionalOperators.ATTRIBUTE_EXISTS
        | DdbConditionalOperators.ATTRIBUTE_NOT_EXISTS
        | DdbConditionalOperators.BETWEEN
        | DdbConditionalOperators.IN
      >;
      key: string;
      values: [NativeAttributeValue]; // Only one value is accepted
    };

export type DdbConditionExpression =
  | {
      condition: DdbCondition;
      and?: never;
      or?: never;
      not?: never;
    }
  | {
      and: DdbConditionExpression[];
      condition?: never;
      or?: never;
      not?: never;
    }
  | {
      or: DdbConditionExpression[];
      condition?: never;
      and?: never;
      not?: never;
    }
  | {
      not: DdbConditionExpression;
      condition?: never;
      or?: never;
      and?: never;
    };

export type SortKeyQueryCondition =
  | {
      operator: DdbConditionalOperators.BETWEEN;
      key: string;
      values: [NativeAttributeValue, NativeAttributeValue]; // Only two values are accepted
    }
  | {
      operator:
        | DdbConditionalOperators.EQUAL_TO
        | DdbConditionalOperators.GREATER_THAN
        | DdbConditionalOperators.GREATER_THAN_OR_EQUAL_TO
        | DdbConditionalOperators.LESS_THAN
        | DdbConditionalOperators.LESS_THAN_OR_EQUAL_TO
        | DdbConditionalOperators.BEGINS_WITH;
      key: string;
      values: [NativeAttributeValue];
    };

export type DdbAttribute = {
  key: string;
  value: NativeAttributeValue;
};

type BuildExpressionOutput = {
  expression: string | undefined; // can be a set expression, conditional expression or a filter expression
  expressionAttributeValues: Record<string, NativeAttributeValue>;
  expressionAttributeNames: Record<string, string>;
};

/**
 * Builds a ddb conditional expression for a given condition
 * @param condition A condition
 * @param placeholderIndex Current index of the value placeholder. This value is appended as a suffix to the
 *                  placeholder to avoid conflicts when there are multiple conditions available for the same key.
 * @returns BuildExpressionOutput
 */
export function buildDdbCondition(condition: DdbCondition, placeholderIndex: number = 0): BuildExpressionOutput {
  const { key, operator, values } = condition;

  // Avoids conflicts with DDB reserved words.
  const convertedKey = `#${key.replaceAll('.', '.#').replaceAll('-', '_')}`;
  const expressionAttributeNames = key
    .split('.')
    .reduce((acc, pathSegment) => ({ ...acc, [`#${pathSegment.replaceAll('-', '_')}`]: pathSegment }), {});

  // Placeholders cannot contain "." or "-"
  const valuePlaceholderBase = key.replaceAll('.', '').replaceAll('-', '_');

  switch (operator) {
    case DdbConditionalOperators.ATTRIBUTE_EXISTS:
    case DdbConditionalOperators.ATTRIBUTE_NOT_EXISTS:
      return {
        expression: `${operator}(#${key})`,
        expressionAttributeNames,
        expressionAttributeValues: {},
      };
    case DdbConditionalOperators.BETWEEN:
      return {
        expression: `#${key} BETWEEN :${valuePlaceholderBase}_1_ForCond_${placeholderIndex} AND :${valuePlaceholderBase}_2_ForCond_${placeholderIndex}`,
        expressionAttributeNames,
        expressionAttributeValues: {
          [`:${valuePlaceholderBase}_1_ForCond_${placeholderIndex}`]: values[0],
          [`:${valuePlaceholderBase}_2_ForCond_${placeholderIndex}`]: values[1],
        },
      };
    case DdbConditionalOperators.IN:
      return {
        expression: `#${key} IN (${values.map((_, i) => `:${valuePlaceholderBase}_${i}_ForCond_${placeholderIndex}`).join(', ')})`,
        expressionAttributeNames,
        expressionAttributeValues: values.reduce(
          (acc, value, i) => ({
            ...acc,
            [`:${valuePlaceholderBase}_${i}_ForCond_${placeholderIndex}`]: value,
          }),
          {},
        ),
      };
    case DdbConditionalOperators.EQUAL_TO:
    case DdbConditionalOperators.NOT_EQUAL_TO:
    case DdbConditionalOperators.GREATER_THAN:
    case DdbConditionalOperators.GREATER_THAN_OR_EQUAL_TO:
    case DdbConditionalOperators.LESS_THAN:
    case DdbConditionalOperators.LESS_THAN_OR_EQUAL_TO:
      return {
        expression: `${convertedKey} ${operator} :${valuePlaceholderBase}_ForCond_${placeholderIndex}`,
        expressionAttributeNames,
        expressionAttributeValues: { [`:${valuePlaceholderBase}_ForCond_${placeholderIndex}`]: values[0] },
      };
    case DdbConditionalOperators.BEGINS_WITH:
    case DdbConditionalOperators.CONTAINS:
      return {
        expression: `${operator}(#${key}, :${valuePlaceholderBase}_ForCond_${placeholderIndex})`,
        expressionAttributeNames,
        expressionAttributeValues: { [`:${valuePlaceholderBase}_ForCond_${placeholderIndex}`]: values[0] },
      };
  }
}

/**
 * Builds a ddb condition expression for a given complex condition expression
 * @param conditionExpression ConditionalExpression
 * @param placeholderIdx Current index of the value placeholder. This value is appended as a suffix to the
 *                  placeholder to avoid conflicts when there are multiple conditions available for the same key.
 * @returns BuildExpressionOutput and the next placeholder index
 */
export function buildDdbConditionExpression(
  conditionExpression: DdbConditionExpression,
  placeholderIdx = 0,
): BuildExpressionOutput & { nextPlaceholderIdx: number } {
  if (conditionExpression.condition) {
    return {
      ...buildDdbCondition(conditionExpression.condition, placeholderIdx),
      nextPlaceholderIdx: placeholderIdx + 1,
    };
  }

  // AND and OR operations
  if (conditionExpression.and || conditionExpression.or) {
    const { subExpression, expressionSeparator } = conditionExpression.and
      ? { subExpression: conditionExpression.and, expressionSeparator: 'AND' }
      : { subExpression: conditionExpression.or, expressionSeparator: 'OR' };
    let nextIdx = placeholderIdx;
    const results = subExpression.map((subExpression) => {
      const { nextPlaceholderIdx, ...results } = buildDdbConditionExpression(subExpression, nextIdx);
      nextIdx = nextPlaceholderIdx;
      return results;
    });
    return {
      expression: results.map((result) => `(${result.expression})`).join(` ${expressionSeparator} `),
      expressionAttributeNames: results.reduce((acc, result) => ({ ...acc, ...result.expressionAttributeNames }), {}),
      expressionAttributeValues: results.reduce((acc, result) => ({ ...acc, ...result.expressionAttributeValues }), {}),
      nextPlaceholderIdx: nextIdx,
    };
  }

  // NOT operation
  const results = buildDdbConditionExpression(conditionExpression.not, placeholderIdx);
  return {
    ...results,
    expression: `NOT(${results.expression})`,
  };
}

/**
 * Build Key Condition Expression for QueryCommand
 * @param partitionKey Partition Key
 * @param sortKeyCondition Sort Key condition
 * @return keyConditionExpression for the query as string
 */
export function buildKeyConditionExpression(
  partitionKey: DdbAttribute,
  sortKeyCondition?: SortKeyQueryCondition,
): BuildExpressionOutput {
  const partitionKeyCondition: DdbCondition = {
    key: partitionKey.key,
    operator: DdbConditionalOperators.EQUAL_TO,
    values: [partitionKey.value],
  };

  if (!sortKeyCondition) {
    return buildDdbConditionExpression({
      condition: partitionKeyCondition,
    });
  }

  return buildDdbConditionExpression({
    and: [
      {
        condition: partitionKeyCondition,
      },
      {
        condition: sortKeyCondition,
      },
    ],
  });
}

/**
 * Builds the update expression for the given attributes
 * @param updateValues Attributes to be updated
 * @returns BuildExpressionOutput
 */
export function buildUpdateExpression(updateValues: Record<string, NativeAttributeValue>): BuildExpressionOutput {
  return {
    expression:
      Object.keys(updateValues).length > 0
        ? 'SET ' +
          Object.keys(updateValues)
            .sort() // To generate expression in consistent order, for easier debugging
            .map((key) => `#${key} = :${key}ForUpdate`)
            .join(', ')
        : undefined,
    expressionAttributeNames: Object.keys(updateValues).reduce((acc, key) => ({ ...acc, [`#${key}`]: key }), {}),
    expressionAttributeValues: Object.keys(updateValues).reduce(
      (acc, key) => ({ ...acc, [`:${key}ForUpdate`]: updateValues[key] }),
      {},
    ),
  };
}
