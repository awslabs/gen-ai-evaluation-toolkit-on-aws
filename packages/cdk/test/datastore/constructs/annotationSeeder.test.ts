import { Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Table, AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { AnnotationSeeder } from '@datastore/constructs/annotationSeeder';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';

// Mock getPrebuiltLambdaCode
jest.mock('@constructs/apiUtils', () => ({
  ...jest.requireActual('@constructs/apiUtils'),
  getPrebuiltLambdaCode: jest.fn(() => lambda.Code.fromInline('exports.handler = async () => {}')),
}));

// Mock SecuredNodejsFunction
jest.mock('@constructs/secured', () => ({
  SecuredNodejsFunction: jest.fn().mockImplementation(() => ({
    addEnvironment: jest.fn(),
    functionArn: 'mock-function-arn',
    grantInvoke: jest.fn(),
    grantPrincipal: {
      addToPrincipalPolicy: jest.fn().mockReturnValue({
        statementAdded: true,
        dependable: {
          dependencies: [],
          add: jest.fn(),
        },
      }),
    },
  })),
}));

describe('AnnotationSeeder', () => {
  let stack: Stack;
  let table: Table;
  let vpc: Vpc;

  beforeEach(() => {
    stack = new Stack();
    table = new Table(stack, 'TestTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
    });
    vpc = new Vpc(stack, 'TestVpc');

    // Mock table.grantWriteData
    table.grantWriteData = jest.fn().mockReturnValue({
      statementAdded: true,
      dependable: {
        dependencies: [],
        add: jest.fn(),
      },
    });
  });

  test('creates required resources', () => {
    // WHEN
    new AnnotationSeeder(stack, 'TestAnnotationSeeder', {
      table,
      vpc,
    });

    // THEN
    const template = Template.fromStack(stack);

    // Verify Custom Resource Provider Role
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
          },
        ],
      },
    });

    // Verify Custom Resource
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      ServiceToken: {
        'Fn::GetAtt': [Match.anyValue(), 'Arn'],
      },
    });
  });

  test('grants write permissions to the function', () => {
    // WHEN
    new AnnotationSeeder(stack, 'TestAnnotationSeeder', {
      table,
      vpc,
    });

    // THEN
    expect(table.grantWriteData).toHaveBeenCalled();
  });
});
