export type WithTaskToken = { taskToken: string; responseDetailType: string };
export type PluginResponse = SuccessEvent | ErrorEvent | InProgressEvent;
export type SuccessEvent = { status: 'success'; output: string | undefined; taskToken: string };
export type ErrorEvent = { status: 'error'; error: string; cause?: string; taskToken: string };
export type InProgressEvent = { status: 'inProgress'; percentage: number; taskToken: string };

export const EventTypes = {
  Evaluation: {
    Done: 'genAiEtkEvaluationDoneEvent',
    Metric: {
      Trigger: 'genAiEtkEvaluationMetricTriggerEvent',
      Done: 'genAiEtkEvaluationMetricDoneEvent',
    },
  },
  Generation: {
    Done: 'genAiEtkGenerationDoneEvent',
    Plugin: {
      Trigger: 'genAiEtkGenerationPluginTriggerEvent',
      Done: 'genAiEtkGenerationPluginDoneEvent',
    },
  },
};
