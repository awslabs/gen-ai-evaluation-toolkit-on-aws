import assert from 'assert';
import { Construct } from 'constructs';
import {
  CfnRouteTable,
  CfnSubnet,
  CfnSubnetRouteTableAssociation,
  CfnVPCCidrBlock,
  FlowLog,
  FlowLogDestination,
  FlowLogResourceType,
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpointAwsService,
  IpAddresses,
  ISubnet,
  IVpc,
  Peer,
  Port,
  SecurityGroup,
  Subnet,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { RemovalPolicy, Tags } from 'aws-cdk-lib';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  APIGATEWAY_VPC_END_POINT_NAME,
  BEDROCK_RUNTIME_VPC_END_POINT_NAME,
  CLOUD_WATCH_LOGS_VPC_END_POINT_NAME,
  CLOUD_WATCH_VPC_END_POINT_NAME,
  EVENTS_VPC_END_POINT_NAME,
  ISOLATED_SUBNETS_SECONDARY_CIDR,
  S3_GATEWAY_END_POINT_NAME,
} from '../common';

type GenAiEtkVpcProps = {
  /**
   * If provided, the construct will reuse this existing execute-api VPC endpoint
   * instead of creating a new one. Useful when the customer already has one to
   * avoid duplicate resources and reduce cost.
   *
   * REQUIRED when `existingVpc` is provided (existing VPC): the construct creates no
   * endpoints in a customer VPC, so the execute-api interface endpoint the
   * private REST API binds to must already exist.
   */
  existingApiGwVpcEndpointId?: string;
  /**
   * Optional existing VPC to use. When provided, the construct will NOT create
   * a new VPC, flow logs, VPC endpoints, a security group, or isolated
   * subnets — the caller is responsible for ensuring the VPC already has
   * whatever connectivity the deployment needs (NAT/IGW, VPC endpoints,
   * isolated subnets for plugins that need them, etc.).
   */
  existingVpc?: IVpc;
  /**
   * Pre-built isolated subnets to use when bringing your own VPC. Required
   * if you want to deploy evaluators that opt into isolated networking (e.g.
   * agent-as-judge). Ignored when this construct creates the VPC.
   */
  existingIsolatedSubnets?: ISubnet[];
};

export class GenAiEtkVpc extends Construct {
  public readonly vpc: IVpc;
  public readonly securityGroup?: SecurityGroup;
  /**
   * VPC endpoint ID for the execute-api interface endpoint.
   * Always populated: when this construct creates the VPC it is either
   * auto-created or reused; on the existing-VPC path it comes from the required
   * `existingApiGwVpcEndpointId` prop.
   */
  public readonly apiGwVpcEndpointId: string;

  /**
   * Subnets with no internet route — neither IGW nor NAT — used by evaluators
   * that must be sealed off from the public internet (e.g. agent-as-judge).
   * Reachable from the rest of the VPC via local routing only.
   *
   * Empty array on the existing-VPC path unless the caller passes
   * `existingIsolatedSubnets`.
   */
  public readonly isolatedSubnets: ISubnet[];

