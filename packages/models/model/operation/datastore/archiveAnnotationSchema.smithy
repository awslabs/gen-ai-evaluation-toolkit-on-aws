$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#AnnotationSchema
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithAnnotationNameLabel
use smithy.framework#ValidationException

@documentation("Mark or unmark an annotation schema as archived to prevent or allow further use")
@http(method: "PUT", uri: "/annotations/schemas/{annotationName}/archive")
@idempotent
operation ArchiveAnnotationSchema {
    input: ArchiveAnnotationSchemaRequest
    output: AnnotationSchema
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure ArchiveAnnotationSchemaRequest with [RequestWithAnnotationNameLabel] {
    @documentation("Whether the schema should be restored")
    restore: Boolean
}
