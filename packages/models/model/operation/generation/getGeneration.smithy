$version: "2"

namespace com.amzn.aws.pse.genaietk.generation.operation

use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.generation.entity#GenerationJobDetails
use com.amzn.aws.pse.genaietk.mixin#RequestWithJobId
use smithy.framework#ValidationException

@documentation("Gets generation job details")
@http(method: "GET", uri: "/generation-jobs/{id}")
@readonly
operation GetGeneration {
    input: GetGenerationInput
    output: GetGenerationOutput
    errors: [
        ValidationException
        ResourceNotFoundException
        ThrottlingException
    ]
}

@input
structure GetGenerationInput with [RequestWithJobId] {}

@output
structure GetGenerationOutput with [GenerationJobDetails] {}
