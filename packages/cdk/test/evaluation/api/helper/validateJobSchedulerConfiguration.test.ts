/* eslint-disable @typescript-eslint/no-explicit-any */
import { JobType } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { validateJobSchedulerConfiguration } from '@src/evaluation/api/helper/validateJobSchedulerConfiguration';

describe('validateJobSchedulerConfiguration', () => {
  describe('FULL jobs', () => {
    it('accepts a valid FULL configuration with inline test cases', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.FULL,
        testCases: { inline: [{ input: { q: 'hello' } }] },
        scorers: { llm_as_judge: { scores: { sample: {} } } },
      } as any);

      expect(errors).toEqual([]);
    });

    it('accepts a valid FULL configuration with a dataset reference', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.FULL,
        testCases: { dataset: { datasetId: 'my-dataset' } },
        scorers: { ragas: null },
      } as any);

      expect(errors).toEqual([]);
    });

    it('rejects FULL without testCases', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.FULL,
        scorers: { ragas: null },
      } as any);

      expect(errors).toEqual(['FULL job requires testCases']);
    });

    it('rejects FULL without scorers', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.FULL,
        testCases: { inline: [{ input: {} }] },
      } as any);

      expect(errors).toEqual(['FULL job requires at least one scorer']);
    });

    it('rejects FULL with an empty scorers map', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.FULL,
        testCases: { inline: [{ input: {} }] },
        scorers: {},
      } as any);

      expect(errors).toEqual(['FULL job requires at least one scorer']);
    });
  });

  describe('SCORE jobs', () => {
    it('accepts SCORE with sourceReportId', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.SCORE,
        sourceReportId: 'report-123',
        scorers: { ragas: null },
      } as any);

      expect(errors).toEqual([]);
    });

    it('accepts SCORE with inline testResults', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.SCORE,
        testResults: [{ input: { q: 'hi' }, output: { a: 'hello' } }],
        scorers: { ragas: null },
      } as any);

      expect(errors).toEqual([]);
    });

    it('rejects SCORE without sourceReportId or testResults', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.SCORE,
        scorers: { ragas: null },
      } as any);

      expect(errors).toEqual(['SCORE job requires sourceReportId or testResults']);
    });

    it('rejects SCORE with both sourceReportId and testResults', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.SCORE,
        sourceReportId: 'report-123',
        testResults: [{ input: {}, output: {} }],
      } as any);

      expect(errors).toEqual(['sourceReportId is mutually exclusive with testResults']);
    });
  });

  describe('APP_INVOKE jobs', () => {
    it('accepts APP_INVOKE with testCases', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.APP_INVOKE,
        testCases: { inline: [{ input: {} }] },
      } as any);

      expect(errors).toEqual([]);
    });

    it('rejects APP_INVOKE without testCases', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.APP_INVOKE,
      } as any);

      expect(errors).toEqual(['APP_INVOKE job requires testCases']);
    });
  });

  describe('testCases structural validation', () => {
    it('rejects empty inline test case list', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.APP_INVOKE,
        testCases: { inline: [] },
      } as any);

      expect(errors).toEqual(['testCases.inline must contain at least one test case']);
    });

    it('rejects inline member that is not an array', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.APP_INVOKE,
        testCases: { inline: 'not-an-array' },
      } as any);

      expect(errors).toEqual(['testCases.inline must contain at least one test case']);
    });

    it('rejects dataset reference without datasetId', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.APP_INVOKE,
        testCases: { dataset: {} },
      } as any);

      expect(errors).toEqual(['testCases.dataset.datasetId is required']);
    });

    it('rejects testCases with neither inline nor dataset member', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.APP_INVOKE,
        testCases: { unknown: true },
      } as any);

      expect(errors).toEqual(['Invalid testCases: must contain either an inline or dataset member']);
    });

    it('rejects testCases that is not an object', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.APP_INVOKE,
        testCases: 'not-an-object',
      } as any);

      expect(errors).toEqual(['Invalid testCases: must be an object with either an inline or dataset member']);
    });
  });

  describe('scorers structural validation', () => {
    it('accepts null scorer configs (run with defaults)', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.FULL,
        testCases: { inline: [{ input: {} }] },
        scorers: { faithfulness: null },
      } as any);

      expect(errors).toEqual([]);
    });

    it('rejects scorers that is not a map', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.FULL,
        testCases: { inline: [{ input: {} }] },
        scorers: ['string-scorer'],
      } as any);

      expect(errors).toEqual(['Invalid scorers: must be a map of scorer name to configuration']);
    });

    it('rejects scorer config values that are not objects', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.FULL,
        testCases: { inline: [{ input: {} }] },
        scorers: { toxicity: 'not-an-object' },
      } as any);

      expect(errors).toEqual([
        "Invalid scorer configuration for scorer 'toxicity': must be an object or null, but found string",
      ]);
    });

    it('collects multiple errors across fields', () => {
      const errors = validateJobSchedulerConfiguration({
        jobType: JobType.FULL,
        testCases: { inline: [] },
        scorers: { a: 'bad', b: null },
      } as any);

      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatch(/inline must contain at least one test case/);
      expect(errors[1]).toMatch(/scorer 'a'/);
    });
  });
});
