$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluator.operation

use com.amzn.aws.pse.genaietk.common#ResourceId
use com.amzn.aws.pse.genaietk.common#TestDataMixin
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use smithy.framework#ValidationException

// =============================================================================
// TestResult Entity
// =============================================================================
@documentation("Core data fields for a test result - reusable as mixin. A test result is a test case that has been run, so it shares the test-case core (input, expected, context, metadata) and adds the execution artifacts (output, appMetrics, error).")
@mixin
structure ResultData with [TestDataMixin] {
    @documentation("Output from app invocation")
    output: Document

    @documentation("Metrics from app invocation (latency, tokens, etc)")
    appMetrics: Document

    @documentation("Error message if app invocation failed")
    error: String
}

@documentation("Scorer name: alphanumeric and underscores only. '.' is reserved for sub-scores.")
@length(min: 1, max: 128)
@pattern("^[a-zA-Z0-9_]+$")
string ScorerName

@documentation("Map of scorer name to score output")
map ScoresMap {
    key: ScorerName
    value: ScoreOutput
}

@documentation("Output from a single scorer")
structure ScoreOutput {
    @documentation("Score value (typically 0-1)")
    value: Float

    @documentation("Human-readable explanation")
    reason: String

    @documentation("Error message if scoring failed")
    error: String

    @documentation("Optional free-form structured detail produced by the scorer (e.g. per-requirement breakdown). Not set by all scorers.")
    context: Document

    @documentation("Timestamp when score was recorded")
    @timestampFormat("date-time")
    scoredAt: Timestamp
}

@documentation("Result of evaluating a single test case")
structure TestResult with [ResultData] {
    @required
    @documentation("Unique identifier for this result")
    resultId: ResourceId

    @required
    @documentation("Report this result belongs to")
    reportId: ResourceId

    @documentation("Optional reference to source test case")
    testcaseId: ResourceId

    @documentation("Scores from evaluators, keyed by scorer name")
    scores: ScoresMap

    @documentation("Timestamp when result was created")
    @timestampFormat("date-time")
    createdAt: Timestamp

    @documentation("Timestamp when result was last updated")
    @timestampFormat("date-time")
    updatedAt: Timestamp
}

// =============================================================================
// Common batch error structure
// =============================================================================
@documentation("Error for a single item in a batch operation")
structure BatchItemError {
    @required
    @documentation("Identifier linking this error back to the request item (index for creates, resultId for updates)")
    id: String

    @required
    @documentation("Error code")
    code: String

    @required
    @documentation("Human-readable error message")
    message: String

    @documentation("Zero-based index of the failed item in the original request array (present for batch create)")
    index: Integer
}

list BatchItemErrorList {
    member: BatchItemError
}

