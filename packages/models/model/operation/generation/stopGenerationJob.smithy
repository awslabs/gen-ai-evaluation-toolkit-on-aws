$version: "2"

namespace com.amzn.aws.pse.genaietk.generation.operation

use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.generation.entity#GenerationJobDetails
use com.amzn.aws.pse.genaietk.generation.entity#GenerationJobErrorContext
use com.amzn.aws.pse.genaietk.mixin#RequestWithJobId
use smithy.framework#ValidationException

@documentation("Stops the generation job")
@http(method: "POST", uri: "/generation-jobs/{id}/stop")
@idempotent
operation StopGeneration {
    input: StopGenerationInput
    output: StopGenerationOutput
    errors: [
        ValidationException
        ResourceNotFoundException
        ThrottlingException
    ]
}

@input
structure StopGenerationInput with [RequestWithJobId, GenerationJobErrorContext] {}

@output
structure StopGenerationOutput with [GenerationJobDetails] {}
