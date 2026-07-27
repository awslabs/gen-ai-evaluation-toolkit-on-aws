$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#TestCase
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithTestCaseIdLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithVersionStringLabel
use smithy.framework#ValidationException

@documentation("Gets test case for dataset version")
@readonly
@http(method: "GET", uri: "/datasets/{datasetId}/versions/{version}/testcases/{testCaseId}")
operation GetTestCase {
    input: GetTestCaseRequest
    output: TestCase
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure GetTestCaseRequest with [RequestWithDatasetIdLabel, RequestWithVersionStringLabel, RequestWithTestCaseIdLabel]
{}
