import assert from 'assert';
import { ModelValidator } from './common';
import { InvalidArgumentError } from 'commander';

export const lengthValidator: ModelValidator<'length'> = ({ type, length }, parseArg) => {
  if (!length) return parseArg;
  assert(type === 'String', `Length not yet implemented for type ${type}`);
  const errorMessage =
    length.min !== undefined && length.max !== undefined
      ? `Has to be at least ${length.min} and at most ${length.max} characters long.`
      : length.min !== undefined
        ? `Has to be at least ${length.min} characters long.`
        : `Has to be at most ${length.max} characters long.`;

  return (value: string, previous: unknown) => {
    const parsed = parseArg(value, previous) as string;
    if (length.min !== undefined && parsed.length < length.min)
      throw new InvalidArgumentError(`Input ${parsed} is too short. ${errorMessage}`);
    if (length.max !== undefined && parsed.length > length.max)
      throw new InvalidArgumentError(`Input ${parsed} is too long. ${errorMessage}`);
    return parsed;
  };
};
