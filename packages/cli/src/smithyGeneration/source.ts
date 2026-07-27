import * as smithyModel from '@smithyModel';

type GetTraitKeys<T> = T extends object
  ? T extends { traits: infer Traits }
    ? keyof Traits
    : T extends { members: infer M }
      ? GetTraitKeys<M>
      : T extends { [key: string]: infer V }
        ? GetTraitKeys<V>
        : never
  : never;

type GetCommands<Shape extends Record<string, object>> = {
  [K in AvailableShapeId]: Shape[K] extends {
    type: string;
    input: { target: string };
    output: { target: string };
  }
    ? K extends `${string}#${infer Name}`
      ? `${Name}Command`
      : never
    : never;
}[AvailableShapeId];

type GetTypes<Namespace extends string, Shape extends Record<string, object>> = {
  [K in AvailableShapeId]: Shape[K] extends object
    ? K extends `${Namespace}${string}#${infer Name}`
      ? Name
      : never
    : never;
}[AvailableShapeId];

type Resolve<T> = T extends T ? T : never;

export type AvailableSmithyShapes = typeof smithyModel.shapes;
export type AvailableShapeId = keyof AvailableSmithyShapes;
export type AvailableTraits =
  | GetTraitKeys<AvailableSmithyShapes[AvailableShapeId]>
  | 'smithy.api#required'
  | 'smithy.api#default'
  | 'smithy.api#documentation'
  | 'smithy.api#pattern'
  | 'smithy.api#range'
  | 'smithy.api#length';
export type AvailableCommands = GetCommands<AvailableSmithyShapes>;
export type AvailableTypes = Resolve<
  | GetTypes<'com.amzn.aws.pse.genaietk', AvailableSmithyShapes>
  | 'Boolean'
  | 'String'
  | 'Integer'
  | 'Unit'
  | 'Timestamp'
  | 'Float'
  | 'Long'
  | 'Document'
>;

export const availableTypes = new Set<AvailableTypes>([
  // Built-in smithy types
  'Boolean',
  'String',
  'Integer',
  'Unit',
  'Timestamp',
  'Float',
  'Long',
  'Document',
  // Custom models
  ...Object.keys(smithyModel.shapes)
    .filter((key) => key.startsWith('com.amzn.aws.pse.genaietk'))
    .map((key) => key.split('#')[1]),
] as AvailableTypes[]);
