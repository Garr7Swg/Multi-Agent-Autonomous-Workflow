import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Download, FileCode, FileJson, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import {
  exportReportAsMarkdown,
  exportSourcesAsCsv,
  exportWorkflowAsJson,
  parseImportedFileContent,
} from '../lib/importExport';
import { generatePythonBlueprint } from '../lib/pythonCodeGen';
import type { WorkflowState } from '../types/workflow';

interface ImportExportPanelProps {
  workflow: WorkflowState;
  ownerId: string;
  onImportWorkflow: (wf: WorkflowState) => Promise<void>;
  onDownloadFile: (filename: string, content: string, mimeType: string) => void;
}

export function ImportExportPanel({
  workflow,
  ownerId,
  onImportWorkflow,
  onDownloadFile,
}: ImportExportPanelProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const safeSlug = workflow.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'workflow_run';

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);

    try {
      const content = await file.text();
      const parsed = parseImportedFileContent({
        filename: file.name,
        content,
        ownerId,
        defaultFramework: workflow.framework,
        defaultProvider: workflow.provider,
      });

      if (!parsed.ok) {
        setImportError(parsed.error);
        return;
      }

      await onImportWorkflow(parsed.workflow);
      setImportSuccess(`Imported "${parsed.workflow.title}" into the active workbench.`);
    } catch {
      setImportError('Something went wrong, try again');
    } finally {
      e.target.value = '';
    }
  }

  const pyBlueprint = generatePythonBlueprint({
    framework: workflow.framework,
    provider: workflow.provider,
    topic: workflow.topic,
    maxCycles: workflow.maxCycles,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Export Current Workflow</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Download the active run ({workflow.title}) in the standard format for reports, state checkpoints, tabular citations, or runnable Python.
          </p>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-3 min-w-0">
              <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Markdown Report (.md)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">YAML metadata frontmatter + synthesized report + source citations</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onDownloadFile(`${safeSlug}.md`, exportReportAsMarkdown(workflow), 'text/markdown;charset=utf-8')
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export .md
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-3 min-w-0">
              <FileJson className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Full State Checkpoint (.json)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Complete LangGraph/CrewAI state, steps, sources, and human feedback</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onDownloadFile(`${safeSlug}.json`, exportWorkflowAsJson(workflow), 'application/json;charset=utf-8')
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export .json
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-3 min-w-0">
              <FileSpreadsheet className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Research Citations Table (.csv)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {workflow.sources.length} DuckDuckGo source(s) formatted for Excel or Pandas
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onDownloadFile(`${safeSlug}_sources.csv`, exportSourcesAsCsv(workflow.sources), 'text/csv;charset=utf-8')
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export .csv
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-3 min-w-0">
              <FileCode className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Python Pipeline Script (.py)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {workflow.framework === 'langgraph' ? 'LangGraph' : 'CrewAI'} + {workflow.provider === 'google' ? 'Google AI Studio' : 'Groq'} code
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onDownloadFile(pyBlueprint.filename, pyBlueprint.code, 'text/x-python;charset=utf-8')
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export .py
            </button>
          </div>
        </div>
      </section>

      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Import Workflow State or Brief</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Restore an exported <span className="font-mono">.json</span> workflow checkpoint or import a <span className="font-mono">.md</span> / <span className="font-mono">.txt</span> research draft directly into the Human Approval Gate.
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-8 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Upload className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Select a workflow file to import</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports AgentFlow JSON bundles (.json) and Markdown/Text drafts (.md, .txt)
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.md,.txt"
            onChange={handleFileSelected}
            className="hidden"
            aria-label="Import workflow file"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            Choose File to Import
          </button>
        </div>

        {importError && (
          <div role="alert" className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
            {importError}
          </div>
        )}
        {importSuccess && (
          <div role="status" className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3">
            {importSuccess}
          </div>
        )}
      </section>
    </div>
  );
}
