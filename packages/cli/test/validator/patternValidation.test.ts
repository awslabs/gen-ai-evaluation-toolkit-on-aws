import { ModelBinder } from '@src/modelBinder/common';
import { patternValidator } from '@src/validator';
import { InvalidArgumentError } from 'commander';

describe('patternValidator', () => {
  const parser: Required<ModelBinder>['parseArg'] = (e) => e;

  test('should not validate if no pattern restriction', () => {
    expect(patternValidator({ type: 'String', pattern: undefined }, parser)).toBe(parser);
  });

  test('Can not parse invalid types', () => {
    expect(() => patternValidator({ type: 'Integer', pattern: '[a-z]+' }, parser)).toThrow();
  });

  test('should validate pattern match', () => {
    const validatedParser = patternValidator({ type: 'String', pattern: '[a-z]+' }, parser);

    expect(validatedParser('test', ['previous', 'input'])).toBe('test');
    expect(() => validatedParser('Test123', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('Test123', ['previous', 'input'])).toThrow(
      "Value Test123 does not match expected pattern. Has to match '[a-z]+'",
    );
  });

  test('should validate different patterns', () => {
    const validatedParser = patternValidator({ type: 'String', pattern: '^\\d{3}-\\d{3}-\\d{4}$' }, parser);

    expect(validatedParser('123-456-7890', ['previous', 'input'])).toBe('123-456-7890');
    expect(() => validatedParser('invalid', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('invalid', ['previous', 'input'])).toThrow(
      "Value invalid does not match expected pattern. Has to match '^\\d{3}-\\d{3}-\\d{4}$'",
    );
  });
});
