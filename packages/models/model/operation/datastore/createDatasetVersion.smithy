$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.common#AsyncContext
use com.amzn.aws.pse.genaietk.datastore.entity#Dataset
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.error#UnprocessableEntityException
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use smithy.framework#ValidationException

@documentation("Creates a new dataset version using all current test cases")
@http(method: "POST", uri: "/datasets/{datasetId}/versions", code: 202)
operation CreateDatasetVersion {
    input: CreateDatasetVersionRequest
    output: CreateDatasetVersionResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
        UnprocessableEntityException
    ]
}

@input
structure CreateDatasetVersionRequest with [RequestWithDatasetIdLabel] {}

@output
structure CreateDatasetVersionResponse {
    dataset: Dataset
    asyncContext: AsyncContext
}
