import { ModelBinder } from '@src/modelBinder/common';
import { lengthValidator } from '@src/validator';
import { InvalidArgumentError } from 'commander';

describe('lengthValidator', () => {
  const parser: Required<ModelBinder>['parseArg'] = (e) => e;

  test('should not validate if no length restriction', () => {
    expect(lengthValidator({ type: 'String', length: undefined }, parser)).toBe(parser);
  });

  test('Can not parse invalid types', () => {
    expect(() => lengthValidator({ type: 'Integer', length: { min: 2, max: 4 } }, parser)).toThrow();
  });

  test('should respect minimum', () => {
    const validatedParser = lengthValidator({ type: 'String', length: { min: 2 } }, parser);

    expect(validatedParser('new', ['previous', 'input'])).toBe('new');
    expect(() => validatedParser('n', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('n', ['previous', 'input'])).toThrow(
      'Input n is too short. Has to be at least 2 characters long.',
    );
  });

  test('should respect maximum', () => {
    const validatedParser = lengthValidator({ type: 'String', length: { max: 4 } }, parser);

    expect(validatedParser('new', ['previous', 'input'])).toBe('new');
    expect(() => validatedParser('otherNew', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('otherNew', ['previous', 'input'])).toThrow(
      'Input otherNew is too long. Has to be at most 4 characters long.',
    );
  });

  test('should respect both', () => {
    const validatedParser = lengthValidator({ type: 'String', length: { min: 2, max: 4 } }, parser);

    expect(validatedParser('new', ['previous', 'input'])).toBe('new');
    expect(() => validatedParser('n', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('n', ['previous', 'input'])).toThrow(
      'Input n is too short. Has to be at least 2 and at most 4 characters long.',
    );
    expect(() => validatedParser('otherNew', ['previous', 'input'])).toThrow(InvalidArgumentError);
    expect(() => validatedParser('otherNew', ['previous', 'input'])).toThrow(
      'Input otherNew is too long. Has to be at least 2 and at most 4 characters long.',
    );
  });
});
