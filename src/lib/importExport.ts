import { createInitialWorkflow, generateRunId, sanitizeWorkflowTitle } from './workflowEngine';
import type {
  ExecutionStep,
  FrameworkOption,
  ProviderOption,
  SearchSource,
  WorkflowState,
} from '../types/workflow';

export function sanitizeHttpUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString().slice(0, 400);
    }
    return '';
  } catch {
    return '';
  }
}

function sanitizeSources(raw: unknown): SearchSource[] {
  if (!Array.isArray(raw)) return [];
  const clean: SearchSource[] = [];
  for (const item of raw.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const safeUrl = sanitizeHttpUrl(obj.url);
    if (!safeUrl) continue;
    clean.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.slice(0, 80) : generateRunId('src'),
      title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim().slice(0, 180) : safeUrl,
      url: safeUrl,
      snippet: typeof obj.snippet === 'string' ? obj.snippet.slice(0, 400) : '',
      query: typeof obj.query === 'string' ? obj.query.slice(0, 160) : '',
      cycle: typeof obj.cycle === 'number' && Number.isFinite(obj.cycle) ? Math.min(Math.max(Math.trunc(obj.cycle), 1), 10) : 1,
    });
  }
  return clean;
}

function sanitizeSteps(raw: unknown): ExecutionStep[] {
  if (!Array.isArray(raw)) return [];
  const validAgents = new Set([
    'Researcher Agent',
    'Writer Agent',
    'State Router',
    'Human Reviewer',
  ]);
  const clean: ExecutionStep[] = [];
  for (const item of raw.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const agent =
      typeof obj.agent === 'string' && validAgents.has(obj.agent)
        ? (obj.agent as ExecutionStep['agent'])
        : 'State Router';
    clean.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.slice(0, 80) : generateRunId('step'),
      agent,
      action: typeof obj.action === 'string' ? obj.action.slice(0, 160) : 'Step',
      summary: typeof obj.summary === 'string' ? obj.summary.slice(0, 320) : '',
      cycle: typeof obj.cycle === 'number' && Number.isFinite(obj.cycle) ? Math.min(Math.max(Math.trunc(obj.cycle), 0), 10) : 0,
      timestamp: typeof obj.timestamp === 'string' ? obj.timestamp.slice(0, 40) : new Date().toISOString(),
    });
  }
  return clean;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportWorkflowAsJson(workflow: WorkflowState): string {
  const bundle = {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    workflow,
  };
  return JSON.stringify(bundle, null, 2);
}

