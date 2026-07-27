export const EnvVariable = {
  // Common across many lambdas
  DYNAMO_TABLE_NAME: 'DYNAMO_TABLE_NAME',
  S3_BUCKET_NAME: 'S3_BUCKET_NAME',
  MLFLOW_TRACKING_SERVER_ARN: 'MLFLOW_TRACKING_SERVER_ARN',

  ACCOUNT_ID: 'ACCOUNT_ID',
  REGION: 'REGION',

  // For specific lambdas
  VERSIONING_SQS_URL: 'VERSIONING_SQS_URL',
  ROLLBACK_SQS_URL: 'ROLLBACK_SQS_URL',
  TARGET_LAMBDA_ARN: 'TARGET_LAMBDA_ARN',
  SCHEDULER_ROLE_ARN: 'SCHEDULER_ROLE_ARN',
  JOB_QUEUE_URL: 'JOB_QUEUE_URL',

  ASYNC_AWAIT_STEP: {
    SOURCE: 'ASYNC_AWAIT_STEP_SOURCE',
    REQUEST_DETAIL_TYPE: 'ASYNC_AWAIT_STEP_REQUEST_DETAIL_TYPE',
    RESPONSE_DETAIL_TYPE: 'ASYNC_AWAIT_STEP_RESPONSE_DETAIL_TYPE',
    EVENT_BUS: 'ASYNC_AWAIT_STEP_EVENT_BUS',
  },

  GENERATION: {
    WORKFLOW_ARN: 'GENERATION_WORKFLOW_ARN',
  },

  EVALUATION: {
    WORKFLOW_ARN: 'EVALUATION_WORKFLOW_ARN',
  },

  PLUGIN: {
    NAME: 'PLUGIN_NAME',
    BUS_ARN: 'EVENT_BUS_ARN',
    NOOP: {
      DELAY_IN_SECONDS: 'PLUGIN_NOOP_DELAY_IN_SECONDS',
    },
    ECS: {
      CLUSTER_NAME: 'PLUGIN_ECS_CLUSTER_NAME',
      TASK_DEFINITION: 'PLUGIN_ECS_TASK_DEFINITION',
      TASK_CONTAINER_NAME: 'PLUGIN_ECS_TASK_CONTAINER_NAME',
      TASK_SECURITY_GROUP_ID: 'PLUGIN_ECS_TASK_SECURITY_GROUP_ID',
      SUBNET_IDS: 'PLUGIN_ECS_SUBNET_IDS',

      CONFIG: 'CONFIG', // this key is used by Plugins. If you change it you also need to change all plugins
      EVENT_BUS: 'EVENT_BUS', // this key is used by Plugins. If you change it you also need to change all plugins

      GEN: {
        INTERNAL_BUCKET: 'INTERNAL_S3_BUCKET', // this key is used by RAG gen plugin. If you change it you also need to change the plugin's code
      },
    },
  },

  GENAI_ETK_URL: 'GENAI_ETK_URL',
} as const;

// component prefix
export const DS_RESOURCE_PREFIX = 'DS';

// DDB related constants
export const DS_DDB_TABLE_NAME = 'DatastoreTable';
export const DS_DDB_PK = 'entityType';
export const DS_DDB_SK = 'entityId';

export const DEFAULT_DYNAMO_RETRIES = 3;

// S3 related constants
export const DS_S3_BUCKET_NAME = 'DatastoreBucket';

// API related constants
export const DS_API_NAME = 'DatastoreApi';

export const VERSION_LATEST = 'latest';
export const VERSION_HEAD = 'head';

export const ServiceName = 'GenAiEvaluationToolkit';

// config related constants
export const EXPERIMENT_CONFIG_BUCKET_PREFIX = 'experiment_configurations';
export const EXPERIMENT_VERSION_MAPPING_BUCKET_PREFIX = 'experiment_version_mappings';
export const CONFIG_BUCKET_PREFIX = 'configurations';
export const CONFIG_VERSION_MAPPING_BUCKET_PREFIX = 'configurations_version_mappings';

// Exports
export const EXPORT_PREFIX = '/genai-etk';
export const EXPERIMENT_MLFLOW_BUCKET_SSM_KEY = `${EXPORT_PREFIX}/experimentMlFlowBucketName`;
