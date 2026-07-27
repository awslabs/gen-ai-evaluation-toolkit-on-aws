import { EnvVariable } from '@common/config';

export function mockGetEnv(...entries: [(env: typeof EnvVariable) => string, string][]) {
  const envValues = Object.fromEntries(entries.map((e) => [e[0](EnvVariable), e[1]]));
  return <T extends string | ((env: typeof EnvVariable) => string)>(envVar: T, defaultValue?: string): string => {
    const envKey = typeof envVar === 'string' ? envVar : envVar(EnvVariable);
    const value = envValues[envKey];
    if (!value) {
      if (defaultValue) return defaultValue;
      throw Error('Value not proivded');
    }
    return value;
  };
}
