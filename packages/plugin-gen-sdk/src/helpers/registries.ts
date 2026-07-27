import { Nullable } from '../types';

export function createRegistry<T>() {
  let value: Nullable<T> = null;

  return {
    set(newValue: T) {
      value = newValue;
    },
    get(): T {
      if (value == null) {
        throw new Error('Registry value has not been set');
      }
      return value;
    },
    isSet(): boolean {
      return value != null;
    },
  };
}
