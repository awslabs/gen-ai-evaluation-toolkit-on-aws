import assert from 'assert';
import * as smithyModel from '@smithyModel';
import {
  AvailableCommands,
  AvailableShapeId,
  hasDocumentation,
  hasLength,
  Range,
  hasPattern,
  hasRange,
  isRequired,
  Traits,
  SmithyShape,
  isComposite,
  isService,
  isSmithyOperation,
  SmithyComposite,
  SmithyReference,
  SmithyModel,
  AvailableTypes,
  availableTypes,
  hasDefault,
} from '.';

export type ParameterDefinition = {
  name: string;
  description: string;
  isOptional: boolean;
  type: AvailableTypes;
  defaultValue: unknown;
  range?: Range;
  length?: Range;
  pattern?: string;
};

type OperationDefinition = {
  description: string;
  parameters: ParameterDefinition[];
};

export type OperationLookup = Record<AvailableCommands, OperationDefinition>;

/**
 * Get all members from a composite, including those from mixins
 * @param compositeShape The composite shape
 * @param shapes All shapes from the model
 * @returns Map of member name to member definition
 */
function getAllStructureMembers(
  compositeShape: Traits & SmithyComposite,
  shapes: { [key: string]: SmithyShape },
): Record<string, SmithyReference> {
  const mixinMembers =
    compositeShape.mixins?.reduce(
      (acc, mixin) => {
        const mixinShape = shapes[mixin.target];
        assert(isComposite(mixinShape), `Mixin ${mixin.target} is not a composite shape`);
        return { ...acc, ...getAllStructureMembers(mixinShape, shapes) };
      },
      {} as Record<string, SmithyReference>,
    ) ?? {};

  const directMembers = compositeShape.members ?? {};

  const allMembers = Object.fromEntries(
    Object.entries({ ...mixinMembers, ...directMembers }).map(([key, value]) => [
      key,
      key in mixinMembers && key in directMembers
        ? ({ ...mixinMembers[key], ...directMembers[key] } as SmithyReference)
        : value,
    ]),
  );

  return allMembers;
}

/**
 * Extract parameters from a Smithy operation input structure
 * @param inputShapeId ID of the input structure shape
 * @param shapes All shapes from the model
 * @returns Array of normalized operation parameters
 */
function parseSmithyOperationParameters(
  inputShapeId: string,
  shapes: { [key: string]: SmithyShape },
): ParameterDefinition[] {
  const inputShape = shapes[inputShapeId];

  assert(isComposite(inputShape), 'Input shape must be composite');

  const allMembers = getAllStructureMembers(inputShape, shapes);
  const parameters = Object.entries(allMembers).map(([memberName, member]) =>
    mapParameter(member, memberName, inputShapeId),
  );

  return parameters;
}

/**
 * Map a Smithy reference to a parameter definition
 * @param member Smithy reference
 * @param memberName Name of the member
 * @param inputShapeId ID of the input structure shape
 * @returns Parameter definition
 */
function mapParameter(member: SmithyReference, memberName: string, inputShapeId: string): ParameterDefinition {
  const isOptional = !isRequired(member);

  assert(hasDocumentation(member), `Member with name ${memberName} of operation ${inputShapeId} has no documentation`);
  const description = member.traits['smithy.api#documentation'];

  const type = member.target.split('#').pop();
  assert(type, `Could not determine type of member ${memberName} of operation ${inputShapeId}`);
  assert(isValidType(type), `Type ${type} is unknown.`);

  const range = hasRange(member) ? member.traits['smithy.api#range'] : undefined;
  const length = hasLength(member) ? member.traits['smithy.api#length'] : undefined;
  const pattern = hasPattern(member) ? member.traits['smithy.api#pattern'] : undefined;
  const defaultValue = hasDefault(member) ? member.traits['smithy.api#default'] : undefined;

  return {
    name: memberName,
    description,
    isOptional,
    type,
    range,
    length,
    pattern,
    defaultValue,
  };
}

/**
 * Create a lookup table from Smithy model
 * @returns Map of operation IDs to their definitions
 */
export function retrieveOperationLookup(): OperationLookup {
  const shapes = (smithyModel as SmithyModel).shapes;
  const serviceShape = Object.values(shapes).find((shape) => isService(shape));

  assert(serviceShape, 'No service shape found in model');

  const operationShapes = serviceShape.operations.map((operationRef) => mapOperation(operationRef, shapes));

  return Object.fromEntries(operationShapes) as OperationLookup;
}

/**
 * Map a Smithy operation reference to an operation definition
 * @param reference Smithy operation reference
 * @param shapes All shapes from the model
 * @returns Operation definition
 */
function mapOperation(
  reference: SmithyReference,
  shapes: Record<AvailableShapeId, SmithyShape>,
): [AvailableCommands, OperationDefinition] {
  const operationShapeId = reference.target;
  const operationShape = shapes[operationShapeId];

  assert(isSmithyOperation(operationShape), 'Invalid shape in service member declaration');

  // Extract operation name from shape ID (e.g., "com.example#CreateDataset" -> "CreateDataset")
  const operationName = operationShapeId.split('#').pop();
  assert(operationName, `Could not determine operation name from shape ID ${operationShapeId}`);

  assert(
    hasDocumentation(operationShape),
    `Documentation for Operation ${operationName} is missing: ${JSON.stringify(operationShape)} `,
  );
  const description = operationShape.traits['smithy.api#documentation'];

  const parameters = parseSmithyOperationParameters(operationShape.input.target, shapes);

  const command = `${operationName}Command` as AvailableCommands;
  return [
    command,
    {
      description: description,
      parameters,
    },
  ];
}

function isValidType(type: string): type is AvailableTypes {
  return availableTypes.has(type as AvailableTypes);
}
