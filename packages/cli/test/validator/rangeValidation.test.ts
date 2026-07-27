import { ModelBinder } from '@src/modelBinder/common';
import { rangeValidator } from '@src/validator';
import { InvalidArgumentError } from 'commander';

describe('rangeValidator', () => {
  const parser: Required<ModelBinder>['parseArg'] = (e) => Number(e);

  test('should not validate if no range restriction', () => {
    expect(rangeValidator({ type: 'Integer', range: undefined }, parser)).toBe(parser);
    expect(rangeValidator({ type: 'Float', range: undefined }, parser)).toBe(parser);
  });

  test('Can not parse invalid types', () => {
    expect(() => rangeValidator({ type: 'String', range: { min: 2, max: 4 } }, parser)).toThrow();
  });

  test('should respect minimum', () => {
    const validatedParser = rangeValidator({ type: 'Integer', range: { min: 2 } }, parser);

    expect(validatedParser('3', ['previous', 'input'])).toBe(3);
    expect(() => validatedParser('1', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('1', ['previous', 'input'])).toThrow('Input 1 is too small. Has to be at least 2.');
  });

  test('should respect maximum', () => {
    const validatedParser = rangeValidator({ type: 'Integer', range: { max: 4 } }, parser);

    expect(validatedParser('3', ['previous', 'input'])).toBe(3);
    expect(() => validatedParser('5', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('5', ['previous', 'input'])).toThrow('Input 5 is too large. Has to be at most 4.');
  });

  test('should respect both', () => {
    const validatedParser = rangeValidator({ type: 'Integer', range: { min: 2, max: 4 } }, parser);

    expect(validatedParser('3', ['previous', 'input'])).toBe(3);
    expect(() => validatedParser('1', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('1', ['previous', 'input'])).toThrow(
      'Input 1 is too small. Has to be at least 2 and at most 4.',
    );
    expect(() => validatedParser('5', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('5', ['previous', 'input'])).toThrow(
      'Input 5 is too large. Has to be at least 2 and at most 4.',
    );
  });
});
