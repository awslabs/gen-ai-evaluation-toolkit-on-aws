export const JUDGMENT_PROMPT =
  'You are a quality assessor for educational content. Evaluate if the given question-answer pair meets all specified criteria. Return true only if all criteria are met, otherwise false.';
export const TEST_CASE_FORMAT = '{"question": "", "answer": "", "valid": ""}';

export const Defaults = {
  chunkSize: 1024,
  chunkOverlap: 128,
  criteria: [
    'Question must be answerable from the provided context',
    'Answer must be accurate and complete',
    'Question should be clear and unambiguous',
  ],
  threshold: 0.8,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  questionsPerChunk: 3,
  prompt: JUDGMENT_PROMPT,
};

export const MAX_CONCURRENCY_LIMIT = 50;
export const DEFAULT_POLL_INTERVAL = 30_000;

export enum EventType {
  DONE = 'genAiEtkGenerationPluginDoneEvent',
}

export enum StatusType {
  IN_PROGRESS = 'inProgress',
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum EnvVariable {
  CONFIG = 'CONFIG',
  EVENT_BUS_ARN = 'EVENT_BUS_ARN',
  BEDROCK_ROLE_ARN = 'BEDROCK_ROLE_ARN',
  INTERNAL_S3_BUCKET = 'INTERNAL_S3_BUCKET',
}
