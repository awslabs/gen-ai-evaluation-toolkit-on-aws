import {
  DeleteDatasetCommand,
  DeleteExperimentCommand,
  DeleteJobSchedulerCommand,
  ListConfigurationsCommand,
  ListDatasetsCommand,
  ListExperimentsCommand,
  ListJobSchedulersCommand
} from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

import * as readline from 'readline';
import { send } from './helpers';

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient());
const s3Client = new S3Client();
const stsClient = new STSClient();

async function main() {
  if (!process.env.NO_VERIFY) {
    console.log('About to wipe all GenAi-ETK data. Press y/Y to continue or any other key to abort...');

    const confirmed = await confirmCleanup();
    console.log();

    if (!confirmed) {
      console.log('Cleanup aborted.');
      return;
    }
  }

  await cleanupAllResources();
}

async function cleanupAllResources() {
  await cleanupJobSchedulers();
  await cleanupExperiments();
  await listEvaluationConfigurations();
  await cleanupDatasets();
  await cleanupDynamoDBTables();
  await cleanupS3Bucket();

  console.log('\n✓ Cleanup complete!');
}

async function cleanupJobSchedulers() {
  console.log('Deleting job schedulers...');
  const { jobSchedulers } = await send(new ListJobSchedulersCommand());

  for (const scheduler of jobSchedulers || []) {
    console.log(`  Deleting job scheduler: ${scheduler.name}`);
    await send(new DeleteJobSchedulerCommand({ name: scheduler.name }));
  }

  console.log(`  Deleted ${jobSchedulers?.length || 0} job schedulers\n`);
}

async function cleanupExperiments() {
  console.log('Deleting experiments...');
  const { experiments } = await send(new ListExperimentsCommand());

  for (const experiment of experiments || []) {
    console.log(`  Deleting experiment: ${experiment.name}`);
    await send(new DeleteExperimentCommand({ name: experiment.name }));
  }

  console.log(`  Deleted ${experiments?.length || 0} experiments\n`);
}

async function listEvaluationConfigurations() {
  console.log('Listing evaluation configurations (no delete API available)...');
  const { configurations } = await send(new ListConfigurationsCommand());

  if (configurations && configurations.length > 0) {
    console.log(`  Found ${configurations.length} evaluation configurations:`);
    for (const config of configurations) {
      console.log(`    - ${config.name}`);
    }
    console.log('  Note: These cannot be deleted via API\n');
  } else {
    console.log(`  No evaluation configurations found\n`);
  }
}

async function cleanupDatasets() {
  console.log('Deleting datasets...');
  const { datasets } = await send(new ListDatasetsCommand());

  for (const dataset of datasets || []) {
    console.log(`  Deleting dataset: ${dataset.datasetId}`);
    await send(new DeleteDatasetCommand({ datasetId: dataset.datasetId }));
  }

  console.log(`  Deleted ${datasets?.length || 0} datasets\n`);
}

// Deletes accumulated test data from both DynamoDB tables. The two tables use different
// key schemas: the datastore table is keyed by entityType/entityId and holds System items
// we must keep; the evaluator table is keyed by pk/sk (reports/jobs/results) with no System
// items, so everything is removed.
async function cleanupDynamoDBTables() {
  const datastoreTable = process.env.DATASTORE_TABLE_NAME || 'GenAiEtkDatastoreDdbTable';
  const evaluatorTable = process.env.EVALUATOR_TABLE_NAME || 'evaluatortable';

  await cleanupDynamoDBTable(datastoreTable, ['entityType', 'entityId'], { skipSystem: true });
  await cleanupDynamoDBTable(evaluatorTable, ['pk', 'sk'], { skipSystem: false });
}

async function cleanupDynamoDBTable(
  tableName: string,
  keyAttributes: string[],
  { skipSystem }: { skipSystem: boolean }
) {
  console.log(`Cleaning up DynamoDB table: ${tableName}...`);

  let deletedCount = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const { Items = [], LastEvaluatedKey } = await ddbClient.send(
      new ScanCommand({
        TableName: tableName,
        ...(skipSystem
          ? {
              FilterExpression: 'createdBy <> :system',
              ExpressionAttributeValues: { ':system': 'System' }
            }
          : {}),
        ExclusiveStartKey: lastEvaluatedKey
      })
    );

    for (let i = 0; i < Items.length; i += 25) {
      await ddbClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: Items.slice(i, i + 25).map((item) => ({
              DeleteRequest: {
                Key: Object.fromEntries(keyAttributes.map((attr) => [attr, item[attr]]))
              }
            }))
          }
        })
      );
      deletedCount += Math.min(25, Items.length - i);
    }

    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`  Deleted ${deletedCount} items${skipSystem ? ' (kept System items)' : ''}\n`);
}

async function cleanupS3Bucket() {
  const { Account } = await stsClient.send(new GetCallerIdentityCommand());
  const region = await s3Client.config.region();
  const bucketName = `genai-etk-experimentconfig-${Account}-${region}`;

  console.log(`Cleaning up S3 bucket: ${bucketName}...`);

  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const { Contents = [], NextContinuationToken } = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken
      })
    );

    if (Contents.length > 0) {
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: Contents.map((obj) => ({ Key: obj.Key! })) }
        })
      );
      deletedCount += Contents.length;
    }

    continuationToken = NextContinuationToken;
  } while (continuationToken);

  console.log(`  Deleted ${deletedCount} objects\n`);
}

async function confirmCleanup(): Promise<boolean> {
  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.once('keypress', (str: string) => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      // Close the stream to unblock the process
      process.stdin.destroy();

      resolve(str.toLowerCase() === 'y');
    });
  });
}

// Run cleanup if executed directly
if (require.main === module) {
  main().catch(console.error);
}
