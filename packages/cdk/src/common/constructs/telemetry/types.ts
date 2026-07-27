import { aws_dynamodb as ddb, aws_lambda as lambda, aws_stepfunctions as sfn, aws_sqs as sqs } from 'aws-cdk-lib';

export interface ServiceMonitorConfig {
  /**
   * The name of the GenAI Evaluation Toolkit.
   */
  readonly serviceName: string;
  /**
   * An array of the REST APIs created by the service
   */
  readonly restApiIds: string[];
  /**
   * An array of Lambda functions created by the service
   */
  readonly lambdas?: (lambda.IFunction | undefined)[];
  /**
   * An array of queue pairs (normal queue and the corresponding DLQ) created by the service
   */
  readonly queuePairs?: {
    /**
     * The first SQS queue if applicable
     */
    queue?: sqs.IQueue;
    /**
     * The DLQ for the normal queue or other event sources (e.g. an EventBridge event bus)
     */
    dlq: sqs.IQueue;
  }[];
  /**
   * An array of DynamoDB tables created by the service
   */
  readonly tables?: {
    /**
     * A DynamoDB table
     */
    table: ddb.ITable;
    /**
     * An array of names of the GSIs on the table
     */
    gsiNames?: string[];
  }[];
  /**
   * An array of the State Machines created by the service
   */
  readonly stateMachines?: sfn.IStateMachine[];
}
