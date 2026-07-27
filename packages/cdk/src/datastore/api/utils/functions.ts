/**
 * Executes the provided function once, then keeps executing it as long as it calls the provided `repeat` function.
 *
 * @param fn provided function to execute
 */
export async function processUntilExhausted(fn: (repeat: () => void) => Promise<unknown>): Promise<void> {
  let shouldRepeat: boolean;
  const repeat = () => (shouldRepeat = true);

  do {
    shouldRepeat = false;
    await fn(repeat);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } while (shouldRepeat);
}

/**
 * Higher order generator that accepts another generator and chunks its items with given chunk size.
 *
 * @param generator target generator to be exhausted and chunked
 * @param chunkSize
 */
export async function* chunkGenerator<T>(generator: AsyncGenerator<T>, chunkSize: number): AsyncGenerator<T[]> {
  const chunk = [];

  for await (const item of generator) {
    chunk.push(item);
    if (chunk.length == chunkSize) yield chunk.splice(0);
  }

  if (chunk.length != 0) yield chunk;
}
