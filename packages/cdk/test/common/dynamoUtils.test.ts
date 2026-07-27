import {
  buildDdbCondition,
  buildDdbConditionExpression,
  buildKeyConditionExpression,
  buildUpdateExpression,
  DdbCondition,
  DdbConditionalOperators,
  DdbConditionExpression,
  SortKeyQueryCondition,
} from '@common/dynamoUtils';

describe('buildDdbCondition', () => {
  it('should handle key-only function operators', () => {
    const operators = [DdbConditionalOperators.ATTRIBUTE_EXISTS, DdbConditionalOperators.ATTRIBUTE_NOT_EXISTS] as const;

    operators.forEach((op) => {
      const condition: DdbCondition = {
        key: 'user',
        operator: op,
      };

      const result = buildDdbCondition(condition);
      expect(result).toEqual({
        expression: `${op}(#user)`,
        expressionAttributeNames: { '#user': 'user' },
        expressionAttributeValues: {},
      });
    });
  });

  it('should handle BETWEEN operator', () => {
    const condition: DdbCondition = {
      key: 'age',
      operator: DdbConditionalOperators.BETWEEN,
      values: [20, 30],
    };

    const result = buildDdbCondition(condition);
    expect(result).toEqual({
      expression: '#age BETWEEN :age_1_ForCond_0 AND :age_2_ForCond_0',
      expressionAttributeNames: { '#age': 'age' },
      expressionAttributeValues: {
        ':age_1_ForCond_0': 20,
        ':age_2_ForCond_0': 30,
      },
    });
  });

  it('should handle IN operator with multiple values', () => {
    const condition: DdbCondition = {
      key: 'status',
      operator: DdbConditionalOperators.IN,
      values: ['active', 'pending', 'completed'],
    };

    const result = buildDdbCondition(condition);
    expect(result).toEqual({
      expression: '#status IN (:status_0_ForCond_0, :status_1_ForCond_0, :status_2_ForCond_0)',
      expressionAttributeNames: { '#status': 'status' },
      expressionAttributeValues: {
        ':status_0_ForCond_0': 'active',
        ':status_1_ForCond_0': 'pending',
        ':status_2_ForCond_0': 'completed',
      },
    });
  });

  it('should handle comparison operators', () => {
    const operators = [
      DdbConditionalOperators.EQUAL_TO,
      DdbConditionalOperators.NOT_EQUAL_TO,
      DdbConditionalOperators.GREATER_THAN,
      DdbConditionalOperators.GREATER_THAN_OR_EQUAL_TO,
      DdbConditionalOperators.LESS_THAN,
      DdbConditionalOperators.LESS_THAN_OR_EQUAL_TO,
    ] as const;

    operators.forEach((op) => {
      const condition: DdbCondition = {
        key: 'price',
        operator: op,
        values: [100],
      };

      const result = buildDdbCondition(condition);
      expect(result).toEqual({
        expression: `#price ${op} :price_ForCond_0`,
        expressionAttributeNames: { '#price': 'price' },
        expressionAttributeValues: {
          ':price_ForCond_0': 100,
        },
      });
    });
  });

  it('should handle BEGINS_WITH operator', () => {
    const condition: DdbCondition = {
      key: 'name',
      operator: DdbConditionalOperators.BEGINS_WITH,
      values: ['abc'],
    };

    const result = buildDdbCondition(condition);
    expect(result).toEqual({
      expression: `${DdbConditionalOperators.BEGINS_WITH}(#name, :name_ForCond_0)`,
      expressionAttributeNames: { '#name': 'name' },
      expressionAttributeValues: {
        ':name_ForCond_0': 'abc',
      },
    });
  });

  it('should handle CONTAINS operator', () => {
    const condition: DdbCondition = {
      key: 'items',
      operator: DdbConditionalOperators.CONTAINS,
      values: ['item1'],
    };

    const result = buildDdbCondition(condition);
    expect(result).toEqual({
      expression: `${DdbConditionalOperators.CONTAINS}(#items, :items_ForCond_0)`,
      expressionAttributeNames: { '#items': 'items' },
      expressionAttributeValues: {
        ':items_ForCond_0': 'item1',
      },
    });
  });

  it('should handle nested path attributes', () => {
    const condition: DdbCondition = {
      key: 'user.address.city',
      operator: DdbConditionalOperators.EQUAL_TO,
      values: ['New York'],
    };

    const result = buildDdbCondition(condition);
    expect(result).toEqual({
      expression: '#user.#address.#city = :useraddresscity_ForCond_0',
      expressionAttributeNames: {
        '#user': 'user',
        '#address': 'address',
        '#city': 'city',
      },
      expressionAttributeValues: {
        ':useraddresscity_ForCond_0': 'New York',
      },
    });
  });

  it('should handle different placeholder indices', () => {
    const condition: DdbCondition = {
      key: 'status',
      operator: DdbConditionalOperators.EQUAL_TO,
      values: ['active'],
    };

    const result = buildDdbCondition(condition, 2);
    expect(result).toEqual({
      expression: '#status = :status_ForCond_2',
      expressionAttributeNames: { '#status': 'status' },
      expressionAttributeValues: {
        ':status_ForCond_2': 'active',
      },
    });
  });
});

