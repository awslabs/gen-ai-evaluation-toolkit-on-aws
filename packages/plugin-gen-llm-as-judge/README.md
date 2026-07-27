# GenAI-ETK Test Case Validation Plugin

## Introduction

The GenAI-ETK Test Case Validation Plugin is a specialized tool designed to validate question-answer pairs using Amazon Bedrock's generative AI capabilities. It analyzes test cases from source documents and evaluates them against specified criteria to ensure they meet quality standards for educational assessments, training materials, or AI model evaluation.

This plugin processes test cases stored in S3 and uses Claude 3 Haiku by default to validate the quality and accuracy of question-answer pairs based on configurable criteria.

## Architecture

The plugin follows a straightforward processing pipeline:

1. **Input Processing**: Reads source documents from a specified S3 location
2. **Prompt Creation**: Creates prompts for each document to be processed by the LLM
3. **Batch Job Creation**: Creates an Amazon Bedrock batch job to process all documents
4. **AI Processing**: Each document is processed by Claude 3 Haiku by default to validate question-answer pairs against specified criteria
5. **Output Filtering**: Only valid test cases that meet the threshold criteria are written to the output location
6. **Event Notifications**: Progress and completion events are emitted throughout the process

## Interface

### Input Configuration

The plugin expects a trigger event with the following structure:

```typescript
{
  taskToken: string,
  id: string,
  
  input: {
    bucket: string,
    prefix: string
  },
  
  output: {
    bucket: string,
    prefix: string
  },
  
  internalS3Bucket: string,
  bedrockRoleArn: string,
  
  configuration: {
    model: string,  // Default: "anthropic.claude-3-haiku-20240307-v1:0"
    criteria: string[],  // Default: ["Question must be answerable from the provided context", 
                        //           "Answer must be accurate and complete", 
                        //           "Question should be clear and unambiguous"]
    prompt: string,  // Default: JUDGMENT_PROMPT from constants.ts
    threshold: number  // Default: 0.8 - Minimum score for a test case to be considered valid
  }
}
```

### Required Permissions

The plugin requires:

1. **S3 Permissions**:
   - Read access to the source document bucket
   - Read/write access to the internal bucket
   - Write access to the output bucket

2. **Bedrock Permissions**:
   - Permission to create and monitor batch jobs
   - The provided `bedrockRoleArn` must have permissions to access the specified S3 buckets

3. **EventBridge Permissions**:
   - Permission to emit events to the configured event bus

### Environment Variables

- `EVENT`: Contains the JSON-formatted trigger event
- `EVENT_BUS`: Name of the EventBridge event bus for progress notifications

## Output Format

The plugin filters test cases and only writes valid ones to the specified output location. Each file represents a validated test case:

```typescript
{
  "input": string,  // The question
  "expected": string,  // The answer
  "context": string[]  // The document chunk that was used to validate this test case
}
```

Files are named sequentially as `test-case-000000.json`, `test-case-000001.json`, etc.

## Validation Process

The plugin uses Claude 3 Haiku by default to evaluate each test case against the specified criteria. The validation process:

1. Analyzes the question-answer pair in context
2. Evaluates against all specified criteria
3. Marks the test case as valid only if it meets all criteria
4. Only valid test cases are included in the output

## Limitations and Error Cases

### Minimum Requirements

- **Chunk Count**: The plugin requires at least 100 chunks to be generated from the input documents. If fewer chunks are generated, the plugin will throw an error.
- **Content Requirements**: Source documents must contain sufficient content for validation.

### Common Error Cases

1. **Missing or Invalid Configuration**:
   - Missing `EVENT` environment variable
   - Invalid JSON in the `EVENT` environment variable
   - Missing required fields in the configuration

2. **S3 Access Issues**:
   - Source bucket or prefix doesn't exist
   - Insufficient permissions to read source documents
   - Insufficient permissions to write to output location

3. **Content Processing Errors**:
   - Empty or null content in source documents
   - Insufficient content to generate the minimum required chunks (100)

4. **Bedrock Job Failures**:
   - Insufficient permissions for the provided `bedrockRoleArn`
   - Model availability issues
   - Job termination with status other than `COMPLETED`
   - Chosen model is not approved for AWS account

5. **Output Processing Errors**:
   - Invalid or unparseable responses from the model
   - Failure to write test cases to the output location

### Performance Considerations

- **Large Documents**: Processing very large documents may take significant time
- **Concurrency**: The plugin processes up to 50 output files concurrently
- **Polling Interval**: The plugin checks job status every 30 seconds by default

## Best Practices

1. **Criteria Definition**:
   - Define clear, specific validation criteria
   - Include criteria for both question quality and answer accuracy
   - Consider domain-specific requirements

2. **Configuration Tuning**:
   - Adjust chunk size and overlap based on document structure
   - Customize the prompt to focus on specific validation aspects
   - Set appropriate threshold based on quality requirements

3. **Monitoring**:
   - Monitor progress events to track job status
   - Check for completion events to confirm successful processing

4. **Error Handling**:
   - Implement retry logic for transient failures
   - Validate output to ensure quality of filtered test cases
