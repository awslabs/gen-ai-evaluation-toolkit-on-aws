import { AvailableTraits } from '.';

type Trait<K extends AvailableTraits, ValueType> = K extends K ? { [P in K]: ValueType } : never;

export type Range = {
  min?: number;
  max?: number;
};

type UnitTraits = Trait<'smithy.api#required', object>;
type StringTraits = Trait<'smithy.api#documentation' | 'smithy.api#pattern', string>;
type BoundedTrait = Trait<'smithy.api#range' | 'smithy.api#length', Range>;
type UnknownTraits = Trait<'smithy.api#default', unknown>;

type SpecifiedTraits = UnknownTraits | BoundedTrait | StringTraits | UnitTraits;

export type Traits = {
  traits?: Partial<SpecifiedTraits>;
};

type Resolve<T> = T extends T ? keyof T : never;
type ReferableTraits = Resolve<SpecifiedTraits>;

export const hasDocumentation = hasTrait('smithy.api#documentation');
export const isRequired = hasTrait('smithy.api#required');
export const hasRange = hasTrait('smithy.api#range');
export const hasLength = hasTrait('smithy.api#length');
export const hasPattern = hasTrait('smithy.api#pattern');
export const hasDefault = hasTrait('smithy.api#default');

function hasTrait<Name extends ReferableTraits>(
  name: Name,
): (target: Traits) => target is { traits: Trait<Name, ExtractTraitValue<Name>> } {
  return (target: Traits): target is { traits: Trait<Name, ExtractTraitValue<Name>> } =>
    !!target.traits && name in target.traits;
}

type ExtractTraitValue<K extends ReferableTraits> = Extract<SpecifiedTraits, { [P in K]: unknown }>[K];
