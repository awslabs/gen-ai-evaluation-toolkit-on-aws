$version: "2"

namespace com.amzn.aws.pse.genaietk.experimentation.operation

use com.amzn.aws.pse.genaietk.error#ConflictException
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.experimentation.entity#ConfigurationDetail
use smithy.framework#ValidationException

@readonly
@documentation("Gets the details of the requested workflow configuration.")
@http(method: "GET", uri: "/configurations/{name}")
operation GetConfiguration {
    input: GetConfigurationRequest
    output: GetConfigurationResponse
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
structure GetConfigurationRequest {
    @documentation("Name of the configuration")
    @httpLabel
    @required
    name: String

    @documentation("Version of the configuration")
    @httpQuery("version")
    version: Integer
}

@output
structure GetConfigurationResponse {
    @documentation("Configuration of the workflow")
    @required
    configuration: ConfigurationDetail
}
