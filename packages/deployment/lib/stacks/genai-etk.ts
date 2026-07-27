import {
  GenAiEvaluationToolkitConstructProps,
  GenAiEvaluationToolkitStacks,
} from '@awssolutions/gen-ai-evaluation-cdk';
import { App, Duration, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { enableCdkNag } from '../common';

// Create GenAI-ETK stacks
export function createGenAiEtkStacks(
  app: App,
  id: string,
  props: GenAiEvaluationToolkitConstructProps,
): GenAiEvaluationToolkitStacks {
  const genAiEtk = new GenAiEvaluationToolkitStacks(app, id, {
    ...props,
    evaluationTempTestDataExpireAfter: Duration.days(7),
    stackFactory: (scope: Construct, id: string, childProps?: StackProps) =>
      new Stack(scope, id, {
        stackName: id,
        terminationProtection: false,
        ...childProps,
        ...props,
      }),
  });

  genAiEtk.stacks.forEach((stack: Stack) => {
    Tags.of(stack).add('stack', stack.stackName); // Only informational
    enableCdkNag(stack);
  });

  return genAiEtk;
}
