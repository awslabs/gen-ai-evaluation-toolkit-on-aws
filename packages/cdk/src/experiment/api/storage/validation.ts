import { ConfigurationDetail } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DocumentType } from '@smithy/types';
import z from 'zod';

const smithyDocumentSchema: z.ZodType<DocumentType> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(smithyDocumentSchema),
    z.record(smithyDocumentSchema),
    z.null(),
  ]),
);

export const workflowConfigurationSchema: z.ZodType<ConfigurationDetail> = z.object({
  name: z.string(),
  version: z.number().optional(),
  config: z.union([
    z.object({
      evaluationConfiguration: smithyDocumentSchema,
      $unknown: z.never().optional(),
    }),
    z.object({
      evaluationConfiguration: z.never().optional(),
      $unknown: z.tuple([z.string(), z.any()]),
    }),
  ]),
});
