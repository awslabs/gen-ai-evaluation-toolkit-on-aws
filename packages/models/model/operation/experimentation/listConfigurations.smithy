$version: "2"

namespace com.amzn.aws.pse.genaietk.experimentation.operation

use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.experimentation.entity#Configurations
use com.amzn.aws.pse.genaietk.mixin#FilterByCondition
use com.amzn.aws.pse.genaietk.mixin#FilterByNamePrefix
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use smithy.framework#ValidationException

@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "configurations")
@documentation("Lists workflow configurations")
@http(method: "POST", uri: "/configurations/list")
operation ListConfigurations {
    input: ListConfigurationsRequest
    output: ListConfigurationsResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
    ]
}

@input
structure ListConfigurationsRequest with [PaginatedInput, FilterByCondition, FilterByNamePrefix] {}

@output
structure ListConfigurationsResponse with [PaginatedOutput] {
    @documentation("List of configurations")
    @required
    configurations: Configurations
}
