$version: "2"

namespace com.amzn.aws.pse.genaietk.experimentation.operation

use com.amzn.aws.pse.genaietk.error#ConflictException
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.experimentation.entity#WorkflowConfigurationPayload
use smithy.framework#ValidationException

@documentation("Creates a new workflow configuration using the supplied workflow details.")
@http(method: "POST", uri: "/configurations")
operation CreateConfiguration {
    input: CreateConfigurationRequest
    output: CreateConfigurationResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ConflictException
    ]
}

@input
structure CreateConfigurationRequest with [WorkflowConfigurationPayload] {}

@output
structure CreateConfigurationResponse with [WorkflowConfigurationPayload] {}
