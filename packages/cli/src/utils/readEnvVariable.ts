/**
 * Reads an environment variable. Throws an error if it is required and not set.
 * @param envVar env variable name
 * @param isRequired whether the env variable is required
 * @returns env variable value
 */
export function readEnvVariable(envVar: string, isRequired = true): string {
  const envVarValue = process.env[envVar]?.trim();
  if (isRequired && (!envVarValue || envVarValue === '')) {
    throw new Error(`Required env variable "${envVar}" not set.`);
  }
  return envVarValue ?? '';
}
