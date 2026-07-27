$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithTestCaseIdLabel
use smithy.framework#ValidationException

@documentation("Deletes test case from dataset")
@idempotent
@http(method: "DELETE", uri: "/datasets/{datasetId}/testcases/{testCaseId}")
operation DeleteTestCase {
    input: DeleteTestCaseRequest
    output: DeleteTestCaseResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure DeleteTestCaseRequest with [RequestWithDatasetIdLabel, RequestWithTestCaseIdLabel] {}

@output
structure DeleteTestCaseResponse {
    message: String
}
