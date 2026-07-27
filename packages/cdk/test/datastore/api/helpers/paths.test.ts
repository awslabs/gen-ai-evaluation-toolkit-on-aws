import { VERSION_HEAD, VERSION_LATEST } from '@common/config';
import { getDatasetVersionS3Path, getS3HeadPath, getS3VersionPath, getTestCaseId } from '@datastore/api/helpers';

describe('Paths helpers tests', () => {
  describe('getDatasetVersionS3Path', () => {
    const datasetId = 'test-dataset';

    it('should return head path when version is HEAD', () => {
      expect(getDatasetVersionS3Path(VERSION_HEAD, { datasetId })).toBe(getS3HeadPath(datasetId));
    });

    it('should throw for LATEST version when no versions exist', () => {
      expect(() => getDatasetVersionS3Path(VERSION_LATEST, { datasetId, currentVersion: 0 })).toThrow(
        'database does not have any versions',
      );
    });

    it('should return latest version path when version is LATEST', () => {
      expect(getDatasetVersionS3Path(VERSION_LATEST, { datasetId, currentVersion: 3 })).toBe(
        getS3VersionPath(datasetId, 3),
      );
    });

    it('should throw for invalid version numbers', () => {
      expect(() => getDatasetVersionS3Path(0, { datasetId })).toThrow('invalid version number 0');
      expect(() => getDatasetVersionS3Path(-1, { datasetId })).toThrow('invalid version number -1');
    });

    it('should throw when version exceeds current version', () => {
      expect(() => getDatasetVersionS3Path(4, { datasetId, currentVersion: 3 })).toThrow('version 4 does not exist');
    });

    it('should return specific version path for valid version', () => {
      expect(getDatasetVersionS3Path(2, { datasetId, currentVersion: 3 })).toBe(getS3VersionPath(datasetId, 2));
    });

    it('should handle undefined currentVersion', () => {
      expect(() => getDatasetVersionS3Path(1, { datasetId })).toThrow('version 1 does not exist');
    });
  });

  describe('getTestCaseId', () => {
    const cases = {
      'some/path/to/file.json': 'file',
      '/file.abc': 'file',
      '/some/file.with.dots.png': 'file.with.dots',
      '/some/file-with-dashes.xml': 'file-with-dashes',
      '/some/file-no-extension': 'file-no-extension',
      '': '',
    };

    Object.entries(cases).forEach(([input, output]) => {
      it(`handles "${input}"`, () => {
        expect(getTestCaseId(input)).toEqual(output);
      });
    });
  });
});
