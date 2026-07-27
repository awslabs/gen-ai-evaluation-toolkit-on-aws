import { InvalidArgumentError } from 'commander';
import * as fs from 'fs';
import * as z from 'zod';
import { ModelBinder } from './common';
import { serializedJsonParameter } from './serializedJsonParameter';
import { assert } from 'console';

export function serializedJsonFile<T>(validator: z.ZodType<T>): ModelBinder<T> {
  const jsonParser = serializedJsonParameter(validator).parseArg;
  assert(jsonParser, 'JSON parser is missing');
  return {
    alternativParamName: (name) => `${name}File`,
    parseArg: (value: string, previous: unknown) => {
      if (!fs.existsSync(value)) throw new InvalidArgumentError(`File not found: ${value}.`);
      return jsonParser(fs.readFileSync(value, 'utf8'), previous);
    },
    descriptionGenerator: (_defaultDescription, flag) =>
      `Alternatively, provided as path to a local file: ${flag} ./config.json`,
  };
}
