$version: "2"

namespace com.amzn.aws.pse.genaietk.experimentation.operation

use com.amzn.aws.pse.genaietk.error#ConflictException
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.experimentation.entity#ConfigurationDetail
use smithy.framework#ValidationException

@idempotent
@documentation("Updates the supplied workflow configuration.")
@http(method: "PUT", uri: "/configurations")
operation UpdateConfiguration {
    input: UpdateConfigurationRequest
    output: UpdateConfigurationResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ConflictException
        ResourceNotFoundException
    ]
}

@input
structure UpdateConfigurationRequest {
    @documentation("Configuration of the workflow")
    @required
    configuration: ConfigurationDetail
}

@output
structure UpdateConfigurationResponse {
    @documentation("Configuration of the workflow")
    @required
    configuration: ConfigurationDetail
}
