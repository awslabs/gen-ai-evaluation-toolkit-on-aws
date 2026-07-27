import { InvalidArgumentError } from 'commander';
import { ModelBinder } from './common';

const versionRegex = /\d+|head|latest/;

/**
 * Parses dataset version as a string, throwing error in case it's not a number or 'head' | 'latest'.
 */
export const versionString: ModelBinder<string> = {
  parseArg: (value: string): string => {
    const lowered = value.toLowerCase();
    if (!versionRegex.test(lowered)) throw new InvalidArgumentError("Version must be a number, 'latest', or 'head'");
    return lowered;
  },
  descriptionGenerator: (defaultDescription) =>
    `${defaultDescription}\nThe value has to be a number, 'latest' or 'head'`,
};
