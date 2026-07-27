import { remapAlternativeFlagKeys } from '@src/cli/remapAlternativeFlagKeys';

describe('remapAlternativeFlagKeys', () => {
  describe('should remap alternative flag keys correctly', () => {
    it('should set target parameter from alternative when target is undefined', () => {
      const mapping = {
        targetParam: {
          alternatives: ['targetParam', 'alternativeParam'],
          defaultValue: undefined,
        },
      };

      const options = {
        targetParam: undefined,
        alternativeParam: 'alternative-value',
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.targetParam).toBe('alternative-value');
      expect(options.alternativeParam).toBeUndefined();
    });

    it('should set target parameter from alternative when target equals default value', () => {
      const mapping = {
        targetParam: {
          alternatives: ['targetParam', 'alternativeParam'],
          defaultValue: 'default-value',
        },
      };

      const options = {
        targetParam: 'default-value',
        alternativeParam: 'alternative-value',
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.targetParam).toBe('alternative-value');
      expect(options.alternativeParam).toBeUndefined();
    });

    it('should not override target parameter when it has a non-default value', () => {
      const mapping = {
        targetParam: {
          alternatives: ['targetParam', 'alternativeParam'],
          defaultValue: 'default-value',
        },
      };

      const options = {
        targetParam: 'explicit-value',
        alternativeParam: 'alternative-value',
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.targetParam).toBe('explicit-value');
      expect(options.alternativeParam).toBeUndefined();
    });

    it('should handle multiple alternatives and pick the first non-default one', () => {
      const mapping = {
        targetParam: {
          alternatives: ['targetParam', 'alt1', 'alt2', 'alt3'],
          defaultValue: undefined,
        },
      };

      const options = {
        targetParam: undefined,
        alt1: undefined,
        alt2: 'second-alternative',
        alt3: 'third-alternative',
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.targetParam).toBe('second-alternative');
      expect(options.alt1).toBeUndefined();
      expect(options.alt2).toBeUndefined();
      expect(options.alt3).toBeUndefined();
    });

    it('should not set target from alternative when alternative equals default value', () => {
      const mapping = {
        targetParam: {
          alternatives: ['targetParam', 'alternativeParam'],
          defaultValue: 'default-value',
        },
      };

      const options = {
        targetParam: undefined,
        alternativeParam: 'default-value',
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.targetParam).toBeUndefined();
      expect(options.alternativeParam).toBeUndefined();
    });

    it('should handle multiple parameters with different mappings', () => {
      const mapping = {
        param1: {
          alternatives: ['param1', 'param1Alt'],
          defaultValue: undefined,
        },
        param2: {
          alternatives: ['param2', 'param2Alt'],
          defaultValue: 'default-2',
        },
      };

      const options = {
        param1: undefined,
        param1Alt: 'value-1',
        param2: 'default-2',
        param2Alt: 'value-2',
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.param1).toBe('value-1');
      expect(options.param1Alt).toBeUndefined();
      expect(options.param2).toBe('value-2');
      expect(options.param2Alt).toBeUndefined();
    });

    it('should clean up all alternatives even when no remapping occurs', () => {
      const mapping = {
        targetParam: {
          alternatives: ['targetParam', 'alt1', 'alt2'],
          defaultValue: undefined,
        },
      };

      const options = {
        targetParam: 'explicit-value',
        alt1: 'alt-value-1',
        alt2: 'alt-value-2',
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.targetParam).toBe('explicit-value');
      expect(options.alt1).toBeUndefined();
      expect(options.alt2).toBeUndefined();
    });

    it('should not delete the target parameter even if it appears in alternatives', () => {
      const mapping = {
        targetParam: {
          alternatives: ['targetParam', 'alternativeParam'],
          defaultValue: undefined,
        },
      };

      const options = {
        targetParam: 'target-value',
        alternativeParam: 'alternative-value',
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.targetParam).toBe('target-value');
      expect(options.alternativeParam).toBeUndefined();
    });

    it('should handle empty alternatives array', () => {
      const mapping = {
        targetParam: {
          alternatives: ['targetParam'],
          defaultValue: undefined,
        },
      };

      const options = {
        targetParam: 'value',
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.targetParam).toBe('value');
    });

    it('should handle boolean default values correctly', () => {
      const mapping = {
        booleanParam: {
          alternatives: ['booleanParam', 'booleanAlt'],
          defaultValue: false,
        },
      };

      const options = {
        booleanParam: false,
        booleanAlt: true,
      };

      const hookFunction = remapAlternativeFlagKeys(mapping);
      hookFunction(options);

      expect(options.booleanParam).toBe(true);
      expect(options.booleanAlt).toBeUndefined();
    });
  });
});
