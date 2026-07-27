import { App, Stack } from 'aws-cdk-lib';
import 'jest-cdk-snapshot';
import { SecuredLogGroup, SecuredNodejsFunction } from '@secured';
import { Code } from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

describe('Secured NodeJS Function', () => {
  beforeAll(() => {
    // We specify a fixed date for the snapshots to create a stable output
    const executionDate = '2023-11-18';
    jest.useFakeTimers();
    jest.setSystemTime(new Date(executionDate));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('Should match snapshot (default)', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');

    // Create a VPC for the test
    const vpc = new ec2.Vpc(stack, 'TestVPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    new SecuredNodejsFunction(stack, 'some-id', {
      code: Code.fromInline(`exports.lambdaHandler = function() { console.log("Hello World!") }`),
      vpc: vpc,
    });

    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });

  test('Should match snapshot (with loggroup)', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');

    // Create a VPC for the test
    const vpc = new ec2.Vpc(stack, 'TestVPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    new SecuredNodejsFunction(stack, 'some-id', {
      logGroup: new SecuredLogGroup(stack, 'LogGroup', {}),
      code: Code.fromInline(`exports.lambdaHandler = function() { console.log("Hello World!") }`),
      vpc: vpc,
    });

    expect(stack).toMatchCdkSnapshot({ ignoreAssets: true });
  });
});
