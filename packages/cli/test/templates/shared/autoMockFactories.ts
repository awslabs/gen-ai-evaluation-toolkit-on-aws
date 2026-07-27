import * as ClientSdk from '@awssolutions/gen-ai-evaluation-toolkit-client';
import * as smithyModel from '@smithyModel';
import { __MetadataBearer, ServiceInputTypes, ServiceOutputTypes } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import assert from 'assert';
import { GenAiEtkCommandAccessor } from '@src/cli';

type SmithyShape = {
  type: string;
  members?: Record<string, SmithyReference>;
  member?: SmithyReference;
  key?: SmithyReference;
  value?: SmithyReference;
  mixins?: SmithyReference[];
  traits?: Record<string, unknown>;
  target?: string;
};

type SmithyReference = {
  target: string;
  traits?: Record<string, unknown>;
};

type SmithyOperation = SmithyShape & {
  type: 'operation';
  input: SmithyReference;
  output: SmithyReference;
};

type SmithyModel = {
  shapes: Record<string, SmithyShape>;
};

// Module-scoped variables
const shapes: Record<string, SmithyShape> = (smithyModel as SmithyModel).shapes;

/**
 * Searches for an operation shape by name across all namespaces
 */
function findOperationByName(operationName: string): string | undefined {
  return Object.entries(shapes).find(
    ([shapeId, shape]) => shape.type === 'operation' && shapeId.endsWith(`#${operationName}`),
  )?.[0];
}

/**
 * Gets all members from a structure, including those from mixins
 */
function getAllStructureMembers(shape: SmithyShape): Record<string, SmithyReference> {
  const mixinMembers = (shape.mixins || []).reduce(
    (acc, mixin) => {
      const mixinShape = shapes[mixin.target];
      assert(mixinShape, `Mixin ${mixin.target} not found in definition`);
      assert(mixinShape.type === 'structure', 'Mixin is not a structure');
      return { ...acc, ...getAllStructureMembers(mixinShape) };
    },
    {} as Record<string, SmithyReference>,
  );

  const directMembers = shape.members || {};

  return { ...mixinMembers, ...directMembers };
}

/**
 * Generates mock structure object
 */
function generateStructureMock(shape: SmithyShape, context: string[]): Record<string, unknown> {
  const members = getAllStructureMembers(shape);
  return Object.entries(members).reduce(
    (acc, [memberName, memberRef]) => ({
      ...acc,
      [memberName]: generateMockValue(memberRef.target, [...context, memberName]),
    }),
    {},
  );
}

/**
 * Generates mock list
 */
function generateListMock(shape: SmithyShape, context: string[]): unknown[] {
  assert(shape.member, 'Member definition missing');
  const memberValue1 = generateMockValue(shape.member.target, [...context, '1']);
  const memberValue2 = generateMockValue(shape.member.target, [...context, '2']);
  return [memberValue1, memberValue2];
}

/**
 * Generates mock map
 */
function generateMapMock(shape: SmithyShape, context: string[]): Record<string, unknown> {
  assert(shape.key, 'Key definition missing');
  assert(shape.value, 'Value definition missing');

  const key1Value = generateMockValue(shape.key.target, [...context, 'key1']);
  const key2Value = generateMockValue(shape.key.target, [...context, 'key2']);
  const valu1Value = generateMockValue(shape.key.target, [...context, 'value1']);
  const valu2Value = generateMockValue(shape.key.target, [...context, 'value2']);

  return {
    [String(key1Value)]: valu1Value,
    [String(key2Value)]: valu2Value,
  };
}

/**
 * Generates mock union (picks first member)
 */
function generateUnionMock(shape: SmithyShape, context: string[]): Record<string, unknown> {
  assert(shape.members, 'Members definition missing');

  const firstMember = Object.entries(shape.members)[0];
  assert(firstMember, 'Members definition missing for first member in union');

  const [memberName, memberRef] = firstMember;
  return {
    [memberName]: generateMockValue(memberRef.target, [...context, memberName]),
  };
}

/**
 * Generates mock enum value (picks first member)
 */
function generateEnumMock(shape: SmithyShape): string {
  assert(shape.members, 'Members definition missing');

  const firstMember = Object.entries(shape.members)[0];
  assert(firstMember, 'First member definition missing');

  const [memberName, memberRef] = firstMember;
  return (memberRef.traits?.['smithy.api#enumValue'] as string) || memberName;
}

/**
 * Generates mock value for custom string types based on shape ID and traits
 */
function generateCustomStringMock(context: string[]): string {
  return [...context, 'string'].join('-');
}

/**
 * Generates mock value for a given shape type
 */
function generateMockValue(shapeId: string, context: string[] = []): unknown {
  const shape = shapes[shapeId];
  if (!shape) {
    const hash = context.join().length + shapeId.length;

    switch (shapeId) {
      case 'smithy.api#String':
        return generateCustomStringMock(context);
      case 'smithy.api#Integer':
        return hash;
      case 'smithy.api#Float':
        return hash / 10.0;
      case 'smithy.api#Long':
        return hash * 10;
      case 'smithy.api#Unit':
        return {};
      case 'smithy.api#Boolean':
        return true;
      case 'smithy.api#Document':
        return {
          some: { complex: ['object'] },
          with: ['nested', 'properties'],
        };
      case 'smithy.api#Timestamp':
        return new Date(2012, 12, 21 + hash * 31);
      default:
        throw Error(`Unknown default (smithy) shape: ${shapeId}, ${context.join(' ')}`);
    }
  }

  switch (shape.type) {
    case 'structure':
      return generateStructureMock(shape, context);
    case 'list':
      return generateListMock(shape, context);
    case 'map':
      return generateMapMock(shape, context);
    case 'union':
      return generateUnionMock(shape, context);
    case 'enum':
      return generateEnumMock(shape);
    case 'string':
      return generateCustomStringMock(context);
    default:
      throw Error(`Unknown shape type: ${shape.type} Id: ${shapeId}, ${context}`);
  }
}

/**
 * Generates mock factory for a output
 */
export function createMockValue<InputType extends ServiceInputTypes, OutputType extends ServiceOutputTypes>(
  constructor: GenAiEtkCommandAccessor<InputType, OutputType>,
): OutputType {
  const commandOutputName = constructor(ClientSdk).name;
  const operationName = commandOutputName.replace(/Command$/, '');
  const operationId = findOperationByName(operationName);
  assert(operationId, `Unknown operation for command: ${commandOutputName}`);

  const operation = shapes[operationId] as SmithyOperation | undefined;
  assert(operation, `Operation not found: ${operationId}`);

  return generateMockValue(operation.output.target) as OutputType;
}