  constructor(scope: Construct, id: string, props: GenAiEtkVpcProps) {
    super(scope, id);

    if (props.existingVpc) {
      this.vpc = props.existingVpc;
      assert(this.vpc.privateSubnets.length > 0, 'Existing VPC must have at least one private subnet for ECS tasks');
      assert(
        props.existingApiGwVpcEndpointId,
        'existingApiGwVpcEndpointId is required when an existing VPC is provided (EXISTING_VPC_ID): the ' +
          'construct creates no endpoints in a customer-provided VPC, so set EXISTING_API_GW_VPC_ENDPOINT_ID to the ID of an ' +
          'existing execute-api interface VPC endpoint the private REST API can bind to.',
      );
      this.apiGwVpcEndpointId = props.existingApiGwVpcEndpointId;
      this.isolatedSubnets = props.existingIsolatedSubnets ?? [];
      return;
    }

    const vpc = new Vpc(this, 'Vpc', {
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });
    this.vpc = vpc;

    this.securityGroup = new SecurityGroup(this, 'VPCEndPointSecurityGroup', {
      description: 'Allow from VPC',
      vpc,
    });

    // Assert that there is at least one private subnet and one public subnet
    assert(vpc.privateSubnets.length > 0, 'VPC must have at least one private subnet for ECS tasks');
    assert(vpc.publicSubnets.length > 0, 'VPC must have at least one public subnet for NAT gateways');

    // Public subnets are for NAT gateways and load balancers
    vpc.publicSubnets.forEach((subnet, index) => {
      Tags.of(subnet).add('Name', `${id}-PublicSubnet-${index + 1}`);
    });

    Tags.of(vpc).add('Name', `${id}-VPC`);

    this.enableFlowLogs();
    // Create isolated subnets BEFORE the gateway endpoint so we can wire the
    // isolated route table into S3 routing in one shot.
    this.isolatedSubnets = this.addIsolatedSubnets(id);
    // CDK auto-adds an ingress rule on the endpoint SG for the VPC's PRIMARY
    // CIDR. Secondary-CIDR subnets (our isolated subnets) need their own
    // ingress rule, otherwise the endpoint ENIs silently drop their packets.
    this.securityGroup.addIngressRule(
      Peer.ipv4(ISOLATED_SUBNETS_SECONDARY_CIDR),
      Port.tcp(443),
      'Allow HTTPS from isolated subnets (secondary CIDR) to interface endpoints',
    );
    const endpointsMap = this.addEndpoints(props.existingApiGwVpcEndpointId);
    const apiGwVpcEndpointId = endpointsMap.get(APIGATEWAY_VPC_END_POINT_NAME);
    assert(apiGwVpcEndpointId, 'addEndpoints must always create or reuse the execute-api endpoint');
    this.apiGwVpcEndpointId = apiGwVpcEndpointId;
  }

  /**
   * Carve a parallel set of subnets — one per AZ — that have no default route
   * to the internet. Allocated from a secondary CIDR
   * (`{@link ISOLATED_SUBNETS_SECONDARY_CIDR}`) so the existing primary CIDR
   * subnets are untouched: this is fully additive at the CFN level and won't
   * cause any existing subnet, route table, or NAT gateway to be replaced.
   *
   * The subnets share a single route table whose only route is the implicit
   * VPC-local route. Evaluators placed here can still reach the rest of the VPC
   * (interface endpoints, the VPC DNS resolver, etc.) but cannot reach the
   * internet — even if their security group allows all outbound traffic.
   */
  private addIsolatedSubnets(id: string): ISubnet[] {
    const secondaryCidr = new CfnVPCCidrBlock(this, 'SecondaryCidrBlock', {
      vpcId: this.vpc.vpcId,
      cidrBlock: ISOLATED_SUBNETS_SECONDARY_CIDR,
    });

    const isolatedRouteTable = new CfnRouteTable(this, 'IsolatedRouteTable', {
      vpcId: this.vpc.vpcId,
    });
    Tags.of(isolatedRouteTable).add('Name', `${id}-IsolatedRouteTable`);

    assert(
      this.vpc.availabilityZones.length <= 16,
      'Isolated subnet CIDR allocation supports max 16 AZs. ' + `VPC has ${this.vpc.availabilityZones.length} AZs.`,
    );

    return this.vpc.availabilityZones.map((az, index) => {
      // /20 per AZ — 4,096 addresses, plenty for any evaluator we'd place here.
      // Spaced 16 third-octet steps apart to keep room for ~16 AZs.
      const cidrBlock = `10.1.${index * 16}.0/20`;

      const cfnSubnet = new CfnSubnet(this, `IsolatedSubnet${index + 1}`, {
        vpcId: this.vpc.vpcId,
        availabilityZone: az,
        cidrBlock,
        mapPublicIpOnLaunch: false,
      });
      // Subnet creation must wait for the secondary CIDR to be attached.
      cfnSubnet.addDependency(secondaryCidr);
      Tags.of(cfnSubnet).add('Name', `${id}-IsolatedSubnet-${index + 1}`);

      new CfnSubnetRouteTableAssociation(this, `IsolatedSubnet${index + 1}RouteTableAssoc`, {
        subnetId: cfnSubnet.ref,
        routeTableId: isolatedRouteTable.ref,
      });

      return Subnet.fromSubnetAttributes(this, `IsolatedSubnet${index + 1}Attrs`, {
        subnetId: cfnSubnet.ref,
        availabilityZone: az,
        routeTableId: isolatedRouteTable.ref,
      });
    });
  }

