$version: "2"

namespace com.amzn.aws.pse.genaietk.common.entity

@documentation("Comparison operators for numeric values")
enum NumericLogicalComparator {
    @documentation("Equal to")
    EQUAL_TO = "="

    @documentation("Not equal to")
    NOT_EQUAL_TO = "!="

    @documentation("Less than")
    LESS_THAN = "<"

    @documentation("Less than or equal to")
    LESS_THAN_OR_EQUAL = "<="

    @documentation("Greater than")
    GREATER_THAN = ">"

    @documentation("Greater than or equal to")
    GREATER_THAN_OR_EQUAL = ">="
}

@documentation("Comparison operators for string and enum values")
enum StringEnumLogicalComparator {
    @documentation("Equal to")
    EQUAL_TO = "="

    @documentation("Not equal to")
    NOT_EQUAL_TO = "!="
}

@documentation("Filter condition for numeric fields")
structure NumericCondition {
    @documentation("Field name to filter on")
    @required
    name: String

    @documentation("Numeric value to compare against")
    @required
    value: Float

    @documentation("Comparison operator")
    @required
    comparator: NumericLogicalComparator
}

@documentation("Filter condition for string/enum fields")
structure StringEnumCondition {
    @documentation("Field name to filter on")
    @required
    name: String

    @documentation("String value to compare against")
    @required
    value: String

    @documentation("Comparison operator")
    @required
    comparator: StringEnumLogicalComparator
}

@documentation("Single filter condition")
union Condition {
    @documentation("Numeric field condition")
    numericCondition: NumericCondition

    @documentation("String/enum field condition")
    stringEnumCondition: StringEnumCondition
}

@documentation("List of condition expressions for logical operations")
list ConditionExpressionList {
    member: ConditionExpression
}

@documentation("Recursive filter expression with logical operators")
union ConditionExpression {
    @documentation("Single condition")
    condition: Condition

    @documentation("Logical AND of conditions")
    and: ConditionExpressionList

    @documentation("Logical OR of conditions")
    or: ConditionExpressionList

    @documentation("Logical NOT of condition")
    not: ConditionExpression
}
