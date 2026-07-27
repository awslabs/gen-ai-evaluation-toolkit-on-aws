$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#Dataset
use com.amzn.aws.pse.genaietk.datastore.entity#DatasetRequest
use com.amzn.aws.pse.genaietk.error#ConflictException
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use smithy.framework#ValidationException

@documentation("Creates a new, empty dataset, after which test cases can be added.")
@http(method: "POST", uri: "/datasets")
operation CreateDataset {
    input: CreateDatasetRequest
    output: Dataset
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ConflictException
    ]
}

@input
structure CreateDatasetRequest with [DatasetRequest] {}