// =============================================================================
// GetTestResult
// =============================================================================
@documentation("Get a single test result by ID")
@readonly
@http(method: "GET", uri: "/v2/reports/{reportId}/results/{resultId}")
operation GetTestResult {
    input: GetTestResultInput
    output: GetTestResultOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure GetTestResultInput {
    @required
    @httpLabel
    @documentation("ID of the report containing the result")
    reportId: ResourceId

    @required
    @httpLabel
    @documentation("ID of the result to retrieve")
    resultId: ResourceId
}

@output
structure GetTestResultOutput {
    @required
    @documentation("The requested test result")
    result: TestResult
}

// =============================================================================
// ListTestResults
// =============================================================================
@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "testResults")
@documentation("List test results within a report. Default maxResults is 50 if not specified.")
@readonly
@http(method: "GET", uri: "/v2/reports/{reportId}/results")
operation ListTestResults {
    input: ListTestResultsInput
    output: ListTestResultsOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure ListTestResultsInput with [PaginatedInput] {
    @required
    @httpLabel
    @documentation("ID of the report to list results from")
    reportId: ResourceId
}

@output
structure ListTestResultsOutput with [PaginatedOutput] {
    @required
    @documentation("List of test results")
    testResults: TestResultList
}

list TestResultList {
    member: TestResult
}

// =============================================================================
// BatchCreateResults
// =============================================================================
@documentation("Create multiple test results in a batch. Returns 200 with separate success and error lists even if some items fail.")
@http(method: "POST", uri: "/v2/reports/{reportId}/results/batch")
operation BatchCreateResults {
    input: BatchCreateResultsInput
    output: BatchCreateResultsOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure BatchCreateResultsInput {
    @required
    @httpLabel
    @documentation("ID of the report to add results to")
    reportId: ResourceId

    @required
    @documentation("List of results to create")
    results: BatchResultInputList
}

@documentation("Input for a single result in batch create")
structure BatchResultInput with [ResultData] {
    @documentation("Client-provided result ID. If omitted, the server generates one.")
    resultId: ResourceId

    @documentation("Optional reference to source test case")
    testcaseId: ResourceId
}

@length(min: 1, max: 25)
list BatchResultInputList {
    member: BatchResultInput
}

@output
structure BatchCreateResultsOutput {
    @required
    @documentation("Successfully created results with their IDs")
    results: BatchResultOutputList

    @required
    @documentation("Errors for items that failed to create")
    errors: BatchItemErrorList

    @required
    @documentation("Number of results successfully created")
    count: Integer
}

@documentation("Output for a single result in batch create")
structure BatchResultOutput {
    @required
    @documentation("ID of the created result")
    resultId: ResourceId

    @documentation("Test case ID if provided")
    testcaseId: ResourceId

    @required
    @documentation("Zero-based index of this item in the original request array")
    index: Integer
}

list BatchResultOutputList {
    member: BatchResultOutput
}

// =============================================================================
// BatchUpdateScores
// =============================================================================
@documentation("Add scores to multiple results in a batch. Returns 200 with separate success and error lists even if some items fail.")
@http(method: "POST", uri: "/v2/reports/{reportId}/results/scores/batch")
operation BatchUpdateScores {
    input: BatchUpdateScoresInput
    output: BatchUpdateScoresOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure BatchUpdateScoresInput {
    @required
    @httpLabel
    @documentation("ID of the report containing the results")
    reportId: ResourceId

    @required
    @documentation("List of score updates")
    items: BatchScoreItemList
}

@documentation("Score update for a single result")
structure BatchScoreItem {
    @required
    @documentation("ID of the result to update")
    resultId: ResourceId

    @required
    @documentation("Scores to add, keyed by scorer name")
    scores: ScoreInputMap
}

@length(min: 1, max: 25)
list BatchScoreItemList {
    member: BatchScoreItem
}

@documentation("Score input for batch update")
structure ScoreInput {
    @documentation("Score value (typically 0-1)")
    value: Float

    @documentation("Human-readable explanation")
    reason: String

    @documentation("Error message if scoring failed")
    error: String

    @documentation("Optional free-form structured detail produced by the scorer (e.g. per-requirement breakdown). Not set by all scorers.")
    context: Document
}

map ScoreInputMap {
    key: ScorerName
    value: ScoreInput
}

@output
structure BatchUpdateScoresOutput {
    @required
    @documentation("Number of results successfully updated")
    updatedCount: Integer

    @required
    @documentation("Errors for items that failed to update")
    errors: BatchItemErrorList
}

// =============================================================================
// BatchDeleteResults
// =============================================================================
@documentation("Delete multiple test results by ID. Returns 200 with separate success count and error lists even if some items fail.")
@http(method: "POST", uri: "/v2/reports/{reportId}/results/delete/batch")
operation BatchDeleteResults {
    input: BatchDeleteResultsInput
    output: BatchDeleteResultsOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure BatchDeleteResultsInput {
    @required
    @httpLabel
    @documentation("ID of the report containing the results")
    reportId: ResourceId

    @required
    @documentation("List of result IDs to delete")
    resultIds: ResourceIdList
}

@length(min: 1, max: 25)
list ResourceIdList {
    member: ResourceId
}

@output
structure BatchDeleteResultsOutput {
    @required
    @documentation("Number of results successfully deleted")
    deletedCount: Integer

    @required
    @documentation("Errors for items that failed to delete")
    errors: BatchItemErrorList
}
