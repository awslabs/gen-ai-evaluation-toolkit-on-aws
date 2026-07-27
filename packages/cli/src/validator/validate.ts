import { patternValidator, rangeValidator, lengthValidator } from '.';
import { ModelValidator } from './common';

const validators = [lengthValidator, rangeValidator, patternValidator];

export const validate: ModelValidator = (parameter, parseArg) => {
  return validators.reduce((prev, validator) => validator(parameter, prev), parseArg);
};
