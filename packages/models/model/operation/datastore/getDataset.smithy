$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#Dataset
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use smithy.framework#ValidationException

@documentation("Gets dataset details")
@readonly
@http(method: "GET", uri: "/datasets/{datasetId}")
operation GetDataset {
    input: GetDatasetRequest
    output: Dataset
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure GetDatasetRequest with [RequestWithDatasetIdLabel] {}
