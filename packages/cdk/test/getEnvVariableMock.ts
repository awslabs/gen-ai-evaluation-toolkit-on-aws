import { EnvVariable } from '@common/config';

export function mockGetEnv(...entries: [(env: typeof EnvVariable) => string, string][]) {
  return <T extends string | ((env: typeof EnvVariable) => string)>(envVar: T): string => {
    const envKey = typeof envVar === 'string' ? envVar : envVar(EnvVariable);
    const envValues = Object.fromEntries(entries.map((e) => Object.entries(e)));
    console.log(envValues);
    return envValues[envKey];
  };
}
