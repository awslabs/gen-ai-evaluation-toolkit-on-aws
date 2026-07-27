import { ModelBinder } from './common';

export function listOf<T>(parser: ModelBinder<T>): ModelBinder<T[]> {
  return {
    parseArg: (value: string, previous?: unknown): T[] => {
      return [...(Array.isArray(previous) ? previous : []), parser.parseArg(value, undefined)];
    },
    descriptionGenerator: (defaultDescription, flag) =>
      `${defaultDescription}\nProvide multiple paramters by chaining: ${flag} <value1> ${flag} <value2>`,
  };
}
