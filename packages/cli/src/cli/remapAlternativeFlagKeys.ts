import { OptionValues } from 'commander';

/**
 * Creates a preAction hook that remaps alternative flag keys to their target parameter names.
 * This function handles the mapping of command line options from alternative names to canonical parameter names,
 * ensuring that only the canonical parameter remains in the options object.
 *
 * @param mapping - Record mapping target parameter names to their alternatives and default values
 * @returns A function that can be used as a Commander.js preAction hook
 */
export function remapAlternativeFlagKeys(
  mapping: Record<string, { alternatives: string[]; defaultValue: unknown }>,
): (options: OptionValues) => void {
  return (options: OptionValues) => {
    for (const [targetKey, { alternatives, defaultValue }] of Object.entries(mapping)) {
      if (options[targetKey] === undefined || options[targetKey] === defaultValue) {
        // if the default option is not yet set we overwrite from alternatives
        for (const alternative of alternatives) {
          if (options[alternative] !== undefined && options[alternative] !== defaultValue) {
            options[targetKey] = options[alternative];
            break; // Take the first non-default alternative
          }
        }
      }

      // we always delete all alternatives from the request object to keep it clean
      for (const alternative of alternatives) {
        if (alternative !== targetKey) delete options[alternative];
      }
    }
  };
}
