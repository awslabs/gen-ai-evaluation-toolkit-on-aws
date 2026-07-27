import { AnnotationValue } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { ModelBinder } from './common';
import assert from 'assert';

export const stringAnnotationValue: ModelBinder<AnnotationValue.StringValueMember> = {
  alternativParamName: (name) => `string${capitalize(name)}`,
  parseArg: (value: string): AnnotationValue.StringValueMember => ({
    stringValue: value,
  }),
  descriptionGenerator: (defaultDescription) => `${defaultDescription} (string)`,
};

export const numericAnnotationValue: ModelBinder<AnnotationValue.NumericValueMember> = {
  alternativParamName: (name) => `numeric${capitalize(name)}`,
  parseArg: (value: string): AnnotationValue.NumericValueMember => ({
    numericValue: parseFloat(value),
  }),
  descriptionGenerator: (defaultDescription) => `${defaultDescription} (number)`,
};

function capitalize(text: string): string {
  assert(text.length !== 0, 'Variable name is empty');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
