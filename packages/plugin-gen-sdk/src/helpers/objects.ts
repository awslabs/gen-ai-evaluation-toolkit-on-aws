import { Nullable } from '../types';

export function lazy<T>(factory: () => T): () => T {
  let instance: Nullable<T> = null;

  return function getter() {
    instance ??= factory();
    return instance;
  };
}
