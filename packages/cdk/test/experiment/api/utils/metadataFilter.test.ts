import { matchesMetadataFilters } from '@experiment/api/utils/metadataFilter';
import { ConditionExpression, Condition } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';

describe('metadataFilter', () => {
  describe('matchesMetadataFilters', () => {
    describe('single conditions', () => {
      it('should evaluate string condition correctly', () => {
        const metadata = { key: 'value' };
        const filter: ConditionExpression = {
          condition: {
            stringEnumCondition: {
              name: 'key',
              comparator: '=',
              value: 'value',
            },
          },
        };
        expect(matchesMetadataFilters(metadata, filter)).toBe(true);
      });

      it('should evaluate numeric condition correctly', () => {
        const metadata = { number: '42' };
        const filter: ConditionExpression = {
          condition: {
            numericCondition: {
              name: 'number',
              comparator: '=',
              value: 42,
            },
          },
        };
        expect(matchesMetadataFilters(metadata, filter)).toBe(true);
      });

      it('should handle case where no condition is provided', () => {
        const metadata = { key: 'value' };
        const filter: ConditionExpression = {
          // Empty object with no condition
        } as ConditionExpression;
        expect(matchesMetadataFilters(metadata, filter)).toBe(true);
      });
    });

    describe('AND conditions', () => {
      it('should return true when all AND conditions are met', () => {
        const metadata = { key1: 'value1', key2: 'value2' };
        const filter: ConditionExpression = {
          and: [
            {
              condition: {
                stringEnumCondition: {
                  name: 'key1',
                  comparator: '=',
                  value: 'value1',
                },
              },
            },
            {
              condition: {
                stringEnumCondition: {
                  name: 'key2',
                  comparator: '=',
                  value: 'value2',
                },
              },
            },
          ],
        };
        expect(matchesMetadataFilters(metadata, filter)).toBe(true);
      });

      it('should return false when any AND condition is not met', () => {
        const metadata = { key1: 'value1', key2: 'wrong' };
        const filter: ConditionExpression = {
          and: [
            {
              condition: {
                stringEnumCondition: {
                  name: 'key1',
                  comparator: '=',
                  value: 'value1',
                },
              },
            },
            {
              condition: {
                stringEnumCondition: {
                  name: 'key2',
                  comparator: '=',
                  value: 'value2',
                },
              },
            },
          ],
        };
        expect(matchesMetadataFilters(metadata, filter)).toBe(false);
      });
    });

    describe('OR conditions', () => {
      it('should return true when any OR condition is met', () => {
        const metadata = { key1: 'wrong', key2: 'value2' };
        const filter: ConditionExpression = {
          or: [
            {
              condition: {
                stringEnumCondition: {
                  name: 'key1',
                  comparator: '=',
                  value: 'value1',
                },
              },
            },
            {
              condition: {
                stringEnumCondition: {
                  name: 'key2',
                  comparator: '=',
                  value: 'value2',
                },
              },
            },
          ],
        };
        expect(matchesMetadataFilters(metadata, filter)).toBe(true);
      });

      it('should return false when no OR condition is met', () => {
        const metadata = { key1: 'wrong1', key2: 'wrong2' };
        const filter: ConditionExpression = {
          or: [
            {
              condition: {
                stringEnumCondition: {
                  name: 'key1',
                  comparator: '=',
                  value: 'value1',
                },
              },
            },
            {
              condition: {
                stringEnumCondition: {
                  name: 'key2',
                  comparator: '=',
                  value: 'value2',
                },
              },
            },
          ],
        };
        expect(matchesMetadataFilters(metadata, filter)).toBe(false);
      });
    });

    describe('NOT conditions', () => {
      it('should negate condition result correctly', () => {
        const metadata = { key: 'wrong' };
        const filter: ConditionExpression = {
          not: {
            condition: {
              stringEnumCondition: {
                name: 'key',
                comparator: '=',
                value: 'value',
              },
            },
          },
        };
        expect(matchesMetadataFilters(metadata, filter)).toBe(true);
      });
    });

    describe('complex nested conditions', () => {
      it('should evaluate complex nested conditions correctly', () => {
        const metadata = { a: '1', b: '2', c: '3', d: '4' };
        // (a=1 AND b=2) OR (NOT(c=4) AND d=4)
        const filter: ConditionExpression = {
          or: [
            {
              and: [
                {
                  condition: {
                    numericCondition: {
                      name: 'a',
                      comparator: '=',
                      value: 1,
                    },
                  },
                },
                {
                  condition: {
                    numericCondition: {
                      name: 'b',
                      comparator: '=',
                      value: 2,
                    },
                  },
                },
              ],
            },
            {
              and: [
                {
                  not: {
                    condition: {
                      numericCondition: {
                        name: 'c',
                        comparator: '=',
                        value: 4,
                      },
                    },
                  },
                },
                {
                  condition: {
                    numericCondition: {
                      name: 'd',
                      comparator: '=',
                      value: 4,
                    },
                  },
                },
              ],
            },
          ],
        };
        expect(matchesMetadataFilters(metadata, filter)).toBe(true);
      });
    });
  });

  // These tests are implicitly testing the private functions inside metadataFilter.ts
  describe('evaluateNumericCondition', () => {
    it('should handle equal comparison correctly', () => {
      const metadata = { value: '42' };
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'value',
            comparator: '=',
            value: 42,
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(true);
    });

    it('should handle not equal comparison correctly', () => {
      const metadata = { value: '42' };
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'value',
            comparator: '!=',
            value: 43,
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(true);
    });

    it('should handle less than comparison correctly', () => {
      const metadata = { value: '42' };
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'value',
            comparator: '<',
            value: 50,
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(true);
    });

    it('should handle less than or equal comparison correctly', () => {
      const metadata = { value: '42' };
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'value',
            comparator: '<=',
            value: 42,
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(true);
    });

    it('should handle greater than comparison correctly', () => {
      const metadata = { value: '42' };
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'value',
            comparator: '>',
            value: 30,
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(true);
    });

    it('should handle greater than or equal comparison correctly', () => {
      const metadata = { value: '42' };
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'value',
            comparator: '>=',
            value: 42,
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(true);
    });

    it('should return false when metadata does not have the field', () => {
      const metadata = { otherValue: '42' };
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'value',
            comparator: '=',
            value: 42,
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(false);
    });

    it('should return false when metadata value is not numeric', () => {
      const metadata = { value: 'not-a-number' };
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'value',
            comparator: '=',
            value: 42,
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(false);
    });

    it('should return false for invalid comparator', () => {
      const metadata = { value: '42' };
      const filter: ConditionExpression = {
        condition: {
          numericCondition: {
            name: 'value',
            comparator: 'invalid' as unknown as '=' | '!=' | '<' | '<=' | '>' | '>=',
            value: 42,
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(false);
    });
  });

  describe('evaluateStringCondition', () => {
    it('should handle equal comparison correctly', () => {
      const metadata = { key: 'value' };
      const filter: ConditionExpression = {
        condition: {
          stringEnumCondition: {
            name: 'key',
            comparator: '=',
            value: 'value',
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(true);
    });

    it('should handle not equal comparison correctly', () => {
      const metadata = { key: 'value' };
      const filter: ConditionExpression = {
        condition: {
          stringEnumCondition: {
            name: 'key',
            comparator: '!=',
            value: 'other',
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(true);
    });

    it('should return false when metadata does not have the field', () => {
      const metadata = { otherKey: 'value' };
      const filter: ConditionExpression = {
        condition: {
          stringEnumCondition: {
            name: 'key',
            comparator: '=',
            value: 'value',
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(false);
    });

    it('should be case-sensitive', () => {
      const metadata = { key: 'Value' };
      const filter: ConditionExpression = {
        condition: {
          stringEnumCondition: {
            name: 'key',
            comparator: '=',
            value: 'value',
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(false);
    });

    it('should return false for invalid comparator', () => {
      const metadata = { key: 'value' };
      const filter: ConditionExpression = {
        condition: {
          stringEnumCondition: {
            name: 'key',
            comparator: 'invalid' as unknown as '=' | '!=',
            value: 'value',
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(false);
    });
  });

  describe('evaluateCondition', () => {
    it('should return false for unsupported condition types', () => {
      const metadata = { key: 'value' };
      const filter: ConditionExpression = {
        condition: {
          // A condition that's neither numericCondition nor stringEnumCondition
        } as Condition,
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(false);
    });
  });

  describe('examples', () => {
    it('App id example', () => {
      const metadata = {
        name: 'complex-filter-a013a733-e1e9-40e1-90db-b921be0275cb-config',
        version: '1',
        createdAt: '1750974005321',
        createdBy: 'arn:aws:iam::123456789012:role/TestRole:test-session',
        lastUpdatedAt: '1750974005321',
        lastUpdatedBy: 'arn:aws:iam::123456789012:role/TestRole:test-session',
        appId: 'app-complex-5bad4fdc-1b48-4755-ae10-3dbccb39176d',
      };
      const filter: ConditionExpression = {
        condition: {
          stringEnumCondition: {
            comparator: '=',
            name: 'appId',
            value: 'app-complex-5bad4fdc-1b48-4755-ae10-3dbccb39176d',
          },
        },
      };
      expect(matchesMetadataFilters(metadata, filter)).toBe(true);
    });
  });
});
