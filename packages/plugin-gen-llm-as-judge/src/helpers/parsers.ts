import readline from 'readline';
import {
  JobResponse,
  JobResponseModel,
  JobResponseValidationModel,
  TestCase,
  TestCaseModel,
  ValidatedTestCase,
} from '../models';

/**
 * Processes the given file line by line, extracts the validation results, formats them, and yields validated test cases.
 */
export async function* parseJobResponseValidatedTestCases(
  responseBody: NodeJS.ReadableStream,
): AsyncGenerator<ValidatedTestCase> {
  const lines = readline.createInterface({ input: responseBody, crlfDelay: Infinity });

  for await (const line of lines) {
    // Parse a line
    let response: JobResponse;
    try {
      response = JobResponseModel.parse(JSON.parse(line));
    } catch (err) {
      console.warn(`Could not parse line: "${line}". Got error: ${err}`);
      continue;
    }

    // Extract structured output by removing all text around first { and last }
    const validationResultText = response.modelOutput.content[0]?.text.replace(/^[^{]+/, '').replace(/[^}]+$/, '');

    // Read validation result
    let valid: boolean;
    try {
      // Parse response
      if (!validationResultText) {
        console.warn('No validation result text found');
        continue;
      }
      const validationResult = JobResponseValidationModel.parse(JSON.parse(validationResultText));
      valid = validationResult.valid === String(true);
    } catch (err) {
      console.warn(`Could not parse response test cases: ${validationResultText}. Got error: ${err}`);
      continue;
    }

    // Read test case from input
    const testCaseText = response.modelInput.messages[0]?.content[0]?.text;
    let testCase: TestCase;
    try {
      if (!testCaseText) {
        console.warn('No test case text found');
        continue;
      }
      testCase = TestCaseModel.parse(JSON.parse(testCaseText));
    } catch (err) {
      console.warn(`Error parsing input testcase: ${testCaseText}: ${err}`);
      continue;
    }

    yield { ...testCase, valid };
  }
}
