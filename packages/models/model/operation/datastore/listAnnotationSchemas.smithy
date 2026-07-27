$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.operation

use com.amzn.aws.pse.genaietk.datastore.entity#AnnotationSchemas
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use smithy.framework#ValidationException

@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "annotationSchemas")
@documentation("Lists available annotation schemas")
@readonly
@http(method: "GET", uri: "/annotations/schemas")
operation ListAnnotationSchemas {
    input: ListAnnotationSchemasRequest
    output: ListAnnotationSchemasResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
    ]
}

@input
structure ListAnnotationSchemasRequest with [PaginatedInput] {
    @documentation("Whether to include archived annotation schemas in the results")
    @httpQuery("includeArchived")
    includeArchived: Boolean
}

@output
structure ListAnnotationSchemasResponse with [PaginatedOutput] {
    @documentation("List of annotation schemas")
    @required
    annotationSchemas: AnnotationSchemas
}
