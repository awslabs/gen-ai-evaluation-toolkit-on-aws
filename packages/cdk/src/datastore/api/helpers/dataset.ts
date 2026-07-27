import { DatasetStatus } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { logErrorAndThrowUnprocessableEntity } from '@common/api/exceptions/serviceExceptions';
import { DdbWrapper } from '../ddb';
import { EntityType } from '../types';
import { log } from '../utils';
import { DdbConditionalOperators } from '@common/dynamoUtils';

/**
 * Checks if the dataset if active and freezes it in an atomic operation.
 * If dataset is already frozen throws an error.
 */
export async function freezeDataset(datasetId: string) {
  try {
    // Check and freeze database in an atomic operation
    await DdbWrapper.getInstance().updateItem(
      EntityType.DATASET,
      datasetId,
      { status: DatasetStatus.FROZEN },
      {
        condition: {
          key: 'status',
          operator: DdbConditionalOperators.EQUAL_TO,
          values: [DatasetStatus.ACTIVE],
        },
      },
    );
    log.info(`Dataset ${datasetId} frozen`);
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      logErrorAndThrowUnprocessableEntity({ externalMessage: 'Dataset is frozen' });
    }

    throw err;
  }
}
