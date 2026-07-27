$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.common#TestDataMixin
use com.amzn.aws.pse.genaietk.datastore.entity#TestCase
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use smithy.framework#ValidationException

@documentation("Creates a new test case")
@http(method: "POST", uri: "/datasets/{datasetId}/testcases")
operation CreateTestCase {
    input: CreateTestCaseRequest
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
structure CreateTestCaseRequest with [RequestWithDatasetIdLabel, TestDataMixin] {}
