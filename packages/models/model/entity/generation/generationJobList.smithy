$version: "2"

namespace com.amzn.aws.pse.genaietk.generation.entity

@documentation("List of generation job summaries")
list GenerationJobList {
    member: GenerationJobListItem
}

@documentation("Summary information for a single generation job in a list")
structure GenerationJobListItem with [GenerationJobSummary] {}
