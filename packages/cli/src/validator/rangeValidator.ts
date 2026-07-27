import assert from 'assert';
import { ModelValidator } from './common';
import { InvalidArgumentError } from 'commander';

export const rangeValidator: ModelValidator<'range'> = ({ type, range }, parseArg) => {
  if (!range) return parseArg;
  assert(type === 'Integer' || type === 'Float', `Range validator not yet implemented for type ${type}`);

  const errorMessage =
    range.min !== undefined && range.max !== undefined
      ? `Has to be at least ${range.min} and at most ${range.max}.`
      : range.min !== undefined
        ? `Has to be at least ${range.min}.`
        : `Has to be at most ${range.max}.`;

  return (value: string, previous: unknown) => {
    const parsed = parseArg(value, previous) as number;
    if (range.min !== undefined && parsed < range.min)
      throw new InvalidArgumentError(`Input ${parsed} is too small. ${errorMessage}`);
    if (range.max !== undefined && parsed > range.max)
      throw new InvalidArgumentError(`Input ${parsed} is too large. ${errorMessage}`);
    return parsed;
  };
};
