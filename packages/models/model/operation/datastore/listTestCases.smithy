$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#TestCaseReferences
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#FilterByAnnotationValue
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithVersionStringLabel
use smithy.framework#ValidationException

@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "testCases")
@documentation("Lists test cases within the requested dataset version.")
@http(method: "POST", uri: "/datasets/{datasetId}/versions/{version}/testcases/list")
operation ListTestCases {
    input: ListTestCasesRequest
    output: ListTestCasesResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure ListTestCasesRequest with [
    PaginatedInput
    RequestWithDatasetIdLabel
    RequestWithVersionStringLabel
    FilterByAnnotationValue
] {}

@output
structure ListTestCasesResponse with [PaginatedOutput] {
    @documentation("List of test-cases")
    @required
    testCases: TestCaseReferences
}
