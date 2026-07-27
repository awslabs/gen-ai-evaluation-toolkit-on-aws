export const GENERATION_PROMPT =
  'You are a Teacher/Professor. Your task is to setup question answer pairs for an upcoming quiz/examination. The questions should be diverse in nature across the document. Restrict the questions to the context information provided. Only output an array of the given format to be parsed as JSON, do not say anything';
export const GENERATION_FORMAT = '[{"question": "", "answer": ""}]';

export const Defaults = {
  chunkSize: 1024,
  chunkOverlap: 128,

  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  questionsPerChunk: 3,
  prompt: GENERATION_PROMPT,
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
