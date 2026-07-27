$version: "2"

namespace com.amzn.aws.pse.genaietk.experimentation.entity

@documentation("Filter for experiment lifecycle status when listing")
enum ViewType {
    @documentation("Return only active experiments")
    ACTIVE_ONLY

    @documentation("Return only deleted experiments")
    DELETED_ONLY

    @documentation("Return all experiments regardless of status")
    ALL
}
