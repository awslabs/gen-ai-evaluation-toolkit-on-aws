import { omit, pick } from '@src/datastore/api/utils';

describe('Objects utils tests', () => {
  describe('pick', () => {
    it('returns null for null input', () => {
      expect(pick(null, [])).toEqual(null);
      expect(pick(undefined, [])).toEqual(undefined);
    });

    it('picks provided fields', () => {
      const input = { a: 1, b: 2, c: 3, d: 4 };
      expect(pick(input, ['a', 'c'])).toStrictEqual({ a: 1, c: 3 });
    });
  });

  describe('omit', () => {
    it('returns null for null input', () => {
      expect(omit(null, [])).toEqual(null);
      expect(omit(undefined, [])).toEqual(undefined);
    });

    it('omits provided fields', () => {
      const input = { a: 1, b: 2, c: 3, d: 4 };
      expect(omit(input, ['a', 'c'])).toStrictEqual({ b: 2, d: 4 });
    });
  });
});
