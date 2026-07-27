import { EnvVariable } from '../../src/constants';
import { getEnvVariable } from '../../src/helpers/env';

describe('getEnvVariable', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return the value when env variable is set', () => {
    process.env[EnvVariable.INTERNAL_S3_BUCKET] = 'test-bucket';

    const result = getEnvVariable(EnvVariable.INTERNAL_S3_BUCKET);

    expect(result).toBe('test-bucket');
  });

  it('should throw an error when env variable is not set', () => {
    delete process.env[EnvVariable.INTERNAL_S3_BUCKET];

    expect(() => getEnvVariable(EnvVariable.INTERNAL_S3_BUCKET)).toThrow(
      `Env variable ${EnvVariable.INTERNAL_S3_BUCKET} is not set`,
    );
  });

  it('should return empty string when env variable is set to empty', () => {
    process.env[EnvVariable.INTERNAL_S3_BUCKET] = '';

    const result = getEnvVariable(EnvVariable.INTERNAL_S3_BUCKET);

    expect(result).toBe('');
  });
});
