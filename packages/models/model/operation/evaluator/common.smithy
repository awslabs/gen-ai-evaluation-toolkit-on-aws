$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluator.operation

use com.amzn.aws.pse.genaietk.common#ResourceId
use com.amzn.aws.pse.genaietk.common#TestDataMixin
use com.amzn.aws.pse.genaietk.datastore.entity#AnnotationConditionExpression

// =============================================================================
// Shared types
// =============================================================================
@documentation("Type of evaluation job (v2)")
enum JobType {
    @documentation("Full evaluation: fetch testcases, invoke app, score, record results")
    FULL

    @documentation("Scoring only: score existing results in a report")
    SCORE

    @documentation("App invocation only: fetch testcases, invoke app, record results (no scoring)")
    APP_INVOKE
}

@documentation("Overall status of an evaluation job — computed from task states, never stored directly")
enum JobStatus {
    @documentation("Job submitted, no tasks started yet")
    PENDING

    @documentation("At least one task is in progress")
    RUNNING

    @documentation("All tasks completed successfully")
    SUCCESS

    @documentation("Primary succeeded but some scorers failed — partial results are useful")
    PARTIAL_FAILURE

    @documentation("Primary task failed, or all scorers failed")
    FAILURE
}

@documentation("Status of an individual task within a job")
enum TaskStatus {
    @documentation("Task not yet dispatched")
    PENDING

    @documentation("Worker is processing")
    RUNNING

    @documentation("Task finished successfully")
    COMPLETED

    @documentation("Task finished with error")
    FAILED
}

@documentation("Current processing stage of a job (v2)")
enum JobStage {
    @documentation("Job created, awaiting execution")
    PENDING

    @documentation("Invoking the application under test")
    INVOKING

    @documentation("Scoring the results")
    SCORING

    @documentation("All processing complete")
    COMPLETE
}

@documentation("Error information for a failed job (v2)")
structure JobError {
    @required
    @documentation("Error code")
    code: String

    @required
    @documentation("Error message")
    message: String

    @documentation("Optional stack trace")
    stackTrace: String
}

@sparse
@documentation("Which scorers to run and with what parameters, keyed by scorer name. Null value = run with defaults. These are configurations, not score results — actual scores are stored on individual test results.")
map ScorerMap {
    key: String
    value: ScorerConfig
}

@documentation("Configuration for a scorer — optional params, optional sub-scores, optional evaluator override")
structure ScorerConfig {
    @documentation("Scorer-specific parameters (opaque to server)")
    params: Document

    @documentation("Sub-scores to run. Null value = use sub-score defaults.")
    scores: SubScoreMap

    @documentation("Evaluator worker to run this scorer. Defaults to the path evaluator if omitted.")
    evaluatorName: String
}

@sparse
@documentation("Map of sub-score name to parameters. Null value = use defaults.")
map SubScoreMap {
    key: String
    value: Document
}

@documentation("Reference to a dataset in the datastore (v2)")
structure DatasetReference {
    @required
    @documentation("Dataset ID to evaluate")
    datasetId: String

    @documentation("Dataset version (defaults to 'head' if not specified)")
    datasetVersion: String

    @documentation("Annotation filter to apply when fetching test cases — only test cases matching the condition will be included in the evaluation")
    filter: AnnotationConditionExpression
}

@documentation("Inline test case for direct submission (v2) — input to invoke an app")
structure InlineTestCase with [TestDataMixin] {}

@documentation("List of inline test cases (v2)")
list InlineTestCaseList {
    member: InlineTestCase
}

@documentation("Inline test result for scoring — a test case that already has an output")
structure InlineTestResult with [TestDataMixin] {
    @documentation("Output from app invocation (the thing being scored)")
    output: Document
}

@documentation("List of inline test results (v2)")
list InlineTestResultList {
    member: InlineTestResult
}

@documentation("Source of test data - either a dataset reference or inline test cases (v2)")
union TestDataSource {
    @documentation("Reference to an existing dataset in the datastore")
    dataset: DatasetReference

    @documentation("Inline test cases provided directly in the request")
    inline: InlineTestCaseList
}

@documentation("An evaluation job tracked in DynamoDB (v2)")
structure EvaluationJob {
    @required
    @documentation("Unique identifier for this job")
    jobId: ResourceId

    @required
    @documentation("Name of the evaluator this job is for")
    evaluatorName: String

    @required
    @documentation("Type of job: FULL (app invoke + scoring), SCORE (scoring only), or APP_INVOKE (invocation only)")
    jobType: JobType

    @documentation("Source of test cases for evaluation")
    testCases: TestDataSource

    @required
    @documentation("Report ID where results will be stored")
    reportId: ResourceId

    @documentation("Source report ID to copy results from for re-scoring (creates a new report)")
    sourceReportId: ResourceId

    scorers: ScorerMap

    @documentation("Experiment name for grouping related jobs and reports")
    experimentName: String

    @documentation("Timestamp when the job was created")
    @timestampFormat("date-time")
    createdAt: Timestamp
}

