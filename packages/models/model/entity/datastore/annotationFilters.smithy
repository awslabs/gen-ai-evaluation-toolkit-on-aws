$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.entity

use com.amzn.aws.pse.genaietk.common.entity#NumericLogicalComparator
use com.amzn.aws.pse.genaietk.common.entity#StringEnumLogicalComparator

@documentation("Condition for filtering by numeric annotation values")
structure NumericAnnotationCondition {
    @documentation("Name of the annotation to filter on")
    @required
    name: String

    @documentation("Numeric value to compare against")
    @required
    value: Float

    @documentation("Comparison operator (equals, greater than, less than, etc.)")
    @required
    comparator: NumericLogicalComparator
}

@documentation("Condition for filtering by string/enum annotation values")
structure StringEnumAnnotationCondition {
    @documentation("Name of the annotation to filter on")
    @required
    name: String

    @documentation("String value to compare against")
    @required
    value: String

    @documentation("Comparison operator (equals, not equals, contains, etc.)")
    @required
    comparator: StringEnumLogicalComparator
}

@documentation("Single annotation filter condition, either numeric or string-based")
union AnnotationCondition {
    @documentation("Filter condition for numeric annotations")
    numericCondition: NumericAnnotationCondition

    @documentation("Filter condition for string/enum annotations")
    stringEnumCondition: StringEnumAnnotationCondition
}

@documentation("List of annotation condition expressions for logical operations")
list AnnotationConditionExpressionList {
    member: AnnotationConditionExpression
}

@documentation("Recursive filter expression supporting logical AND, OR, NOT operations")
union AnnotationConditionExpression {
    @documentation("Single filter condition")
    condition: AnnotationCondition

    @documentation("Logical AND of multiple conditions")
    and: AnnotationConditionExpressionList

    @documentation("Logical OR of multiple conditions")
    or: AnnotationConditionExpressionList

    @documentation("Logical NOT of a condition")
    not: AnnotationConditionExpression
}
