import { Construct } from 'constructs';
import { ContainerImage, EcrImage } from 'aws-cdk-lib/aws-ecs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { ECRDeployment, S3ArchiveName, DockerImageName } from 'cdk-ecr-deployment';
import { IRepository } from 'aws-cdk-lib/aws-ecr';
import { IRole, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { S3Ref } from '@src/common/types';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Stack } from 'aws-cdk-lib';

type S3ToEcrProps = { ecrRepository: IRepository };

const SOLUTION_NAME = 'gen-ai-evaluation-toolkit';

// Base class for uploading docker images from S3 to ECR
export abstract class S3ToEcr extends Construct {
  protected readonly ecrRepository: IRepository;
  protected readonly role: IRole;

  constructor(scope: Construct, id: string, props: S3ToEcrProps) {
    super(scope, id);

    // Look up the existing ECR repository created in BaseStack
    //this.ecrRepository = Repository.fromRepositoryName(this, 'EcrRepository', ECR_REPOSITORY_NAME);
    this.ecrRepository = props.ecrRepository;

    // ECRDeployment needs additional KMS Decrypt permissions to access bucket objects
    this.role = new Role(this, 'EcrDeploymentRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    // Add suppression for L1 warning for whole of stack
    NagSuppressions.addStackSuppressions(Stack.of(this), [
      { id: 'AwsSolutions-IAM5', reason: 'Construct creates IAM resource with wildcard permissions' },
      { id: 'AwsSolutions-IAM4', reason: 'Construct creates IAM resource with wildcard permissions' },
    ]);
  }

  protected uploadToEcr(pluginName: string, imageS3Ref: S3Ref): EcrImage {
    const id = pluginName.replace(/-/g, '_');

    const kmsKey = imageS3Ref.bucketKeyArn ? Key.fromKeyArn(this, `Key_${id}`, imageS3Ref.bucketKeyArn) : undefined;

    const bucket = Bucket.fromBucketAttributes(this, `Bucket_${id}`, {
      encryptionKey: kmsKey,
      bucketName: imageS3Ref.location.bucketName,
    });
    bucket.grantRead(this.role);

    // Include image version in tag to trigger ECR updates only when image changes
    const solutionNamePrefixedImageTag = `${SOLUTION_NAME}-${pluginName}-${imageS3Ref.imageVersion}`;

    const srcArchive = new S3ArchiveName(`${imageS3Ref.location.bucketName}/${imageS3Ref.location.objectKey}`);
    const destImage = new DockerImageName(`${this.ecrRepository.repositoryUri}:${solutionNamePrefixedImageTag}`);

    new ECRDeployment(this, `ECRDeployment_${id}`, {
      src: srcArchive,
      dest: destImage,
      role: this.role,
    });

    return ContainerImage.fromEcrRepository(this.ecrRepository, solutionNamePrefixedImageTag);
  }
}
