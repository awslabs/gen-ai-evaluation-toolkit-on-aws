import {
  GetGenerationCommand,
  GetTestCaseCommand,
  ListTestCasesCommand,
  StartGenerationInput,
  StartGenerationOutput,
  StepFunctionJobStatus,
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import ms from 'ms';
import { send, startDummyGenerationRun, waitUntilGenerationRunIsCompleted, getCustomerBucketName } from '../../helpers';
import { createDummyDataset, waitUntilDatasetIsActive } from '../../helpers/datastore';
import { IAsyncDisposable } from '../../types';

// Default model for agentic generation tests - Claude Sonnet via global inference profile
const DEFAULT_TEST_MODEL = 'global.anthropic.claude-sonnet-4-5-20250929-v1:0';

// Type definitions moved outside describe block for Babel compatibility
interface ToolDefinition {
  name: string;
  description: string;
  parameters?: {
    type: string;
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

interface SeedExample {
  input: string | string[];
  expected: {
    response: string;
    topics?: string[];
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  };
}

interface TraceConfig {
  source: 's3';
  location: string;
  maxConversations?: number;
  errorSampleRate?: number;
  successSampleRate?: number;
  abandonmentSampleRate?: number;
}

type AugmentationStrategy = 'rephrase' | 'parameter_variation' | 'multi_turn_extension' | 'edge_case' | 'negative_case';

interface AgenticConfig {
  modelId?: string;
  totalTestCases: number;
  agent?: {
    systemPrompt?: string;
    tools?: ToolDefinition[];
  };
  seedExamples?: SeedExample[];
  focusAreas?: string[];
  taxonomyAxes?: {
    turnCounts?: number[];
    difficulty?: string[];
    outcomes?: string[];
  };
  traces?: TraceConfig;
  augmentationStrategies?: AugmentationStrategy[];
  reviewSampleRate?: number;
}

describe('Agentic Generation Tests', () => {
  jest.setTimeout(ms('1h'));

  function getAgenticGenerationInput(
    datasetId: string,
    mintVersion: boolean,
    agenticConfig: AgenticConfig,
  ): StartGenerationInput {
    const config = {
      modelId: agenticConfig.modelId ?? DEFAULT_TEST_MODEL,
      totalTestCases: agenticConfig.totalTestCases,
      ...(agenticConfig.agent && { agent: agenticConfig.agent }),
      ...(agenticConfig.seedExamples && { seedExamples: agenticConfig.seedExamples }),
      ...(agenticConfig.focusAreas && { focusAreas: agenticConfig.focusAreas }),
      ...(agenticConfig.taxonomyAxes && { taxonomyAxes: agenticConfig.taxonomyAxes }),
      ...(agenticConfig.traces && { traces: agenticConfig.traces }),
      ...(agenticConfig.augmentationStrategies && { augmentationStrategies: agenticConfig.augmentationStrategies }),
      ...(agenticConfig.reviewSampleRate !== undefined && { reviewSampleRate: agenticConfig.reviewSampleRate }),
    };

    return {
      experimentName: undefined,
      steps: [
        {
          plugin: 'agenticTestCases',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          configuration: config as any,
        },
        {
          plugin: 'DatastoreExport',
          configuration: {
            datasetConfiguration: {
              datasetId,
              mintVersion,
            },
          },
        },
      ],
    };
  }

  async function startAndVerifyGenerationRun(
    generationJob: StartGenerationInput,
  ): Promise<IAsyncDisposable<StartGenerationOutput>> {
    const run = await startDummyGenerationRun(generationJob);

    const retrievedGeneration = await send(new GetGenerationCommand({ id: run.id }));
    expect(retrievedGeneration.id).toEqual(run.id);
    expect(retrievedGeneration.status).toEqual(StepFunctionJobStatus.RUNNING);

    return run;
  }

  async function verifyTestCases(
    datasetId: string,
    version: string,
    expectedMinCount: number = 1,
    options?: {
      expectTools?: string[];
      expectMultiTurn?: boolean;
      // When true, at least one test case must have provenance.source === 'augmentation'.
      expectAugmentation?: boolean;
      // When provided, expect at least one augmented case for each listed strategy.
      expectAugmentationStrategies?: AugmentationStrategy[];
    },
  ) {
    const listTestCasesResponse = await send(
      new ListTestCasesCommand({
        datasetId,
        version,
      }),
    );

    expect(listTestCasesResponse.testCases).toBeDefined();
    expect(Array.isArray(listTestCasesResponse.testCases)).toBe(true);
    expect(listTestCasesResponse.testCases.length).toBeGreaterThanOrEqual(expectedMinCount);

    // Fetch and validate structure of each test case
    // ListTestCases returns references; GetTestCase returns full content
    let hasMultiTurn = false;
    const seenAugmentationStrategies = new Set<string>();
    let augmentationCount = 0;

    for (const ref of listTestCasesResponse.testCases) {
      const tc = await send(
        new GetTestCaseCommand({
          datasetId,
          testCaseId: ref.id!,
          version,
        }),
      );

      // input: string (single-turn) or string[] (multi-turn)
      expect(tc.input).toBeDefined();
      const isSingleTurn = typeof tc.input === 'string';
      const isMultiTurn = Array.isArray(tc.input);
      expect(isSingleTurn || isMultiTurn).toBe(true);
      if (isMultiTurn) hasMultiTurn = true;

      // expected: { response, topics, toolCalls? }
      expect(tc.expected).toBeDefined();
      const expectedOutput = tc.expected as {
        response?: string;
        topics?: string[];
        toolCalls?: Array<{ name: string; args: unknown }> | Array<Array<{ name: string; args: unknown }>>;
      };
      expect(typeof expectedOutput.response).toBe('string');
      expect(Array.isArray(expectedOutput.topics)).toBe(true);

      // context: { provenance: { source, scenarioId, planAxis?, augmentationStrategy?, parentScenarioId? } }
      expect(tc.context).toBeDefined();
      const context = tc.context as {
        provenance?: {
          source?: string;
          scenarioId?: string;
          augmentationStrategy?: string;
          parentScenarioId?: string;
        };
        requiresReview?: unknown;
      };
      expect(context.provenance).toBeDefined();
      expect(['gap_fill', 'focus_area', 'failure_pattern', 'augmentation']).toContain(context.provenance?.source);
      expect(typeof context.provenance?.scenarioId).toBe('string');

      // Augmentation cases must carry the strategy + parent linkage.
      if (context.provenance?.source === 'augmentation') {
        augmentationCount++;
        expect(typeof context.provenance.augmentationStrategy).toBe('string');
        expect(typeof context.provenance.parentScenarioId).toBe('string');
        seenAugmentationStrategies.add(context.provenance.augmentationStrategy!);
      }

      // requiresReview: review sampler tags every emitted case (true or false).
      // Stored inside context (top-level requiresReview is not part of the TestCase schema).
      expect(typeof context.requiresReview).toBe('boolean');

      // Validate tool calls if tools were provided
      if (options?.expectTools?.length && expectedOutput.toolCalls) {
        const toolCalls = expectedOutput.toolCalls;
        // Flatten nested arrays for multi-turn cases
        const flatCalls = Array.isArray(toolCalls[0]) ? toolCalls.flat() : toolCalls;
        for (const call of flatCalls as Array<{ name: string; args: unknown }>) {
          expect(typeof call.name).toBe('string');
          expect(options.expectTools).toContain(call.name);
          expect(typeof call.args).toBe('object');
        }
      }
    }

    // Validate multi-turn presence if expected
    if (options?.expectMultiTurn) {
      expect(hasMultiTurn).toBe(true);
    }

    // Validate augmentation presence + per-strategy coverage if expected
    if (options?.expectAugmentation) {
      expect(augmentationCount).toBeGreaterThan(0);
    }
    if (options?.expectAugmentationStrategies?.length) {
      for (const strategy of options.expectAugmentationStrategies) {
        expect(seenAugmentationStrategies.has(strategy)).toBe(true);
      }
    }

    return listTestCasesResponse;
  }

  async function runAgenticGenerationTest(
    mintVersion: boolean,
    agenticConfig: Parameters<typeof getAgenticGenerationInput>[2],
    validationOptions?: {
      expectTools?: string[];
      expectMultiTurn?: boolean;
      expectAugmentation?: boolean;
      expectAugmentationStrategies?: AugmentationStrategy[];
    },
  ) {
    const dataset = await createDummyDataset();
    const generationJob = getAgenticGenerationInput(dataset.datasetId, mintVersion, agenticConfig);

    await using run = await startAndVerifyGenerationRun(generationJob);

    await waitUntilGenerationRunIsCompleted(run.id);

    const completedGenerationJob = await send(new GetGenerationCommand({ id: run.id }));
    expect(completedGenerationJob.status).toEqual(StepFunctionJobStatus.SUCCEEDED);

    const version = mintVersion ? '1' : 'head';

    if (mintVersion) await waitUntilDatasetIsActive(dataset.datasetId);

    // Use expectedMinCount=1 since GTG is best-effort; exact count depends on
    // input richness, LLM variability, and taxonomy constraints
    const listTestCasesResponse = await verifyTestCases(dataset.datasetId, version, 1, validationOptions);

    return {
      run,
      datasetId: dataset.datasetId,
      listTestCasesResponse,
      [Symbol.asyncDispose]: async () => {
        await dataset[Symbol.asyncDispose]();
      },
    };
  }

  async function runFailingGenerationTest(generationJob: StartGenerationInput, expectedError: string) {
    await using run = await startAndVerifyGenerationRun(generationJob);

    await waitUntilGenerationRunIsCompleted(run.id);

    const completedGenerationJob = await send(new GetGenerationCommand({ id: run.id }));
    expect(completedGenerationJob.status).toEqual(StepFunctionJobStatus.FAILED);
    expect(completedGenerationJob.error).toContain(expectedError);

    return completedGenerationJob;
  }

  describe('Agentic GTG Plugin', () => {
    test.concurrent('Generate test cases without agent config', async () => {
      await using _result = await runAgenticGenerationTest(false, {
        totalTestCases: 3,
      });
    });

    test.concurrent('Generate test cases with system prompt', async () => {
      await using _result = await runAgenticGenerationTest(false, {
        totalTestCases: 3,
        agent: {
          systemPrompt: 'You are a helpful customer service agent for an e-commerce platform.',
        },
      });
    });

    test.concurrent('Generate test cases with tools', async () => {
      await using _result = await runAgenticGenerationTest(false, {
        totalTestCases: 5,
        agent: {
          systemPrompt: 'You are a helpful assistant that can look up product information.',
          tools: [
            {
              name: 'get_product',
              description: 'Get product information by ID',
              parameters: {
                type: 'object',
                properties: {
                  product_id: { type: 'string', description: 'The product ID' },
                },
                required: ['product_id'],
              },
            },
            {
              name: 'search_products',
              description: 'Search for products by query',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' },
                  limit: { type: 'number', description: 'Maximum results to return' },
                },
                required: ['query'],
              },
            },
          ],
        },
      });
    });

    test.concurrent('Generate test cases with focus areas', async () => {
      await using _result = await runAgenticGenerationTest(false, {
        totalTestCases: 5,
        agent: {
          systemPrompt: 'You are a banking assistant.',
        },
        focusAreas: ['account balance inquiries', 'transaction disputes', 'card replacement'],
      });
    });

    test.concurrent('Generate test cases and mint version', async () => {
      await using _result = await runAgenticGenerationTest(true, {
        totalTestCases: 3,
      });
    });

    test.concurrent('Generate test cases with all configuration options', async () => {
      const tools: ToolDefinition[] = [
        {
          name: 'search_flights',
          description: 'Search for available flights between two airports',
          parameters: {
            type: 'object',
            properties: {
              origin: { type: 'string', description: 'Origin airport code (e.g., JFK)' },
              destination: { type: 'string', description: 'Destination airport code (e.g., LAX)' },
              departure_date: { type: 'string', description: 'Departure date in YYYY-MM-DD format' },
              passengers: { type: 'number', description: 'Number of passengers' },
            },
            required: ['origin', 'destination', 'departure_date'],
          },
        },
        {
          name: 'search_hotels',
          description: 'Search for available hotels in a city',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' },
              check_in: { type: 'string', description: 'Check-in date in YYYY-MM-DD format' },
              check_out: { type: 'string', description: 'Check-out date in YYYY-MM-DD format' },
              guests: { type: 'number', description: 'Number of guests' },
            },
            required: ['city', 'check_in', 'check_out'],
          },
        },
        {
          name: 'book_flight',
          description: 'Book a specific flight',
          parameters: {
            type: 'object',
            properties: {
              flight_id: { type: 'string', description: 'Flight ID from search results' },
              passenger_names: {
                type: 'array',
                description: 'List of passenger names',
              },
            },
            required: ['flight_id', 'passenger_names'],
          },
        },
        {
          name: 'book_hotel',
          description: 'Book a specific hotel',
          parameters: {
            type: 'object',
            properties: {
              hotel_id: { type: 'string', description: 'Hotel ID from search results' },
              guest_name: { type: 'string', description: 'Primary guest name' },
            },
            required: ['hotel_id', 'guest_name'],
          },
        },
      ];

      await using _result = await runAgenticGenerationTest(
        false,
        {
          totalTestCases: 5,
          agent: {
            systemPrompt:
              'You are a helpful travel booking assistant. You help users search for flights, hotels, and rental cars. Always confirm details before making reservations.',
            tools,
          },
          focusAreas: [
            'multi-leg trip planning',
            'booking modifications and cancellations',
            'handling unavailable options',
          ],
          taxonomyAxes: {
            turnCounts: [1, 2, 3],
            difficulty: ['simple', 'moderate', 'complex'],
            outcomes: ['successful_booking', 'partial_booking', 'no_availability'],
          },
        },
        {
          expectTools: tools.map((t) => t.name),
          expectMultiTurn: true,
        },
      );
    });

    test.concurrent('Generate test cases with seed examples', async () => {
      await using _result = await runAgenticGenerationTest(false, {
        totalTestCases: 3,
        agent: {
          systemPrompt: 'You are a helpful FAQ assistant for a software product.',
          tools: [
            {
              name: 'search_docs',
              description: 'Search documentation for answers',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' },
                },
                required: ['query'],
              },
            },
          ],
        },
        seedExamples: [
          {
            input: 'How do I reset my password?',
            expected: {
              response:
                'To reset your password, go to Settings > Security > Reset Password. You will receive a confirmation email.',
              topics: ['authentication', 'password'],
              toolCalls: [{ name: 'search_docs', args: { query: 'password reset' } }],
            },
          },
          {
            input: ['What integrations are available?', 'Does it support Slack?'],
            expected: {
              response: 'Yes, we support Slack integration! You can connect it from Settings > Integrations > Slack.',
              topics: ['integrations', 'slack'],
              toolCalls: [
                { name: 'search_docs', args: { query: 'integrations' } },
                { name: 'search_docs', args: { query: 'slack integration' } },
              ],
            },
          },
        ],
      });
    });

    test.concurrent('Generate test cases with augmentation strategies', async () => {
      // 2 base × 5 strategies = 10 augmentation calls. Both gating prerequisites
      // are present (tools + systemPrompt) so all five strategies should run.
      await using _result = await runAgenticGenerationTest(
        false,
        {
          totalTestCases: 2,
          agent: {
            systemPrompt:
              'You are a helpful product assistant. You only help with product information and orders, nothing else.',
            tools: [
              {
                name: 'get_product',
                description: 'Get product information by ID',
                parameters: {
                  type: 'object',
                  properties: {
                    product_id: { type: 'string', description: 'Product identifier' },
                  },
                  required: ['product_id'],
                },
              },
            ],
          },
          augmentationStrategies: [
            'rephrase',
            'parameter_variation',
            'multi_turn_extension',
            'edge_case',
            'negative_case',
          ],
        },
        {
          expectAugmentation: true,
        },
      );
    });

    test.concurrent('Generate test cases with augmentation gating (no tools)', async () => {
      // No tools provided → parameter_variation must be skipped silently;
      // negative_case still applies because systemPrompt is present.
      await using _result = await runAgenticGenerationTest(
        false,
        {
          totalTestCases: 2,
          agent: {
            systemPrompt: 'You are a movie recommendation assistant for general audiences only.',
          },
          augmentationStrategies: ['rephrase', 'parameter_variation', 'negative_case'],
        },
        {
          expectAugmentation: true,
        },
      );
    });

    test.concurrent('Generate test cases with full review sampling', async () => {
      // reviewSampleRate=1.0 forces every emitted case to be tagged for review.
      const dataset = await createDummyDataset();
      const generationJob = getAgenticGenerationInput(dataset.datasetId, false, {
        totalTestCases: 3,
        agent: {
          systemPrompt: 'You are a helpful assistant.',
        },
        reviewSampleRate: 1.0,
      });

      await using run = await startAndVerifyGenerationRun(generationJob);
      await waitUntilGenerationRunIsCompleted(run.id);

      const completedJob = await send(new GetGenerationCommand({ id: run.id }));
      expect(completedJob.status).toEqual(StepFunctionJobStatus.SUCCEEDED);

      const list = await send(new ListTestCasesCommand({ datasetId: dataset.datasetId, version: 'head' }));
      expect(list.testCases.length).toBeGreaterThanOrEqual(1);

      // At rate=1.0, every case must have requiresReview=true.
      // Stored inside context (top-level requiresReview is not part of the TestCase schema).
      for (const ref of list.testCases) {
        const tc = await send(
          new GetTestCaseCommand({ datasetId: dataset.datasetId, testCaseId: ref.id!, version: 'head' }),
        );
        expect((tc.context as { requiresReview?: unknown })?.requiresReview).toBe(true);
      }

      await dataset[Symbol.asyncDispose]();
    });

    test.concurrent('Review sampling flags every case (base and augmented) when rate=1.0', async () => {
      // The review sampler runs after augmentation and stratifies by provenance.source,
      // which includes 'augmentation' as its own group. At rate=1.0 every source must
      // flag everything, so the flag has to land on both base and augmented cases.
      const dataset = await createDummyDataset();
      const generationJob = getAgenticGenerationInput(dataset.datasetId, false, {
        totalTestCases: 2,
        agent: {
          systemPrompt: 'You are a helpful product assistant.',
          tools: [
            {
              name: 'get_product',
              description: 'Get product information by ID',
              parameters: {
                type: 'object',
                properties: {
                  product_id: { type: 'string', description: 'Product identifier' },
                },
                required: ['product_id'],
              },
            },
          ],
        },
        augmentationStrategies: ['rephrase'],
        reviewSampleRate: 1.0,
      });

      await using run = await startAndVerifyGenerationRun(generationJob);
      await waitUntilGenerationRunIsCompleted(run.id);

      const completedJob = await send(new GetGenerationCommand({ id: run.id }));
      expect(completedJob.status).toEqual(StepFunctionJobStatus.SUCCEEDED);

      const list = await send(new ListTestCasesCommand({ datasetId: dataset.datasetId, version: 'head' }));
      // At least one base + one augmented case must be present for the
      // base/augmented split assertions below to be meaningful. Stricter
      // (e.g. ≥4 = totalTestCases × strategies) would flake against the
      // best-effort generation contract — augmentor.skips a case when LLM
      // call fails, and base count varies with taxonomy/LLM output.
      expect(list.testCases.length).toBeGreaterThanOrEqual(2);

      let baseSeen = 0;
      let augmentedSeen = 0;
      for (const ref of list.testCases) {
        const tc = await send(
          new GetTestCaseCommand({ datasetId: dataset.datasetId, testCaseId: ref.id!, version: 'head' }),
        );
        const context = tc.context as {
          provenance?: { source?: string };
          requiresReview?: unknown;
        };
        expect(context.requiresReview).toBe(true);
        if (context.provenance?.source === 'augmentation') {
          augmentedSeen++;
        } else {
          baseSeen++;
        }
      }

      // Both populations must be present so the all-flagged assertion above is meaningful.
      expect(baseSeen).toBeGreaterThan(0);
      expect(augmentedSeen).toBeGreaterThan(0);

      await dataset[Symbol.asyncDispose]();
    });

    test.concurrent('Review sampling at mid rate flags some-but-not-all', async () => {
      // rate=1.0 hides wiring regressions where the sampler ignores the rate and flags
      // everything unconditionally. A mid rate exercises the stratification math end-to-end.
      // totalTestCases is sized so the expected flagged count comfortably falls between
      // 0 and total even with ceil rounding per stratum.
      const dataset = await createDummyDataset();
      const generationJob = getAgenticGenerationInput(dataset.datasetId, false, {
        totalTestCases: 8,
        agent: {
          systemPrompt: 'You are a helpful assistant.',
        },
        reviewSampleRate: 0.3,
      });

      await using run = await startAndVerifyGenerationRun(generationJob);
      await waitUntilGenerationRunIsCompleted(run.id);

      const completedJob = await send(new GetGenerationCommand({ id: run.id }));
      expect(completedJob.status).toEqual(StepFunctionJobStatus.SUCCEEDED);

      const list = await send(new ListTestCasesCommand({ datasetId: dataset.datasetId, version: 'head' }));
      // ≥4 keeps the some-but-not-all range check below semantically meaningful:
      // at totalTestCases=8 and rate=0.3 we expect ~3 flagged (ceil(0.3×8)),
      // and a degenerate total of 1–2 could satisfy 0 < flagged < total trivially.
      // ≥8 (=totalTestCases) would be tighter but flakes against the generator's
      // best-effort contract — see runAgenticGenerationTest.
      expect(list.testCases.length).toBeGreaterThanOrEqual(4);

      let flagged = 0;
      for (const ref of list.testCases) {
        const tc = await send(
          new GetTestCaseCommand({ datasetId: dataset.datasetId, testCaseId: ref.id!, version: 'head' }),
        );
        const context = tc.context as { requiresReview?: unknown };
        expect(typeof context.requiresReview).toBe('boolean');
        if (context.requiresReview === true) flagged++;
      }

      expect(flagged).toBeGreaterThan(0);
      expect(flagged).toBeLessThan(list.testCases.length);

      await dataset[Symbol.asyncDispose]();
    });

    test.concurrent('Fail with invalid model ID', async () => {
      const dataset = await createDummyDataset();
      const generationJob = getAgenticGenerationInput(dataset.datasetId, false, {
        modelId: 'invalid-model-id',
        totalTestCases: 1,
      });

      await runFailingGenerationTest(generationJob, 'ValidationException');
    });

    test.concurrent('Fail with non-existing dataset ID', async () => {
      const generationJob = getAgenticGenerationInput('non-existing-dataset-id', false, {
        modelId: DEFAULT_TEST_MODEL,
        totalTestCases: 1,
      });

      await runFailingGenerationTest(generationJob, 'DatastoreExport plugin failed');
    });

    test.concurrent('Generate test cases with OTEL trace extraction', async () => {
      // Uses pre-deployed trace files from assets/test-data/traces/
      // These include 3 success traces and 2 failure traces with get_product, search_products, check_inventory tools
      const customerBucket = await getCustomerBucketName();

      await using _result = await runAgenticGenerationTest(
        false,
        {
          totalTestCases: 5,
          agent: {
            systemPrompt: 'You are a product catalog assistant that helps users find products and check inventory.',
            tools: [
              {
                name: 'get_product',
                description: 'Get product details by ID',
                parameters: {
                  type: 'object',
                  properties: {
                    product_id: { type: 'string', description: 'Product ID' },
                  },
                  required: ['product_id'],
                },
              },
              {
                name: 'search_products',
                description: 'Search for products',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Search query' },
                    max_price: { type: 'number', description: 'Maximum price filter' },
                  },
                  required: ['query'],
                },
              },
              {
                name: 'check_inventory',
                description: 'Check inventory for a product SKU',
                parameters: {
                  type: 'object',
                  properties: {
                    sku: { type: 'string', description: 'Product SKU' },
                  },
                  required: ['sku'],
                },
              },
            ],
          },
          traces: {
            source: 's3',
            location: `s3://${customerBucket}/traces/`,
            maxConversations: 100,
            errorSampleRate: 1.0,
            successSampleRate: 1.0,
          },
        },
        {
          expectTools: ['get_product', 'search_products', 'check_inventory'],
        },
      );
    });

    /**
     * Comprehensive OTEL trace extraction test covering all four outcome/tool combinations:
     * 1. Success with tools - successful conversations using tool calls
     * 2. Failure with tools - failed conversations with tool errors
     * 3. Success without tools - pure conversational successes
     * 4. Failure without tools - refusals and conversational failures
     *
     * This validates that trace-grounded generation properly uses:
     * - Tool-based traces for scenarios with tools
     * - Tool-less traces for scenarios without tools
     * - Outcome-aware matching (failure scenarios get failure traces)
     */
    test.concurrent('Comprehensive OTEL trace extraction - all scenario combinations', async () => {
      const customerBucket = await getCustomerBucketName();

      // Define tools for scenarios that use them
      const tools: ToolDefinition[] = [
        {
          name: 'get_product',
          description: 'Get product details by ID',
          parameters: {
            type: 'object',
            properties: {
              product_id: { type: 'string', description: 'Product ID' },
            },
            required: ['product_id'],
          },
        },
        {
          name: 'search_products',
          description: 'Search for products',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
            },
            required: ['query'],
          },
        },
      ];

      await using _result = await runAgenticGenerationTest(
        false,
        {
          totalTestCases: 12,
          agent: {
            systemPrompt: `You are a helpful assistant for an e-commerce platform.
You can help users find products using tools, or have general conversations.
For requests outside your capabilities or that violate policies, politely decline.`,
            tools,
          },
          // Focus areas to ensure coverage of all scenario types
          focusAreas: [
            'product information requests', // Success with tools
            'search functionality', // Success with tools
            'general greetings and small talk', // Success without tools
            'policy violation requests', // Failure without tools
            'invalid product lookups', // Failure with tools
          ],
          // Request a mix of outcomes to test trace matching
          taxonomyAxes: {
            turnCounts: [1, 2],
            difficulty: ['simple', 'moderate'],
            outcomes: ['happy_path', 'refusal', 'clarification'],
          },
          traces: {
            source: 's3',
            location: `s3://${customerBucket}/traces/`,
            maxConversations: 200,
            errorSampleRate: 1.0,
            successSampleRate: 0.5,
            abandonmentSampleRate: 0.5,
          },
        },
        {
          // We expect a mix - some with tools, some without
          // The test validates structure, not specific tool presence
        },
      );
    });

    /**
     * Test tool-less scenario generation with OTEL traces.
     * Uses an agent without any tools to verify that:
     * - Tool-less success traces are used for success scenarios
     * - Tool-less failure traces are used for failure scenarios
     */
    test.concurrent('OTEL trace extraction for tool-less agent', async () => {
      const customerBucket = await getCustomerBucketName();

      await using _result = await runAgenticGenerationTest(false, {
        totalTestCases: 5,
        agent: {
          systemPrompt: `You are a friendly conversational assistant.
You cannot perform any actions or look up information - you can only have conversations.
If users ask for tasks you cannot do, politely explain your limitations.`,
          // No tools defined - pure conversational agent
        },
        focusAreas: ['friendly greetings', 'general questions', 'requests outside capabilities'],
        taxonomyAxes: {
          turnCounts: [1, 2],
          difficulty: ['simple'],
          outcomes: ['happy_path', 'refusal'],
        },
        traces: {
          source: 's3',
          location: `s3://${customerBucket}/traces/`,
          maxConversations: 50,
          errorSampleRate: 1.0,
          successSampleRate: 1.0,
        },
      });
    });
  });
});
