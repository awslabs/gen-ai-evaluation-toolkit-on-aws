# GenAI-ETK Test Case Generation Plugin

## Introduction

The GenAI-ETK Test Case Generation Plugin is a specialized tool designed to automatically generate question-answer pairs from source documents. It leverages Amazon Bedrock's generative AI capabilities to analyze document content and create high-quality test cases that can be used for educational assessments, training materials, or AI model evaluation.

This plugin processes documents stored in S3, chunks them into manageable segments, and uses Claude 3 Haiku by default to generate contextually relevant questions and answers based on the document content.

## Architecture

The plugin follows a straightforward processing pipeline:

1. **Input Processing**: Reads source documents from a specified S3 location
2. **Document Chunking**: Splits documents into smaller chunks with configurable size and overlap using RecursiveCharacterTextSplitter
3. **Batch Job Creation**: Creates an Amazon Bedrock batch job to process all chunks
4. **AI Processing**: Each chunk is processed by Claude 3 Haiku by default to generate question-answer pairs
5. **Output Formatting**: Results are parsed, formatted as test cases, and written to the specified S3 output location
6. **Event Notifications**: Progress and completion events are emitted throughout the process

## Interface

### Input Configuration

The plugin expects a trigger event with the following structure:

```typescript
{
  taskToken: string,
  id: string,
  
  output: {
    bucket: string,
    prefix: string
  },
  
  internalS3Bucket: string,
  bedrockRoleArn: string,
  
  configuration: {
    documentSource: {
      bucket: string,
      prefix: string
    },
    
    chunk: {
      size: number,  // Default: 1024
      overlap: number  // Default: 128
    },
    
    question: {
      model: string,  // Default: "anthropic.claude-3-haiku-20240307-v1:0"
      questionsPerChunk: number,  // Default: 3
      prompt: string  // Default: "You are a Teacher/Professor. Your task is to setup question answer pairs..."
    }
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

The plugin generates individual JSON files in the specified output location, with each file representing a test case:

```typescript
{
  "input": string,  // The question
  "expected": string,  // The answer
  "context": string[]  // The document chunk that was used to generate this test case
}
```

Files are named sequentially as `test-case-000000.json`, `test-case-000001.json`, etc.

## Limitations and Error Cases

### Minimum Requirements

- **Chunk Count**: The plugin requires at least 100 chunks to be generated from the input documents. If fewer chunks are generated, the plugin will throw an error.
- **Content Requirements**: Source documents must contain sufficient content to generate meaningful test cases.

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

1. **Document Preparation**:
   - Ensure documents are well-structured and contain meaningful content
   - Consider pre-processing documents to remove irrelevant sections

2. **Configuration Tuning**:
   - Adjust chunk size and overlap based on document structure
   - Customize the prompt to generate specific types of questions
   - Set appropriate `questionsPerChunk` based on document density

3. **Monitoring**:
   - Monitor progress events to track job status
   - Check for completion events to confirm successful processing

4. **Error Handling**:
   - Implement retry logic for transient failures
   - Validate output to ensure quality of generated test cases
