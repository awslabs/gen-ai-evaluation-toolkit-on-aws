import assert from 'assert';
import { EnvVariable } from '../constants';

export function getEnvVariable(envVar: EnvVariable): string {
  const value = process.env[envVar];
  assert(value != null, `Env variable ${envVar} is not set`);

  return value;
}
