$version: "2"

namespace com.amzn.aws.pse.genaietk.experimentation.entity

@documentation("Lifecycle status of an experiment")
enum LifecycleStage {
    @documentation("Experiment is active and available for use")
    ACTIVE

    @documentation("Experiment has been deleted but may be recoverable")
    DELETED
}
