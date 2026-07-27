$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithAnnotationNameLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithDatasetIdLabel
use com.amzn.aws.pse.genaietk.mixin#RequestWithVersionLabel
use smithy.framework#ValidationException

@documentation("Removes the requested annotation from the given dataset version.")
@http(method: "DELETE", uri: "/datasets/{datasetId}/versions/{version}/annotations/{annotationName}", code: 204)
@idempotent
operation DeleteDatasetVersionAnnotation {
    input: DeleteDatasetVersionAnnotationRequest
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure DeleteDatasetVersionAnnotationRequest with [
    RequestWithDatasetIdLabel
    RequestWithVersionLabel
    RequestWithAnnotationNameLabel
] {}
