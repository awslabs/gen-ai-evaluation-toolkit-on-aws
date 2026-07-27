export { MAX_CONCURRENCY_LIMIT, EnvVariable } from '@genai-etk/plugin-gen-sdk';

export const MAX_RETRY_ATTEMPTS = 3;
export const DEFAULT_CONCURRENCY = 10;
// Augmentation runs at lower concurrency than generation per HLD §2.6 (line 633)
export const DEFAULT_AUGMENTATION_CONCURRENCY = 5;
export const MIN_CONCURRENCY = 2;
export const SCENARIO_BATCH_SIZE = 15;

export const DEFAULT_MODEL = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

export const DEFAULT_TAXONOMY_AXES = {
  turnCounts: [1, 2, 3],
  difficulty: ['easy', 'medium', 'hard'],
  outcomes: ['happy_path', 'refusal', 'clarification'],
};
