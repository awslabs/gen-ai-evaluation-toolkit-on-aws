import { App, Stack } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import 'jest-cdk-snapshot';
import { SecuredLogGroup } from '@secured';

describe('Secured LogGroup', () => {
  beforeAll(() => {
    // We specify a fixed date for the snapshots to create a stable output
    const executionDate = '2023-11-18';
    jest.useFakeTimers();
    jest.setSystemTime(new Date(executionDate));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('Should match snapshot without encryption key', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');

    const logGroup = new SecuredLogGroup(stack, 'some-id');

    expect(logGroup.encryptionKey).toBeUndefined();
    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });

  test('Should match snapshot with customer-managed encryption key', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');

    const encryptionKey = new Key(stack, 'TestKey', {
      description: 'Test customer-managed KMS key for log group',
    });

    const logGroup = new SecuredLogGroup(stack, 'some-id', {
      encryptionKey,
    });

    expect(logGroup.encryptionKey).toBe(encryptionKey);
    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });

  test('Should create minimal role for step function with KMS permissions', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');

    const encryptionKey = new Key(stack, 'TestKey', {
      description: 'Test customer-managed KMS key for log group',
    });

    const logGroup = new SecuredLogGroup(stack, 'some-id', {
      encryptionKey,
    });

    const role = SecuredLogGroup.from(logGroup).createMinimalRoleForStepFunction();

    expect(role).toBeDefined();
    expect(role.assumeRolePolicy).toBeDefined();
  });
});
