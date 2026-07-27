import { chunkGenerator, processUntilExhausted } from '@src/datastore/api/utils/functions';
import { setTimeout as sleep } from 'timers/promises';

describe('processUntilExhausted', () => {
  it('should execute function once when repeat is not called', async () => {
    const mockFn = jest.fn();

    await processUntilExhausted(async () => {
      mockFn();
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should execute function multiple times when repeat is called', async () => {
    const mockFn = jest.fn();
    let counter = 0;

    await processUntilExhausted(async (repeat) => {
      mockFn();
      counter++;
      if (counter < 3) repeat();
    });

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should handle async operations correctly', async () => {
    const results: number[] = [];
    let counter = 0;

    await processUntilExhausted(async (repeat) => {
      await sleep(10);
      results.push(counter);
      counter++;
      if (counter < 5) repeat();
    });

    expect(results).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('chunkGenerator', () => {
  // Helper function to create an async generator from array
  async function* createGenerator<T>(items: T[]): AsyncGenerator<T> {
    yield* items;
  }

  it('should chunk items with exact division', async () => {
    const input = [1, 2, 3, 4, 5, 6];
    const generator = createGenerator(input);
    const chunks = [];

    for await (const chunk of chunkGenerator(generator, 2)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual([1, 2]);
    expect(chunks[1]).toEqual([3, 4]);
    expect(chunks[2]).toEqual([5, 6]);
  });

  it('should handle remaining items in last chunk', async () => {
    const input = [1, 2, 3, 4, 5];
    const generator = createGenerator(input);
    const chunks = [];

    for await (const chunk of chunkGenerator(generator, 2)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual([1, 2]);
    expect(chunks[1]).toEqual([3, 4]);
    expect(chunks[2]).toEqual([5]);
  });

  it('should handle empty generator', async () => {
    const generator = createGenerator([]);
    const chunks = [];

    for await (const chunk of chunkGenerator(generator, 2)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(0);
  });

  it('should handle chunk size of 1', async () => {
    const input = [1, 2, 3];
    const generator = createGenerator(input);
    const chunks = [];

    for await (const chunk of chunkGenerator(generator, 1)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual([1]);
    expect(chunks[1]).toEqual([2]);
    expect(chunks[2]).toEqual([3]);
  });

  it('should handle chunk size larger than input', async () => {
    const input = [1, 2, 3];
    const generator = createGenerator(input);
    const chunks = [];

    for await (const chunk of chunkGenerator(generator, 5)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual([1, 2, 3]);
  });
});
