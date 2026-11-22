import type {
  ExecutionStep,
  FrameworkOption,
  ProviderOption,
  SearchSource,
  StarterPrompt,
  WorkflowState,
} from '../types/workflow';

export const STARTER_PROMPTS: StarterPrompt[] = [
  {
    id: 'starter-langgraph-edge',
    title: 'Edge AI Inference Frameworks 2026',
    topic:
      'Compare edge AI inference runtimes (ONNX Runtime, ExecuTorch, llama.cpp) for mobile latency, memory footprint, and quantization support.',
    framework: 'langgraph',
    provider: 'google',
  },
  {
    id: 'starter-crewai-rag',
    title: 'Hybrid RAG Evaluation Architectures',
    topic:
      'Analyze production Hybrid RAG architectures combining BM25, dense vector embeddings, and cross-encoder reranking with evaluation benchmarks.',
    framework: 'crewai',
    provider: 'groq',
  },
  {
    id: 'starter-langgraph-agents',
    title: 'Enterprise Agentic Guardrails & HITL',
    topic:
      'Evaluate checkpoint persistence, human-in-the-loop approval gates, and tool-call sandboxing patterns in stateful multi-agent systems.',
    framework: 'langgraph',
    provider: 'google',
  },
];

export function generateRunId(prefix = 'run'): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export function sanitizeWorkflowTitle(topic: string, maxLength = 72): string {
  const cleaned = topic.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Untitled Research Workflow';
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

export function createInitialWorkflow(params: {
  topic: string;
  framework: FrameworkOption;
  provider: ProviderOption;
  ownerId?: string;
  maxCycles?: number;
  title?: string;
}): WorkflowState {
  const now = new Date().toISOString();
  const maxCycles = Math.min(Math.max(params.maxCycles ?? 3, 1), 5);
  return {
    id: generateRunId('wf'),
    ownerId: params.ownerId ?? 'local_guest',
    title: params.title ?? sanitizeWorkflowTitle(params.topic),
    topic: params.topic.trim(),
    framework: params.framework,
    provider: params.provider,
    status: 'idle',
    activeNode: 'start',
    cycleCount: 0,
    maxCycles,
    researchNotes: '',
    draftMarkdown: '',
    humanFeedback: '',
    sources: [],
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function canAdvanceCycle(state: Pick<WorkflowState, 'cycleCount' | 'maxCycles'>): boolean {
  return state.cycleCount < state.maxCycles;
}

export function transitionResearchResult(
  state: WorkflowState,
  payload: {
    queries: string[];
    newSources: SearchSource[];
    researchSummary: string;
  },
): WorkflowState {
  const nextCycle = state.cycleCount + 1;
  const now = new Date().toISOString();
  const existingUrls = new Set(state.sources.map((s) => s.url));
  const mergedSources = [
    ...state.sources,
    ...payload.newSources.filter((s) => s.url && !existingUrls.has(s.url)),
  ].slice(0, 30);

  const appendedNotes = state.researchNotes
    ? `${state.researchNotes}\n\n### Cycle ${nextCycle} Findings\n${payload.researchSummary}`
    : `### Cycle ${nextCycle} Findings\n${payload.researchSummary}`;

  const step: ExecutionStep = {
    id: generateRunId('step'),
    agent: 'Researcher Agent',
    action: `DuckDuckGo search (${payload.queries.join(' · ')})`,
    summary: `Retrieved ${payload.newSources.length} source(s) and synthesized Cycle ${nextCycle} evidence.`,
    cycle: nextCycle,
    timestamp: now,
  };

  return {
    ...state,
    status: 'running',
    activeNode: 'writer',
    cycleCount: nextCycle,
    researchNotes: appendedNotes.slice(0, 40000),
    sources: mergedSources,
    steps: [...state.steps, step].slice(-40),
    updatedAt: now,
  };
}

export function transitionWriterDecision(
  state: WorkflowState,
  payload: {
    draftMarkdown: string;
    needsMoreResearch: boolean;
    missingDataReason?: string;
    followUpQuery?: string;
  },
): WorkflowState {
  const now = new Date().toISOString();
  const shouldLoopBack = payload.needsMoreResearch && canAdvanceCycle(state);

  const writerStep: ExecutionStep = {
    id: generateRunId('step'),
    agent: 'Writer Agent',
    action: shouldLoopBack ? 'Requested missing data (cyclic edge)' : 'Drafted report for Human Gate',
    summary: shouldLoopBack
      ? payload.missingDataReason || 'Key empirical data points missing; routing back to Researcher Agent.'
      : 'Synthesized structured markdown report and paused at Human-in-the-Loop checkpoint.',
    cycle: state.cycleCount,
    timestamp: now,
  };

  const routerStep: ExecutionStep = {
    id: generateRunId('step'),
    agent: 'State Router',
    action: shouldLoopBack
      ? `Loop edge -> Researcher (Cycle ${state.cycleCount + 1}/${state.maxCycles})`
      : 'Checkpoint pause -> Human Approval',
    summary: shouldLoopBack
      ? `Next query queued: ${payload.followUpQuery || state.topic}`
      : 'Persisted workflow state. Execution halted pending human sign-off.',
    cycle: state.cycleCount,
    timestamp: now,
  };

  return {
    ...state,
    status: shouldLoopBack ? 'running' : 'awaiting_approval',
    activeNode: shouldLoopBack ? 'researcher' : 'human_gate',
    draftMarkdown: payload.draftMarkdown.slice(0, 80000),
    missingDataReason: shouldLoopBack ? payload.missingDataReason : undefined,
    steps: [...state.steps, writerStep, routerStep].slice(-40),
    updatedAt: now,
  };
}

export function transitionHumanDecision(
  state: WorkflowState,
  decision: {
    approved: boolean;
    feedback?: string;
    editedMarkdown?: string;
  },
): WorkflowState {
  const now = new Date().toISOString();
  const finalDraft = decision.editedMarkdown?.trim()
    ? decision.editedMarkdown
    : state.draftMarkdown;
  const feedbackText = (decision.feedback ?? '').trim();

  if (decision.approved) {
    const step: ExecutionStep = {
      id: generateRunId('step'),
      agent: 'Human Reviewer',
      action: 'Approved & finalized report',
      summary: feedbackText || 'Human reviewer approved the markdown report at the HITL gate.',
      cycle: state.cycleCount,
      timestamp: now,
    };

    return {
      ...state,
      status: 'completed',
      activeNode: 'final',
      draftMarkdown: finalDraft.slice(0, 80000),
      humanFeedback: feedbackText.slice(0, 4000),
      missingDataReason: undefined,
      steps: [...state.steps, step].slice(-40),
      updatedAt: now,
    };
  }

  const step: ExecutionStep = {
    id: generateRunId('step'),
    agent: 'Human Reviewer',
    action: 'Requested revision -> Researcher Agent',
    summary: feedbackText || 'Reviewer requested deeper evidence before final approval.',
    cycle: state.cycleCount,
    timestamp: now,
  };

  return {
    ...state,
    status: 'running',
    activeNode: 'researcher',
    maxCycles: Math.min(Math.max(state.maxCycles, state.cycleCount + 1), 5),
    draftMarkdown: finalDraft.slice(0, 80000),
    humanFeedback: feedbackText.slice(0, 4000),
    missingDataReason: feedbackText || 'Human reviewer requested additional verification.',
    steps: [...state.steps, step].slice(-40),
    updatedAt: now,
  };
}

export function createSampleWorkflowRuns(ownerId = 'local_guest'): WorkflowState[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'sample_edge_ai_2026',
      ownerId,
      title: 'Edge AI Inference Runtimes Benchmark',
      topic:
        'Compare edge AI inference runtimes (ONNX Runtime, ExecuTorch, llama.cpp) for mobile latency and INT4 quantization.',
      framework: 'langgraph',
      provider: 'google',
      status: 'completed',
      activeNode: 'final',
      cycleCount: 2,
      maxCycles: 3,
      researchNotes:
        '### Cycle 1 Findings\nCollected initial runtime specs for ONNX Runtime Mobile, Meta ExecuTorch, and llama.cpp.\n\n### Cycle 2 Findings\nFilled missing INT4 memory footprint metrics on ARMv9 mobile NPUs.',
      draftMarkdown: `# Edge AI Inference Runtimes Benchmark\n\n## Executive Summary\nAcross mobile and embedded deployments, **ExecuTorch**, **ONNX Runtime**, and **llama.cpp** serve distinct workload profiles depending on operator coverage and quantization targets.\n\n## Comparative Findings\n| Runtime | Primary Strength | Quantization | Target Hardware |\n| --- | --- | --- | --- |\n| ExecuTorch | PyTorch native export, tiny binary footprint | INT4 / INT8 via XNNPACK | Mobile CPU, Apple ANE, Qualcomm NPU |\n| ONNX Runtime | Cross-framework graph optimization | QDQ INT8 / AWQ INT4 | Heterogeneous Edge & Desktop |\n| llama.cpp | GGUF zero-dependency C/C++ transformer execution | Q4_K_M / IQ4_XS | Apple Silicon, ARM NEON, Vulkan |\n\n## Architectural Recommendation\nUse **ExecuTorch** for tightly integrated PyTorch mobile vision/multimodal pipelines and **llama.cpp** when deploying standalone quantized LLMs with predictable RAM budgets.`,
      humanFeedback: 'Approved after Cycle 2 filled in the quantization table.',
      sources: [
        {
          id: 'src_1',
          title: 'ExecuTorch Documentation — PyTorch Edge',
          url: 'https://pytorch.org/executorch/stable/index.html',
          snippet: 'On-device AI inference runtime for mobile and embedded PyTorch models.',
          query: 'ExecuTorch mobile inference quantization',
          cycle: 1,
        },
        {
          id: 'src_2',
          title: 'ONNX Runtime Mobile Performance Tuning',
          url: 'https://onnxruntime.ai/docs/performance/mobile-performance.html',
          snippet: 'Guidelines for operator fusion, thread affinity, and quantized models.',
          query: 'ONNX Runtime mobile INT4 quantization',
          cycle: 2,
        },
      ],
      steps: [
        {
          id: 'st_1',
          agent: 'Researcher Agent',
          action: 'DuckDuckGo search (ExecuTorch, ONNX Runtime, llama.cpp)',
          summary: 'Retrieved initial architecture documentation across three edge runtimes.',
          cycle: 1,
          timestamp: now,
        },
        {
          id: 'st_2',
          agent: 'Writer Agent',
          action: 'Requested missing data (cyclic edge)',
          summary: 'Missing concrete INT4 quantization schemes per runtime; routed back to Researcher.',
          cycle: 1,
          timestamp: now,
        },
        {
          id: 'st_3',
          agent: 'Researcher Agent',
          action: 'DuckDuckGo search (INT4 quantization mobile NPU)',
          summary: 'Added XNNPACK, QDQ, and GGUF Q4_K_M details.',
          cycle: 2,
          timestamp: now,
        },
        {
          id: 'st_4',
          agent: 'Human Reviewer',
          action: 'Approved & finalized report',
          summary: 'Approved after Cycle 2 filled in the quantization table.',
          cycle: 2,
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}
