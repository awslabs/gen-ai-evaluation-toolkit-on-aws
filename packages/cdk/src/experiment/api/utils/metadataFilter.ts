import {
  ConditionExpression,
  Condition,
  NumericCondition,
  StringEnumCondition,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';

/**
 * Checks if the object's metadata matches the provided filter criteria
 */
export function matchesMetadataFilters(metadata: Record<string, string>, filter: ConditionExpression): boolean {
  if ('condition' in filter && filter.condition) {
    return evaluateCondition(filter.condition, metadata);
  } else if ('and' in filter && filter.and) {
    return filter.and.every((expr) => matchesMetadataFilters(metadata, expr));
  } else if ('or' in filter && filter.or) {
    return filter.or.some((expr) => matchesMetadataFilters(metadata, expr));
  } else if ('not' in filter && filter.not) {
    return !matchesMetadataFilters(metadata, filter.not);
  }

  return true;
}

/**
 * Evaluates a single condition against metadata
 */
function evaluateCondition(condition: Condition, metadata: Record<string, string>): boolean {
  if ('numericCondition' in condition && condition.numericCondition) {
    return evaluateNumericCondition(condition.numericCondition, metadata);
  } else if ('stringEnumCondition' in condition && condition.stringEnumCondition) {
    return evaluateStringCondition(condition.stringEnumCondition, metadata);
  }
  return false;
}

/**
 * Evaluates numeric conditions (=, !=, <, <=, >, >=)
 * Also handles date comparisons using numeric timestamps
 */
function evaluateNumericCondition(condition: NumericCondition, metadata: Record<string, string>): boolean {
  const { name, value, comparator } = condition;
  const metadataValue = metadata[name];
  if (!metadataValue) return false;

  const numericMetadataValue = parseFloat(metadataValue);
  if (isNaN(numericMetadataValue)) return false;

  switch (comparator) {
    case '=':
      return numericMetadataValue === value;
    case '!=':
      return numericMetadataValue !== value;
    case '<':
      return numericMetadataValue < value;
    case '<=':
      return numericMetadataValue <= value;
    case '>':
      return numericMetadataValue > value;
    case '>=':
      return numericMetadataValue >= value;
    default:
      return false;
  }
}

/**
 * Evaluates string conditions (=, !=)
 */
function evaluateStringCondition(condition: StringEnumCondition, metadata: Record<string, string>): boolean {
  const { name, value, comparator } = condition;
  const metadataValue = metadata[name];
  if (!metadataValue) return false;

  switch (comparator) {
    case '=':
      return metadataValue === value;
    case '!=':
      return metadataValue !== value;
    default:
      return false;
  }
}
