import { ModelBinder } from './common';

export const integerValue: ModelBinder<number> = {
  parseArg: (value: string) => parseInt(value, 10),
  descriptionGenerator: (defaultDescription) => `${defaultDescription} (integer)`,
};
