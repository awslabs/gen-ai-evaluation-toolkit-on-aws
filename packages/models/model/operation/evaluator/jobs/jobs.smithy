$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluator.operation

use com.amzn.aws.pse.genaietk.common#ResourceId
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use smithy.framework#ValidationException

// =============================================================================
// GetEvaluatorJob
// =============================================================================
@documentation("Get details of an evaluation job (v2)")
@readonly
@http(method: "GET", uri: "/v2/jobs/{jobId}")
operation GetEvaluatorJob {
    input: GetEvaluatorJobInput
    output: GetEvaluatorJobOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure GetEvaluatorJobInput {
    @required
    @httpLabel
    @documentation("ID of the job")
    jobId: ResourceId
}

@output
structure GetEvaluatorJobOutput {
    @required
    @documentation("Unique identifier for this job")
    jobId: ResourceId

    @required
    @documentation("Name of the evaluator")
    evaluatorName: String

    @required
    @documentation("Type of job")
    jobType: JobType

    @required
    @documentation("Overall job status — computed from task states")
    status: JobStatus

    @required
    @documentation("Report ID where results are stored")
    reportId: ResourceId

    @documentation("Source report ID to copy results from for re-scoring (creates a new report)")
    sourceReportId: ResourceId

    @documentation("Scorer configurations used for this job (keyed by scorer name)")
    scorers: ScorerMap

    @documentation("App invocation configuration used for this job")
    app: AppConfig

    @required
    @documentation("Per-task status and configuration")
    tasks: TaskMap

    @required
    @documentation("Current processing stage of the job")
    stage: JobStage

    @documentation("Result data. Present only when the job completes successfully.")
    result: Document

    @documentation("Error details. Present only when the job fails.")
    error: JobError

    @documentation("Experiment name for grouping related jobs and reports")
    experimentName: String

    @documentation("Timestamp when the job was created")
    @timestampFormat("date-time")
    createdAt: Timestamp

    @documentation("Timestamp when the job was last updated")
    @timestampFormat("date-time")
    updatedAt: Timestamp
}

// =============================================================================
// ListJobs
// =============================================================================
@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "jobs")
@documentation("List all evaluation jobs")
@readonly
@http(method: "GET", uri: "/v2/jobs")
operation ListJobs {
    input: ListJobsInput
    output: ListJobsOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
    ]
}

@input
structure ListJobsInput with [PaginatedInput] {}

@output
structure ListJobsOutput with [PaginatedOutput] {
    @required
    @documentation("List of jobs")
    jobs: EvaluatorJobSummaryList
}

// =============================================================================
// UpdateEvaluatorJobStatus
// =============================================================================
@documentation("Update the status of an evaluation job (v2)")
@idempotent
@http(method: "PUT", uri: "/v2/jobs/{jobId}/status")
operation UpdateEvaluatorJobStatus {
    input: UpdateEvaluatorJobStatusInput
    output: UpdateEvaluatorJobStatusOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure UpdateEvaluatorJobStatusInput {
    @required
    @httpLabel
    @documentation("ID of the job")
    jobId: ResourceId

    @required
    @documentation("New task status")
    status: TaskStatus

    @documentation("Current processing stage of the job")
    stage: JobStage

    @documentation("Result data (required when status=COMPLETED)")
    result: Document

    @documentation("Error details (required when status=FAILED)")
    error: JobError

    @documentation("Orchestration context — present for SFN-orchestrated tasks, absent for local SDK calls")
    orchestration: OrchestrationContext

    @documentation("Checkpoint data for resume flow (inline_testcase_index, last_evaluated_key, welford)")
    checkpoint: Document
}

@output
structure UpdateEvaluatorJobStatusOutput {
    @required
    @documentation("The job ID")
    jobId: ResourceId

    @required
    @documentation("The updated task status")
    status: TaskStatus

    @documentation("Timestamp when the job was updated")
    @timestampFormat("date-time")
    updatedAt: Timestamp
}
