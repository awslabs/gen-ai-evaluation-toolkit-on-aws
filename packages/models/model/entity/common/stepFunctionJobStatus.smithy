$version: "2.0"

namespace com.amzn.aws.pse.genaietk.common.entity

@documentation("Status of asynchronous jobs executed via AWS Step Functions")
enum StepFunctionJobStatus {
    @documentation("Job is currently executing")
    RUNNING

    @documentation("Job completed successfully")
    SUCCEEDED

    @documentation("Job failed due to an error")
    FAILED

    @documentation("Job exceeded maximum execution time")
    TIMED_OUT

    @documentation("Job was manually stopped or cancelled")
    ABORTED

    @documentation("Job is waiting to be redriven after a failure")
    PENDING_REDRIVE
}
