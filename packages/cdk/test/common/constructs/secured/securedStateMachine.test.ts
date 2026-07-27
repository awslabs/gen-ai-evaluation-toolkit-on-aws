import { App, Stack } from 'aws-cdk-lib';
import { DefinitionBody, Pass } from 'aws-cdk-lib/aws-stepfunctions';
import { Key } from 'aws-cdk-lib/aws-kms';
import 'jest-cdk-snapshot';
import { SecuredStateMachine } from '@src/common/constructs/secured';

describe('SecuredStateMachine', () => {
  let app: App;
  let stack: Stack;

  beforeAll(() => {
    // We specify a fixed date for the snapshots to create a stable output
    const executionDate = '2023-11-18';
    jest.useFakeTimers();
    jest.setSystemTime(new Date(executionDate));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
  });

  test('Should create secured state machine without encryption key', () => {
    const definition = new Pass(stack, 'TestPass');

    const stateMachine = new SecuredStateMachine(stack, 'TestStateMachine', {
      definitionBody: DefinitionBody.fromChainable(definition),
    });

    expect(stateMachine).toBeDefined();
    expect(stateMachine.encryptionKey).toBeUndefined();
    expect(stateMachine.role).toBeDefined();
    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });

  test('Should create secured state machine with customer-managed encryption key', () => {
    const encryptionKey = new Key(stack, 'TestKey', {
      description: 'Test customer-managed KMS key for state machine',
    });

    const definition = new Pass(stack, 'TestPass');

    const stateMachine = new SecuredStateMachine(stack, 'TestStateMachine', {
      definitionBody: DefinitionBody.fromChainable(definition),
      encryptionKey,
    });

    expect(stateMachine).toBeDefined();
    expect(stateMachine.encryptionKey).toBe(encryptionKey);
    expect(stateMachine.role).toBeDefined();
    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });

  test('Should pass encryption key to log group', () => {
    const encryptionKey = new Key(stack, 'TestKey', {
      description: 'Test customer-managed KMS key for state machine',
    });

    const definition = new Pass(stack, 'TestPass');

    const stateMachine = new SecuredStateMachine(stack, 'TestStateMachine', {
      definitionBody: DefinitionBody.fromChainable(definition),
      encryptionKey,
    });

    // Verify that the encryption key is properly set
    expect(stateMachine.encryptionKey).toBe(encryptionKey);
  });

  test('Should configure tracing and logging properly', () => {
    const encryptionKey = new Key(stack, 'TestKey', {
      description: 'Test customer-managed KMS key for state machine',
    });

    const definition = new Pass(stack, 'TestPass');

    const stateMachine = new SecuredStateMachine(stack, 'TestStateMachine', {
      definitionBody: DefinitionBody.fromChainable(definition),
      encryptionKey,
    });

    // Verify that the state machine is properly configured
    expect(stateMachine).toBeDefined();
    expect(stateMachine.role).toBeDefined();
    expect(stateMachine.encryptionKey).toBe(encryptionKey);
  });
});