describe('buildDdbConditionExpression', () => {
  it('should build a simple condition expression', () => {
    const condition: DdbConditionExpression = {
      condition: {
        key: 'status',
        operator: DdbConditionalOperators.EQUAL_TO,
        values: ['active'],
      },
    };

    const result = buildDdbConditionExpression(condition);

    expect(result.expression).toBe('#status = :status_ForCond_0');
    expect(result.expressionAttributeNames).toEqual({
      '#status': 'status',
    });
    expect(result.expressionAttributeValues).toEqual({
      ':status_ForCond_0': 'active',
    });
    expect(result.nextPlaceholderIdx).toBe(1);
  });

  it('should build complex expressions with nested conditions', () => {
    const condition: DdbConditionExpression = {
      and: [
        {
          condition: {
            key: 'name',
            operator: DdbConditionalOperators.EQUAL_TO,
            values: ['test'],
          },
        },
        {
          or: [
            {
              condition: {
                key: 'value',
                operator: DdbConditionalOperators.GREATER_THAN_OR_EQUAL_TO,
                values: [20],
              },
            },
            {
              condition: {
                key: 'value',
                operator: DdbConditionalOperators.LESS_THAN_OR_EQUAL_TO,
                values: [50],
              },
            },
          ],
        },
        {
          not: {
            condition: {
              key: 'state',
              operator: DdbConditionalOperators.IN,
              values: ['archived', 'deprecated'],
            },
          },
        },
      ],
    };

    const result = buildDdbConditionExpression(condition);

    expect(result.expression).toBe(
      '(#name = :name_ForCond_0) AND ((#value >= :value_ForCond_1) OR (#value <= :value_ForCond_2)) AND (NOT(#state IN (:state_0_ForCond_3, :state_1_ForCond_3)))',
    );
    expect(result.expressionAttributeNames).toEqual({
      '#name': 'name',
      '#value': 'value',
      '#state': 'state',
    });
    expect(result.expressionAttributeValues).toEqual({
      ':name_ForCond_0': 'test',
      ':value_ForCond_1': 20,
      ':value_ForCond_2': 50,
      ':state_0_ForCond_3': 'archived',
      ':state_1_ForCond_3': 'deprecated',
    });
    expect(result.nextPlaceholderIdx).toBe(4);
  });
});

describe('buildKeyConditionExpression', () => {
  it('should build expression with partition key only', () => {
    const partitionKey = {
      key: 'pk',
      value: 'test-id',
    };

    const result = buildKeyConditionExpression(partitionKey);

    expect(result).toEqual({
      expression: '#pk = :pk_ForCond_0',
      expressionAttributeNames: {
        '#pk': 'pk',
      },
      expressionAttributeValues: {
        ':pk_ForCond_0': 'test-id',
      },
      nextPlaceholderIdx: 1,
    });
  });

  it('should build expression with partition key and sort key condition', () => {
    const partitionKey = {
      key: 'pk',
      value: 'test-id',
    };

    const sortKeyCondition: SortKeyQueryCondition = {
      key: 'sk',
      operator: DdbConditionalOperators.BEGINS_WITH,
      values: ['ORDER#'],
    };

    const result = buildKeyConditionExpression(partitionKey, sortKeyCondition);

    expect(result).toEqual({
      expression: '(#pk = :pk_ForCond_0) AND (begins_with(#sk, :sk_ForCond_1))',
      expressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk',
      },
      expressionAttributeValues: {
        ':pk_ForCond_0': 'test-id',
        ':sk_ForCond_1': 'ORDER#',
      },
      nextPlaceholderIdx: 2,
    });
  });
});

describe('buildUpdateExpression', () => {
  it('should build update expression for single attribute', () => {
    const updateValues = {
      name: 'John Doe',
    };

    const result = buildUpdateExpression(updateValues);

    expect(result.expression).toBe('SET #name = :nameForUpdate');
    expect(result.expressionAttributeNames).toEqual({
      '#name': 'name',
    });
    expect(result.expressionAttributeValues).toEqual({
      ':nameForUpdate': 'John Doe',
    });
  });

  it('should build update expression for multiple attributes', () => {
    const updateValues = {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com',
    };

    const result = buildUpdateExpression(updateValues);

    expect(result.expression).toBe('SET #age = :ageForUpdate, #email = :emailForUpdate, #name = :nameForUpdate');
    expect(result.expressionAttributeNames).toEqual({
      '#age': 'age',
      '#email': 'email',
      '#name': 'name',
    });
    expect(result.expressionAttributeValues).toEqual({
      ':ageForUpdate': 30,
      ':emailForUpdate': 'john@example.com',
      ':nameForUpdate': 'John Doe',
    });
  });

  it('should handle empty update values', () => {
    const updateValues = {};

    const result = buildUpdateExpression(updateValues);

    expect(result.expression).toBeUndefined();
    expect(result.expressionAttributeNames).toEqual({});
    expect(result.expressionAttributeValues).toEqual({});
  });
});
