$version: "2"

namespace com.amzn.aws.pse.genaietk.experiment.operation

use com.amzn.aws.pse.genaietk.error#ConflictException
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.experimentation.entity#ExperimentMixin
use com.amzn.aws.pse.genaietk.experimentation.entity#ExperimentRequest
use smithy.framework#ValidationException

@documentation("Updates an existing experiment")
@http(method: "PATCH", uri: "/experiments/{name}")
operation UpdateExperiment {
    input: UpdateExperimentRequest
    output: UpdateExperimentResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ConflictException
    ]
}

@input
structure UpdateExperimentRequest with [ExperimentRequest] {
    @documentation("New name of the experiment")
    newName: String

    @httpLabel
    name: String
}

@output
structure UpdateExperimentResponse with [ExperimentMixin] {}
