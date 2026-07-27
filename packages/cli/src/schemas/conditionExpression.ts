import { ConditionExpression } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import z from 'zod';

const numericComparatorSchema = z.enum(['=', '!=', '<', '<=', '>', '>=']);
const stringEnumComparatorSchema = z.enum(['=', '!=']);

const conditionLeafSchema = z.object({
  condition: z.union([
    z.object({
      numericCondition: z.object({ name: z.string(), value: z.number(), comparator: numericComparatorSchema }),
    }),
    z.object({
      stringEnumCondition: z.object({ name: z.string(), value: z.string(), comparator: stringEnumComparatorSchema }),
    }),
  ]),
});

export const conditionExpressionSchema: z.ZodType<ConditionExpression> = z.lazy(() =>
  z.union([
    conditionLeafSchema,
    z.object({
      and: z.array(conditionExpressionSchema),
    }),
    z.object({
      or: z.array(conditionExpressionSchema),
    }),
    z.object({
      not: conditionExpressionSchema,
    }),
  ]),
) as z.ZodType<ConditionExpression>;
