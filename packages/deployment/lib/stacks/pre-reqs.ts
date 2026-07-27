import { S3Ref } from '@awssolutions/gen-ai-evaluation-cdk';
import assert from 'assert';
import { RemovalPolicy, Size, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { ISubnet, IVpc, Subnet, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository, TagMutability } from 'aws-cdk-lib/aws-ecr';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { DockerImageName, ECRDeployment, S3ArchiveName } from 'cdk-ecr-deployment';
import { Construct } from 'constructs';
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { ContainerImageReference } from '../common';
import { CustomerManagedKmsKey, GenAiEtkVpc } from '../constructs';

export type GenAiEtkPreReqsStackProps = {
  createCustomerKmsKey?: boolean;
  /**
   * Existing VPC ID to use instead of creating a new one. When provided, the
   * pre-reqs stack imports the VPC via Vpc.fromLookup and skips creating VPC
   * endpoints, flow logs, and a security group.
   */
  existingVpcId?: string;
  /**
   * Existing execute-api VPC endpoint ID to reuse instead of creating a new one.
   * Useful when customers already have one to avoid duplicate resources and reduce cost.
   * REQUIRED on the existing-VPC path (`existingVpcId` set) — the stack creates no
   * endpoints in a customer VPC, so the private REST API must bind to a
   * customer-provided execute-api interface endpoint.
   */
  existingApiGwVpcEndpointId?: string;
  /**
   * Existing isolated (no-internet) subnet IDs for evaluators that require
   * airgapped networking (agent-as-judge). Only used on the existing-VPC path;
   * ignored when the stack creates the VPC (isolated subnets are then created
   * automatically). Mirrors Terraform's `existing_isolated_subnet_ids`.
   */
  existingIsolatedSubnetIds?: string[];
} & StackProps;

export class GenAiEtkPreReqsStack extends Stack {
  public readonly vpc: GenAiEtkVpc;
  public readonly kmskey?: CustomerManagedKmsKey;

  public readonly ecrRepository: Repository;

  private imagesBucket: Bucket;
  private ecrDeploymentRole: Role;

  constructor(
    scope: Construct,
    {
      createCustomerKmsKey = false,
      existingVpcId,
      existingApiGwVpcEndpointId,
      existingIsolatedSubnetIds,
      ...stackProps
    }: GenAiEtkPreReqsStackProps = {},
  ) {
    super(scope, 'GenAiEtk-pre-reqs', {
      terminationProtection: false,
      description: 'GenAi-ETK pre-requisite resources that are required for GenAi-ETK CDK deployments',
      ...stackProps,
    });

    Tags.of(this).add('stack', this.stackName); // Only informational

    const existingVpc: IVpc | undefined = existingVpcId
      ? Vpc.fromLookup(this, 'ExistingVpc', { vpcId: existingVpcId })
      : undefined;
    // existing VPC only: import the customer's isolated (no-internet) subnets for
    // the agent-as-judge evaluator. Ignored when we create the VPC ourselves.
    const existingIsolatedSubnets: ISubnet[] | undefined =
      existingVpc && existingIsolatedSubnetIds?.length
        ? existingIsolatedSubnetIds.map((subnetId, index) =>
            Subnet.fromSubnetId(this, `ExistingIsolatedSubnet${index + 1}`, subnetId),
          )
        : undefined;
    this.vpc = new GenAiEtkVpc(this, 'vpc', { existingApiGwVpcEndpointId, existingVpc, existingIsolatedSubnets });

    // KMS keys
    if (createCustomerKmsKey) {
      this.kmskey = new CustomerManagedKmsKey(this, 'kmskey', {
        keyDescription: 'KMS key for GenAI-ETK with CloudWatch Logs support',
        keyAlias: 'genai-etk-kms-key',
      });
    }

    this.ecrRepository = new Repository(this, 'ContainerImagesEcrRepository', {
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.imagesBucket = new Bucket(this, 'ContainerImagesBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      autoDeleteObjects: true,
      encryptionKey: this.kmskey?.key, // Use customer-managed key if provided
    });

    this.ecrDeploymentRole = new Role(this, 'EcrDeploymentRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    // Grant the lambda access to the S3 bucket (and its KMS key) that contains the image
    this.imagesBucket.grantRead(this.ecrDeploymentRole);
  }

  public uploadContainerImage(scope: Construct, imagePath: string, imageName?: string): ContainerImageReference {
    // e.g. assets/images/plugin-eval-ragas_lambda.zip -> PluginEvalRagasLambda
    imageName ??= path
      .basename(imagePath)
      .replace(/\.\w+$/, '') // Remove extension
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join('');

    const { s3Ref, bucketDeployment } = this.uploadContainerImageToS3(scope, imageName, imagePath);
    const { imageTag, ecrDeployment } = this.uploadS3ImageToECR(scope, imageName, s3Ref);

    // Explicitly add dependency: ECR deployment must wait for S3 upload to complete
    ecrDeployment.node.addDependency(bucketDeployment);

    return { imageTag, ecrRepo: this.ecrRepository, ecrDeployment };
  }

  private uploadContainerImageToS3(
    scope: Construct,
    imageName: string,
    imagePath: string,
  ): { s3Ref: S3Ref; bucketDeployment: BucketDeployment } {
    // Key prefix in the target S3 bucket
    const DESTINATION_PREFIX = 'images';

    // Assert that file exists and is a zip file
    assert(imagePath.endsWith('.zip'), `Expected a zip file, got ${imagePath}`);
    assert(existsSync(imagePath), `${imagePath} does not exist`);

    // Deployment lambda's storage can be at most 10GB
    // it downloads then re-uploads the files, so files cannot be larger than 10GB
    assert(
      statSync(imagePath).size < 10 * (1 << 30),
      `Image ${imageName} is larger than 10GB, cannot upload files larger than 10GB`,
    );

    const bucketDeployment = new BucketDeployment(scope, 'DeployContainerImage' + imageName, {
      sources: [Source.asset(imagePath)],
      destinationBucket: this.imagesBucket,
      destinationKeyPrefix: 'images',
      prune: false, // Do not remove other files under same prefix

      // Lambda limits - using max memory for large container images
      memoryLimit: 10 * 1024, // 10GB (Lambda max), size is in MB
      ephemeralStorageSize: Size.gibibytes(10), // Max storage
    });

    const imageHashPath = imagePath.replace(/\.zip$/, '.hash');
    assert(existsSync(imageHashPath), `Hash ${imageHashPath} for ${imageName} image does not exist`);

    // Format: "timestamp hash"
    const imageHash = readFileSync(imageHashPath, 'utf-8').trim().split(' ').at(-1)!;
    assert(imageHash, `Expected hash for ${imageName} image at ${imageHashPath}, found empty file`);

    // Extract original filename from path (e.g., experiment-logger) for S3 object key
    const originalName = path.basename(imagePath).replace(/\.\w+$/, '');

    return {
      s3Ref: {
        location: {
          bucketName: this.imagesBucket.bucketName,
          objectKey: `${DESTINATION_PREFIX}/${originalName}.tar`,
        },
        imageVersion: imageHash?.substring(0, 8), // Image version can be at most 8 characters
      },
      bucketDeployment,
    };
  }

  /**
   * Uploads docker image from S3 to ECR
   */
  private uploadS3ImageToECR(
    scope: Construct,
    imageName: string,
    imageS3Ref: S3Ref,
  ): { imageTag: string; ecrDeployment: ECRDeployment } {
    // Grant the lambda access to the S3 bucket (and its KMS key) that contains the image
    this.imagesBucket.grantRead(this.ecrDeploymentRole);

    // Include image version in tag to trigger ECR updates when image changes
    const imageTag = `GenAi-ETK-${imageName}-${imageS3Ref.imageVersion}`;

    // The actual deployment that uploads the image from S3 to ECR
    const deployment = new ECRDeployment(scope, 'ECRDeployment' + imageName, {
      src: new S3ArchiveName(`${imageS3Ref.location.bucketName}/${imageS3Ref.location.objectKey}`),
      dest: new DockerImageName(`${this.ecrRepository.repositoryUri}:${imageTag}`),
      role: this.ecrDeploymentRole,
    });

    return {
      imageTag,
      ecrDeployment: deployment,
    };
  }
}
