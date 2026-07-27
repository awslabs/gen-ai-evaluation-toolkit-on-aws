import { Dimension } from '../types';
import { crossMultiply } from './dimensions';

describe('Dimenstions helpers unit tests', () => {
  test('crossMultiply', () => {
    const input = [{ a: [1, 2] }, { b: [1, 2] }, { c: [1, 2] }];

    const expectedOutput = [
      { a: 1, b: 1, c: 1 },
      { a: 1, b: 1, c: 2 },
      { a: 1, b: 2, c: 1 },
      { a: 1, b: 2, c: 2 },
      { a: 2, b: 1, c: 1 },
      { a: 2, b: 1, c: 2 },
      { a: 2, b: 2, c: 1 },
      { a: 2, b: 2, c: 2 },
    ];

    const output = crossMultiply(input as unknown as Dimension[]);
    expect(output).toEqual(expectedOutput);
  });
});
