import {
  JobStatus,
  ListTestResultsCommand,
  SubmitScoringJobCommand,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import ms from 'ms';
import assert from 'assert';
import { send, stopCreatedEvaluationRuns, waitUntilEvaluatorJobIsCompleted } from '../../helpers';

// The DeepEval scorer is hosted by the builtin evaluator Lambda.
const EVALUATOR_NAME = 'builtin';
const SCORER_NAME = 'deepeval';

// Single-turn metrics exercised through the deployed Lambda. Kept small so the
// job stays well within the Lambda timeout while still covering RAG-style
// (faithfulness/relevancy) and safety (toxicity) metrics.
const METRICS = ['answer_relevancy', 'faithfulness', 'toxicity'] as const;

const DEEPEVAL_PARAMS = {
  model_id: 'us.amazon.nova-lite-v1:0',
  region: 'us-east-1',
};

// One test case with prompt, response, and context so faithfulness/relevancy
// have grounding to score against.
const TEST_RESULTS = [
  {
    input: {
      text: 'What is the capital of France?',
      context: [
        'Paris is the capital and most populous city of France.',
        'France is a country in Western Europe.',
      ],
    },
    output: { text: 'The capital of France is Paris.' },
    expected: { text: 'Paris' },
  },
];

describe('DeepEval Scorer (deployed builtin Lambda)', () => {
  jest.setTimeout(ms('30m'));

  afterAll(async () => {
    await stopCreatedEvaluationRuns();
  });

  test('scores single-turn metrics end-to-end via the deployed evaluator', async () => {
    // Submit a SCORE job WITHOUT processLocally so the API emits an EventBridge
    // event and the deployed builtin Lambda runs DeepEval against real Bedrock.
    const job = await send(
      new SubmitScoringJobCommand({
        evaluatorName: EVALUATOR_NAME,
        testResults: TEST_RESULTS.map((tc) => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input: tc.input as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          output: tc.output as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expected: tc.expected as any,
        })),
        scorers: {
          [SCORER_NAME]: {
            params: DEEPEVAL_PARAMS,
            scores: Object.fromEntries(METRICS.map((m) => [m, null])),
          },
        },
      }),
    );
    expect(job.jobId).toBeDefined();

    const completed = await waitUntilEvaluatorJobIsCompleted(job.jobId);
    expect(completed.status).toEqual(JobStatus.SUCCESS);

    // Every test case should have been scored for every requested metric.
    const resultsPage = await send(new ListTestResultsCommand({ reportId: job.reportId }));
    const results = resultsPage.testResults ?? [];

    assert(results.length > 0, 'Expected at least one test result');
    expect(results.length).toEqual(TEST_RESULTS.length);

    results.forEach((result) => {
      METRICS.forEach((metric) => {
        const scoreKey = `${SCORER_NAME}.${metric}`;
        const score = result.scores?.[scoreKey];
        expect(score).toBeDefined();
        // A real score must be a number in [0, 1]; tolerate a reported error.
        if (score?.error == null) {
          expect(typeof score?.value).toBe('number');
          expect(score?.value).toBeGreaterThanOrEqual(0);
          expect(score?.value).toBeLessThanOrEqual(1);
        }
      });
    });
  });
});