// =============================================================================
// Shared mixins for job submission operations
// =============================================================================
@mixin
structure SubmitJobInputMixin {
    @documentation("Name for the auto-created report (ignored if reportId is provided)")
    reportName: String

    @documentation("Experiment name for grouping related jobs and reports")
    experimentName: String

    @documentation("When true, the caller will process the job locally — suppresses EventBridge event emission")
    @default(false)
    processLocally: Boolean

    @documentation("Buffer time in milliseconds before Lambda timeout to trigger CONTINUE checkpoint. Internal testing/tuning parameter — not for end-user use.")
    @range(min: 1000, max: 900000)
    @default(60000)
    continueBufferMs: Integer

    @documentation("Heartbeat timeout in seconds for Step Functions task states. The evaluator must send a heartbeat within this interval or the task is marked as timed out.")
    @range(min: 30, max: 86400)
    @default(300)
    heartbeatSeconds: Integer
}

@mixin
structure SubmitJobOutputMixin {
    @required
    @documentation("Unique identifier assigned to this job")
    jobId: ResourceId

    @required
    @documentation("Report ID where results will be stored")
    reportId: ResourceId

    @documentation("Source report ID (if copy-and-score was requested)")
    sourceReportId: ResourceId

    @required
    @documentation("Name of the evaluator the job was submitted to")
    evaluatorName: String

    @required
    @documentation("Type of job")
    jobType: JobType

    @required
    @documentation("Initial status of the job — always PENDING on submission")
    status: JobStatus

    @documentation("Experiment name for grouping related jobs and reports")
    experimentName: String

    @documentation("Timestamp when the job was created")
    @timestampFormat("date-time")
    createdAt: Timestamp

    @required
    @documentation("The full job object - use this for local testing with evaluator.evaluate()")
    job: EvaluationJob
}

// =============================================================================
// Job summary (for list responses)
// =============================================================================
@documentation("Summary of an evaluation job for list responses (v2)")
structure EvaluatorJobSummary {
    @required
    @documentation("Job ID")
    jobId: ResourceId

    @required
    @documentation("Job type")
    jobType: JobType

    @required
    @documentation("Overall job status — computed from task states")
    status: JobStatus

    @required
    @documentation("Report ID")
    reportId: ResourceId

    @documentation("Timestamp when the job was created")
    @timestampFormat("date-time")
    createdAt: Timestamp

    @documentation("Timestamp when the job was last updated")
    @timestampFormat("date-time")
    updatedAt: Timestamp
}

list EvaluatorJobSummaryList {
    member: EvaluatorJobSummary
}

// =============================================================================
// Multi-evaluator orchestration types
// =============================================================================
@documentation("Configuration for app invocation — name selection, runtime parameters, and optional evaluator override")
structure AppConfig {
    @documentation("Name of the app_invoke function to use (optional if evaluator has only one)")
    name: String

    @documentation("App-specific parameters (opaque to server, passed to app_invoke function)")
    params: Document

    @documentation("Evaluator worker for app invocation. Defaults to path evaluator if omitted.")
    evaluatorName: String
}

@documentation("Orchestration context for SFN-orchestrated task updates. Present = orchestrated task, absent = local SDK call.")
structure OrchestrationContext {
    @required
    @documentation("Task key identifying which task within the job (e.g. 'app_invoke', 'score:llm_as_judge', 'post_process')")
    taskKey: String

    @required
    @documentation("Step Functions task token for callback")
    taskToken: String
}

@documentation("State of an individual task within a job's tasks map")
structure TaskState {
    @required
    @documentation("Current status of this task")
    status: TaskStatus

    @documentation("Evaluator worker handling this task")
    evaluatorName: String

    @documentation("Error message if task failed")
    error: String

    @documentation("Checkpoint data for resume (inline_testcase_index, last_evaluated_key, welford state)")
    checkpoint: Document

    @documentation("Scorer configuration for this task (SCORE tasks only)")
    scorers: ScorerMap
}

@documentation("Map of task key to task state. Keys: 'full', 'app_invoke', 'copy_results', 'score:<name>', 'post_process', 'local'")
map TaskMap {
    key: String
    value: TaskState
}
