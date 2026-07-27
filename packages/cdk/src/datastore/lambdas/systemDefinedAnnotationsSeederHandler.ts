import { createAnnotationSchema } from '@datastore/api/helpers';
import { AnnotationValueType, Unit, StringConfigurations } from '@datastore/api/types';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { z } from 'zod';

const SystemDefinedSchemaItemSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    valueType: z.union([
      z.object({ numericType: z.object({}).strict() }).strict(),
      z.object({ stringType: z.object({ enum: z.array(z.string()).min(1) }).strict() }).strict(),
    ]),
  })
  .strict();

const SeederInputSchema = z.array(SystemDefinedSchemaItemSchema);

// Convert SDK-style valueType to local valueType
function convertValueType(sdkValueType: { numericType?: unknown; stringType?: unknown }): AnnotationValueType {
  if ('numericType' in sdkValueType) {
    return { number: sdkValueType.numericType as Unit };
  }
  if ('stringType' in sdkValueType) {
    return { string: sdkValueType.stringType as StringConfigurations };
  }
  throw new Error('Invalid valueType in seeder input');
}

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  try {
    console.log('Event:', JSON.stringify(event, null, 2));
    const requestType = event.RequestType;
    if (requestType == 'Delete') {
      console.log('No action needed for Delete RequestType');
      return {
        statusCode: 200,
      };
    }

    const seederInput = JSON.parse(event.ResourceProperties.annotations);
    if (!isValidSeederInput(seederInput)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid seeder input',
        }),
      };
    }

    await Promise.all(
      seederInput.map(async (schemaItem) => {
        await createAnnotationSchema({
          name: schemaItem.name,
          description: schemaItem.description,
          valueType: convertValueType(schemaItem.valueType),
          createdBy: 'System',
        });
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'System-defined annotations added successfully',
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal failure',
      }),
    };
  }
};

function isValidSeederInput(obj: unknown): obj is z.infer<typeof SeederInputSchema> {
  return SeederInputSchema.safeParse(obj).success;
}

export const lambdaHandler = handler;
