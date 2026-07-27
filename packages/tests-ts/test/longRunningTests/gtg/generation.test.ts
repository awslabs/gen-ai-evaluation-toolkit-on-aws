import {
  GetGenerationCommand,
  ListTestCasesCommand,
  ListTestCasesCommandOutput,
  StartGenerationInput,
  StartGenerationOutput,
  StepFunctionJobStatus,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import ms from 'ms';
import { lazy, send, startDummyGenerationRun, waitUntilGenerationRunIsCompleted } from '../../helpers';
import { getDummyRagDocuments, RagDocumentSource } from '../../helpers/common';
import { createDummyDataset, waitUntilDatasetIsActive } from '../../helpers/datastore';
import { IAsyncDisposable } from '../../types';

// Set chunk size and questions per chunk to minimise the number of Bedrock batch jobs to reduce test time.
// Current settings set the number of jobs to be ~110, the minimum jobs for Bedrock batch is 100.
const DOC_SOURCE_CHUNK_SIZE = 1536;
const QUESTIONS_PER_CHUNK = 1;

// Default model for generation tests - Claude Haiku 4.5 via global inference profile
const DEFAULT_TEST_MODEL = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';

describe('Generation Tests', () => {
  jest.setTimeout(ms('2h'));

  const dummyRagDocsSource = lazy(() => getDummyRagDocuments());

  function getInputForStartGenerationJob(
    mintVersion: boolean,
    datasetId: string,
    ragDocs: RagDocumentSource,
    testCaseValidationModelId?: string,
    testCaseGenerateModelId?: string,
  ): StartGenerationInput {
    // Create generation job configuration
    const datasetConfiguration = {
      datasetId: datasetId,
      mintVersion: mintVersion,
    };

    return {
      experimentName: undefined,
      steps: [
        {
          plugin: 'generateTestCases',
          configuration: {
            documentSource: ragDocs,
            chunk: {
              size: DOC_SOURCE_CHUNK_SIZE,
            },
            question: {
              model: testCaseGenerateModelId ?? DEFAULT_TEST_MODEL,
              questionsPerChunk: QUESTIONS_PER_CHUNK,
            },
          },
        },
        {
          plugin: 'llmAsAJudge',
          configuration: {
            model: testCaseValidationModelId ?? DEFAULT_TEST_MODEL,
          },
        },
        {
          plugin: 'DatastoreExport',
          configuration: {
            datasetConfiguration,
          },
        },
      ],
    };
  }

  /**
   * Starts a generation run and verifies its initial state
   */
  async function startAndVerifyGenerationRun(
    generationJob: StartGenerationInput,
  ): Promise<IAsyncDisposable<StartGenerationOutput>> {
    const run = await startDummyGenerationRun(generationJob);

    // Verify initial state
    const retrievedGeneration = await send(new GetGenerationCommand({ id: run.id }));
    expect(retrievedGeneration.id).toEqual(run.id);
    expect(retrievedGeneration.status).toEqual(StepFunctionJobStatus.RUNNING);

    return run;
  }

  /**
   * Verifies test cases in a dataset
   */
  async function verifyTestCases(datasetId: string, version: string) {
    const listTestCasesCommand = new ListTestCasesCommand({
      datasetId: datasetId,
      version,
    });

    const listTestCasesResponse = await send(listTestCasesCommand);

    // Verify the response structure
    expect(listTestCasesResponse.testCases).toBeDefined();
    expect(Array.isArray(listTestCasesResponse.testCases)).toBe(true);
    expect(listTestCasesResponse.testCases.length).toBeGreaterThan(0);

    return listTestCasesResponse;
  }

  type TestContext = {
    run: StartGenerationOutput;
    datasetId: string;
    listTestCasesResponse: ListTestCasesCommandOutput;
  };

  /**
   * Utility method to run a generation test with or without minting a version
   * @param mintVersion Whether to mint a version or not
   * @returns Object containing test results and dataset ID
   */
  async function runGenerationTest(mintVersion: boolean): Promise<IAsyncDisposable<TestContext>> {
    const dataset = await createDummyDataset();
    const generationJob = getInputForStartGenerationJob(mintVersion, dataset.datasetId, await dummyRagDocsSource());

    // Start the generation run and verify initial state
    const run = await startAndVerifyGenerationRun(generationJob);

    // Wait for completion
    await waitUntilGenerationRunIsCompleted(run.id);

    // Verify completion
    const completedGenerationJob = await send(new GetGenerationCommand({ id: run.id }));
    expect(completedGenerationJob.status).toEqual(StepFunctionJobStatus.SUCCEEDED);

    // Determine which version to check
    const version = mintVersion ? '1' : 'head';

    if (mintVersion) await waitUntilDatasetIsActive(dataset.datasetId);

    // Verify test cases
    const listTestCasesResponse = await verifyTestCases(dataset.datasetId, version);

    return {
      run,
      datasetId: dataset.datasetId,
      listTestCasesResponse,
      [Symbol.asyncDispose]: async () => {
        await dataset[Symbol.asyncDispose]();
        await run[Symbol.asyncDispose]();
      },
    };
  }

  /**
   * Runs a generation test that is expected to fail
   */
  async function runFailingGenerationTest(generationJob: StartGenerationInput, error: string, cause?: string) {
    // Start the generation run and verify initial state
    await using run = await startAndVerifyGenerationRun(generationJob);

    // Wait for completion
    await waitUntilGenerationRunIsCompleted(run.id);

    // Verify completion with failure
    const completedGenerationJob = await send(new GetGenerationCommand({ id: run.id }));
    expect(completedGenerationJob.id).toEqual(run.id);
    expect(completedGenerationJob.status).toEqual(StepFunctionJobStatus.FAILED);
    expect(completedGenerationJob.error).toEqual(error);

    if (cause) expect(completedGenerationJob.cause).toContain(cause);

    return completedGenerationJob;
  }

  describe('Generation', () => {
    test.concurrent('Get generation run without minting the version', async () => {
      await using _run = await runGenerationTest(false);
    });

    test.concurrent('Get generation run with minting the version', async () => {
      await runGenerationTest(true);
    });

    test.concurrent('Get generation run with non-existing datasetId', async () => {
      const generationJob = getInputForStartGenerationJob(false, 'non-existing-dataset-id', await dummyRagDocsSource());
      await runFailingGenerationTest(generationJob, 'DatastoreExport plugin failed: ResourceNotFoundException');
    });

    test.concurrent('Run generation run with non-existing rag documents source', async () => {
      const { datasetId } = await createDummyDataset();
      const generationJob = getInputForStartGenerationJob(false, datasetId, {
        bucket: 'non-existing-rag-bucket',
        prefix: 'dummy',
      });
      await runFailingGenerationTest(
        generationJob,
        'NoSuchBucket',
        'generateTestCases plugin failed: The specified bucket does not exist',
      );
    });

    test.concurrent('Run generation run with invalid model for LLMAsJudgePlugin', async () => {
      const { datasetId } = await createDummyDataset();
      const generationJob = getInputForStartGenerationJob(
        false,
        datasetId,
        await dummyRagDocsSource(),
        'invalid-model-id',
      );

      await runFailingGenerationTest(generationJob, 'ValidationException', 'provided model identifier is invalid.');
    });

    test.concurrent('Run generation run with non-existing plugin', async () => {
      const generationJob: StartGenerationInput = {
        experimentName: undefined,
        steps: [
          {
            plugin: 'non-existing-plugin',
            configuration: {},
          },
        ],
      };

      const completedJob = await runFailingGenerationTest(generationJob, 'States.Timeout');
      expect(completedJob.cause).toContain('Plugin execution timed out after 10 minutes');
      expect(completedJob.cause).toContain('Plugin(s): ["non-existing-plugin"]');
      expect(completedJob.cause).toContain(
        'This can occur if the plugin failed to start, crashed during execution, or stopped sending progress updates',
      );
      expect(completedJob.cause).toContain('Verify the plugin name is correct and the plugin is properly configured');
    });

    test.concurrent('Run generation run with custom plugin configurations', async () => {
      const { datasetId } = await createDummyDataset();

      const generationJob: StartGenerationInput = {
        experimentName: undefined,
        steps: [
          {
            plugin: 'generateTestCases',
            configuration: {
              documentSource: await dummyRagDocsSource(),
              chunk: {
                size: DOC_SOURCE_CHUNK_SIZE - 1,
                overlap: 64,
              },
              question: {
                model: DEFAULT_TEST_MODEL,
                questionsPerChunk: QUESTIONS_PER_CHUNK,
                prompt:
                  'You are a Knowledge Base Curator. Based on the provided technical content, create comprehensive question-answer pairs with different variety of questions such as factual, descriptive, analytical',
              },
            },
          },
          {
            plugin: 'llmAsAJudge',
            configuration: {
              model: DEFAULT_TEST_MODEL,
              criteria: [
                'Ensure answers are factual and directly supported by the context',
                'Maintain consistency with the source material',
                'Each question must be precisely worded to have only one possible interpretation',
              ],
              prompt:
                'You are a Knowledge Quality Inspector who verifies the precision and completeness of Q&A pairs. Evaluate if these Q&A pairs are clear (unambiguous, self-contained), accurate (factually correct, aligned with source), and complete (fully answers the question) - return true only if ALL criteria are met, otherwise false with reasons for failure.',
            },
          },
          {
            plugin: 'DatastoreExport',
            configuration: {
              datasetConfiguration: {
                datasetId: datasetId,
                mintVersion: false,
              },
            },
          },
        ],
      };

      // Start the generation run and verify initial state
      await using run = await startAndVerifyGenerationRun(generationJob);

      // Wait for completion
      await waitUntilGenerationRunIsCompleted(run.id);

      // Verify completion
      const completedGenerationJob = await send(new GetGenerationCommand({ id: run.id }));
      expect(completedGenerationJob.id).toEqual(run.id);
      expect(completedGenerationJob.status).toEqual(StepFunctionJobStatus.SUCCEEDED);

      // Verify test cases
      await verifyTestCases(datasetId, 'head');
    });
  });
});
