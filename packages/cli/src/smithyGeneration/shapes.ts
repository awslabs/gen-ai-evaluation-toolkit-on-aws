import { AvailableShapeId, Traits } from '.';

export type SmithyShape = Traits & (SmithyService | SmithyOperation | SmithyComposite);

export type SmithyModel = {
  smithy: string;
  shapes: Record<AvailableShapeId, SmithyShape>;
};

type SmithyOperation = {
  type: 'operation';
  input: SmithyReference;
  output: SmithyReference;
  errors: SmithyReference[];
};

type SmithyService = {
  type: 'service';
  version: string;
  operations: SmithyReference[];
};

export type SmithyComposite = {
  type: 'structure' | 'enum' | 'union';
  members?: Record<string, SmithyReference>;
  mixins?: SmithyReference[];
};

export type SmithyReference = Traits & {
  target: AvailableShapeId;
};

function isShape<T extends SmithyShape>(...types: T['type'][]) {
  return (target?: SmithyShape): target is T => !!target && types.includes(target.type);
}

export const isSmithyOperation = isShape<SmithyOperation>('operation');
export const isService = isShape<SmithyService>('service');
export const isComposite = isShape<SmithyComposite>('structure', 'union', 'enum');
