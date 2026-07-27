$version: "2"

namespace com.amzn.aws.pse.genaietk.experiment.operation

use com.amzn.aws.pse.genaietk.error#ConflictException
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.experimentation.entity#ExperimentMixin
use com.amzn.aws.pse.genaietk.experimentation.entity#ExperimentRequest
use smithy.framework#ValidationException

@documentation("Creates a new experiment")
@http(method: "POST", uri: "/experiments")
operation CreateExperiment {
    input: CreateExperimentRequest
    output: CreateExperimentResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ConflictException
    ]
}

@input
structure CreateExperimentRequest with [ExperimentRequest] {}

@output
structure CreateExperimentResponse with [ExperimentMixin] {
    @documentation("An ID for the experiment")
    @required
    id: String
}
