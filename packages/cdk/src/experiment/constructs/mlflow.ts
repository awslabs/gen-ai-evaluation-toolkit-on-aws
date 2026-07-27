import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as iam from 'aws-cdk-lib/aws-iam';

import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { ML_FLOW_SERVER_NAME } from '@src/common';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';

type MLFlowStackProps = {
  experimentMlFlowBucket: IBucket;
  encryptionKey?: IKey;
};

export class MLFlow extends Construct {
  public readonly mlFlowServerArn: string;
  constructor(scope: Construct, id: string, props: MLFlowStackProps) {
    super(scope, id);

    // Create MLflow tracking server role with least privilege
    const mlflowRole = new iam.Role(this, 'MLFlowRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
    });

    // Grant bucket permissions (includes KMS permissions if encrypted)
    props.experimentMlFlowBucket.grantReadWrite(mlflowRole);
    suppressCdkNag(mlflowRole, 'AwsSolutions-IAM5', 'MLflow requires wildcard S3 permissions for artifact storage');

    // Create MLflow tracking server
    const mlflowServer = new sagemaker.CfnMlflowTrackingServer(this, 'MLFlowTrackingServer', {
      artifactStoreUri: props.experimentMlFlowBucket.s3UrlForObject(),
      roleArn: mlflowRole.roleArn,
      trackingServerName: ML_FLOW_SERVER_NAME,
    });

    this.mlFlowServerArn = mlflowServer.attrTrackingServerArn;
  }
}
