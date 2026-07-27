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

@documentation("Restores a dataset to specified version")
@http(method: "POST", uri: "/datasets/{datasetId}/restore", code: 202)
operation RestoreDataset {
    input: RestoreDatasetRequest
    output: RestoreDatasetResponse
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
structure RestoreDatasetRequest with [RequestWithDatasetIdLabel] {
    @required
    @range(min: 1)
    @documentation("The target version for the restore. i.e. dataset will restore to this version")
    version: Integer
}

@output
structure RestoreDatasetResponse {
    dataset: Dataset
    asyncContext: AsyncContext
}
