$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#AnnotationSchema
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#RequestWithAnnotationNameLabel
use smithy.framework#ValidationException

@documentation("Gets annotation schema details")
@readonly
@http(method: "GET", uri: "/annotations/schemas/{annotationName}")
operation GetAnnotationSchema {
    input: GetAnnotationSchemaRequest
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
structure GetAnnotationSchemaRequest with [RequestWithAnnotationNameLabel] {}
