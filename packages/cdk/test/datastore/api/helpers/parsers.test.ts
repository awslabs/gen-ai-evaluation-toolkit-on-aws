import { VERSION_HEAD, VERSION_LATEST } from '@common/config';
import { parseVersionString } from '@datastore/api/helpers';

describe('Paths helpers tests', () => {
  describe('parseVersionNumber', () => {
    const testCases = {
      [VERSION_HEAD]: VERSION_HEAD,
      [VERSION_LATEST]: VERSION_LATEST,
      '-1': -1,
      '0': 0,
      '123': 123,
    };

    Object.entries(testCases).forEach(([input, expected]) => {
      it(`parses "${input}" correctly`, () => {
        expect(parseVersionString(input)).toEqual(expected);
      });
    });
  });
});
