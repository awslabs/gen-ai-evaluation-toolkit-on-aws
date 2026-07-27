import {
  S3Client,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { TraceConfig, ExtractedConversation, ExtractedTurn, OutcomeSignal, ToolCall, TraceCoverage } from '../models';

const CONCURRENCY = 20;
const BATCH_SIZE = 1000; // Matches S3 LIST limit

// Limits to prevent memory/context saturation
const MAX_FAILURE_PATTERNS_FOR_PROMPT = 10; // Cap failure patterns passed to LLM
const MAX_CONVERSATIONS_IN_MEMORY = 5000; // Hard limit before streaming is required

// OTEL span structure (simplified for our needs)
interface OTELSpan {
  traceId?: string;
  spanId?: string;
  name?: string;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: Record<string, unknown>;
  status?: { code?: number; message?: string };
  events?: Array<{ name?: string; timeUnixNano?: string; attributes?: Record<string, unknown> }>;
}

interface RawTrace {
  resourceSpans?: Array<{
    scopeSpans?: Array<{
      spans?: OTELSpan[];
    }>;
  }>;
}

type SpanType = 'model' | 'tool' | 'agent' | 'unknown';

/**
 * Phase 1: Process traces in batches, persist extracted conversations to internal S3.
 * Handles millions of trace files without memory exhaustion.
 */
export async function extractTracesInBatches(
  bucket: string,
  prefix: string,
  internalBucket: string,
  runId: string,
  onProgress?: (batchNumber: number, totalConversations: number) => void,
): Promise<{ conversationsPrefix: string; totalConversations: number }> {
  const s3 = new S3Client({});
  const conversationsPrefix = `extracted-conversations/${runId}/`;

  let continuationToken: string | undefined;
  let batchNumber = 0;
  let totalConversations = 0;

  do {
    let listResponse: ListObjectsV2CommandOutput;
    try {
      listResponse = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: BATCH_SIZE,
        }),
      );
    } catch (error) {
      // Log the original SDK error first so its name (AccessDenied/NoSuchKey) and
      // $metadata (request ID) survive in CloudWatch even after we wrap it.
      console.error(`Failed to list trace files in s3://${bucket}/${prefix}:`, error);
      throw new Error(`Failed to list trace files in s3://${bucket}/${prefix}`, { cause: error });
    }

    const files = (listResponse.Contents ?? [])
      .filter((obj): obj is { Key: string } => Boolean(obj.Key && obj.Key.endsWith('.json')))
      .map((obj) => obj.Key);

    if (files.length > 0) {
      const traces = await fetchTracesBatch(s3, bucket, files);
      const conversations = extractConversations(traces);

      if (conversations.length > 0) {
        const batchKey = `${conversationsPrefix}batch-${batchNumber.toString().padStart(5, '0')}.json`;
        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: internalBucket,
              Key: batchKey,
              Body: JSON.stringify(conversations),
              ContentType: 'application/json',
            }),
          );
          totalConversations += conversations.length;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            `Failed to write batch ${batchNumber} to s3://${internalBucket}/${batchKey} (${conversations.length} conversations): ${message}`,
          );
          throw error;
        }
      }

      console.log(`Batch ${batchNumber}: ${files.length} files → ${conversations.length} conversations`);
      onProgress?.(batchNumber, totalConversations);
      batchNumber++;
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  console.log(`Phase 1 complete: ${totalConversations} conversations in ${batchNumber} batches`);
  return { conversationsPrefix, totalConversations };
}

/**
 * Fetch a batch of trace files with concurrency limit.
 */
async function fetchTracesBatch(s3: S3Client, bucket: string, files: string[]): Promise<RawTrace[]> {
  const traces: RawTrace[] = [];

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((key) => fetchAndParseTrace(s3, bucket, key)));
    traces.push(...results.filter((t): t is RawTrace => t !== null));
  }

  return traces;
}

async function fetchAndParseTrace(s3: S3Client, bucket: string, key: string): Promise<RawTrace | null> {
  try {
    const data = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const content = await data.Body?.transformToString();
    return content ? JSON.parse(content) : null;
  } catch (err) {
    console.warn(`Failed to load trace ${key}:`, err);
    return null;
  }
}

/**
 * Phase 2: Load extracted conversations from internal S3, dedupe, and sample.
 * Uses streaming approach for large datasets to prevent memory exhaustion.
 */
