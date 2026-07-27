import { GenerationStep } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import z from 'zod';
import { documentSchema } from '.';

export const generationStepSchema: z.ZodType<GenerationStep> = z.object({
  plugin: z.string(),
  configuration: documentSchema,
});
export const generationStepsSchema: z.ZodType<GenerationStep[]> = z.array(generationStepSchema);
