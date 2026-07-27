import { TestCase } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { DocumentType } from '@smithy/types';
import z from 'zod';

const documentSchema: z.ZodType<DocumentType> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.array(documentSchema), z.record(documentSchema), z.null()]),
);

export const TriggerVersioningMessageSchema = z.strictObject({
  datasetId: z.string().uuid(),
  triggeredBy: z.string().min(1).max(256),
});

export const TriggerRollbackMessageSchema = z.strictObject({
  datasetId: z.string().uuid(),
  targetVersion: z.number().min(1),
  triggeredBy: z.string().min(1).max(256),
});

export const TestCaseSchema: z.ZodType<Omit<TestCase, 'testCaseId'>> = z.strictObject({
  input: documentSchema.optional(),
  expected: documentSchema.optional(),
  context: documentSchema.optional(),
  metadata: documentSchema.optional(),
});

export const TestCaseMetadataSchema = z.object({
  createdAt: z.optional(z.date({ coerce: true })),
  createdBy: z.optional(z.string()),
});
