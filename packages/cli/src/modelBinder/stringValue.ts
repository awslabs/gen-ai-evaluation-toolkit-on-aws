import { ModelBinder } from './common';

export const stringValue: ModelBinder<string> = {
  parseArg: (value) => value,
};
