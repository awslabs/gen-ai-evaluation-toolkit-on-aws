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
  input: S3ReferenceModel,
  output: S3ReferenceModel,
  configuration: z.object({
    model: z.string().default(Defaults.model),
    criteria: z.array(z.string()).default(Defaults.criteria),
    prompt: z.string().default(Defaults.prompt),
    threshold: z.number().min(0).max(1).default(Defaults.threshold),
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

export const JobResponseValidationModel = z.object({
  valid: z.string(),
});

export type JobResponseValidatedTestCase = z.infer<typeof JobResponseValidationModel>;

export const TestCaseModel = z.object({
  input: z.nullable(documentSchema),
  expected: z.nullable(documentSchema),
  context: z.nullable(documentSchema),
});

export type TestCase = z.infer<typeof TestCaseModel>;

export const ValidatedTestCaseModel = TestCaseModel.extend({
  valid: z.boolean(),
});

export type ValidatedTestCase = z.infer<typeof ValidatedTestCaseModel>;
