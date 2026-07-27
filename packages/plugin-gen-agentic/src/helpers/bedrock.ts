import { BedrockRuntimeClient, ConverseCommand, ContentBlock, Message } from '@aws-sdk/client-bedrock-runtime';
import { lazy } from '@genai-etk/plugin-gen-sdk';
import { z } from 'zod';
import { MAX_RETRY_ATTEMPTS } from '../constants';

const bedrockClient = lazy(() => new BedrockRuntimeClient());

export interface ConverseOptions {
  modelId: string;
  systemPrompt?: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
}

export interface ConverseResult {
  content: string;
  stopReason: string | undefined;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Errors that should fail fast without retry
const NON_RETRYABLE_ERROR_PATTERNS = [
  // Authentication errors
  'accessdeniedexception',
  'unauthorizedexception',
  'invalididentitytoken',
  'expiredtokenexception',
  'credentialsnotfound',
  // Validation/configuration errors
  'validationexception',
  'modelnotfoundexception',
  'resourcenotfoundexception',
];

function isNonRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  return NON_RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern) || name.includes(pattern));
}

function isAuthenticationError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  const authPatterns = [
    'accessdeniedexception',
    'unauthorizedexception',
    'invalididentitytoken',
    'expiredtokenexception',
    'credentialsnotfound',
  ];
  return authPatterns.some((pattern) => message.includes(pattern) || name.includes(pattern));
}

export async function converse(options: ConverseOptions): Promise<ConverseResult> {
  const { modelId, systemPrompt, messages, maxTokens = 4096, temperature = 0.7 } = options;

  const command = new ConverseCommand({
    modelId,
    system: systemPrompt ? [{ text: systemPrompt }] : undefined,
    messages,
    inferenceConfig: {
      maxTokens,
      temperature,
    },
  });

  let response;
  try {
    response = await bedrockClient().send(command);
  } catch (error) {
    // Preserve original error if it's already an Error, otherwise wrap it
    const err = error instanceof Error ? error : new Error(String(error), { cause: error });

    // Authentication errors should fail fast - no point retrying
    if (isAuthenticationError(err)) {
      throw new Error(`Authentication failed: ${err.message}. Check AWS credentials and permissions.`, { cause: err });
    }

    // Re-throw other errors (throttling, network) for caller to handle
    throw err;
  }

  const outputContent = response.output?.message?.content ?? [];
  const textContent = outputContent
    .filter((block): block is ContentBlock.TextMember => 'text' in block)
    .map((block) => block.text)
    .join('');

  return {
    content: textContent,
    stopReason: response.stopReason,
    usage: {
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
    },
  };
}

export function createUserMessage(content: string): Message {
  return {
    role: 'user',
    content: [{ text: content }],
  };
}

export function createAssistantMessage(content: string): Message {
  return {
    role: 'assistant',
    content: [{ text: content }],
  };
}

export async function converseWithRetry<T>(
  options: ConverseOptions,
  parseResponse: (content: string) => T,
  formatRetryPrompt: (error: Error, previousContent: string) => string,
): Promise<T> {
  let lastError: Error | undefined;
  let lastContent = '';
  const messages = [...options.messages];

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await converse({ ...options, messages });
      lastContent = result.content;
      return parseResponse(result.content);
    } catch (error) {
      // Preserve original error context for debugging
      lastError = error instanceof Error ? error : new Error(String(error), { cause: error });
      console.warn(`Attempt ${attempt + 1} failed: ${lastError.message}`);

      // Fail fast on non-retryable errors (auth failures, validation errors)
      if (isNonRetryableError(lastError)) {
        throw lastError;
      }

      // Only add retry prompt for parse errors (when we have LLM content to correct)
      // Skip retry prompt for SDK errors (network, throttling) - just retry the call
      if (attempt < MAX_RETRY_ATTEMPTS && lastContent) {
        messages.push(createAssistantMessage(lastContent));
        messages.push(createUserMessage(formatRetryPrompt(lastError, lastContent)));
      }
    }
  }

  throw lastError ?? new Error('Failed after retries');
}

/**
 * Parse a JSON string and, on failure, throw an Error that includes the
 * underlying parse message plus a head/tail snippet of the raw input and
 * its total length. Truncating to a single 200-char prefix (the previous
 * pattern) hid malformations that occurred late in long responses, making
 * production debugging guesswork.
 */
export function safeJsonParse(raw: string, label = 'Failed to parse LLM response as JSON'): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const HEAD = 300;
    const TAIL = 200;
    const snippet =
      raw.length <= HEAD + TAIL
        ? raw
        : `${raw.slice(0, HEAD)}\n... [${raw.length} total chars; ${raw.length - HEAD - TAIL} omitted] ...\n${raw.slice(-TAIL)}`;
    throw new Error(`${label}: ${reason}\n${snippet}`);
  }
}

/**
 * Parse a value through a Zod schema and, on failure, throw an Error whose
 * message is a flat list of `path: message` entries. Zod's default
 * `error.message` is a JSON-array dump that the LLM struggles to act on
 * during retry; this format is far more useful in retry prompts.
 *
 * Uses ZodTypeAny + z.output<S> so schemas with .default()/.transform()
 * keep their proper output type (e.g. requiresReview: boolean, not
 * boolean | undefined).
 */
export function parseWithFieldErrors<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  label = 'Schema validation failed',
): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fieldErrors = result.error.errors
    .map((e) => {
      const path = e.path.length > 0 ? e.path.join('.') : '(root)';
      return `${path}: ${e.message}`;
    })
    .join('; ');
  throw new Error(`${label}: ${fieldErrors}`);
}

export function extractJsonFromResponse(content: string): string {
  // Prefer code-fenced JSON (most reliable)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  const firstBracket = content.indexOf('[');
  const lastBracket = content.lastIndexOf(']');

  const hasObject = firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace;
  const hasArray = firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket;

  // If both exist, extract whichever starts first and validate it's parseable
  if (hasObject && hasArray) {
    const objectCandidate = content.slice(firstBrace, lastBrace + 1);
    const arrayCandidate = content.slice(firstBracket, lastBracket + 1);

    // Prefer whichever comes first, but validate it's valid JSON
    if (firstBrace < firstBracket) {
      try {
        JSON.parse(objectCandidate);
        return objectCandidate;
      } catch {
        // Object invalid, try array
        try {
          JSON.parse(arrayCandidate);
          return arrayCandidate;
        } catch {
          // Both invalid, return object candidate (caller will handle parse error)
          return objectCandidate;
        }
      }
    } else {
      try {
        JSON.parse(arrayCandidate);
        return arrayCandidate;
      } catch {
        // Array invalid, try object
        try {
          JSON.parse(objectCandidate);
          return objectCandidate;
        } catch {
          // Both invalid, return array candidate (caller will handle parse error)
          return arrayCandidate;
        }
      }
    }
  }

  if (hasObject) {
    return content.slice(firstBrace, lastBrace + 1);
  }

  if (hasArray) {
    return content.slice(firstBracket, lastBracket + 1);
  }

  return content.trim();
}
