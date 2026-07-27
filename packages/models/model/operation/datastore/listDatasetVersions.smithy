$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#Versions
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#FilterByAnnotationValue
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use smithy.framework#ValidationException

@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "versions")
@documentation("Lists available dataset versions for the requested dataset.")
@http(method: "POST", uri: "/datasets/{datasetId}/versions/list")
operation ListDatasetVersions {
    input: ListDatasetVersionsRequest
    output: ListDatasetVersionsResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure ListDatasetVersionsRequest with [PaginatedInput, RequestWithDatasetIdLabel, FilterByAnnotationValue] {}

@output
structure ListDatasetVersionsResponse with [PaginatedOutput] {
    @documentation("List of dataset versions")
    @required
    versions: Versions
}
