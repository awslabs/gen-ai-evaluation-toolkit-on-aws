import { GenAiEvaluationToolkitClient } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { lazy, readEnvVariable } from './utils';
import { API_GW_ENDPOINT } from './constants';

/**
 * Get GenAi ETK client
 */
export const getClient = lazy(
  () =>
    new GenAiEvaluationToolkitClient({
      endpoint: readEnvVariable(API_GW_ENDPOINT),
    }),
);
