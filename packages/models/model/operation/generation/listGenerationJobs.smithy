$version: "2"

namespace com.amzn.aws.pse.genaietk.generation.operation

use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.generation.entity#GenerationJobList
use com.amzn.aws.pse.genaietk.mixin#FilterByJobStatus
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use smithy.framework#ValidationException

@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "jobs")
@readonly
@documentation("Lists generation jobs with optional filtering")
@http(method: "GET", uri: "/generation-jobs")
operation ListGenerations {
    input: ListGenerationsInput
    output: ListGenerationsOutput
    errors: [
        ValidationException
        ThrottlingException
    ]
}

@input
structure ListGenerationsInput with [PaginatedInput, FilterByJobStatus] {}

/// Output structure for listing jobs
@output
structure ListGenerationsOutput with [PaginatedOutput] {
    @required
    @documentation("List of Jobs")
    jobs: GenerationJobList
}
