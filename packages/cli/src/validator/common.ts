import { ParameterDefinition } from '@src/smithyGeneration';
import { ModelBinder } from '@src/modelBinder/common';

export type ModelValidator<
  Keys extends keyof ParameterDefinition = keyof Omit<ParameterDefinition, 'name' | 'description' | 'type'>,
> = (
  definition: Pick<ParameterDefinition, 'type' | Keys>,
  parseArg: Required<ModelBinder>['parseArg'],
) => Required<ModelBinder>['parseArg'];
