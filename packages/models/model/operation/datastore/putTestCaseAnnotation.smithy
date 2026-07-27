$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#Annotation
use com.amzn.aws.pse.genaietk.datastore.entity#AnnotationDetails
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithTestCaseIdLabel
use smithy.framework#ValidationException

@documentation("Creates or updates an annotation on the given test case.")
@http(method: "PUT", uri: "/datasets/{datasetId}/testcases/{testCaseId}/annotations")
@idempotent
operation PutTestCaseAnnotation {
    input: PutTestCaseAnnotationRequest
    output: Annotation
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure PutTestCaseAnnotationRequest with [RequestWithDatasetIdLabel, RequestWithTestCaseIdLabel, AnnotationDetails]
{}
