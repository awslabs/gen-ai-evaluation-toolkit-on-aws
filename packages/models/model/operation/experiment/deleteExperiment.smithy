$version: "2"

namespace com.amzn.aws.pse.genaietk.experiment.operation

use com.amzn.aws.pse.genaietk.error#ConflictException
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithExperimentName
use smithy.framework#ValidationException

@documentation("Deletes an experiment")
@idempotent
@http(method: "DELETE", uri: "/experiments/{name}", code: 204)
operation DeleteExperiment {
    input: DeleteExperimentRequest
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ConflictException
    ]
}

@input
structure DeleteExperimentRequest with [RequestWithExperimentName] {}
