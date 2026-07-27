import { defineFilter, InputTestCase, getS3ObjectContent, writeS3Object } from '@genai-etk/plugin-gen-sdk';
import { z } from 'zod';
import assert from 'assert';
import path from 'path';
import type { Readable } from 'stream';
import {
  createBedrockBatchJob,
  createModelInput,
  waitUntilJobTerminates,
  parseJobResponseValidatedTestCases,
  getEnvVariable,
} from './helpers';
import { Defaults, EnvVariable } from './constants';

const LLMAsJudgeConfigSchema = z.object({
  model: z.string().default(Defaults.model),
  criteria: z.array(z.string()).default(Defaults.criteria),
  prompt: z.string().default(Defaults.prompt),
  threshold: z.number().min(0).max(1).default(Defaults.threshold),
});

type LLMAsJudgeConfig = z.output<typeof LLMAsJudgeConfigSchema>;

const plugin = defineFilter({
  name: 'LLMAsJudgeFilter',
  configSchema: LLMAsJudgeConfigSchema,

  filter: async function* (testCases, config, ctx) {
    const internalS3Bucket = getEnvVariable(EnvVariable.INTERNAL_S3_BUCKET);

    // Step 1: Create validation prompts from input test cases
    await ctx.reportProgress('Creating validation prompts from input test cases...');
    const jsonlLines = createValidationPrompts(testCases, config);
    assert(jsonlLines.length > 0, 'No validation prompts were generated');
    assert(jsonlLines.length >= 100, 'Cannot invoke batch job with less than 100 prompts');

    // Step 2: Write prompts to S3
    const promptsKey = `prompts/${ctx.runId}.jsonl`;
    const jsonlContent = jsonlLines.join('\n');
    await writeS3Object(internalS3Bucket, promptsKey, jsonlContent);
    console.log(`Wrote ${jsonlLines.length} validation prompts to ${promptsKey}`);

    await ctx.reportProgress(`Created ${jsonlLines.length} validation prompts for processing`);

    // Step 3: Start Bedrock batch job
    const inputS3Uri = `s3://${internalS3Bucket}/${promptsKey}`;
    const outputPrefix = `outputs/${ctx.runId}`;
    const outputS3Uri = `s3://${internalS3Bucket}/${outputPrefix}/`;

    const jobArn = await createBedrockBatchJob(ctx.runId, inputS3Uri, outputS3Uri, config.model);
    console.log(`Bedrock batch job created: ${jobArn}`);

    await ctx.reportProgress('Bedrock validation batch job started');

    // Step 4: Wait for job completion
    await waitUntilJobTerminates(jobArn, (status) => ctx.reportProgress(`Batch job status: ${status}`));

    await ctx.reportProgress('Batch job completed, parsing validation results...');

    // Step 5: Parse and yield valid test cases
    const jobArnParts = jobArn.split('/');
    const jobId = jobArnParts[jobArnParts.length - 1] ?? '';
    const jobOutputPath = path.join(outputPrefix, jobId, `${ctx.runId}.jsonl.out`);
    const body = await getS3ObjectContent(internalS3Bucket, jobOutputPath);
    assert(body != null, 'Job output not found');

    for await (const validatedTestCase of parseJobResponseValidatedTestCases(body as Readable)) {
      const { valid, ...testCase } = validatedTestCase;

      if (valid) {
        yield testCase;
      } else {
        console.log(`Skipping invalid test case: ${JSON.stringify(testCase)}`);
      }
    }
  },
});

function createValidationPrompts(testCases: InputTestCase[], config: LLMAsJudgeConfig): string[] {
  const jsonlLines: string[] = [];

  for (const { data } of testCases) {
    const testCaseContent = JSON.stringify(data);
    jsonlLines.push(
      JSON.stringify(createModelInput(testCaseContent, config.prompt, config.criteria, config.threshold)),
    );
  }

  console.log(`Created ${jsonlLines.length} validation prompts in total.`);
  return jsonlLines;
}

export default plugin;
