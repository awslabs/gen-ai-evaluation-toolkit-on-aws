$version: "2"

namespace com.amzn.aws.pse.genaietk.experiment.operation

use com.amzn.aws.pse.genaietk.common#StringList
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.experimentation.entity#ExperimentOutputList
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use com.amzn.aws.pse.genaietk.mixin#RequestWithExperimentName
use smithy.framework#ValidationException

@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "outputs")
@documentation("Lists available dataset versions for the requested experiment.")
@http(method: "POST", uri: "/experiments/{name}/outputs")
operation ListExperimentOutputs {
    input: ListExperimentOutputsRequest
    output: ListExperimentOutputsResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure ListExperimentOutputsRequest with [PaginatedInput, RequestWithExperimentName] {
    @documentation("input workflow configurations to return")
    input: WorkflowList

    @documentation("output workflow metrics to return")
    output: StringList

    @documentation("start version to filter")
    @required
    startVersion: Integer

    @documentation("end version to filter")
    @required
    endVersion: Integer
}

@output
structure ListExperimentOutputsResponse with [PaginatedOutput] {
    @documentation("An ID for the experiment")
    @required
    id: String

    @documentation("Output List")
    @required
    outputs: ExperimentOutputList
}

@documentation("Types of workflows that can be configured in an experiment")
enum Workflow {
    @documentation("Evaluation workflow for testing models")
    EVALUATION = "Evaluation"

    @documentation("Generation workflow for creating synthetic data")
    GENERATION = "Generation"
}

@documentation("List of workflow types")
list WorkflowList {
    member: Workflow
}
