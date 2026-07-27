$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#Datasets
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use smithy.framework#ValidationException

@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "datasets")
@documentation("Lists available datasets")
@readonly
@http(method: "GET", uri: "/datasets")
operation ListDatasets {
    input: ListDatasetsRequest
    output: ListDatasetsResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
    ]
}

@input
structure ListDatasetsRequest with [PaginatedInput] {}

@output
structure ListDatasetsResponse with [PaginatedOutput] {
    @documentation("List of datasets")
    @required
    datasets: Datasets
}
