import { Construct } from 'constructs';
import { ServiceMonitorConfig } from './types';
import { Stack } from 'aws-cdk-lib';
import { GenAiEtkDashboard } from './monitoring-dashboard';
import { GenAiEvaluationToolkitStackProps } from '@src/index';

type MonitoringProps<T extends Stack> = GenAiEvaluationToolkitStackProps<T> & {
  serviceMonitorConfig: ServiceMonitorConfig[];
};

// Manages the customer-facing CloudWatch monitoring dashboard.
export class MonitoringStack<T extends Stack> {
  public readonly stack: T;

  constructor(scope: Construct, id: string, props: MonitoringProps<T>) {
    this.stack = props.stackFactory(scope, id, {
      description: 'Stack for the GenAI Evaluation Toolkit: Monitoring',
    });

    new GenAiEtkDashboard(this.stack, 'Dashboard', { monitorConfigs: props.serviceMonitorConfig });
  }
}
