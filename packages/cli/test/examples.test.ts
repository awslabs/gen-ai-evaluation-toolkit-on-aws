import { EvaluationConfig } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import evalConfig from 'example_eval_config.json';

describe('example payload tests', () => {
  test('Evaluation payload matches smithy model', () => {
    const stronglyTyped: Required<EvaluationConfig> = {
      ...evalConfig,
    };

    expect(stronglyTyped).toEqual(evalConfig);
  });
});
