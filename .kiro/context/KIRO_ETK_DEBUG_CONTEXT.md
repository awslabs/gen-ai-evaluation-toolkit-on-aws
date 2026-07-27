# Kiro Prompt for ETK Log Debugging

## Core Debugging Principles

1. **Use APIs before logs** - If you can get information via AWS API (describe-execution, get-job-status), do that first. Logs are for when APIs don't have the answer.

2. **Construct, don't search** - If you can build an ARN/identifier from what the user gave you, construct it directly rather than searching for it.

3. **Narrow before broad** - Start with the most specific resource (the job, the execution) before searching across log groups.

## Prompt

I need help debugging Gen AI Evaluation Toolkit (ETK) CloudWatch logs.

**My Environment:**
- AWS Region: [e.g., eu-west-2, us-east-1]
- ETK Resource Prefix: [e.g., GenAiEtk-personal, GenAiETK, GenAiEtk-prod] (if unknown, help me find it)

**ETK Architecture Flow:**
```
API Gateway → Lambda Functions → Step Functions (orchestrates evaluation/generation) → ECS Tasks (Plugins)
                                      ↓
                              Experiment Tracking (separate failure domain)
```

**Important:** Evaluation and generation jobs are orchestrated by Step Functions workflows. After the initial Lambda invocation, the main execution logic runs in Step Functions, which then triggers plugins as ECS tasks. **Experiment tracking runs independently and can fail even when the Step Function succeeds.**

**Common ETK Failure Patterns:**

1. **"Job passed but nothing in MLflow"**
   - Step Function succeeded but experiment tracking failed
   - Check: EvaluationRunParamReporting Lambda (creates MLflow run) - look for ValidationError
   - Check: ExperimentLogger ECS task (logs metrics to MLflow) - look for "No run found"
   - Root cause: Usually validation errors in experiment configuration (e.g., evaluators format)

2. **"Job failed in Step Functions"**
   - Check Step Functions execution output for error details
   - Look for plugin ECS task failures
   - Check plugin container logs

3. **"Job stuck/timeout"**
   - Check Step Functions execution status
   - Look for heartbeat events from plugins
   - Check ECS task status

**Key Log Group Patterns to Search:**
- **API Gateway:** `API-Gateway-Execution-Logs_<api-id>/prod` and `<prefix>-Base-ApiGatewayAccessLogs*`
- **Lambda Functions:** `<prefix>-<Service>-<Function>LambdaLogGroup*`
  - Services: DataStore, Evaluation, Generation, Experiment, Plugins
  - Key functions: StartEvaluation, GetEvaluation, StartGeneration, GetGeneration
- **Step Functions (Core Orchestration):**
  - `EvaluationStepFunction-LogGroup` - Orchestrates all evaluation jobs
  - `GenerationStepFunction-LogGroup` - Orchestrates all generation jobs
  - `DatastoreExportPlugin-StepFunction-LogGroup` - DataStore export operations
- **ECS Plugins:** `<prefix>-Plugins-<PluginName>TaskDefinition*`
  - Plugins: FMEvalPlugin, RagasPlugin, LlmAsAJudgePlugin, LlmAsJudgeEvalPlugin, RagTestCaseGenerationPlugin
- **Experiment Tracking (Critical for MLflow debugging):**
  - `<prefix>-Experiment-EvaluationRunParamReportingExperimentReportFunctionLogGroup*` - Creates MLflow runs (check for ValidationError)
  - `<prefix>-Evaluation-ExperimentLoggerOrchestratedEcsTaskDefinitionPluginContainerLogGroup*` - Logs metrics to MLflow (check for "No run found")
  - `<prefix>-Experiment-EvaluationRunMetricReporting*` - Reports metrics to MLflow
  - `<prefix>-Experiment-EvaluationRunTermination*` - Terminates MLflow runs

**What I need help with:**
[Describe your specific debugging scenario, e.g.:
- "I have a failed evaluation job with ID abc-123 and need to trace where it failed"
- "Find all errors in the last hour across all ETK components"
- "Evaluation job passed but no experiment run appeared in MLflow"
- "Debug why my dataset creation is failing"
- "Check if a specific plugin is running correctly"]

