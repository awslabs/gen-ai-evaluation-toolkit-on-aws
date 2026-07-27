import { ModelBinder } from './common';

export const booleanValue: ModelBinder<boolean> = {
  isBoolean: true,
  parseArg: () => true,
};
