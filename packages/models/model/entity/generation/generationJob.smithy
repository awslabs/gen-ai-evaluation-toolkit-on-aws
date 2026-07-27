$version: "2"

namespace com.amzn.aws.pse.genaietk.generation.entity

use com.amzn.aws.pse.genaietk.common.entity#StepFunctionJobStatus
use com.amzn.aws.pse.genaietk.mixin#ExperimentTracking

@mixin
@documentation("Complete details of a generation job including input, status, and output")
structure GenerationJobDetails with [GenerationJobInput, GenerationJobSummary] {
    @documentation("Output data from the generation job if it succeeded")
    output: Document
}

@mixin
@documentation("Input configuration for a generation job")
structure GenerationJobInput with [ExperimentTracking] {
    @documentation("Ordered list of generation steps to execute")
    @required
    steps: GenerationStepList
}

@mixin
@documentation("Error information for failed generation jobs")
structure GenerationJobErrorContext {
    @documentation("Error message describing why the job failed")
    cause: String

    @documentation("Error type or category")
    error: String
}

@mixin
@documentation("Summary information about a generation job's execution")
structure GenerationJobSummary with [GenerationJobErrorContext] {
    @documentation("Unique identifier for the generation job")
    @required
    id: String

    @documentation("Current execution status of the job")
    @required
    status: StepFunctionJobStatus

    @documentation("Timestamp when the job was created and started")
    @required
    @timestampFormat("date-time")
    createdAt: Timestamp

    @documentation("Timestamp when the job completed or was stopped")
    @timestampFormat("date-time")
    stoppedAt: Timestamp
}
