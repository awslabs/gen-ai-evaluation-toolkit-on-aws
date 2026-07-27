$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.entity

use com.amzn.aws.pse.genaietk.common#StringList

@documentation("Configuration for string-type annotations")
structure StringConfigurations {
    @documentation("Allowed enum values for string annotations, enforcing controlled vocabulary")
    @required
    enum: StringList
}

@documentation("Defines the data type and validation rules for annotation values")
union AnnotationValueType {
    @documentation("Numeric annotation type for quantitative values")
    numericType: Unit

    @documentation("String annotation type with optional enum constraints")
    stringType: StringConfigurations
}

@mixin
@documentation("Core schema definition including name, description, and value type")
structure AnnotationSchemaDetails {
    @documentation("Unique name identifying the annotation schema")
    @required
    name: String

    @documentation("Human-readable description of the schema's purpose")
    description: String

    @documentation("Type and validation rules for annotation values")
    @required
    valueType: AnnotationValueType
}

@mixin
@documentation("Metadata about the schema's lifecycle and creation")
structure AnnotationSchemaMetadata {
    @documentation("Whether the schema is archived and unavailable for new annotations")
    isArchived: Boolean

    @documentation("Username or identifier of who created the schema")
    createdBy: String

    @documentation("Timestamp when the schema was created")
    @timestampFormat("date-time")
    createdAt: Timestamp
}

@documentation("Complete annotation schema defining structure and validation for annotations")
structure AnnotationSchema with [AnnotationSchemaDetails, AnnotationSchemaMetadata] {}

@documentation("A list of annotation schemas")
list AnnotationSchemas {
    member: AnnotationSchema
}
