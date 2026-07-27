import * as GenAiETKSDK from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';

describe('Import Test', () => {
  it('should successfully import the GenAiETK SDK', async () => {
    expect(GenAiETKSDK).toBeDefined();
    expect(GenAiETKSDK.ValidationException).toBeDefined();
  });
});
