import { mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { generationTestData } from './generation';
import {
  agentAsJudgeTestCases,
  agentcoreEvaluationTestCases,
  agenticEvaluationTestCases,
  ragEvaluationTestCases,
} from './evaluation';
import { otelTraceTestData, toollessSuccessTraces, toollessFailureTraces } from './traces';
import type { InlineTestResult } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';

export function copyTestData(parentPath: string) {
  // Delete target directory if exists
  rmSync(parentPath, { force: true, recursive: true });

  // Create directory
  mkdirSync(parentPath, { recursive: true });

  // Evaluation
  writeRagTestCases(parentPath);
  writeAgenticTestCases(parentPath);
  writeAgentcoreTestCases(parentPath);
  writeAgentAsJudgeTestData(parentPath);

  // Generation
  copyGenerationData(parentPath);

  // Traces (for agentic GTG trace extraction tests)
  writeTracesData(parentPath);
}

function writeAgenticTestCases(parentDirPath: string) {
  const sizes = [1, 3, agenticEvaluationTestCases.length];
  for (const size of sizes) {
    const dirPath = path.join(parentDirPath, `evaluation/agentic/${size}`);
    mkdirSync(dirPath, { recursive: true });

    const testCases = agenticEvaluationTestCases.slice(0, size);

    testCases.forEach((testCase, index) => {
      const fileName = `test-case-${String(index + 1).padStart(2, '0')}.jsonl`;
      const filePath = path.join(dirPath, fileName);
      writeFileSync(filePath, JSON.stringify(testCase));
    });
  }
}

function writeAgentcoreTestCases(parentDirPath: string) {
  const sizes = [1, 3, agentcoreEvaluationTestCases.length];
  for (const size of sizes) {
    const dirPath = path.join(parentDirPath, `evaluation/agentcore/${size}`);
    mkdirSync(dirPath, { recursive: true });

    const testCases = agentcoreEvaluationTestCases.slice(0, size);

    testCases.forEach((testCase, index) => {
      const fileName = `test-case-${String(index + 1).padStart(2, '0')}.jsonl`;
      const filePath = path.join(dirPath, fileName);
      writeFileSync(filePath, JSON.stringify(testCase));
    });
  }
}

function writeRagTestCases(parentDirPath: string) {
  const sizes = [1, 3, 15, 50, 100, 200];

  for (const size of sizes) {
    // Create the directory
    const dirPath = path.join(parentDirPath, 'evaluation/rag', String(size));
    mkdirSync(dirPath, { recursive: true });

    const dirTestCases = ragEvaluationTestCases.slice(0, size);

    // Write the test cases
    dirTestCases.forEach((testCase, index) => {
      const fileName = `test-case-${String(index + 1).padStart(3, '0')}.jsonl`;
      const filePath = path.join(dirPath, fileName);
      writeFileSync(filePath, JSON.stringify(testCase));
    });
  }
}

function copyGenerationData(parentDirPath: string) {
  const dirPath = path.join(parentDirPath, 'generation');
  mkdirSync(dirPath, { recursive: true });

  generationTestData.forEach((document) => {
    const filePath = path.join(dirPath, document.title);
    writeFileSync(filePath, document.content);
  });
}

function writeAgentAsJudgeTestData(parentDirPath: string) {
  const basePrefix = 'evaluation/agent-as-judge';

  const testCasesDir = path.join(parentDirPath, basePrefix, 'test-cases');
  mkdirSync(testCasesDir, { recursive: true });

  agentAsJudgeTestCases.forEach((testCase, index) => {
    const tcId = `tc-${String(index + 1).padStart(2, '0')}`;

    // Requirement docs — per-test-case, per-evaluator subdirectory
    testCase.evaluators.forEach((evaluator, evalIndex) => {
      const evalId = `evaluator-${String(evalIndex + 1).padStart(2, '0')}`;
      const requirementsDir = path.join(parentDirPath, basePrefix, 'requirements', tcId, evalId);
      mkdirSync(requirementsDir, { recursive: true });
      evaluator.requirementDocs.forEach((doc) => {
        writeFileSync(path.join(requirementsDir, doc.title), doc.content);
      });
    });

    // Artifact files — per-test-case subdirectory
    const artifactsDir = path.join(parentDirPath, basePrefix, 'artifacts', tcId);
    mkdirSync(artifactsDir, { recursive: true });
    testCase.artifacts.forEach((artifact) => {
      writeFileSync(path.join(artifactsDir, artifact.title), artifact.content);
    });

    // Test case file — BUCKET_NAME_PLACEHOLDER is patched at test runtime
    const evalTestCase: InlineTestResult = { input: testCase.input, output: '' };

    if (testCase.artifacts.length > 0) {
      evalTestCase.context = {
        artifacts: [
          {
            bucketName: 'BUCKET_NAME_PLACEHOLDER',
            prefix: `${basePrefix}/artifacts/${tcId}/`,
          },
        ],
      };
    }

    writeFileSync(path.join(testCasesDir, `${tcId}.jsonl`), JSON.stringify(evalTestCase));
  });
}

function writeTracesData(parentDirPath: string) {
  const dirPath = path.join(parentDirPath, 'traces');
  mkdirSync(dirPath, { recursive: true });

  // Write traces with tools (existing)
  otelTraceTestData.forEach((trace, index) => {
    const fileName = `trace-${String(index + 1).padStart(3, '0')}.json`;
    const filePath = path.join(dirPath, fileName);
    writeFileSync(filePath, JSON.stringify(trace, null, 2));
  });

  // Write tool-less success traces
  toollessSuccessTraces.forEach((trace, index) => {
    const fileName = `toolless-success-${index + 1}.json`;
    const filePath = path.join(dirPath, fileName);
    writeFileSync(filePath, JSON.stringify(trace, null, 2));
  });

  // Write tool-less failure traces
  toollessFailureTraces.forEach((trace, index) => {
    const fileName = `toolless-failure-${index + 1}.json`;
    const filePath = path.join(dirPath, fileName);
    writeFileSync(filePath, JSON.stringify(trace, null, 2));
  });
}
