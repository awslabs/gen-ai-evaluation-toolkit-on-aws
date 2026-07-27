$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#Annotation
use com.amzn.aws.pse.genaietk.datastore.entity#AnnotationDetails
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.error#UnprocessableEntityException
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithVersionLabel
use smithy.framework#ValidationException

@documentation("Creates or updates an annotation on the given dataset version.")
@http(method: "PUT", uri: "/datasets/{datasetId}/versions/{version}/annotations")
@idempotent
operation PutDatasetVersionAnnotation {
    input: PutDatasetVersionAnnotationRequest
    output: Annotation
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
structure PutDatasetVersionAnnotationRequest with [
    RequestWithDatasetIdLabel
    RequestWithVersionLabel
    AnnotationDetails
] {}
