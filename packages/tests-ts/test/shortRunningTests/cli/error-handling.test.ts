import { $, createTempFile, setupTestEnvironment } from './helpers';

beforeAll(async () => {
  await setupTestEnvironment();
});

describe('Error Handling', () => {
  test('should handle non-existent dataset ID', async () => {
    await expect($`genai-etk dataset get --dataset-id non-existent-id`).rejects.toThrow(/not found/i);
  });

  test('should handle invalid command syntax', async () => {
    await expect($`genai-etk dataset create --invalid-flag`).rejects.toThrow(/unknown option/i);
  });

  test('should handle missing required parameters', async () => {
    await expect($`genai-etk dataset create --name`).rejects.toThrow(/argument missing/i);
  });

  test('should handle invalid JSON in config files', async () => {
    await using invalidJsonFile = await createTempFile('invalid-config.json', '{ "invalid": "json"');
    await expect($`genai-etk eval config create -n test-config -cf ${invalidJsonFile.path}`).rejects.toThrow(/JSON/i);
  });

  test('should handle connection errors', async () => {
    const invalidUrl = 'https://invalid-url.amazon.com';
    await expect($`GEN_AI_ETK_API_URL=${invalidUrl} genai-etk dataset list`).rejects.toThrow(
      /ENOTFOUND/i,
    );
  });
});
