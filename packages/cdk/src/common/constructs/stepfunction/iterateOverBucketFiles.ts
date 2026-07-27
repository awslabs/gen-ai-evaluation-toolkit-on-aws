import {
  QueryLanguage,
  IChainable,
  INextable,
  StateMachineFragment,
  State,
  Pass,
  Choice,
  Condition,
} from 'aws-cdk-lib/aws-stepfunctions';
import { CallAwsService } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

import { suppressCdkNag } from '@src/cdk-nag-suppressions';

export type IterateOverBucketFilesProps = {
  stateName: string;
  operation: IChainable;
  aggregator?: INextable & IChainable;
  resultPath?: string;
} & BucketNameProps &
  PrefixProps &
  PageSizeProps;

type BucketNameProps =
  | {
      /**
       * The bucket name.
       */
      bucketName: string;

      bucketNamePath?: never;
    }
  | {
      bucketName?: never;

      /**
       * The path to the bucket name in the fragment input.
       */
      bucketNamePath: string;
    };

type PrefixProps =
  | {
      /**
       * The bucket prefix.
       */
      prefix?: string;

      prefixPath?: never;
    }
  | {
      prefix?: never;

      /**
       * The path to the prefix in the fragment input.
       */
      prefixPath?: string;
    };

type PageSizeProps =
  | {
      /**
       * The page size.
       */
      pageSize?: number;

      pageSizePath?: never;
    }
  | {
      pageSize?: never;

      /**
       * The path to the page size in the fragment input.
       */
      pageSizePath?: string;
    };

/**
 * A Step Function fragment to process all objects within an S3 bucket through iterative pagination. It works by
 * recursively listing objects, page by page from the S3 bucket and executing a specified operation for each page
 * encountered. During this process, the fragment combines the original input with the current page's list response
 * before passing it to the designated operation. If the operation's output contains results at the defined resultPath,
 * these results are collected and aggregated throughout the iteration. Upon completion, the fragment outputs a
 * combination of the original input data enriched with all the aggregated results from processing each page.
 *
 * Input to the provided operation:
 * {
 *     ...inputToThisFragment,
 *     partialListResult: <listObjectV2 response>
 * }
 *
 * Final output:
 * {
 *     ...inputToThisFragment,
 *     [resultPath]: <aggregated results>
 * }
 *
 */
export class IterateOverBucketFilesState extends StateMachineFragment implements INextable {
  public readonly startState: State;
  public readonly endStates: INextable[];

  constructor(scope: Construct, id: string, props: IterateOverBucketFilesProps) {
    super(scope, id);

    const resultPath = props.resultPath || 'output';

    const initialize = new Pass(this, `${id}-Initialize`, {
      stateName: `Initialize (${props.stateName})`,
      assign: {
        bucket: props.bucketName ?? `{% $states.input.${props.bucketNamePath} %}`,
        prefix: props.prefix ?? (props.prefixPath ? `{% $states.input.${props.prefixPath} %}` : '{% null %}'),
        maxKeys: props.pageSize ?? (props.pageSizePath ? `{% $states.input.${props.pageSizePath} %}` : '{% null %}'),
        continuationToken: '{% null %}',
        aggregatedResults: [],
        fragmentInput: '{% $states.input %}',
      },
      queryLanguage: QueryLanguage.JSONATA,
    });

    const listTestFiles = new CallAwsService(this, `${id}-ListTestFilesWithToken`, {
      stateName: `List paginated files with token (${props.stateName})`,
      service: 's3',
      action: 'listObjectsV2',
      parameters: {
        Bucket: '{% $bucket %}',
        Prefix: '{% $prefix %}',
        ContinuationToken: '{% $continuationToken %}',
        MaxKeys: '{% $maxKeys %}',
      },
      // SECURITY: `iamResources: ['*']` here is intentional and is gated by
      // the consuming workflow role's own policy (e.g.
      // `grantReadWriteGenerationBucket` -> `generationBucket.grantReadWrite(...)`
      // for the DatastoreExport plugin, see `plugins/index.ts` and
      // `plugins/datastoreExport/datastoreExport.ts`). The Step Functions
      // task-level `iamResources` is ANDed with the role's permissions; the
      // role is the enforcement boundary. Customers extend workflows to access
      // their own buckets by attaching a managed policy to the exported
      // workflow role (`generationWorkflowRole` in the toolkit exports, see
      // Tightening this to a static bucket ARN would break
      // that BYOB extension path. risk-accepted with this
      // rationale; cdk-nag IAM5 wildcard finding is suppressed below.
      iamResources: ['*'],
      outputs: '{% $merge([$fragmentInput, {"partialListResult": $states.result}]) %}',
      assign: {
        continuationToken:
          '{% $exists($states.result.NextContinuationToken) ? $states.result.NextContinuationToken : null %}',
      },
      queryLanguage: QueryLanguage.JSONATA,
    });
    suppressCdkNag(
      listTestFiles,
      'AwsSolutions-IAM5',
      "Wildcard `iamResources: ['*']` on the s3:listObjectsV2 task is intentional. " +
        'The Step Functions task IAM scope is ANDed with the workflow role policy, ' +
        'which is the actual enforcement boundary (scoped via grantReadWrite on the ' +
        'consuming bucket). Customers extend workflows to their own buckets via the ' +
        'exported workflow role; a static bucket ARN here would ' +
        'break that BYOB extension path.',
    );

    const done = new Pass(this, `${id}-Done`, {
      stateName: `Done (${props.stateName})`,
      outputs: `{% $merge([$fragmentInput, {"${[resultPath]}": $aggregatedResults}]) %}`,
      queryLanguage: QueryLanguage.JSONATA,
    });

    const checkIfDone = new Choice(this, `${id}-CheckIfDone`, {
      stateName: `Check if done (${props.stateName})`,
      queryLanguage: QueryLanguage.JSONATA,
    })
      .when(Condition.jsonata('{% $continuationToken != null %}'), listTestFiles)
      .otherwise(done)
      .afterwards();

    const partialAggregator =
      props.aggregator ??
      new Pass(this, `${id}-PartialAggregator`, {
        stateName: `PartialAggregator (${props.stateName})`,
        assign: {
          aggregatedResults: `{% $exists($states.input.${resultPath}) ? $append($aggregatedResults, $states.input.${resultPath}) : $aggregatedResults %}`,
        },
        queryLanguage: QueryLanguage.JSONATA,
      });

    const chain = initialize.next(listTestFiles).next(props.operation).next(partialAggregator).next(checkIfDone);

    this.startState = chain.startState;
    this.endStates = [done];
  }
}
