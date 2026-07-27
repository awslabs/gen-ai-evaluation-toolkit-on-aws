/**
 * Returns a unique resource name based upon the stage and environment
 * @param servicePrefix Prefix for the service
 * @param resourceName Name of the resource
 *  @param regionName AWS Deployment  Region
 * @param stageName Service  Deployment  Stage
 * @return {string} unique resource name
 * */
export function getUniqueResourceName(
  servicePrefix: string,
  resourceName: string,
  regionName: string,
  stageName: string,
): string {
  return `${stageName.toLowerCase()}-${regionName.toLowerCase()}-${servicePrefix}-${resourceName}`;
}

/**
 * Return a unique S3 bucket name based upon the stage and environment
 * @param servicePrefix Prefix for the service
 * @param shortBucketName A short and meaningful bucket name
 * @param accountId AWS account ID
 *  @param regionName AWS Deployment  Region
 * @param stageName Service  Deployment  Stage
 * @returns unique S3 bucket name
 */
export function getUniqueS3BucketName(
  servicePrefix: string,
  shortBucketName: string,
  accountId: string,
  regionName: string,
  stageName: string,
): string {
  return (
    getUniqueResourceName(servicePrefix, shortBucketName, regionName, stageName)
      .toLowerCase()
      // account id is appended to the generated resource name in localdev stage to make s3 bucket name globally unique
      .concat(stageName === 'local' ? `-${accountId}` : '')
  );
}
