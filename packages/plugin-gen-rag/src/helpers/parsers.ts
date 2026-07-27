import readline from 'readline';
import { z } from 'zod';
import { JobResponse, JobResponseModel, JobResponseTestCase, JobResponseTestCaseModel, TestCase } from '../models';

/**
 * Processes the given file line by line, extracts the output, formats it, and yields a valid test case.
 */
export async function* parseJobResponseTestCases(responseBody: NodeJS.ReadableStream): AsyncGenerator<TestCase> {
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

    // Extract context from input
    const context = response.modelInput.messages[0]?.content[0]?.text
      .replace(/^\s*<context>\s*/, '')
      .replace(/\s*<\/context>\s*$/, '');

    // Extract test cases from output
    const testCasesText = response.modelOutput.content[0]?.text.replace(/^[^[]+/, '').replace(/[^\]]+$/, '');

    // Parse test cases
    let jobTestCases: JobResponseTestCase[];
    try {
      if (!testCasesText) {
        console.warn(`No test cases text found in response`);
        continue;
      }
      jobTestCases = z.array(JobResponseTestCaseModel).parse(JSON.parse(testCasesText));
    } catch (err) {
      console.warn(`Could not parse response test cases: ${testCasesText}. Got error: ${err}`);
      continue;
    }

    const testCases: TestCase[] = jobTestCases.map(({ question, answer }) => ({
      input: question,
      expected: answer,
      context: context != null ? [context] : [],
    }));

    yield* testCases;
  }
}
