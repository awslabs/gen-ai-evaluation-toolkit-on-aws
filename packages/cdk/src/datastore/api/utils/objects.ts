/**
 * Picks the given key from provided object
 *
 * @returns clone of give object with only provided keys
 */
export function pick<T extends object | null | undefined, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  if (obj == null) return obj;
  const entires = Object.entries(obj);
  const filteredEntries = entires.filter(([key]) => (keys as string[]).includes(key));
  return Object.fromEntries(filteredEntries) as Pick<T, K>;
}

/**
 * Removes given keys from given object
 *
 * @returns clone of given object without given keys
 */
export function omit<T extends object | null | undefined, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  if (obj == null) return obj;
  const entires = Object.entries(obj);
  const filteredEntries = entires.filter(([key]) => !(keys as string[]).includes(key));
  return Object.fromEntries(filteredEntries) as Omit<T, K>;
}
