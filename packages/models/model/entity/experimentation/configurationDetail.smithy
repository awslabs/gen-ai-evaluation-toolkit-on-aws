$version: "2"

namespace com.amzn.aws.pse.genaietk.experimentation.entity

@documentation("Workflow configuration type")
union WorkflowConfiguration {
    @documentation("Configuration for a workflow (opaque JSON)")
    evaluationConfiguration: Document
}

@documentation("Complete workflow configuration with name, version, and settings")
structure ConfigurationDetail {
    @documentation("Unique name identifying the configuration")
    @required
    name: String

    @documentation("Version number of this configuration")
    version: Integer

    @documentation("Workflow-specific configuration details")
    @required
    config: WorkflowConfiguration
}

@documentation("Reference to a configuration by name and version")
structure ConfigurationReference {
    @documentation("Unique name of the configuration")
    @required
    name: String

    @documentation("Version number to reference")
    version: Integer
}

@documentation("List of configuration references")
list Configurations {
    member: ConfigurationReference
}

@mixin
@documentation("Payload containing a workflow configuration")
structure WorkflowConfigurationPayload {
    @documentation("The workflow configuration")
    @required
    configuration: ConfigurationDetail
}
