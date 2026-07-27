import { InvalidArgumentError } from 'commander';
import * as z from 'zod';
import { ModelBinder } from './common';

export function serializedJsonParameter<T>(validator: z.ZodType<T>, isAlternative: boolean = false): ModelBinder<T> {
  return {
    alternativParamName: (original) => (isAlternative ? `${original}Json` : original),
    parseArg: (value: string) => {
      try {
        // Remove surrounding single or double quotes if present
        const trimmedValue = value.replace(/^['"](.*)['"]$/, '$1');
        return validator.parse(JSON.parse(trimmedValue));
      } catch (e) {
        throw new InvalidArgumentError(`Invalid JSON: '${value}'. Error ${e}`);
      }
    },
    descriptionGenerator: (defaultDescription, flag) =>
      isAlternative
        ? `Alternatively, provided as a serialized json object: ${flag} '{..<config>..}'`
        : `${defaultDescription}\nCan be provided as a serialized json object: ${flag} '{..<config>..}'`,
  };
}