export function exportReportAsMarkdown(workflow: WorkflowState): string {
  const sourceLines = workflow.sources
    .map((src, idx) => `${idx + 1}. [${src.title}](${sanitizeHttpUrl(src.url) || '#'}) — *Cycle ${src.cycle}*`)
    .join('\n');

  const frontmatter = [
    '---',
    `title: "${workflow.title.replace(/"/g, '\\"')}"`,
    `framework: ${workflow.framework}`,
    `provider: ${workflow.provider}`,
    `status: ${workflow.status}`,
    `cycles: ${workflow.cycleCount}`,
    `exported_at: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n');

  const body = workflow.draftMarkdown.trim() || `# ${workflow.title}\n\n${workflow.researchNotes || '_No report drafted yet._'}`;
  const referencesSection = sourceLines ? `\n\n## Verified Sources\n${sourceLines}\n` : '';
  return `${frontmatter}${body}${referencesSection}`;
}

export function exportSourcesAsCsv(sources: SearchSource[]): string {
  const header = ['Cycle', 'Query', 'Title', 'URL', 'Snippet'].join(',');
  const rows = sources.map((s) =>
    [
      escapeCsvCell(s.cycle),
      escapeCsvCell(s.query),
      escapeCsvCell(s.title),
      escapeCsvCell(s.url),
      escapeCsvCell(s.snippet),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function parseImportedFileContent(params: {
  filename: string;
  content: string;
  ownerId?: string;
  defaultFramework?: FrameworkOption;
  defaultProvider?: ProviderOption;
}): { ok: true; workflow: WorkflowState } | { ok: false; error: string } {
  const lower = params.filename.toLowerCase();
  const raw = params.content.trim();

  if (!raw) {
    return { ok: false, error: 'The imported file is empty.' };
  }

  if (lower.endsWith('.json')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const candidate = (parsed.workflow ?? parsed) as Partial<WorkflowState>;

      if (!candidate || typeof candidate !== 'object' || typeof candidate.topic !== 'string' || !candidate.topic.trim()) {
        return { ok: false, error: 'JSON file must contain a valid workflow object with a non-empty "topic" field.' };
      }

      const framework: FrameworkOption = candidate.framework === 'crewai' ? 'crewai' : 'langgraph';
      const provider: ProviderOption = candidate.provider === 'groq' ? 'groq' : 'google';
      const now = new Date().toISOString();

      const imported: WorkflowState = {
        id: generateRunId('imp'),
        ownerId: params.ownerId ?? 'local_guest',
        title: typeof candidate.title === 'string' && candidate.title.trim()
          ? candidate.title.trim().slice(0, 160)
          : sanitizeWorkflowTitle(candidate.topic),
        topic: candidate.topic.trim().slice(0, 500),
        framework,
        provider,
        status: candidate.status === 'completed' || candidate.status === 'awaiting_approval' ? candidate.status : 'idle',
        activeNode: candidate.status === 'completed' ? 'final' : candidate.status === 'awaiting_approval' ? 'human_gate' : 'start',
        cycleCount: typeof candidate.cycleCount === 'number' && candidate.cycleCount >= 0 ? Math.min(Math.trunc(candidate.cycleCount), 10) : 0,
        maxCycles: typeof candidate.maxCycles === 'number' && candidate.maxCycles >= 1 ? Math.min(Math.trunc(candidate.maxCycles), 5) : 3,
        researchNotes: typeof candidate.researchNotes === 'string' ? candidate.researchNotes.slice(0, 40000) : '',
        draftMarkdown: typeof candidate.draftMarkdown === 'string' ? candidate.draftMarkdown.slice(0, 80000) : '',
        humanFeedback: typeof candidate.humanFeedback === 'string' ? candidate.humanFeedback.slice(0, 4000) : '',
        sources: sanitizeSources(candidate.sources),
        steps: sanitizeSteps(candidate.steps),
        createdAt: now,
        updatedAt: now,
      };

      return { ok: true, workflow: imported };
    } catch {
      return { ok: false, error: 'Invalid JSON syntax. Please select a valid AgentFlow JSON export.' };
    }
  }

  if (lower.endsWith('.md') || lower.endsWith('.txt')) {
    let body = raw;
    let extractedTitle = '';
    if (raw.startsWith('---')) {
      const endIdx = raw.indexOf('\n---', 3);
      if (endIdx !== -1) {
        const frontmatter = raw.slice(3, endIdx);
        const titleMatch = frontmatter.match(/title:\s*"?([^"\n]+)"?/i);
        if (titleMatch) extractedTitle = titleMatch[1].trim();
        body = raw.slice(endIdx + 4).trim();
      }
    }

    const headingMatch = body.match(/^#\s+(.+)$/m);
    const topic = extractedTitle || headingMatch?.[1]?.trim() || sanitizeWorkflowTitle(body.slice(0, 120));

    const wf = createInitialWorkflow({
      topic,
      title: topic,
      framework: params.defaultFramework ?? 'langgraph',
      provider: params.defaultProvider ?? 'google',
      ownerId: params.ownerId,
    });

    return {
      ok: true,
      workflow: {
        ...wf,
        draftMarkdown: body.slice(0, 80000),
        status: 'awaiting_approval',
        activeNode: 'human_gate',
      },
    };
  }

  return { ok: false, error: 'Unsupported file format. Import a .json workflow bundle or .md / .txt research brief.' };
}
