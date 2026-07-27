import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Subnet, Vpc } from 'aws-cdk-lib/aws-ec2';
import { GenAiEtkVpc } from '../../lib/constructs';

describe('GenAiEtkVpc', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
  });

  test('creates VPC with correct CIDR', () => {
    stack = new cdk.Stack(app, 'TestStack');
    new GenAiEtkVpc(stack, 'TestVpc', {});
    template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
  });

  test('creates VPC flow logs with correct configuration', () => {
    stack = new cdk.Stack(app, 'TestStack');
    new GenAiEtkVpc(stack, 'TestVpc', {});

    template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: 'VpcFlowLogs',
      RetentionInDays: 365,
    });

    template.hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'VPC',
    });
  });

  test('always creates all required VPC endpoints including execute-api', () => {
    stack = new cdk.Stack(app, 'TestStack');
    new GenAiEtkVpc(stack, 'TestVpc', {});

    template = Template.fromStack(stack);

    // 4 interface endpoints (CloudWatch, CloudWatch Logs, Bedrock-runtime, EventBridge) + execute-api + 1 S3 gateway = 6
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 6);
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: {
        'Fn::Join': ['', ['com.amazonaws.', { Ref: 'AWS::Region' }, '.monitoring']],
      },
      VpcEndpointType: 'Interface',
      PrivateDnsEnabled: true,
    });
    // Verify Bedrock-runtime endpoint is present
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: {
        'Fn::Join': ['', ['com.amazonaws.', { Ref: 'AWS::Region' }, '.bedrock-runtime']],
      },
      VpcEndpointType: 'Interface',
      PrivateDnsEnabled: true,
    });
    // Verify EventBridge endpoint is present
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: {
        'Fn::Join': ['', ['com.amazonaws.', { Ref: 'AWS::Region' }, '.events']],
      },
      VpcEndpointType: 'Interface',
      PrivateDnsEnabled: true,
    });
    // Verify execute-api endpoint is always present
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: {
        'Fn::Join': ['', ['com.amazonaws.', { Ref: 'AWS::Region' }, '.execute-api']],
      },
      VpcEndpointType: 'Interface',
      PrivateDnsEnabled: true,
    });
  });

  test('reuses existing execute-api VPC endpoint when provided', () => {
    stack = new cdk.Stack(app, 'TestStack');
    new GenAiEtkVpc(stack, 'TestVpc', {
      existingApiGwVpcEndpointId: 'vpce-existing123',
    });

    template = Template.fromStack(stack);

    // Only 5 created endpoints (no new execute-api endpoint — existing one reused)
    // 4 interface endpoints (CloudWatch, CloudWatch Logs, Bedrock-runtime, EventBridge) + 1 S3 gateway = 5
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 5);
  });

  test('uses existing VPC without creating new VPC, flow logs, or endpoints', () => {
    stack = new cdk.Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
    const existingVpc = Vpc.fromVpcAttributes(stack, 'ImportedVpc', {
      vpcId: 'vpc-12345678',
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      privateSubnetIds: ['subnet-private-1', 'subnet-private-2'],
      publicSubnetIds: ['subnet-public-1', 'subnet-public-2'],
    });

    const construct = new GenAiEtkVpc(stack, 'TestVpc', {
      existingVpc,
      existingApiGwVpcEndpointId: 'vpce-existing123',
    });

    template = Template.fromStack(stack);
    template.resourceCountIs('AWS::EC2::VPC', 0);
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 0);
    template.resourceCountIs('AWS::EC2::FlowLog', 0);
    template.resourceCountIs('AWS::EC2::SecurityGroup', 0);
    expect(construct.vpc).toBe(existingVpc);
    expect(construct.securityGroup).toBeUndefined();
    expect(construct.apiGwVpcEndpointId).toBe('vpce-existing123');
    expect(construct.isolatedSubnets).toEqual([]);
  });

  test('throws on existing VPC without an existing execute-api endpoint', () => {
    stack = new cdk.Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
    const existingVpc = Vpc.fromVpcAttributes(stack, 'ImportedVpc', {
      vpcId: 'vpc-12345678',
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      privateSubnetIds: ['subnet-private-1', 'subnet-private-2'],
    });

    expect(() => new GenAiEtkVpc(stack, 'TestVpc', { existingVpc })).toThrow(
      /existingApiGwVpcEndpointId is required when an existing VPC is provided/,
    );
  });

  test('exposes existing isolated subnets on the existing-VPC path', () => {
    stack = new cdk.Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
    const existingVpc = Vpc.fromVpcAttributes(stack, 'ImportedVpc', {
      vpcId: 'vpc-12345678',
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      privateSubnetIds: ['subnet-private-1', 'subnet-private-2'],
    });
    const isolatedSubnets = [
      Subnet.fromSubnetId(stack, 'Iso1', 'subnet-iso-1'),
      Subnet.fromSubnetId(stack, 'Iso2', 'subnet-iso-2'),
    ];

    const construct = new GenAiEtkVpc(stack, 'TestVpc', {
      existingVpc,
      existingApiGwVpcEndpointId: 'vpce-existing123',
      existingIsolatedSubnets: isolatedSubnets,
    });

    expect(construct.isolatedSubnets).toEqual(isolatedSubnets);
  });
});
