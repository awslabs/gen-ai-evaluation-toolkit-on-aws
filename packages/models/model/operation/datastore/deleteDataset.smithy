$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use smithy.framework#ValidationException

@documentation("Deletes the dataset")
@idempotent
@http(method: "DELETE", uri: "/datasets/{datasetId}", code: 204)
operation DeleteDataset {
    input: DeleteDatasetRequest
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure DeleteDatasetRequest with [RequestWithDatasetIdLabel] {}
