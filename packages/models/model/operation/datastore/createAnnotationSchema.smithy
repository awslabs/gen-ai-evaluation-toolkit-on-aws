$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#AnnotationSchema
use com.amzn.aws.pse.genaietk.datastore.entity#AnnotationSchemaDetails
use com.amzn.aws.pse.genaietk.error#ConflictException
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use smithy.framework#ValidationException

@documentation("Creates a new annotation schema")
@http(method: "POST", uri: "/annotations/schemas")
operation CreateAnnotationSchema {
    input: CreateAnnotationSchemaRequest
    output: AnnotationSchema
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ConflictException
    ]
}

@input
structure CreateAnnotationSchemaRequest with [AnnotationSchemaDetails] {}
