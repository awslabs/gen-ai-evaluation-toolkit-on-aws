import { AnnotationSchema } from '@awssolutions/gen-ai-evaluation-toolkit-ts-client';
import { IAsyncDisposable } from '../../../types';
import { $ } from './test-utils';
import { deleteAnnotationSchemaFromDDB } from '../../../helpers';
import assert from 'assert';

/**
 * Creates an annotation schema and returns a disposable annotation object
 * @param {string} testId - The name of the annotation
 * @param {object} params - Configuration capabilities
 * @returns {Promise<TestCase>} A disposable annotation object
 */
export async function createAnnotationSchema(
  testId: string,
  params: { type: 'number' } | { type: 'string'; stringEnum: string[] } = {
    type: 'string',
    stringEnum: ['Good', 'Bad', 'Neutral'],
  },
): Promise<IAsyncDisposable<{ name: string }>> {
  const annotationName = `annotation-${testId}`;
  const annotationDescription = `Test annotation created for test with id ${testId}`;

  const commandOptions = [`--name ${annotationName}`, `--description "${annotationDescription}"`];

  if (params.type == 'number') {
    commandOptions.push('--number-value');
  } else {
    assert(params.stringEnum.length > 0, 'stringEnum must be provided for string annotations');
    params.stringEnum.forEach((value) => commandOptions.push(`--enum-value ${value}`));
  }

  const result = await $.json<AnnotationSchema>`genai-etk dataset create-annotation-schema ${commandOptions.join(' ')}`;

  return {
    ...result,
    async [Symbol.asyncDispose]() {
      await deleteAnnotationSchemaFromDDB(annotationName).catch(() => {});
    },
  };
}
