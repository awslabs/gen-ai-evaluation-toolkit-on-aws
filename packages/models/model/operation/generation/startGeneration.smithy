$version: "2"

namespace com.amzn.aws.pse.genaietk.generation.operation

use com.amzn.aws.pse.genaietk.error#ExecutionLimitExceeded
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.generation.entity#GenerationJobDetails
use com.amzn.aws.pse.genaietk.generation.entity#GenerationJobInput
use smithy.framework#ValidationException

@documentation("Starts generation job with specified steps")
@http(method: "POST", uri: "/generation-jobs")
operation StartGeneration {
    input: StartGenerationInput
    output: StartGenerationOutput
    errors: [
        ValidationException
        ExecutionLimitExceeded
        ThrottlingException
    ]
}

@input
structure StartGenerationInput with [GenerationJobInput] {}

@output
structure StartGenerationOutput with [GenerationJobDetails] {}
