$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#DatasetVersion
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithVersionStringLabel
use smithy.framework#ValidationException

@documentation("Gets version details")
@readonly
@http(method: "GET", uri: "/datasets/{datasetId}/versions/{version}")
operation GetDatasetVersion {
    input: GetDatasetVersionRequest
    output: DatasetVersion
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure GetDatasetVersionRequest with [RequestWithDatasetIdLabel, RequestWithVersionStringLabel] {}
