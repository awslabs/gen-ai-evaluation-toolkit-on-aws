import {
  defineGenerator,
  S3ReferenceModel,
  getS3ObjectContent,
  listS3PrefixObjects,
  writeS3Object,
} from '@genai-etk/plugin-gen-sdk';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { z } from 'zod';
import assert from 'assert';
import path from 'path';
import type { Readable } from 'stream';
import {
  createBedrockBatchJob,
  createModelInput,
  waitUntilJobTerminates,
  parseJobResponseTestCases,
  getEnvVariable,
} from './helpers';
import { Defaults, EnvVariable } from './constants';

const RAGConfigSchema = z.object({
  documentSource: S3ReferenceModel,

  chunk: z
    .object({
      size: z.number().positive().default(Defaults.chunkSize),
      overlap: z.number().nonnegative().default(Defaults.chunkOverlap),
    })
    .default({}),

  question: z
    .object({
      model: z.string().default(Defaults.model),
      questionsPerChunk: z.number().default(Defaults.questionsPerChunk),
      prompt: z.string().default(Defaults.prompt),
    })
    .default({}),
});

type RAGConfig = z.infer<typeof RAGConfigSchema>;

const plugin = defineGenerator({
  name: 'RAGGenerator',
  configSchema: RAGConfigSchema,

  generate: async function* (config, ctx) {
    const internalS3Bucket = getEnvVariable(EnvVariable.INTERNAL_S3_BUCKET);

    // Step 1: Chunk documents into JSONL
    await ctx.reportProgress('Reading and chunking documents...');
    const jsonlLines = await chunkDocuments(config);
    assert(jsonlLines.length > 0, 'No chunks were generated');
    assert(jsonlLines.length >= 100, 'Cannot invoke batch job with less than 100 chunks');

    // Step 2: Write chunks to S3
    const chunksKey = `chunks/${ctx.runId}.jsonl`;
    const jsonlContent = jsonlLines.join('\n');
    await writeS3Object(internalS3Bucket, chunksKey, jsonlContent);
    console.log(`Wrote ${jsonlLines.length} chunks to ${chunksKey}`);

    await ctx.reportProgress(`Created ${jsonlLines.length} chunks for processing`);

    // Step 3: Start Bedrock batch job
    const inputS3Uri = `s3://${internalS3Bucket}/${chunksKey}`;
    const outputPrefix = `outputs/${ctx.runId}`;
    const outputS3Uri = `s3://${internalS3Bucket}/${outputPrefix}/`;

    const jobArn = await createBedrockBatchJob(ctx.runId, inputS3Uri, outputS3Uri, config.question.model);
    console.log(`Bedrock batch job created: ${jobArn}`);

    await ctx.reportProgress('Bedrock batch job started');

    // Step 4: Wait for job completion
    await waitUntilJobTerminates(jobArn, (status) => ctx.reportProgress(`Batch job status: ${status}`));

    await ctx.reportProgress('Batch job completed, parsing results...');

    // Step 5: Parse and yield test cases
    const jobArnParts = jobArn.split('/');
    const jobId = jobArnParts[jobArnParts.length - 1] ?? '';
    const jobOutputPath = path.join(outputPrefix, jobId, `${ctx.runId}.jsonl.out`);
    const body = await getS3ObjectContent(internalS3Bucket, jobOutputPath);
    assert(body != null, 'Job output not found');

    for await (const testCase of parseJobResponseTestCases(body as Readable)) {
      yield testCase;
    }
  },
});

async function chunkDocuments(config: RAGConfig): Promise<string[]> {
  const { documentSource, chunk: chunkConfig, question: questionConfig } = config;
  const jsonlLines: string[] = [];

  for await (const { Key: key } of listS3PrefixObjects(documentSource.bucket, documentSource.prefix)) {
    if (!key) continue;
    console.log(`Processing: ${key}`);

    const objectBody = await getS3ObjectContent(documentSource.bucket, key);
    const content = await objectBody?.transformToString();
    if (!content) {
      console.warn(`Empty file: ${key}`);
      continue;
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: chunkConfig.size,
      chunkOverlap: chunkConfig.overlap,
    });
    const chunks = await splitter.splitText(content);

    for (const chunk of chunks) {
      jsonlLines.push(JSON.stringify(createModelInput(chunk, questionConfig.prompt, questionConfig.questionsPerChunk)));
    }

    console.log(`Split ${key} into ${chunks.length} chunks`);
  }

  console.log(`Total chunks: ${jsonlLines.length}`);
  return jsonlLines;
}

export default plugin;
