$version: "2.0"

namespace com.amzn.aws.pse.genaietk.common

@documentation("A unique identifier")
@length(min: 1, max: 128)
@pattern("^[A-Za-z0-9:-]+$")
string Uuid

@documentation("Resource identifier for SDK v2 APIs")
@length(min: 1, max: 64)
string ResourceId

@documentation("Job identifier for Step Functions executions (supports underscores and hyphens)")
@length(min: 1, max: 256)
@pattern("^[A-Za-z0-9_-]+$")
string JobId

@documentation("An S3 Url")
@pattern("^s3:\\/\\/[a-z0-9][a-z0-9\\-\\.]{1,61}[a-z0-9]\\/[^\\s]*$")
string S3Path

// Max size for base64-encoded DynamoDB ExclusiveStartKey pagination tokens.
// 32 KB is deliberately generous — real tokens are ~200 bytes.
@documentation("Opaque pagination token returned by list operations")
@length(min: 1, max: 32768)
string PaginationToken

@documentation("An array of strings")
list StringList {
    member: String
}

@pattern("^(\\d+|latest|head)$")
string VersionString

@documentation("Context for SQS-related requests for tracking and debugging")
structure AsyncContext {
    messageId: String
    requestId: String
}
