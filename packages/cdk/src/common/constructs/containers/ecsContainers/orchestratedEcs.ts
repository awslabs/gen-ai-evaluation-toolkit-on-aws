import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EcsRunTask, EcsFargateLaunchTarget, EcsRunTaskProps } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { IntegrationPattern, JsonPath } from 'aws-cdk-lib/aws-stepfunctions';
import { BaseEcs, BaseEcsProps } from './baseEcs';

export type OrchestratedEcsProps = BaseEcsProps & {
  environmentVariables?: Record<string, string>;
};

export class OrchestratedEcs extends BaseEcs {
  private readonly environmentVariables: Record<string, string>;

  constructor(scope: Construct, id: string, props: OrchestratedEcsProps) {
    super(scope, id, props);
    this.environmentVariables = props.environmentVariables || {};
  }

  public grantPermissions(role: iam.IRole): void {
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ecs:RunTask', 'ecs:StopTask', 'ecs:DescribeTasks'],
        resources: [this.taskDefinition.taskDefinitionArn],
      }),
    );

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [this.taskDefinition.executionRole!.roleArn, this.taskDefinition.taskRole.roleArn],
      }),
    );
  }

  public createTaskState(id: string, inputDataPath: string = '$', resultPath?: string): EcsRunTask {
    const baseEnvironment = [
      {
        name: 'INPUT_DATA',
        value: JsonPath.stringAt(`States.JsonToString(${inputDataPath})`),
      },
    ];

    const additionalEnvironment = Object.entries(this.environmentVariables).map(([name, value]) => ({
      name,
      value,
    }));

    const taskStateProps: EcsRunTaskProps = {
      integrationPattern: IntegrationPattern.RUN_JOB,
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      launchTarget: new EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [
        {
          containerDefinition: this.containerDefinition,
          environment: [...baseEnvironment, ...additionalEnvironment],
        },
      ],
      subnets: {
        subnets: this.vpc.privateSubnets,
      },
      securityGroups: [this.securityGroup],
      ...(resultPath && { resultPath }),
    };

    return new EcsRunTask(this, id, taskStateProps);
  }
}
