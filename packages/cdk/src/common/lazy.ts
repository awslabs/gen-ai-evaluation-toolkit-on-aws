export function lazy<T>(factory: () => T): () => T {
  let instance: T | undefined = undefined;
  return () => {
    return (instance ??= factory());
  };
}
