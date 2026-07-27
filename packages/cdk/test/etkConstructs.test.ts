import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { GenAiEvaluationToolkitStacks } from '@src/index';
import { ContainerImages } from '@src/common/types';
import * as cdk from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { AwsSolutionsChecks, NagReportFormat } from 'cdk-nag';
import { Construct, IConstruct } from 'constructs';
import 'jest-cdk-snapshot';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs';

// Mock getPrebuiltLambdaCode
jest.mock('@constructs/apiUtils', () => {
  const actual = jest.requireActual('@constructs/apiUtils');
  const lambda = jest.requireActual('aws-cdk-lib/aws-lambda');
  return {
    ...actual,
    getPrebuiltLambdaCode: jest.fn(() => lambda.Code.fromInline('exports.handler = async () => {}')),
  };
});

jest.mock('aws-cdk-lib/aws-lambda', () => {
  const actual = jest.requireActual('aws-cdk-lib/aws-lambda');
  return {
    ...actual,
    Function: jest.fn((scope: Construct, id: string, props: object) => fakeLambda(scope, id, props)),
  };
});

jest.mock('aws-cdk-lib/aws-lambda-nodejs', () => {
  const actual = jest.requireActual('aws-cdk-lib/aws-lambda-nodejs');
  return {
    ...actual,
    NodejsFunction: jest.fn((scope: Construct, id: string, props: object) => fakeLambda(scope, id, props)),
  };
});
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

function createDummyContainerImages(): ContainerImages {
  return {
    llmAsJudge: ContainerImage.fromRegistry('dummy-image'),
    generateTestCases: ContainerImage.fromRegistry('dummy-image'),
    experimentLogger: ContainerImage.fromRegistry('dummy-image'),
  };
}

