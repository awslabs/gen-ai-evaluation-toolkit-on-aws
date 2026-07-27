$version: "2"

namespace com.amzn.aws.pse.genaietk.experimentation.entity

@documentation("Tag for experiment containing a key-value pair")
structure ExperimentTag {
    @required
    @documentation("Tag key")
    key: String

    @required
    @documentation("Tag value")
    value: String
}

list ExperimentTagList {
    member: ExperimentTag
}

@mixin
structure ExperimentRequest {
    @required
    @documentation("Unique identifier for the experiment")
    name: String

    @documentation("Description of the experiment")
    description: String
}

@mixin
structure ExperimentMixin with [ExperimentRequest] {
    @documentation("Location where artifacts for the experiment are stored")
    artifactLocation: String

    @documentation("Current life cycle stage of the experiment.")
    lifecycleStage: LifecycleStage

    @documentation("Last update time")
    lastUpdateTime: Long

    @documentation("Creation time")
    creationTime: Long

    @documentation("Tags: Additional metadata key-value pairs")
    tags: ExperimentTagList
}

@documentation("Experiment details")
structure Experiment with [ExperimentMixin] {
    @documentation("An ID for the experiment")
    @required
    id: String
}

list ExperimentList {
    member: Experiment
}

@length(max: 8)
list OrderByList {
    member: OrderByEntry
}

@length(max: 128)
string OrderByEntry
