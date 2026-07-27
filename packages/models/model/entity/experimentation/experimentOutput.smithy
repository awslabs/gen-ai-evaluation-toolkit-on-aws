$version: "2"

namespace com.amzn.aws.pse.genaietk.experimentation.entity

@documentation("Output results from a specific experiment version")
structure ExperimentOutput {
    @documentation("Experiment configuration version that produced these results")
    @required
    version: Integer

    @documentation("Configuration parameters used in this experiment run")
    @required
    configuration: ExperimentParameters

    @documentation("List of individual runs within this experiment version")
    @required
    runs: RunList
}

@documentation("List of experiment outputs across versions")
list ExperimentOutputList {
    member: ExperimentOutput
}

@documentation("Map of parameter names to values for an experiment")
map ExperimentParameters {
    key: String
    value: String
}

@documentation("List of experiment runs")
list RunList {
    member: Run
}

@documentation("Individual experiment run with metrics")
structure Run {
    @documentation("Unique identifier for this run")
    @required
    run_id: String

    @documentation("Human-readable name for this run")
    @required
    run_name: String

    @documentation("Status of the run (e.g., SUCCEEDED, FAILED)")
    @required
    run_status: String

    @documentation("Metrics collected during this run")
    @required
    metrics: MetricsMap
}

@documentation("Map of metric names to their values")
map MetricsMap {
    key: String
    value: MetricValues
}

@documentation("Map of metric value types to their numeric values")
map MetricValues {
    key: String
    value: Float
}