function createDummyVpc(app: cdk.App, env: cdk.Environment): ec2.Vpc {
  const stack = new cdk.Stack(app, 'TestVPCStack', { env: env });
  const vpc = new ec2.Vpc(stack, 'TestVPC', {
    ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
    maxAzs: 2,
    subnetConfiguration: [
      {
        cidrMask: 24,
        name: 'Public',
        subnetType: ec2.SubnetType.PUBLIC,
      },
      {
        cidrMask: 24,
        name: 'Private',
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    ],
  });

  suppressCdkNag(vpc, 'AwsSolutions-VPC7', 'This is a test VPC, flow logs not needed');
  return vpc;
}

describe('GenAiETK Construct', () => {
  const envStore = process.env;

  beforeAll(() => {
    // We specify a fixed date for the snapshots to create a stable output
    const executionDate = '2023-11-18';
    jest.useFakeTimers();
    jest.setSystemTime(new Date(executionDate));
    process.env = {
      EXPERIMENT_API_LAMBDA_ZIP: 'EXPERIMENT_API_LAMBDA_ZIP',
    };
  });

  afterAll(() => {
    jest.useRealTimers();
    process.env = envStore;
  });

  describe('Should match snapshot (private API)', () => {
    const app = new cdk.App();
    const env: cdk.Environment = {
      account: '12345',
      region: 'eu-west-2',
    };

    const construct = new GenAiEvaluationToolkitStacks(app, 'GenAiEtk', {
      vpc: createDummyVpc(app, env),
      apiGwProps: { enablePrivateApiEndpoints: true, apiGwVpcEndpointId: 'some-id' },
      containerImages: createDummyContainerImages(),
      env: env,
    });

    expect(findAllStacks(app).length).toBe(construct.stacks.length + 1);

    construct.stacks.forEach((stack) => {
      test(stack.stackName, () => {
        runStackAssertions(stack);
      });
    });
  });

  describe('Should match snapshot (private API, with customer KMS key)', () => {
    const app = new cdk.App();
    const env: cdk.Environment = {
      account: '12345',
      region: 'eu-west-2',
    };

    // Create a customer-managed KMS key for encryption
    const keyStack = new cdk.Stack(app, 'KeyStack', { env });
    const customerKey = kms.Key.fromKeyArn(
      keyStack,
      'CustomerKey',
      'arn:aws:kms:eu-west-2:12345:key/12345678-1234-1234-1234-123456789012',
    );

    const construct = new GenAiEvaluationToolkitStacks(app, 'GenAiEtk', {
      vpc: createDummyVpc(app, env),
      apiGwProps: { enablePrivateApiEndpoints: true, apiGwVpcEndpointId: 'some-id' },
      containerImages: createDummyContainerImages(),
      encryptionKey: customerKey,
      env: env,
    });

    expect(findAllStacks(app).length).toBe(construct.stacks.length + 2); // +2 because of Key and VPC Stack

    construct.stacks.forEach((stack) => {
      test(`${stack.stackName} (with encryption)`, () => {
        runStackAssertions(stack, customerKey);
      });
    });
  });

  describe('Should match snapshot (public API)', () => {
    const app = new cdk.App();
    const env: cdk.Environment = {
      account: '12345',
      region: 'eu-west-2',
    };

    const construct = new GenAiEvaluationToolkitStacks(app, 'GenAiEtk', {
      vpc: createDummyVpc(app, env),
      apiGwProps: { enablePrivateApiEndpoints: false },
      containerImages: createDummyContainerImages(),
      env: env,
    });

    expect(findAllStacks(app).length).toBe(construct.stacks.length + 1);

    construct.stacks.forEach((stack) => {
      test(stack.stackName, () => {
        runStackAssertions(stack);
      });
    });
  });

  describe('compliance', () => {
    test('S3 buckets', () => {
      const app = new cdk.App();
      const env: cdk.Environment = {
        account: '12345',
        region: 'eu-west-2',
      };

      const construct = new GenAiEvaluationToolkitStacks(app, 'GenAiEtk', {
        vpc: createDummyVpc(app, env),
        apiGwProps: { enablePrivateApiEndpoints: false },
        containerImages: createDummyContainerImages(),
        env: env,
      });

      const buckets = construct.stacks.flatMap((stack, index) => {
        return Object.entries(Template.fromStack(stack).findResources('AWS::S3::Bucket')).map(([reference, info]) => {
          // I could not find the right type that contains all the properties
          // I logged the objects, and picked up the needed fields
          // If you find the right type, please replace the "[key: string]: any" part
          return { reference, stackIndex: index, ...info } as {
            reference: string;
            stackIndex: number; // Using stack index instead of stack makes logging -for debugging- easier
            [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
          };
        });
      });

      expect(buckets.length).toBeGreaterThan(0);

      for (const bucket of buckets) {
        expect(bucket.Properties.BucketEncryption).toBeDefined();

        const isAccessLogBucket = bucket.reference.includes('AccessLogs');

        // Access-log buckets have versioning suspended (unique-per-write objects don't need it)
        if (isAccessLogBucket) {
          // CDK omits VersioningConfiguration entirely when versioned: false
          expect(bucket.Properties.VersioningConfiguration).toBeUndefined();
        } else {
          expect(bucket.Properties.VersioningConfiguration.Status).toBe('Enabled');
        }

        expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        });

        const isTempBucket = bucket.Properties.BucketName == null;
        if (isTempBucket) {
          // Temp and access-log buckets both have auto deletion
          expect(bucket.DeletionPolicy).toEqual('Delete');
          expect(bucket.UpdateReplacePolicy).toEqual('Delete');
          expect(bucket.Properties.LifecycleConfiguration.Rules.length).toBeGreaterThanOrEqual(1);

          if (!isAccessLogBucket) {
            // Non-access-log temp buckets have a MonthlyDelete rule
            const deletionRule = bucket.Properties.LifecycleConfiguration.Rules.find((rule: { Id: string }) =>
              rule.Id.endsWith('-MonthlyDelete'),
            );

            expect(deletionRule).toBeDefined();
            expect(deletionRule).toEqual(
              expect.objectContaining({
                AbortIncompleteMultipartUpload: { DaysAfterInitiation: 30 },
                ExpirationInDays: 30,
                NoncurrentVersionExpiration: { NoncurrentDays: 30 },
                Status: 'Enabled',
              }),
            );
          }
        } else {
          // Permanent bucket should not be deleted
          expect(bucket.DeletionPolicy).toEqual('RetainExceptOnCreate');
          expect(bucket.UpdateReplacePolicy).toEqual('Retain');
        }

        if (isAccessLogBucket) {
          // Access logs buckets should not have log access
          expect(bucket.Properties.LoggingConfiguration).not.toBeDefined();
        } else {
          // All other buckets should have access logs bucket
          expect(bucket.Properties.LoggingConfiguration).toBeDefined();
        }

        // Assert that each bucket has a policy that enforces SSL
        Template.fromStack(construct.stacks[bucket.stackIndex]!).hasResourceProperties('AWS::S3::BucketPolicy', {
          Bucket: {
            Ref: bucket.reference,
          },
          PolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Effect: 'Deny',
                Principal: { AWS: '*' },
                Action: 's3:*',
                Resource: Match.anyValue(),
                Condition: { Bool: { 'aws:SecureTransport': 'false' } },
              }),
            ]),
          },
        });
      }
    });

    test('DDB tables', () => {
      const app = new cdk.App();
      const env: cdk.Environment = {
        account: '12345',
        region: 'eu-west-2',
      };

      const construct = new GenAiEvaluationToolkitStacks(app, 'GenAiEtk', {
        vpc: createDummyVpc(app, env),
        apiGwProps: { enablePrivateApiEndpoints: false },
        containerImages: createDummyContainerImages(),
        env: env,
      });

      const tables = construct.stacks.flatMap((stack) => {
        return Object.values(Template.fromStack(stack).findResources('AWS::DynamoDB::Table'));
      });

      expect(tables.length).toBeGreaterThan(0);
      for (const table of tables) {
        expect(table.Properties.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled).toBe(true);
      }
    });
  });
});

