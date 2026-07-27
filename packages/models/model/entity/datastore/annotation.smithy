$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.entity

@documentation("Value of an annotation, either string or numeric")
union AnnotationValue {
    @documentation("String value for categorical or text annotations")
    stringValue: String

    @documentation("Numeric value for quantitative annotations")
    @range(min: -1000000, max: 1000000)
    numericValue: Double
}

@mixin
@documentation("Core annotation data including name, value, and optional comment")
structure AnnotationDetails {
    @documentation("Name of the annotation schema this annotation uses")
    @required
    name: String

    @documentation("Annotation value conforming to the schema's type")
    @required
    value: AnnotationValue

    @documentation("Optional explanatory comment providing context for the annotation")
    comment: String
}

@mixin
@documentation("Metadata tracking who created the annotation and when")
structure AnnotationMetadata {
    @documentation("Username or identifier of who created the annotation")
    @required
    annotatedBy: String

    @documentation("Timestamp when the annotation was created")
    @timestampFormat("date-time")
    @required
    annotatedAt: Timestamp
}

@documentation("Complete annotation with value and metadata")
structure Annotation with [AnnotationDetails, AnnotationMetadata] {}

@documentation("A list of annotations")
list Annotations {
    member: Annotation
}