  addEndpoints(existingApiGwVpcEndpointId?: string): Map<string, string> {
    const endpointMap = new Map<string, string>();
    const endpoints: Array<[string, InterfaceVpcEndpointAwsService]> = [
      [CLOUD_WATCH_VPC_END_POINT_NAME, InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING],
      [CLOUD_WATCH_LOGS_VPC_END_POINT_NAME, InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS],
      // Required by agent-as-judge Lambda: Bedrock for inference, EventBridge
      // for the dispatch rule to deliver into isolated subnets. The evaluator
      // is Lambda-based and pulls no container images, so no ECR endpoints.
      [BEDROCK_RUNTIME_VPC_END_POINT_NAME, InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME],
      [EVENTS_VPC_END_POINT_NAME, InterfaceVpcEndpointAwsService.EVENTBRIDGE],
    ];

    // Interface endpoints: deliberately NOT associated with the isolated
    // subnets — interface endpoints accept at most one subnet per AZ, and
    // each AZ already has a private subnet ENI. Tasks in the isolated
    // subnets reach those ENIs via local VPC routing (the local route covers
    // both the primary and secondary CIDRs), and zonal DNS for
    // privateDnsEnabled endpoints returns the same-AZ ENI.
    for (const [name, service] of endpoints) {
      const endpoint = this.vpc.addInterfaceEndpoint(name, {
        service,
        privateDnsEnabled: true,
        lookupSupportedAzs: false,
        securityGroups: this.securityGroup ? [this.securityGroup] : undefined,
      });
      endpointMap.set(name, endpoint.vpcEndpointId);
    }

    // execute-api VPC endpoint: always created so isolated-subnet Lambdas can
    // reach the private API Gateway. If the customer already has one, reuse it
    // to avoid duplicate resources.
    if (existingApiGwVpcEndpointId) {
      endpointMap.set(APIGATEWAY_VPC_END_POINT_NAME, existingApiGwVpcEndpointId);
    } else {
      const apiGwEndpoint = this.vpc.addInterfaceEndpoint(APIGATEWAY_VPC_END_POINT_NAME, {
        service: InterfaceVpcEndpointAwsService.APIGATEWAY,
        privateDnsEnabled: true,
        lookupSupportedAzs: false,
        securityGroups: this.securityGroup ? [this.securityGroup] : undefined,
      });
      endpointMap.set(APIGATEWAY_VPC_END_POINT_NAME, apiGwEndpoint.vpcEndpointId);
    }

    // S3 gateway endpoint: route-table-based, so we DO need to associate the
    // isolated route table — otherwise traffic to S3 from isolated subnets
    // would have nowhere to go. Public + private selections preserve the
    // historical association set so other workloads keep working unchanged.
    const gateway = this.vpc.addGatewayEndpoint(S3_GATEWAY_END_POINT_NAME, {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnets: this.vpc.privateSubnets },
        { subnets: this.vpc.publicSubnets },
        { subnets: this.isolatedSubnets },
      ],
    });
    endpointMap.set(S3_GATEWAY_END_POINT_NAME, gateway.vpcEndpointId);

    return endpointMap;
  }

  enableFlowLogs() {
    const vpcFlowLogsLogGroup = new LogGroup(this, 'VpcFlowLogsLogGroup', {
      logGroupName: 'VpcFlowLogs',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_YEAR,
    });

    new FlowLog(this, 'VpcFlowLogs', {
      resourceType: FlowLogResourceType.fromVpc(this.vpc),
      destination: FlowLogDestination.toCloudWatchLogs(vpcFlowLogsLogGroup),
    });
  }
}
