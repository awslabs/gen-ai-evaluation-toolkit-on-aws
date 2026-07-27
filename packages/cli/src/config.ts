export const supportedOutputFormats = ['text', 'json'] as const;

type GlobalCliConfig = {
  /**
   * Output format for command responses
   * - 'text': Plain text output (default)
   * - 'json': Output raw JSON
   */
  output: (typeof supportedOutputFormats)[number];
};

const globalCliConfig: GlobalCliConfig = {
  output: supportedOutputFormats[0],
};

/**
 * Get the currently used global cli config
 * @returns The config used for this invocation
 */
export function getConfig(): GlobalCliConfig {
  return globalCliConfig;
}

/**
 * Set the global cli configuration
 * @param options A partial set of options
 */
export function setConfig(options: Partial<GlobalCliConfig>): void {
  if (options.output) {
    if (!supportedOutputFormats.includes(options.output)) {
      console.warn(`Invalid output format: ${options.output}. Using default format.`);
      options.output = supportedOutputFormats[0];
    }
  }

  Object.keys(globalCliConfig)
    .map((key) => key as keyof GlobalCliConfig)
    .forEach((key) => {
      globalCliConfig[key] = options[key] ?? globalCliConfig[key];
    });
}
