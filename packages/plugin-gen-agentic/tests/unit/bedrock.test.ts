// Mock the Bedrock client
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockSend })),
  ConverseCommand: jest.fn((params) => params),
}));

// Mock the lazy helper
jest.mock('@genai-etk/plugin-gen-sdk', () => ({
  lazy: jest.fn((factory) => factory),
}));

import {
  createUserMessage,
  createAssistantMessage,
  extractJsonFromResponse,
  converse,
  converseWithRetry,
  parseWithFieldErrors,
  safeJsonParse,
} from '../../src/helpers/bedrock';
import { z } from 'zod';

describe('bedrock helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUserMessage', () => {
    it('should create a user message with text content', () => {
      const message = createUserMessage('Hello, world!');

      expect(message).toEqual({
        role: 'user',
        content: [{ text: 'Hello, world!' }],
      });
    });

    it('should handle empty string', () => {
      const message = createUserMessage('');

      expect(message).toEqual({
        role: 'user',
        content: [{ text: '' }],
      });
    });

    it('should handle multi-line content', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const message = createUserMessage(content);

      expect(message.content?.[0]).toEqual({ text: content });
    });
  });

  describe('createAssistantMessage', () => {
    it('should create an assistant message with text content', () => {
      const message = createAssistantMessage('I can help with that.');

      expect(message).toEqual({
        role: 'assistant',
        content: [{ text: 'I can help with that.' }],
      });
    });

    it('should handle JSON content', () => {
      const jsonContent = '{"key": "value"}';
      const message = createAssistantMessage(jsonContent);

      expect(message).toEqual({
        role: 'assistant',
        content: [{ text: jsonContent }],
      });
    });
  });

  describe('extractJsonFromResponse', () => {
    it('should extract JSON from markdown code block', () => {
      const content = 'Here is the result:\n```json\n{"name": "test"}\n```';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('{"name": "test"}');
    });

    it('should extract JSON from code block without language specifier', () => {
      const content = 'Result:\n```\n{"key": "value"}\n```';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('{"key": "value"}');
    });

    it('should extract JSON object when no code block present', () => {
      const content = 'The answer is {"result": 42} as expected.';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('{"result": 42}');
    });

    it('should extract JSON array when no code block present', () => {
      const content = 'Here are the items: [1, 2, 3]';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('[1, 2, 3]');
    });

    it('should prefer object over array when object comes first', () => {
      const content = '{"obj": true} and [1, 2, 3]';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('{"obj": true}');
    });

    it('should extract array when it comes before object', () => {
      const content = '[1, 2, 3] and then {"obj": true}';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('[1, 2, 3]');
    });

    it('should handle nested JSON objects', () => {
      const content = '{"outer": {"inner": {"deep": "value"}}}';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('{"outer": {"inner": {"deep": "value"}}}');
    });

    it('should handle nested JSON arrays', () => {
      const content = '[[1, 2], [3, 4], [5, 6]]';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('[[1, 2], [3, 4], [5, 6]]');
    });

    it('should return trimmed content when no JSON found', () => {
      const content = '  plain text response  ';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('plain text response');
    });

    it('should handle complex nested structure in code block', () => {
      const json = `{
  "scenarios": [
    {"id": "1", "name": "test"},
    {"id": "2", "name": "test2"}
  ],
  "metadata": {
    "count": 2
  }
}`;
      const content = `Here's the output:\n\`\`\`json\n${json}\n\`\`\``;
      const result = extractJsonFromResponse(content);

      expect(JSON.parse(result)).toEqual({
        scenarios: [
          { id: '1', name: 'test' },
          { id: '2', name: 'test2' },
        ],
        metadata: { count: 2 },
      });
    });

    it('should extract first code block when multiple present', () => {
      const content = '```json\n{"first": true}\n```\nAnd also:\n```json\n{"second": true}\n```';
      const result = extractJsonFromResponse(content);

      expect(result).toBe('{"first": true}');
    });
  });

  describe('converse', () => {
    it('should call Bedrock with correct parameters', async () => {
      mockSend.mockResolvedValue({
        output: { message: { content: [{ text: 'Response from LLM' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const result = await converse({
        modelId: 'test-model',
        messages: [createUserMessage('Hello')],
      });

      expect(result.content).toBe('Response from LLM');
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(50);
    });

    it('should include system prompt when provided', async () => {
      mockSend.mockResolvedValue({
        output: { message: { content: [{ text: 'Response' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 50, outputTokens: 25 },
      });

      await converse({
        modelId: 'test-model',
        systemPrompt: 'You are a helpful assistant',
        messages: [createUserMessage('Hello')],
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [{ text: 'You are a helpful assistant' }],
        }),
      );
    });

    it('should use default maxTokens and temperature', async () => {
      mockSend.mockResolvedValue({
        output: { message: { content: [{ text: 'Response' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 50, outputTokens: 25 },
      });

      await converse({
        modelId: 'test-model',
        messages: [createUserMessage('Hello')],
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          inferenceConfig: { maxTokens: 4096, temperature: 0.7 },
        }),
      );
    });

    it('should allow overriding maxTokens and temperature', async () => {
      mockSend.mockResolvedValue({
        output: { message: { content: [{ text: 'Response' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 50, outputTokens: 25 },
      });

      await converse({
        modelId: 'test-model',
        messages: [createUserMessage('Hello')],
        maxTokens: 1000,
        temperature: 0.3,
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          inferenceConfig: { maxTokens: 1000, temperature: 0.3 },
        }),
      );
    });

    it('should handle empty response content', async () => {
      mockSend.mockResolvedValue({
        output: { message: { content: [] } },
        stopReason: 'end_turn',
        usage: {},
      });

      const result = await converse({
        modelId: 'test-model',
        messages: [createUserMessage('Hello')],
      });

      expect(result.content).toBe('');
      expect(result.usage.inputTokens).toBe(0);
      expect(result.usage.outputTokens).toBe(0);
    });

    it('should concatenate multiple text blocks', async () => {
      mockSend.mockResolvedValue({
        output: { message: { content: [{ text: 'Part 1 ' }, { text: 'Part 2' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 50, outputTokens: 25 },
      });

      const result = await converse({
        modelId: 'test-model',
        messages: [createUserMessage('Hello')],
      });

      expect(result.content).toBe('Part 1 Part 2');
    });

    it('should handle missing output gracefully', async () => {
      mockSend.mockResolvedValue({
        output: {},
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const result = await converse({
        modelId: 'test-model',
        messages: [createUserMessage('Hello')],
      });

      expect(result.content).toBe('');
    });

    it('should fail fast on authentication errors with helpful message', async () => {
      mockSend.mockRejectedValue(new Error('AccessDeniedException: User is not authorized'));

      await expect(
        converse({
          modelId: 'test-model',
          messages: [createUserMessage('Hello')],
        }),
      ).rejects.toThrow('Authentication failed');
    });

    it('should fail fast on expired token errors', async () => {
      mockSend.mockRejectedValue(new Error('ExpiredTokenException: Token has expired'));

      await expect(
        converse({
          modelId: 'test-model',
          messages: [createUserMessage('Hello')],
        }),
      ).rejects.toThrow('Authentication failed');
    });

    it('should propagate throttling errors for caller to handle', async () => {
      mockSend.mockRejectedValue(new Error('ThrottlingException: Rate exceeded'));

      await expect(
        converse({
          modelId: 'test-model',
          messages: [createUserMessage('Hello')],
        }),
      ).rejects.toThrow('ThrottlingException');
    });

    it('should propagate network errors for caller to handle', async () => {
      mockSend.mockRejectedValue(new Error('NetworkError: Connection refused'));

      await expect(
        converse({
          modelId: 'test-model',
          messages: [createUserMessage('Hello')],
        }),
      ).rejects.toThrow('NetworkError');
    });
  });

  describe('converseWithRetry', () => {
    it('should return parsed response on success', async () => {
      mockSend.mockResolvedValue({
        output: { message: { content: [{ text: '{"result": "success"}' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 50, outputTokens: 25 },
      });

      const result = await converseWithRetry(
        { modelId: 'test-model', messages: [createUserMessage('Hello')] },
        (content) => JSON.parse(content),
        (error) => `Fix error: ${error.message}`,
      );

      expect(result).toEqual({ result: 'success' });
    });

    it('should retry on parse error', async () => {
      let callCount = 0;
      mockSend.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            output: { message: { content: [{ text: 'invalid json' }] } },
            stopReason: 'end_turn',
            usage: { inputTokens: 50, outputTokens: 25 },
          };
        }
        return {
          output: { message: { content: [{ text: '{"valid": true}' }] } },
          stopReason: 'end_turn',
          usage: { inputTokens: 50, outputTokens: 25 },
        };
      });

      const result = await converseWithRetry(
        { modelId: 'test-model', messages: [createUserMessage('Hello')] },
        (content) => JSON.parse(content),
        (error) => `Fix: ${error.message}`,
      );

      expect(result).toEqual({ valid: true });
      expect(callCount).toBe(2);
    });

    it('should throw after max retries', async () => {
      mockSend.mockResolvedValue({
        output: { message: { content: [{ text: 'always invalid' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 50, outputTokens: 25 },
      });

      await expect(
        converseWithRetry(
          { modelId: 'test-model', messages: [createUserMessage('Hello')] },
          () => {
            throw new Error('Parse failed');
          },
          (error) => `Fix: ${error.message}`,
        ),
      ).rejects.toThrow('Parse failed');
    });

    it('should include previous response in retry message', async () => {
      let retryPromptReceived = '';
      const formatRetry = jest.fn((error: Error, previousContent: string) => {
        retryPromptReceived = previousContent;
        return `Fix: ${error.message}`;
      });

      mockSend
        .mockResolvedValueOnce({
          output: { message: { content: [{ text: 'bad response' }] } },
          stopReason: 'end_turn',
          usage: { inputTokens: 50, outputTokens: 25 },
        })
        .mockResolvedValueOnce({
          output: { message: { content: [{ text: '{"valid": true}' }] } },
          stopReason: 'end_turn',
          usage: { inputTokens: 50, outputTokens: 25 },
        });

      await converseWithRetry(
        { modelId: 'test-model', messages: [createUserMessage('Hello')] },
        (content) => JSON.parse(content),
        formatRetry,
      );

      expect(formatRetry).toHaveBeenCalled();
      expect(retryPromptReceived).toBe('bad response');
    });

    it('should handle AWS SDK errors during retry', async () => {
      // First call succeeds with invalid content (triggers parse error)
      // All subsequent calls throw SDK error
      mockSend
        .mockResolvedValueOnce({
          output: { message: { content: [{ text: 'invalid' }] } },
          stopReason: 'end_turn',
          usage: { inputTokens: 50, outputTokens: 25 },
        })
        .mockRejectedValue(new Error('ThrottlingException: Rate exceeded'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(
        converseWithRetry(
          { modelId: 'test-model', messages: [createUserMessage('Hello')] },
          (content) => JSON.parse(content),
          (error) => `Fix: ${error.message}`,
        ),
      ).rejects.toThrow('ThrottlingException');

      consoleSpy.mockRestore();
    });

    it('should propagate SDK errors on first call', async () => {
      mockSend.mockRejectedValue(new Error('ServiceUnavailableException'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(
        converseWithRetry(
          { modelId: 'test-model', messages: [createUserMessage('Hello')] },
          (content) => JSON.parse(content),
          (error) => `Fix: ${error.message}`,
        ),
      ).rejects.toThrow('ServiceUnavailableException');

      consoleSpy.mockRestore();
    });

    it('should fail fast on authentication errors without retrying', async () => {
      mockSend.mockRejectedValue(new Error('Authentication failed: AccessDeniedException'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(
        converseWithRetry(
          { modelId: 'test-model', messages: [createUserMessage('Hello')] },
          (content) => JSON.parse(content),
          (error) => `Fix: ${error.message}`,
        ),
      ).rejects.toThrow('Authentication failed');

      // Should only have one attempt logged (no retries)
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });

    it('should fail fast on validation exceptions without retrying', async () => {
      mockSend.mockRejectedValue(new Error('ValidationException: Invalid model ID'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(
        converseWithRetry(
          { modelId: 'test-model', messages: [createUserMessage('Hello')] },
          (content) => JSON.parse(content),
          (error) => `Fix: ${error.message}`,
        ),
      ).rejects.toThrow('ValidationException');

      // Should only have one attempt logged (no retries)
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });
  });

  describe('safeJsonParse', () => {
    it('returns parsed value on success', () => {
      expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
      expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('throws an Error including the underlying parser message', () => {
      expect(() => safeJsonParse('{ invalid }')).toThrow(/Failed to parse LLM response as JSON:/);
    });

    it('includes the full input when shorter than head+tail budget', () => {
      const short = '{ "broken": ';
      try {
        safeJsonParse(short);
      } catch (err) {
        expect((err as Error).message).toContain(short);
      }
    });

    it('shows head + tail + total length for long inputs', () => {
      // Build a malformed JSON longer than head(300)+tail(200)=500 chars.
      const filler = 'x'.repeat(700);
      const broken = `{"start":1,${filler},"end":`; // unclosed
      let message = '';
      try {
        safeJsonParse(broken);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/total chars/);
      expect(message).toMatch(/omitted/);
      // First 300 chars are present
      expect(message).toContain(broken.slice(0, 300));
      // Last 200 chars are present
      expect(message).toContain(broken.slice(-200));
    });

    it('honors custom label', () => {
      expect(() => safeJsonParse('not json', 'Custom error')).toThrow(/^Custom error:/);
    });
  });

  describe('parseWithFieldErrors', () => {
    const Schema = z.object({
      input: z.string(),
      expected: z.object({
        response: z.string(),
        toolCalls: z.array(z.object({ name: z.string(), args: z.record(z.unknown()) })).optional(),
      }),
    });

    it('returns parsed value on success', () => {
      const value = { input: 'q', expected: { response: 'r' } };
      expect(parseWithFieldErrors(Schema, value)).toEqual(value);
    });

    it('throws an Error with field paths and messages on failure', () => {
      const value = { input: 'q', expected: { response: 123, toolCalls: [{ name: 'foo' }] } };
      expect(() => parseWithFieldErrors(Schema, value)).toThrow(
        /expected\.response: Expected string, received number/,
      );
      expect(() => parseWithFieldErrors(Schema, value)).toThrow(/expected\.toolCalls\.0\.args/);
    });

    it('uses (root) for empty path errors', () => {
      const StringSchema = z.string();
      expect(() => parseWithFieldErrors(StringSchema, 42)).toThrow(/\(root\): Expected string/);
    });

    it('honors custom label', () => {
      expect(() => parseWithFieldErrors(Schema, {}, 'Custom error label')).toThrow(/^Custom error label:/);
    });

    it('preserves Zod default values in the output type', () => {
      // Real-world case: GeneratedTestCaseModel has requiresReview with .default(false).
      const WithDefault = z.object({ name: z.string(), flag: z.boolean().default(false) });
      const result = parseWithFieldErrors(WithDefault, { name: 'x' });
      expect(result.flag).toBe(false);
    });
  });
});
