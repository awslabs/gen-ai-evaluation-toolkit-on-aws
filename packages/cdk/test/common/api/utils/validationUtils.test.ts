import { EnvVariable } from '@common/config';
import { InternalServerException } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { getEnvVariable } from '@common';

describe('getEnvVariable tests', () => {
  it('should return the value if it exists', () => {
    process.env[EnvVariable.DYNAMO_TABLE_NAME] = 'foo';
    const envVar = getEnvVariable(EnvVariable.DYNAMO_TABLE_NAME);
    expect(envVar).toBe('foo');
  });

  it('throws internal error if the value does not exist', () => {
    delete process.env[EnvVariable.S3_BUCKET_NAME];
    expect(() => getEnvVariable(EnvVariable.S3_BUCKET_NAME)).toThrow(InternalServerException);
  });
});
