$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithAnnotationNameLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithTestCaseIdLabel
use smithy.framework#ValidationException

@documentation("Removes the requested annotation from the given testcase.")
@http(method: "DELETE", uri: "/datasets/{datasetId}/testcases/{testCaseId}/annotations/{annotationName}", code: 204)
@idempotent
operation DeleteTestCaseAnnotation {
    input: DeleteTestCaseAnnotationRequest
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure DeleteTestCaseAnnotationRequest with [
    RequestWithDatasetIdLabel
    RequestWithTestCaseIdLabel
    RequestWithAnnotationNameLabel
] {}
