import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAdvanceCycle,
  createInitialWorkflow,
  transitionHumanDecision,
  transitionResearchResult,
  transitionWriterDecision,
} from './workflowEngine';
import { generatePythonBlueprint } from './pythonCodeGen';
import {
  exportReportAsMarkdown,
  exportSourcesAsCsv,
  exportWorkflowAsJson,
  parseImportedFileContent,
  sanitizeHttpUrl,
} from './importExport';

test('cyclic LangGraph state machine loops back when writer flags missing data', () => {
  let state = createInitialWorkflow({
    topic: 'Evaluate quantization in ExecuTorch',
    framework: 'langgraph',
    provider: 'google',
    maxCycles: 3,
  });

  assert.equal(state.status, 'idle');
  assert.equal(canAdvanceCycle(state), true);

  state = transitionResearchResult(state, {
    queries: ['ExecuTorch quantization'],
    newSources: [
      {
        id: 's1',
        title: 'ExecuTorch Docs',
        url: 'https://pytorch.org/executorch',
        snippet: 'Supports XNNPACK quantization.',
        query: 'ExecuTorch quantization',
        cycle: 1,
      },
    ],
    researchSummary: 'Found XNNPACK backend info.',
  });

  assert.equal(state.cycleCount, 1);
  assert.equal(state.activeNode, 'writer');

  // Writer requests missing data -> cyclic edge back to Researcher
  state = transitionWriterDecision(state, {
    draftMarkdown: '# Draft 1',
    needsMoreResearch: true,
    missingDataReason: 'Missing INT4 memory numbers.',
    followUpQuery: 'ExecuTorch INT4 memory benchmark',
  });

  assert.equal(state.status, 'running');
  assert.equal(state.activeNode, 'researcher');
  assert.match(state.missingDataReason ?? '', /INT4/);
});

test('workflow pauses at human approval gate and loops back on rejection or completes on approval', () => {
  let state = createInitialWorkflow({
    topic: 'Hybrid RAG benchmarks',
    framework: 'crewai',
    provider: 'groq',
    maxCycles: 2,
  });

  state = transitionResearchResult(state, {
    queries: ['Hybrid RAG BM25'],
    newSources: [],
    researchSummary: 'Collected BM25 + dense retrieval notes.',
  });

  state = transitionWriterDecision(state, {
    draftMarkdown: '# Hybrid RAG Report\nComplete draft.',
    needsMoreResearch: false,
  });

  assert.equal(state.status, 'awaiting_approval');
  assert.equal(state.activeNode, 'human_gate');

  // Human requests revision
  const revised = transitionHumanDecision(state, {
    approved: false,
    feedback: 'Add cross-encoder latency numbers.',
  });
  assert.equal(revised.status, 'running');
  assert.equal(revised.activeNode, 'researcher');
  assert.equal(revised.humanFeedback, 'Add cross-encoder latency numbers.');

  // Human approves
  const approved = transitionHumanDecision(state, {
    approved: true,
    feedback: 'Looks solid.',
    editedMarkdown: '# Hybrid RAG Report\nFinal verified version.',
  });
  assert.equal(approved.status, 'completed');
  assert.equal(approved.activeNode, 'final');
  assert.match(approved.draftMarkdown, /Final verified version/);
});

test('python code generator produces valid scripts for all 4 framework/provider combinations', () => {
  const combos = [
    ['langgraph', 'google', 'ChatGoogleGenerativeAI', 'interrupt_before'],
    ['langgraph', 'groq', 'ChatGroq', 'interrupt_before'],
    ['crewai', 'google', 'ChatGoogleGenerativeAI', 'human_input=True'],
    ['crewai', 'groq', 'ChatGroq', 'human_input=True'],
  ] as const;

  for (const [framework, provider, expectedClass, expectedHitl] of combos) {
    const out = generatePythonBlueprint({
      framework,
      provider,
      topic: 'Test Agentic AI Topic',
      maxCycles: 3,
    });
    assert.ok(out.code.includes(expectedClass), `Expected ${expectedClass} in ${framework}/${provider}`);
    assert.ok(out.code.includes(expectedHitl), `Expected ${expectedHitl} in ${framework}/${provider}`);
    assert.ok(out.code.includes('DuckDuckGoSearchRun'), 'Expected DuckDuckGoSearchRun tool');
  }
});

test('JSON, Markdown, and CSV export and import round-trip cleanly', () => {
  let wf = createInitialWorkflow({
    topic: 'State Persistence in LangGraph',
    framework: 'langgraph',
    provider: 'google',
  });
  wf = transitionResearchResult(wf, {
    queries: ['LangGraph checkpointer'],
    newSources: [
      {
        id: 'src1',
        title: 'LangGraph Persistence, "Official" Guide',
        url: 'https://langchain-ai.github.io/langgraph/',
        snippet: 'Checkpointers persist graph state.',
        query: 'LangGraph checkpointer',
        cycle: 1,
      },
    ],
    researchSummary: 'Checkpointers allow time travel and HITL.',
  });
  wf = transitionWriterDecision(wf, {
    draftMarkdown: '# Persistence Guide\nDetailed report.',
    needsMoreResearch: false,
  });

  const jsonStr = exportWorkflowAsJson(wf);
  const importedJson = parseImportedFileContent({ filename: 'run.json', content: jsonStr });
  assert.equal(importedJson.ok, true);
  if (importedJson.ok) {
    assert.equal(importedJson.workflow.topic, wf.topic);
    assert.equal(importedJson.workflow.sources.length, 1);
  }

  const mdStr = exportReportAsMarkdown(wf);
  assert.match(mdStr, /framework: langgraph/);
  assert.match(mdStr, /## Verified Sources/);
  const importedMd = parseImportedFileContent({ filename: 'brief.md', content: mdStr });
  assert.equal(importedMd.ok, true);

  const csvStr = exportSourcesAsCsv(wf.sources);
  assert.match(csvStr, /"LangGraph Persistence, ""Official"" Guide"/);

  const badImport = parseImportedFileContent({ filename: 'bad.json', content: '{not json' });
  assert.equal(badImport.ok, false);
});

test('import sanitization rejects dangerous javascript: or data: source URLs', () => {
  assert.equal(sanitizeHttpUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeHttpUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(sanitizeHttpUrl('https://pytorch.org/executorch/'), 'https://pytorch.org/executorch/');

  const maliciousJson = JSON.stringify({
    workflow: {
      topic: 'Security check',
      sources: [
        { title: 'Bad Link', url: 'javascript:alert(document.cookie)', snippet: 'bad', query: 'q', cycle: 1 },
        { title: 'Good Link', url: 'https://langchain-ai.github.io/langgraph/', snippet: 'ok', query: 'q', cycle: 1 },
      ],
    },
  });

  const parsed = parseImportedFileContent({ filename: 'sec.json', content: maliciousJson });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.workflow.sources.length, 1);
    assert.equal(parsed.workflow.sources[0].title, 'Good Link');
  }
});