function assertNoNagErrors(stack: cdk.Stack) {
  const assertions = Annotations.fromStack(stack);
  const errors = assertions.findError('*', Match.anyValue());
  expect(errors.map((e) => ({ id: e.id, data: e.entry.data, type: e.entry.type }))).toHaveLength(0);
}

function fakeLambda(scope: Construct, id: string, props: { entry?: string }): lambda.Function {
  const lambdaFunctionClass = jest.requireActual('aws-cdk-lib/aws-lambda').Function as typeof lambda.Function;
  const lambdaFunction = new lambdaFunctionClass(scope, id, {
    ...props,
    runtime: lambda.Runtime.NODEJS_LATEST,
    handler: 'index.handler',
    code: lambda.Code.fromInline(`
                    exports.handler = async (event) => {
                        return {
                            statusCode: 200,
                            body: JSON.stringify({ message: 'Mock Lambda response' })
                        };
                    };
                `),
  });

  return lambdaFunction;
}

function findAllStacks(construct: IConstruct): cdk.Stack[] {
  const stacks: cdk.Stack[] = [];

  // Check if current construct is a stack
  if (cdk.Stack.isStack(construct)) {
    stacks.push(construct as cdk.Stack);
  }

  // Recursively search through all children
  for (const child of construct.node.children) {
    stacks.push(...findAllStacks(child));
  }

  return stacks;
}

function runStackAssertions(stack: cdk.Stack, encryptionKey?: kms.IKey) {
  cdk.Aspects.of(stack).add(new AwsSolutionsChecks({ reportFormats: [NagReportFormat.JSON] }));
  assertNoNagErrors(stack);
  assertSigv4EnabledOnAllEndpoints(stack);

  // If encryption key is provided, assert encryption-related properties
  if (encryptionKey) {
    assertEncryptionAttributes(stack, encryptionKey);
  }

  // Ignore API GW deployment snapshot due to changing logical ID
  if (stack.stackName.includes('-ApiDeploy')) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = { ignoreAssets: true };

  expect(stack).toMatchCdkSnapshot(config);
}

function assertEncryptionAttributes(stack: cdk.Stack, encryptionKey: kms.IKey) {
  const template = Template.fromStack(stack);
  const keyArn = encryptionKey.keyArn;

  // Verify S3 buckets use customer-managed KMS encryption
  const buckets = template.findResources('AWS::S3::Bucket');
  Object.values(buckets).forEach((bucket) => {
    const bucketEncryption = bucket.Properties?.BucketEncryption;
    if (bucketEncryption?.ServerSideEncryptionConfiguration) {
      const encryptionRule = bucketEncryption.ServerSideEncryptionConfiguration[0];
      if (encryptionRule.ServerSideEncryptionByDefault.SSEAlgorithm === 'aws:kms') {
        expect(encryptionRule.ServerSideEncryptionByDefault.KMSMasterKeyID).toBe(keyArn);
        expect(encryptionRule.BucketKeyEnabled).toBe(true);
      }
    }
  });

  // Verify DynamoDB tables use customer-managed KMS encryption
  const tables = template.findResources('AWS::DynamoDB::Table');
  Object.values(tables).forEach((table) => {
    if (table.Properties?.SSESpecification) {
      expect(table.Properties.SSESpecification.SSEEnabled).toBe(true);
      expect(table.Properties.SSESpecification.KMSMasterKeyId).toBe(keyArn);
    }
  });

  // Verify SQS queues use customer-managed KMS encryption where applicable
  const queues = template.findResources('AWS::SQS::Queue');
  Object.values(queues).forEach((queue) => {
    if (queue.Properties?.KmsMasterKeyId) {
      expect(queue.Properties.KmsMasterKeyId).toBe(keyArn);
    }
  });
}

function assertSigv4EnabledOnAllEndpoints(stack: cdk.Stack) {
  const template = Template.fromStack(stack);

  // Find all API Gateway Method resources
  const apiGatewayMethods = template.findResources('AWS::ApiGateway::Method');
  // Check each API Gateway Method for SigV4 auth
  Object.values(apiGatewayMethods).forEach((resource) => {
    expect(resource.Properties.AuthorizationType).toEqual('AWS_IAM');
  });
}
