import { z } from 'zod';

export const S3ReferenceModel = z.object({
  bucket: z.string(),
  prefix: z.string(),
});

export type S3Reference = z.infer<typeof S3ReferenceModel>;

export const BaseTriggerEventModel = z.object({
  taskToken: z.string(),
  id: z.string(),
  output: S3ReferenceModel,
});

export type BaseTriggerEvent = z.infer<typeof BaseTriggerEventModel>;
