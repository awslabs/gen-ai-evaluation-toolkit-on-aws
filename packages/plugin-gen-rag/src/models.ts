import { z } from 'zod';
import { Defaults } from './constants';

const documentSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.array(documentSchema), z.record(documentSchema), z.null()]),
);

export const S3ReferenceModel = z.object({
  bucket: z.string(),
  prefix: z.string(),
});

export const TriggerEventModel = z.object({
  taskToken: z.string(),
  id: z.string(),

  output: S3ReferenceModel,

  configuration: z.object({
    documentSource: S3ReferenceModel,

    chunk: z
      .object({
        size: z.number().positive().default(Defaults.chunkSize),
        overlap: z.number().nonnegative().default(Defaults.chunkOverlap),
      })
      .default({}),

    question: z
      .object({
        model: z.string().default(Defaults.model),
        questionsPerChunk: z.number().default(Defaults.questionsPerChunk),
        prompt: z.string().default(Defaults.prompt),
      })
      .default({}),
  }),
});

export type TriggerEvent = z.infer<typeof TriggerEventModel>;

export const JobResponseModel = z.object({
  modelInput: z.object({
    max_tokens: z.number(),
    anthropic_version: z.string(),

    messages: z.array(
      z.object({
        role: z.string(),
        content: z.array(
          z.object({
            type: z.string(),
            text: z.string(),
          }),
        ),
      }),
    ),
  }),

  modelOutput: z.object({
    id: z.string(),
    type: z.string(),
    role: z.string(),
    model: z.string(),

    stop_reason: z.string(),
    stop_sequence: z.nullable(z.string()),
    usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),

    content: z.array(
      z.object({
        type: z.string(),
        text: z.string(),
      }),
    ),
  }),

  recordId: z.string(),
});

export type JobResponse = z.infer<typeof JobResponseModel>;

export const JobResponseTestCaseModel = z.object({
  question: z.string(),
  answer: z.string(),
});

export type JobResponseTestCase = z.infer<typeof JobResponseTestCaseModel>;

export const TestCaseModel = z.object({
  input: z.nullable(documentSchema),
  expected: z.nullable(documentSchema),
  context: z.nullable(documentSchema),
});

export type TestCase = z.infer<typeof TestCaseModel>;
