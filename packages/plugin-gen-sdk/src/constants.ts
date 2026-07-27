export const MAX_CONCURRENCY_LIMIT = 50;

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
  INTERNAL_S3_BUCKET = 'INTERNAL_S3_BUCKET',
  PLUGIN_NAME = 'PLUGIN_NAME',
}