export async function dedupeAndSample(
  internalBucket: string,
  conversationsPrefix: string,
  config: TraceConfig,
): Promise<ExtractedConversation[]> {
  const s3 = new S3Client({});

  // List all batch files
  const batchFiles: string[] = [];
  let continuationToken: string | undefined;

  do {
    let response: ListObjectsV2CommandOutput;
    try {
      response = await s3.send(
        new ListObjectsV2Command({
          Bucket: internalBucket,
          Prefix: conversationsPrefix,
          ContinuationToken: continuationToken,
        }),
      );
    } catch (error) {
      console.error(
        `Failed to list extracted conversation batches in s3://${internalBucket}/${conversationsPrefix}:`,
        error,
      );
      throw new Error(
        `Failed to list extracted conversation batches in s3://${internalBucket}/${conversationsPrefix}`,
        { cause: error },
      );
    }

    for (const obj of response.Contents ?? []) {
      if (obj.Key) batchFiles.push(obj.Key);
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // For large datasets, use streaming aggregation
  const byOutcome: Record<OutcomeSignal, ExtractedConversation[]> = {
    success: [],
    failure: [],
    abandonment: [],
  };
  let totalLoaded = 0;

  for (const key of batchFiles) {
    try {
      const data = await s3.send(new GetObjectCommand({ Bucket: internalBucket, Key: key }));
      const content = await data.Body?.transformToString();
      if (!content) continue;

      let batch: ExtractedConversation[];
      try {
        batch = JSON.parse(content) as ExtractedConversation[];
      } catch (parseErr) {
        console.warn(`Failed to parse batch file ${key}:`, parseErr);
        continue;
      }

      // Immediately categorize and apply early sampling to prevent memory buildup
      for (const conv of batch) {
        // Early rejection based on sample rate (probabilistic)
        const shouldSample =
          (conv.outcome === 'success' && Math.random() < config.successSampleRate) ||
          (conv.outcome === 'failure' && Math.random() < config.errorSampleRate) ||
          (conv.outcome === 'abandonment' && Math.random() < config.abandonmentSampleRate);

        if (shouldSample) {
          byOutcome[conv.outcome].push(conv);
        }
      }

      totalLoaded += batch.length;

      // Memory protection: if we've accumulated too much, trim early
      const currentTotal = byOutcome.success.length + byOutcome.failure.length + byOutcome.abandonment.length;
      if (currentTotal > MAX_CONVERSATIONS_IN_MEMORY) {
        console.log(`Memory protection: trimming ${currentTotal} conversations`);
        // Keep failures/abandonments, trim successes
        const targetSuccesses = Math.max(
          100,
          config.maxConversations - byOutcome.failure.length - byOutcome.abandonment.length,
        );
        if (byOutcome.success.length > targetSuccesses) {
          byOutcome.success = randomSample(byOutcome.success, targetSuccesses);
        }
      }
    } catch (err) {
      console.warn(`Failed to load batch file ${key}:`, err);
    }
  }

  // Fail fast if every batch yielded zero conversations. Without this,
  // downstream stages would silently operate on an empty conversation set —
  // whether the batches were unreadable (cross-account permissions, KMS key
  // removal, corrupted writes) or upstream extraction emitted only empty
  // batches — and the LLM pipeline would still emit results, just
  // trace-ungrounded ones.
  if (totalLoaded === 0 && batchFiles.length > 0) {
    throw new Error(
      `Failed to load any conversations from ${batchFiles.length} batch files in s3://${internalBucket}/${conversationsPrefix}. Possible causes: S3 permissions, file corruption, or empty source data. Check S3 access and upstream extraction logs.`,
    );
  }

  console.log(`Loaded ${totalLoaded} conversations from ${batchFiles.length} batch files`);
  console.log(
    `After early sampling: ${byOutcome.success.length} success, ${byOutcome.failure.length} failure, ${byOutcome.abandonment.length} abandonment`,
  );

  // Apply diversity clustering to each outcome group
  const clusteredFailures = clusterAndSelectDiverse(byOutcome.failure, 3);
  const clusteredAbandonments = clusterAndSelectDiverse(byOutcome.abandonment, 3);
  const clusteredSuccesses = clusterAndSelectDiverse(byOutcome.success, 2);

  console.log(
    `After clustering: ${clusteredSuccesses.length} success, ${clusteredFailures.length} failure, ${clusteredAbandonments.length} abandonment`,
  );

  // Final assembly with priority order
  const sampled: ExtractedConversation[] = [];

  // Failures first (highest priority)
  sampled.push(...clusteredFailures);

  // Abandonments second
  sampled.push(...clusteredAbandonments);

  // Fill remaining with successes
  const remainingBudget = config.maxConversations - sampled.length;
  if (remainingBudget > 0) {
    sampled.push(...clusteredSuccesses.slice(0, remainingBudget));
  }

  // Final deduplication by tool sequence
  const deduped = deduplicateByToolSequence(sampled);

  return deduped.slice(0, config.maxConversations);
}

/**
 * Extract conversations from raw OTEL traces.
 */
export function extractConversations(traces: RawTrace[]): ExtractedConversation[] {
  const sessionMap = new Map<string, OTELSpan[]>();

  // Group spans by session/trace ID
  for (const trace of traces) {
    for (const resourceSpan of trace.resourceSpans ?? []) {
      for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
        for (const span of scopeSpan.spans ?? []) {
          const sessionId = getSessionId(span);
          const existing = sessionMap.get(sessionId) ?? [];
          existing.push(span);
          sessionMap.set(sessionId, existing);
        }
      }
    }
  }

  const conversations: ExtractedConversation[] = [];

  for (const [sessionId, spans] of sessionMap) {
    const sorted = spans.sort((a, b) => {
      const aTime = BigInt(a.startTimeUnixNano ?? '0');
      const bTime = BigInt(b.startTimeUnixNano ?? '0');
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    });

    const turns = buildTurns(sorted);
    if (turns.length === 0) continue;

    const outcome = tagOutcome(sorted);

    conversations.push({
      sessionId,
      traceId: sorted[0]?.traceId ?? sessionId,
      turns,
      outcome,
    });
  }

  return conversations;
}

function getSessionId(span: OTELSpan): string {
  const attrs = span.attributes ?? {};
  return String(attrs['session.id'] ?? attrs['session_id'] ?? span.traceId ?? 'unknown');
}

/**
 * Classify span type based on name and attributes.
 */
export function classifySpan(span: OTELSpan): SpanType {
  const name = span.name?.toLowerCase() ?? '';
  const attrs = span.attributes ?? {};

  if (name.includes('tool') || name.includes('execute_tool') || attrs['gen_ai.tool.name']) {
    return 'tool';
  }

  if (name.includes('chat') || name.includes('llm') || attrs['gen_ai.operation.name']) {
    return 'model';
  }

  if (name.includes('invoke_agent') || name.includes('agent')) {
    return 'agent';
  }

  return 'unknown';
}

/**
 * Extract tool call from a tool span.
 */
export function extractToolCall(span: OTELSpan): ToolCall | null {
  const attrs = span.attributes ?? {};
  const toolName = attrs['gen_ai.tool.name'] ?? attrs['tool.name'];

  if (!toolName) return null;

  let toolArgs: Record<string, unknown> = {};
  const rawArgs = attrs['gen_ai.tool.args'] ?? attrs['tool.args'];
  if (typeof rawArgs === 'string') {
    try {
      toolArgs = JSON.parse(rawArgs);
    } catch {
      toolArgs = {};
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    toolArgs = rawArgs as Record<string, unknown>;
  }

  return {
    name: String(toolName),
    args: toolArgs,
  };
}

/**
 * Build conversation turns from sorted spans.
 */
function buildTurns(spans: OTELSpan[]): ExtractedTurn[] {
  const turns: ExtractedTurn[] = [];
  let currentTurn: Partial<ExtractedTurn> = {};
  const currentToolCalls: ToolCall[] = [];

  for (const span of spans) {
    const spanType = classifySpan(span);
    const attrs = span.attributes ?? {};

    if (spanType === 'model') {
      // User message from prompt
      const userMessage = attrs['gen_ai.prompt'] ?? attrs['input'] ?? attrs['user_message'];
      if (userMessage && typeof userMessage === 'string') {
        // Save previous turn if exists
        if (currentTurn.userMessage) {
          turns.push({
            userMessage: currentTurn.userMessage,
            assistantMessage: currentTurn.assistantMessage,
            toolCalls: currentToolCalls.length > 0 ? [...currentToolCalls] : undefined,
          });
          currentToolCalls.length = 0;
        }
        currentTurn = { userMessage };
      }

      // Assistant response from completion
      const assistantMessage = attrs['gen_ai.completion'] ?? attrs['output'] ?? attrs['assistant_message'];
      if (assistantMessage && typeof assistantMessage === 'string') {
        currentTurn.assistantMessage = assistantMessage;
      }
    }

    if (spanType === 'tool') {
      const toolCall = extractToolCall(span);
      if (toolCall) {
        currentToolCalls.push(toolCall);
      }
    }
  }

  // Don't forget the last turn
  if (currentTurn.userMessage) {
    turns.push({
      userMessage: currentTurn.userMessage,
      assistantMessage: currentTurn.assistantMessage,
      toolCalls: currentToolCalls.length > 0 ? [...currentToolCalls] : undefined,
    });
  }

  return turns;
}

/**
 * Tag conversation outcome based on span signals.
 */
export function tagOutcome(spans: OTELSpan[]): OutcomeSignal {
  const hasError = spans.some((s) => {
    if (s.status?.code === 2) return true; // OTEL ERROR status
    const attrs = s.attributes ?? {};
    if (attrs['error'] === true) return true;
    const httpStatus = Number(attrs['http.status_code'] ?? 0);
    if (httpStatus >= 400) return true;
    if (s.events?.some((e) => e.name === 'exception')) return true;
    return false;
  });

  if (hasError) {
    return 'failure';
  }

  const hasResponse = spans.some((s) => {
    const spanType = classifySpan(s);
    if (spanType !== 'model') return false;
    const attrs = s.attributes ?? {};
    return !!(attrs['gen_ai.completion'] ?? attrs['output'] ?? attrs['assistant_message']);
  });

  const hasAgentEnd = spans.some((s) => s.name?.toLowerCase().includes('agent') && s.endTimeUnixNano);

  if (!hasResponse || !hasAgentEnd) {
    return 'abandonment';
  }

  return 'success';
}

function randomSample<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return [...arr];
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function deduplicateByToolSequence(conversations: ExtractedConversation[]): ExtractedConversation[] {
  const seen = new Set<string>();
  return conversations.filter((conv) => {
    const signature = conv.turns.flatMap((t) => t.toolCalls?.map((tc) => tc.name) ?? []).join('|');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

/**
 * Generate a content signature for semantic deduplication.
 * Combines tool sequence + normalized user intent.
 */
function getConversationSignature(conv: ExtractedConversation): string {
  const toolSequence = conv.turns.flatMap((t) => t.toolCalls?.map((tc) => tc.name) ?? []).join('→');
  const intentWords = conv.turns
    .map((t) => t.userMessage?.toLowerCase().split(/\s+/).slice(0, 5).join(' ') ?? '')
    .join('|');
  return `${conv.outcome}:${toolSequence}:${intentWords}`;
}

/**
 * Cluster similar conversations and pick diverse representatives.
 * Uses signature-based grouping as lightweight alternative to embeddings.
 */
export function clusterAndSelectDiverse(
  conversations: ExtractedConversation[],
  maxPerCluster: number = 3,
): ExtractedConversation[] {
  const clusters = new Map<string, ExtractedConversation[]>();

  for (const conv of conversations) {
    const sig = getConversationSignature(conv);
    // Use prefix of signature for broader clustering
    const clusterKey = sig.split(':').slice(0, 2).join(':');
    const existing = clusters.get(clusterKey) ?? [];
    existing.push(conv);
    clusters.set(clusterKey, existing);
  }

  const selected: ExtractedConversation[] = [];
  for (const [, members] of clusters) {
    // Sort by turn count (prefer more complex) and take up to maxPerCluster
    const sorted = members.sort((a, b) => b.turns.length - a.turns.length);
    selected.push(...sorted.slice(0, maxPerCluster));
  }

  return selected;
}

/**
 * Select diverse failure patterns for LLM prompt.
 * Limits total patterns and ensures variety across error types.
 */
export function selectDiverseFailurePatterns(
  failures: ExtractedConversation[],
  maxPatterns: number = MAX_FAILURE_PATTERNS_FOR_PROMPT,
): ExtractedConversation[] {
  if (failures.length <= maxPatterns) {
    return failures;
  }

  // Group by tool combination to ensure variety
  const byToolCombo = new Map<string, ExtractedConversation[]>();
  for (const f of failures) {
    const tools = f.turns
      .flatMap((t) => t.toolCalls?.map((tc) => tc.name) ?? [])
      .sort()
      .join('+');
    const key = tools || 'no-tools';
    const existing = byToolCombo.get(key) ?? [];
    existing.push(f);
    byToolCombo.set(key, existing);
  }

  // Round-robin selection across tool combos
  const selected: ExtractedConversation[] = [];
  const iterators = [...byToolCombo.values()].map((arr) => arr[Symbol.iterator]());

  while (selected.length < maxPatterns && iterators.length > 0) {
    for (let i = iterators.length - 1; i >= 0; i--) {
      const iterator = iterators[i];
      if (!iterator) continue;
      const next = iterator.next();
      if (next.done) {
        iterators.splice(i, 1);
      } else {
        selected.push(next.value);
        if (selected.length >= maxPatterns) break;
      }
    }
  }

  return selected;
}

/**
 * Find trace examples matching a scenario's tool combination.
 * Used for trace-grounded generation to provide realistic seed examples.
 *
 * For tool-less scenarios (empty toolsInvolved), matches conversations
 * that also have no tool calls, filtered by outcome.
 */
export function findMatchingTraceExamples(
  conversations: ExtractedConversation[],
  toolsInvolved: string[],
  outcome: string,
  maxExamples: number = 3,
): ExtractedConversation[] {
  // Filter by outcome first
  const outcomeFiltered = conversations.filter((c) => {
    if (outcome === 'refusal' || outcome === 'failure') {
      return c.outcome === 'failure';
    }
    return c.outcome === 'success';
  });

  // Handle tool-less scenarios: match conversations with no tool calls
  if (toolsInvolved.length === 0) {
    const toolLessConversations = outcomeFiltered.filter((c) => {
      const hasToolCalls = c.turns.some((t) => t.toolCalls && t.toolCalls.length > 0);
      return !hasToolCalls;
    });
    // Prefer longer conversations (more turns) for richer examples
    return toolLessConversations.sort((a, b) => b.turns.length - a.turns.length).slice(0, maxExamples);
  }

  // For scenarios with tools: score by tool overlap
  const targetTools = new Set(toolsInvolved);

  const scored = outcomeFiltered
    .map((c) => {
      const convTools = new Set(c.turns.flatMap((t) => t.toolCalls?.map((tc) => tc.name) ?? []));
      const overlap = [...targetTools].filter((t) => convTools.has(t)).length;
      const extraTools = [...convTools].filter((t) => !targetTools.has(t)).length;
      // Score: higher overlap is better, penalize extra tools
      const score = overlap * 10 - extraTools * 2;
      return { conv: c, score, overlap };
    })
    .filter((s) => s.overlap > 0) // Must have at least one matching tool
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxExamples).map((s) => s.conv);
}

/**
 * Convert an extracted conversation to a seed example format.
 * Preserves per-turn tool call structure for multi-turn conversations.
 */
export function conversationToSeedExample(conv: ExtractedConversation): {
  input: string | string[];
  expected: {
    response: string;
    toolCalls?: ToolCall[] | ToolCall[][];
  };
  _traceId?: string;
  _outcome?: OutcomeSignal;
} {
  const isSingleTurn = conv.turns.length === 1;

  if (isSingleTurn) {
    const turn = conv.turns[0]!;
    const result: {
      input: string | string[];
      expected: {
        response: string;
        toolCalls?: ToolCall[] | ToolCall[][];
      };
      _traceId?: string;
      _outcome?: OutcomeSignal;
    } = {
      input: turn.userMessage,
      expected: {
        response: turn.assistantMessage ?? '',
      },
      _traceId: conv.traceId,
      _outcome: conv.outcome,
    };
    if (turn.toolCalls && turn.toolCalls.length > 0) {
      result.expected.toolCalls = turn.toolCalls;
    }
    return result;
  }

  // Multi-turn: preserve per-turn tool call structure
  const perTurnToolCalls = conv.turns.map((t) => t.toolCalls ?? []);
  const hasAnyToolCalls = perTurnToolCalls.some((calls) => calls.length > 0);

  const result: {
    input: string | string[];
    expected: {
      response: string;
      toolCalls?: ToolCall[] | ToolCall[][];
    };
    _traceId?: string;
    _outcome?: OutcomeSignal;
  } = {
    input: conv.turns.map((t) => t.userMessage),
    expected: {
      response: conv.turns[conv.turns.length - 1]?.assistantMessage ?? '',
    },
    _traceId: conv.traceId,
    _outcome: conv.outcome,
  };
  if (hasAnyToolCalls) {
    result.expected.toolCalls = perTurnToolCalls;
  }
  return result;
}

/**
 * Compute trace coverage from extracted conversations.
 */
export function computeTraceCoverage(conversations: ExtractedConversation[]): TraceCoverage {
  const tools = new Set<string>();
  const combinations = new Set<string>();
  const outcomes = { success: 0, failure: 0, abandonment: 0 };

  for (const conv of conversations) {
    outcomes[conv.outcome]++;

    const turnTools: string[] = [];
    for (const turn of conv.turns) {
      for (const tc of turn.toolCalls ?? []) {
        tools.add(tc.name);
        turnTools.push(tc.name);
      }
    }

    if (turnTools.length > 0) {
      combinations.add(turnTools.sort().join('+'));
    }
  }

  return {
    observedTools: [...tools],
    observedCombinations: [...combinations].map((c) => c.split('+')),
    outcomeDistribution: outcomes,
  };
}