**Additional context:**
- Specific date and time: [e.g., "Friday November 29, 2024 between 2pm-4pm", "Today at 10:30am"]
- Job ID (if applicable): [job-id]
- Component of interest: [e.g., "evaluation", "generation", "dataset operations", "FMEval plugin"]
- Error message (if known): [error message]

**Please help me:**

**Efficient Debugging Strategies:**

1. **For job-specific issues with known job ID:**
   - Start with Step Functions API (`stepfunctions describe-execution`) - fastest way to see what happened
   - Execution ARN format: `arn:aws:states:<region>:<account>:execution:EvaluationStepFunction:<job-id>`
   - Only search logs if API doesn't reveal the issue

2. **For MLflow/experiment tracking issues:**
   - Go directly to experiment tracking Lambda logs (ParamReporting, MetricReporting)
   - Don't waste time on Step Functions logs if execution succeeded
   - Check for ValidationError in ParamReporting logs first

3. **For time-based searches:**
   - Always convert user dates to epoch milliseconds
   - Use narrow time windows (start with 1 hour, expand if needed)
   - Remember: User might give dates in future years (2025 not 2024)

**Step 1: Validate AWS environment**
- Use current AWS_PROFILE for AWS environment
- Verify AWS credentials (account ID, user/role)
- Confirm AWS region
- Check CloudWatch Logs permissions

**After showing me the environment details, STOP and ask me to confirm:**
"Is this the correct AWS account and region for your ETK deployment? Please confirm before I continue."

**Step 2: Understand the issue**
Ask clarifying questions:
- Exact date and time range (be specific!)
- What component/operation was affected
- Any job IDs or request IDs available
- Expected vs actual behavior

**Step 3: Discover log groups**
- Find ETK log groups using the resource prefix
- Identify relevant log groups based on the issue

**Step 4: Construct efficient queries**
- **ALWAYS convert human dates to epoch milliseconds** using Python
  - Example: `python3 -c "from datetime import datetime; print(int(datetime(2025, 11, 28, 16, 20).timestamp() * 1000))"`
  - Be careful with year - user might say "Nov 28" meaning 2025, not 2024
  - Add buffer time (e.g., ±10 minutes) to account for timezone differences
- **ALWAYS use --limit (max 50) to avoid long searches**
- **ALWAYS use specific time ranges (--start-time and --end-time)**
- **Use narrow time windows (1 hour initially, expand to 2-4 hours if needed)**
- Use filter patterns to narrow results

**Step 5: Trace request flow**

**For "Job passed but no MLflow data" issues:**
1. **Get Step Functions execution directly** - Use `stepfunctions describe-execution` with execution ARN
   - Execution ARN format: `arn:aws:states:<region>:<account>:execution:EvaluationStepFunction:<job-id>`
   - Check output for `experimentLoggerError` or validation errors
   - Extract startDate and stopDate for time range
2. **Check EvaluationRunParamReporting Lambda** - This creates the MLflow run
   - Search for job ID in `<prefix>-Experiment-EvaluationRunParamReportingExperimentReportFunctionLogGroup*`
   - Look for ValidationError or model_type errors (common: evaluators format issues)
   - Use time range from Step Functions execution
3. **Check ExperimentLogger ECS task** - This logs metrics to MLflow
   - Search `<prefix>-Evaluation-ExperimentLoggerOrchestratedEcsTaskDefinitionPluginContainerLogGroup*`
   - Look for "No run found" errors (indicates ParamReporting failed to create run)

**For general evaluation/generation job debugging:**
1. **Step Functions execution** - Get execution details via API first (faster than log search)
   - Use `stepfunctions describe-execution` with ARN
   - Check status, startDate, stopDate, output for errors
   - Extract time range for subsequent log searches
2. **API Gateway** (if needed) - Find the POST /Jobs request
3. **Lambda** - Check StartEvaluation/StartGeneration if API issues
4. **Plugins** - Check ECS task logs if Step Functions shows plugin failures

**Step 6: Analyze and suggest next steps**
- Summarize findings with specific error messages
- Identify root cause (be specific about configuration issues)
- Suggest remediation with corrected configuration examples
- Provide next steps for further investigation if needed

**Important: Keep searches fast by:**
- Using Step Functions API before searching logs (when job ID is known)
- Limiting results to 10-50 logs per query
- Using specific time ranges from Step Functions execution
- Searching one log group at a time
- Using filter patterns to narrow results
- For MLflow issues, go directly to experiment tracking logs
