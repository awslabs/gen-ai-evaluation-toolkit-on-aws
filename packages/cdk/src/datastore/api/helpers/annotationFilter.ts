import {
  AnnotationCondition,
  AnnotationConditionExpression,
  NumericLogicalComparator,
  StringEnumLogicalComparator,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DdbCondition, DdbConditionalOperators, DdbConditionExpression } from '@common/dynamoUtils';
import { logErrorAndThrowValidation } from '@common/api/exceptions/serviceExceptions';
import { getAnnotationSchema } from '@datastore/api/helpers/getEntityHelpers';

const numericAnnotationComparatorToDdbConditionOperatorMap = {
  [NumericLogicalComparator.EQUAL_TO]: DdbConditionalOperators.EQUAL_TO,
  [NumericLogicalComparator.NOT_EQUAL_TO]: DdbConditionalOperators.NOT_EQUAL_TO,
  [NumericLogicalComparator.GREATER_THAN]: DdbConditionalOperators.GREATER_THAN,
  [NumericLogicalComparator.GREATER_THAN_OR_EQUAL]: DdbConditionalOperators.GREATER_THAN_OR_EQUAL_TO,
  [NumericLogicalComparator.LESS_THAN]: DdbConditionalOperators.LESS_THAN,
  [NumericLogicalComparator.LESS_THAN_OR_EQUAL]: DdbConditionalOperators.LESS_THAN_OR_EQUAL_TO,
} as const;

const stringEnumAnnotationComparatorToDdbConditionOperatorMap = {
  [StringEnumLogicalComparator.EQUAL_TO]: DdbConditionalOperators.EQUAL_TO,
  [StringEnumLogicalComparator.NOT_EQUAL_TO]: DdbConditionalOperators.NOT_EQUAL_TO,
} as const;

/**
 * Function to assert the validity of a given annotation condition
 * @param annotationCondition annotation condition
 * @returns void
 */
export async function assertAnnotationConditionValidity(annotationCondition: AnnotationCondition): Promise<void> {
  if (annotationCondition.$unknown) {
    logErrorAndThrowValidation({
      externalMessage: `Unknown annotation condition: ${JSON.stringify(annotationCondition.$unknown)}`,
    });
  }
  const annotationName = (annotationCondition.numericCondition ?? annotationCondition.stringEnumCondition).name;

  const schema = await getAnnotationSchema(annotationName);

  if (!!schema.valueType.number && !annotationCondition.numericCondition) {
    logErrorAndThrowValidation({
      externalMessage: `Invalid condition for annotation '${annotationName}': Expected a numeric value condition.`,
    });
  }

  if (
    !!schema.valueType.string &&
    !(
      annotationCondition.stringEnumCondition &&
      schema.valueType.string.enum.includes(annotationCondition.stringEnumCondition.value)
    )
  ) {
    logErrorAndThrowValidation({
      externalMessage: `Invalid condition for annotation '${annotationName}': The value must be one of the following: [${schema.valueType.string.enum.join(', ')}].`,
    });
  }
}

/**
 * Function to convert annotation condition to ddb condition
 * @param annotationCondition annotation condition
 * @returns ddb condition
 */
export async function toDdbCondition(annotationCondition: AnnotationCondition): Promise<DdbCondition> {
  await assertAnnotationConditionValidity(annotationCondition);

  if (annotationCondition.numericCondition) {
    const condition = annotationCondition.numericCondition;
    return {
      key: `annotations.${condition.name}.value.numericValue`,
      operator: numericAnnotationComparatorToDdbConditionOperatorMap[condition.comparator],
      values: [condition.value],
    };
  }

  // if the 'annotationCondition' contains '$unknown' field, the above assertAnnotationConditionValidity throws an error.
  // Hence, at this point, annotationCondition can contain only the 'stringEnumCondition' field.
  const condition = annotationCondition.stringEnumCondition!;
  return {
    key: `annotations.${condition.name}.value.stringValue`,
    operator: stringEnumAnnotationComparatorToDdbConditionOperatorMap[condition.comparator],
    values: [condition.value],
  };
}

/**
 * Function to convert annotation condition expression to ddb condition expression
 * @param annotationConditionExpression annotation condition expression
 * @returns ddb condition expression
 */
export async function toDdbConditionExpression(
  annotationConditionExpression: AnnotationConditionExpression,
): Promise<DdbConditionExpression> {
  if (annotationConditionExpression.condition) {
    return {
      condition: await toDdbCondition(annotationConditionExpression.condition),
    };
  }

  if (annotationConditionExpression.and) {
    return {
      and: await Promise.all(
        annotationConditionExpression.and.map(async (expression) => await toDdbConditionExpression(expression)),
      ),
    };
  }

  if (annotationConditionExpression.or) {
    return {
      or: await Promise.all(
        annotationConditionExpression.or.map(async (expression) => await toDdbConditionExpression(expression)),
      ),
    };
  }

  if (annotationConditionExpression.not) {
    return {
      not: await toDdbConditionExpression(annotationConditionExpression.not),
    };
  }

  logErrorAndThrowValidation({
    externalMessage: `Unknown annotation condition expression: ${JSON.stringify(annotationConditionExpression.$unknown)}`,
  });
}
