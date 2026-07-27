$version: "2"

namespace com.amzn.aws.pse.genaietk.generation.entity

@documentation("Single step in a generation workflow")
structure GenerationStep {
    @documentation("Name of the generation plugin to execute (e.g., 'synthetic-qa-generator')")
    @required
    plugin: String

    @documentation("Plugin-specific configuration parameters")
    @required
    configuration: Document
}

@documentation("Ordered list of generation steps to execute sequentially")
list GenerationStepList {
    member: GenerationStep
}
