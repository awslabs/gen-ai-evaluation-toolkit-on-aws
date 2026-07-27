import { DocumentType } from '@smithy/types';
import z from 'zod';

export const documentSchema: z.ZodType<DocumentType> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.array(documentSchema), z.record(documentSchema), z.null()]),
);
