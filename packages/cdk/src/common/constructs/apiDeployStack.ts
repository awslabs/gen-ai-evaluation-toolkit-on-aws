import { GenAiEvaluationToolkitStackProps } from '@src/index';
import { Stack } from 'aws-cdk-lib';
import { Deployment, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export type ApiDeployStackProps<T extends Stack> = GenAiEvaluationToolkitStackProps<T> & {
  restApiId: string;
  restApiRootResourceId: string;
  /**
   * Optional public API to deploy alongside the private one.
   * Both APIs share the same Lambda handlers; the public API (EDGE) serves
   * external callers while the private API is used internally via VPC endpoint.
   */
  publicRestApiId?: string;
  publicRestApiRootResourceId?: string;
};

export class ApiDeployStack<T extends Stack> {
  public readonly stack: T;

  constructor(scope: Construct, id: string, props: ApiDeployStackProps<T>) {
    this.stack = props.stackFactory(scope, id, {
      description: 'Stack for the GenAI Evaluation Toolkit: API Stage Deployment',
    });

    // Deploy the private API (always present — used by internal Lambdas via VPC endpoint)
    const restApi = RestApi.fromRestApiAttributes(this.stack, 'RestApi', {
      restApiId: props.restApiId,
      rootResourceId: props.restApiRootResourceId,
    });
    const apiDeployment = new Deployment(restApi, 'ApiDeployment', {
      api: restApi,
      stageName: 'prod',
    });
    // Trigger a deployment every time to ensure API is deployed
    apiDeployment.addToLogicalId(new Date().toISOString());

    // Deploy the public API if one exists (EDGE/REGIONAL — used by external callers)
    if (props.publicRestApiId && props.publicRestApiRootResourceId) {
      const publicRestApi = RestApi.fromRestApiAttributes(this.stack, 'PublicRestApi', {
        restApiId: props.publicRestApiId,
        rootResourceId: props.publicRestApiRootResourceId,
      });
      const publicApiDeployment = new Deployment(publicRestApi, 'PublicApiDeployment', {
        api: publicRestApi,
        stageName: 'prod',
      });
      publicApiDeployment.addToLogicalId(new Date().toISOString());
    }
  }
}
