$version: "2"

namespace com.amzn.aws.pse.genaietk.experiment.operation

use com.amzn.aws.pse.genaietk.error#ConflictException
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.experimentation.entity#ExperimentMixin
use com.amzn.aws.pse.genaietk.mixin#RequestWithExperimentName
use smithy.framework#ValidationException

@documentation("Gets experiment details")
@readonly
@http(method: "GET", uri: "/experiments/{name}")
operation GetExperiment {
    input: GetExperimentRequest
    output: GetExperimentResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ConflictException
    ]
}

@input
structure GetExperimentRequest with [RequestWithExperimentName] {}

@output
structure GetExperimentResponse with [ExperimentMixin] {
    @documentation("An ID for the experiment")
    @required
    id: String
}
