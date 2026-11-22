import { useState } from 'react';
import { Check, RotateCcw, ShieldAlert } from 'lucide-react';

interface HumanApprovalGateProps {
  draftMarkdown: string;
  cycleCount: number;
  maxCycles: number;
  busy: boolean;
  onApprove: (feedback: string, editedMarkdown: string) => void;
  onRequestRevision: (feedback: string, editedMarkdown: string) => void;
}

export function HumanApprovalGate({
  draftMarkdown,
  cycleCount,
  maxCycles,
  busy,
  onApprove,
  onRequestRevision,
}: HumanApprovalGateProps) {
  const [feedback, setFeedback] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState(draftMarkdown);

  return (
    <section
      aria-label="Human-in-the-Loop Approval Gate"
      className="border border-amber-300 dark:border-amber-700/70 bg-amber-50/70 dark:bg-amber-950/35 rounded-xl p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-2 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700/70">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Checkpoint Paused: Human Approval Required
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
              Execution halted before finalizing after Cycle {cycleCount} of {maxCycles}. Review the Markdown draft below, optionally refine it, or send specific instructions back to the Researcher Agent.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditedMarkdown(draftMarkdown);
            setEditMode((prev) => !prev);
          }}
          className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {editMode ? 'Close Draft Editor' : 'Edit Draft Inline'}
        </button>
      </div>

      {editMode && (
        <div className="mt-4">
          <label htmlFor="hitl-draft-editor" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Markdown Draft Override
          </label>
          <textarea
            id="hitl-draft-editor"
            rows={8}
            value={editedMarkdown}
            onChange={(e) => setEditedMarkdown(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
        <div className="flex-1">
          <label htmlFor="hitl-feedback" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Reviewer Notes or Revision Instructions
          </label>
          <input
            id="hitl-feedback"
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Add latency benchmarks on Apple M3 or approve as written"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRequestRevision(feedback, editMode ? editedMarkdown : draftMarkdown)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Send Back to Researcher
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(feedback, editMode ? editedMarkdown : draftMarkdown)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            Approve &amp; Finalize
          </button>
        </div>
      </div>
    </section>
  );
}
