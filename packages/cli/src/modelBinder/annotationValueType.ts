import { AnnotationValueType } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { ModelBinder } from './common';

export const enumAnnotationValueType: ModelBinder<
  AnnotationValueType.StringTypeMember | AnnotationValueType.StringTypeMember[]
> = {
  alternativParamName: () => 'enumValue',
  parseArg: (
    value: string,
    previous?: unknown,
  ): AnnotationValueType.StringTypeMember | AnnotationValueType.StringTypeMember[] => {
    if (previous === undefined) return { stringType: { enum: [value.trim()] } };
    return {
      stringType: {
        enum: [...(previous as AnnotationValueType.StringTypeMember).stringType.enum, value.trim()],
      },
    };
  },
  descriptionGenerator: (defaultDescription) =>
    `${defaultDescription} (for specific annotations). Valid values have to be provided as e.g. --enum-value value1 --enum-value value2`,
};

export const numericAnnotationValueType: ModelBinder<AnnotationValueType.NumericTypeMember> = {
  isBoolean: true,
  alternativParamName: () => 'numberValue',
  parseArg: (): AnnotationValueType.NumericTypeMember => ({ numericType: {} }),
  descriptionGenerator: (defaultDescription) => `${defaultDescription} (for numeric annotations)`,
};
