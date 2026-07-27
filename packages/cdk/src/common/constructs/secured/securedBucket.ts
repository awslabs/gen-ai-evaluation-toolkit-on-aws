import { Duration, PhysicalName, RemovalPolicy } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption, BucketProps } from 'aws-cdk-lib/aws-s3';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export type SecuredBucketProps = Omit<BucketProps, FixedKeys> & {
  expireObjectsAfter?: Duration;
  encryptionKey?: IKey;
  /**
   * Retention period for the auto-created access-log sub-bucket (default: 30 days).
   * Only applies when this bucket is NOT itself an access-log bucket.
   */
  accessLogsRetentionDays?: number;
  /**
   * Noncurrent version expiry for stable buckets that have no other lifecycle.
   * Applies to datastore/mlflow/experiment buckets. Default: 90 days.
   */
  noncurrentVersionExpiryDays?: number;
};

type FixedKeys =
  | keyof typeof defaultSettings
  | 'encryptionKey'
  | 'serverAccessLogsBucket'
  | 'removalPolicy'
  | 'autoDeleteObjects';

const defaultSettings = {
  versioned: true,
  publicReadAccess: false,
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  encryption: BucketEncryption.S3_MANAGED,
};

export class SecuredBucket extends Bucket {
  public override readonly encryptionKey?: IKey;

  constructor(scope: Construct, id: string, props: SecuredBucketProps = {}) {
    const accessLogSuffix = 'AccessLogs';
    const isAccessLogBucket = id.endsWith(`-${accessLogSuffix}`);
    const isTempBucket = props.bucketName == null;

    // If current bucket is not access log bucket, create an access log bucket for it
    let accessLogBucket: Bucket | undefined;
    if (!isAccessLogBucket) {
      accessLogBucket = new SecuredBucket(scope, `${id}-${accessLogSuffix}`, {
        // Pass the same encryption key and retention config to access log bucket
        encryptionKey: props.encryptionKey,
        accessLogsRetentionDays: props.accessLogsRetentionDays,
      });
    }

    let bucketConfig: Partial<BucketProps>;
    if (isAccessLogBucket) {
      bucketConfig = getAccessLogBucketConfig(id, props);
    } else if (isTempBucket) {
      bucketConfig = getTemporaryBucketConfig(id, props);
    } else {
      bucketConfig = getStableBucketConfig(id, props);
    }

    // Determine encryption configuration
    const encryptionConfig = SecuredBucket.getEncryptionConfig(props.encryptionKey);

    const config: BucketProps = {
      ...props,
      ...defaultSettings,
      ...bucketConfig,
      ...encryptionConfig,
      bucketName: props.bucketName ?? PhysicalName.GENERATE_IF_NEEDED,
      serverAccessLogsBucket: accessLogBucket,
    };

    super(scope, id, config);

    // Store the encryption key for use in grant methods
    this.encryptionKey = props.encryptionKey;

    // Apply CDK-nag suppressions for customer-managed keys
    if (props.encryptionKey) {
      NagSuppressions.addResourceSuppressions(this, [
        {
          id: 'AwsSolutions-S3-6',
          reason: 'Customer-managed KMS key provides equivalent or better encryption than AWS managed keys',
        },
      ]);
    }
  }

  private static getEncryptionConfig(encryptionKey?: IKey): Partial<BucketProps> {
    if (encryptionKey) {
      return {
        encryption: BucketEncryption.KMS,
        encryptionKey,
        bucketKeyEnabled: true, // Optimize KMS costs
      };
    }
    // defaultSettings already has S3_MANAGED
    return {};
  }
}

/**
 * Access-log buckets receive log objects from other buckets. Log objects are
 * unique per-write (never overwritten), so versioning adds no value — suspend
 * it and aggressively drain historical noncurrent versions. Short retention
 * prevents unbounded growth of delete markers and stale log data.
 */
function getAccessLogBucketConfig(id: string, props: SecuredBucketProps): Partial<BucketProps> {
  if (props.accessLogsRetentionDays !== undefined && props.accessLogsRetentionDays < 1) {
    throw new Error('accessLogsRetentionDays must be at least 1');
  }
  const retentionDays = props.accessLogsRetentionDays ?? 30;

  return {
    versioned: false, // Suspend — log objects are unique per-write
    autoDeleteObjects: true,
    removalPolicy: RemovalPolicy.DESTROY,
    lifecycleRules: [
      {
        id: `${id}-LogRetention`,
        enabled: true,
        expiration: Duration.days(retentionDays),
        noncurrentVersionExpiration: Duration.days(1),
        abortIncompleteMultipartUploadAfter: Duration.days(7),
      },
      {
        id: `${id}-DeleteMarkerCleanup`,
        enabled: true,
        expiredObjectDeleteMarker: true,
      },
    ],
  };
}

/**
 * Temporary buckets do not contain content that needs to be preserved across deployments
 * That means we can just delete all of its content and the bucket itself in case it is
 * not referenced anymore by its parent stack
 * In addition, they are often used as temporary datastore aggregating large amounts of
 * data. To avoid collecting useless data we can remove the unused content after a month
 */
function getTemporaryBucketConfig(id: string, props: SecuredBucketProps): Partial<BucketProps> {
  const lifecycleRules = props.lifecycleRules ?? [];
  const expirationDuration = props.expireObjectsAfter ?? Duration.days(30);

  lifecycleRules.push({
    id: `${id}-MonthlyDelete`,
    enabled: true,
    expiration: expirationDuration,
    noncurrentVersionExpiration: expirationDuration,
    abortIncompleteMultipartUploadAfter: expirationDuration,
  });

  lifecycleRules.push({
    id: `${id}-DeleteMarkerCleanup`,
    enabled: true,
    expiredObjectDeleteMarker: true,
  });

  return {
    lifecycleRules: lifecycleRules,
    autoDeleteObjects: true,
    removalPolicy: RemovalPolicy.DESTROY,
  };
}

/**
 * Stable buckets should be preserved and attempted destruction should trigger errors.
 * The data inside these buckets is valuable in the long term and across deployments.
 * A minimal lifecycle rule cleans up orphaned delete markers and expired noncurrent
 * versions to prevent unbounded version growth.
 */
function getStableBucketConfig(id: string, props: SecuredBucketProps): Partial<BucketProps> {
  if (props.noncurrentVersionExpiryDays !== undefined && props.noncurrentVersionExpiryDays < 1) {
    throw new Error('noncurrentVersionExpiryDays must be at least 1');
  }
  const noncurrentDays = props.noncurrentVersionExpiryDays ?? 90;

  return {
    autoDeleteObjects: false,
    removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    lifecycleRules: [
      {
        id: `${id}-CleanupMarkers`,
        enabled: true,
        expiredObjectDeleteMarker: true,
        noncurrentVersionExpiration: Duration.days(noncurrentDays),
        abortIncompleteMultipartUploadAfter: Duration.days(7),
      },
    ],
  };
}
