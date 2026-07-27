import { DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function deleteAnnotationSchemaFromDDB(annotationName: string): Promise<void> {
  await ddbClient.send(
    new DeleteCommand({
      TableName: process.env.DATASTORE_TABLE_NAME!,
      Key: { entityType: 'ANNOTATION_SCHEMA', entityId: annotationName },
    }),
  );
}
