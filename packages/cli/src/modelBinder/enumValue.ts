import { InvalidArgumentError } from 'commander';
import { ModelBinder } from './common';

export function enumValue<T extends { [key: string]: string }>(enumObj: T): ModelBinder<T[keyof T]> {
  const validValuesDocumentation = Object.values(enumObj).join(', ');
  const lookup = Object.fromEntries(Object.values(enumObj).map((o) => [o.toLowerCase(), o as T[keyof T]]));

  return {
    parseArg: (value: string): T[keyof T] => {
      const parsed = lookup[value.toLowerCase()];
      if (!parsed) {
        throw new InvalidArgumentError(`Value ${value} is not one of ${validValuesDocumentation}`);
      }
      return parsed;
    },
    descriptionGenerator: (defaultDescription) => `${defaultDescription}\nValid values: ${validValuesDocumentation}`,
  };
}
