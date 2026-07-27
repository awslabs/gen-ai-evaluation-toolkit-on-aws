import { Construct } from 'constructs';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { SecuredNodejsFunction } from '@secured';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as cdk from 'aws-cdk-lib';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { EnvVariable } from '@common/config';
import { suppressCdkNag } from '@src/cdk-nag-suppressions';
import { IVpc } from 'aws-cdk-lib/aws-ec2';

import annotations from './data/annotations.json';

export interface AnnotationSeederProps {
  readonly table: ITable;
  readonly vpc: IVpc;
}

export class AnnotationSeeder extends Construct {
  protected props: AnnotationSeederProps;
  constructor(scope: Construct, id: string, props: AnnotationSeederProps) {
    super(scope, id);
    this.props = props;

    const fn = new SecuredNodejsFunction(this, 'SystemAnnotationsSeederHandler', {
      handler: 'index.systemDefinedAnnotationsSeederHandler.lambdaHandler',
      vpc: props.vpc,
    });

    fn.addEnvironment(EnvVariable.DYNAMO_TABLE_NAME, props.table.tableName);

    props.table.grantWriteData(fn);

    const providerRole = new Role(this, 'CustomResourceProviderRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    const provider = new cr.Provider(this, 'CustomResourceProvider', {
      onEventHandler: fn,
      role: providerRole,
    });

    new cdk.CustomResource(this, 'SystemAnnotationsSeederCustomResource', {
      serviceToken: provider.serviceToken,
      properties: {
        annotations: JSON.stringify(annotations),
      },
    });

    suppressCdkNag(this, [
      { id: 'AwsSolutions-L1', reason: 'Using latest Node.js LTS version (22.x)' },
      { id: 'AwsSolutions-IAM5', reason: 'Custom resource creates some internal policy' },
    ]);
  }
}
