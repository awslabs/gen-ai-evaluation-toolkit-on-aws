import { Aspects, Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagReportFormat } from 'cdk-nag';

export function lazy<T>(factory: () => T): () => T {
  let instance: T | undefined;

  return function getInstance(): T {
    instance ??= factory();
    return instance;
  };
}

export function enableCdkNag(stack: Stack) {
  Aspects.of(stack).add(new AwsSolutionsChecks({ reportFormats: [NagReportFormat.JSON] }));
}
