import {
  enumValue,
  listOf,
  integerValue,
  stringAnnotationValue,
  numericAnnotationValue,
  enumAnnotationValueType,
  numericAnnotationValueType,
  booleanValue,
  serializedJsonParameter,
  serializedJsonFile,
  stringValue,
  versionString,
} from '.';
import { JobType, StepFunctionJobStatus, ViewType, Workflow } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { generationStepsSchema, conditionExpressionSchema, documentSchema } from '@src/schemas';
import { AvailableTypes } from '@src/smithyGeneration';
import assert from 'assert';
import { ModelBinder } from './common';

export const registeredModelBinder: Partial<Record<AvailableTypes, ModelBinder[]>> = {
  Boolean: [booleanValue],
  Uuid: [stringValue],
  JobId: [stringValue],
  PaginationToken: [stringValue],
  String: [stringValue],
  Document: [stringValue, serializedJsonParameter(documentSchema, true), serializedJsonFile(documentSchema)],
  StringList: [listOf(stringValue)],
  Integer: [integerValue],
  VersionString: [versionString],
  OrderByList: [listOf(stringValue)],
  AnnotationValue: [stringAnnotationValue, numericAnnotationValue],
  AnnotationValueType: [enumAnnotationValueType, numericAnnotationValueType],
  StepFunctionJobStatus: [enumValue(StepFunctionJobStatus)],
  ViewType: [enumValue(ViewType)],
  AnnotationConditionExpression: [
    serializedJsonParameter(conditionExpressionSchema),
    serializedJsonFile(conditionExpressionSchema),
  ],
  ConditionExpression: [
    serializedJsonParameter(conditionExpressionSchema),
    serializedJsonFile(conditionExpressionSchema),
  ],
  GenerationStepList: [serializedJsonParameter(generationStepsSchema), serializedJsonFile(generationStepsSchema)],
  WorkflowList: [listOf(enumValue(Workflow))],
  // v2 evaluator types
  JobType: [enumValue(JobType)],
  ResourceId: [stringValue],
  TestDataSource: [serializedJsonParameter(documentSchema, true), serializedJsonFile(documentSchema)],
  ScorerMap: [serializedJsonParameter(documentSchema, true), serializedJsonFile(documentSchema)],
  AppConfig: [serializedJsonParameter(documentSchema, true), serializedJsonFile(documentSchema)],
  InlineTestResultList: [serializedJsonParameter(documentSchema, true), serializedJsonFile(documentSchema)],
  ReportMetadata: [serializedJsonParameter(documentSchema, true), serializedJsonFile(documentSchema)],
  BatchResultInputList: [serializedJsonParameter(documentSchema, true), serializedJsonFile(documentSchema)],
  BatchScoreItemList: [serializedJsonParameter(documentSchema, true), serializedJsonFile(documentSchema)],
  ResourceIdList: [serializedJsonParameter(documentSchema, true), serializedJsonFile(documentSchema)],
};

export function getModelBinder(type: string): Required<ModelBinder>[] {
  assert(isRegisteredType(type), `Type ${type} is not registered in the model binding registry.`);

  const parserConfig = registeredModelBinder[type];
  assert(parserConfig, `No model binder for type ${type} in the registry.`);

  return parserConfig.map((modelBinder) => ({
    alternativParamName: (name) => name,
    descriptionGenerator: (defaultDescription) => defaultDescription,
    isBoolean: false,
    ...modelBinder,
  }));
}

function isRegisteredType(type: string): type is keyof typeof registeredModelBinder {
  return type in registeredModelBinder;
}
