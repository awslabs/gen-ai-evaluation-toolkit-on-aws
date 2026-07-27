import assert from 'assert';
import { ModelValidator } from './common';
import { InvalidArgumentError } from 'commander';

export const patternValidator: ModelValidator<'pattern'> = ({ type, pattern }, parseArg) => {
  if (!pattern) return parseArg;
  assert(type === 'String', `Pattern validator not yet implemented for type ${type}`);

  // Ensure full string matching by adding ^ and $ if not already present
  const fullStringPattern = (pattern.startsWith('^') ? '' : '^') + pattern + (pattern.endsWith('$') ? '' : '$');

  const regexp = new RegExp(fullStringPattern);
  return (value: string, previous: unknown) => {
    const parsed = parseArg(value, previous) as string;
    if (!regexp.test(parsed))
      throw new InvalidArgumentError(`Value ${parsed} does not match expected pattern. Has to match '${pattern}'`);
    return parsed;
  };
};
