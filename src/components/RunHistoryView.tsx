import { useMemo, useState } from 'react';
import { CopyPlus, FolderOpen, Search, Trash2 } from 'lucide-react';
import type { WorkflowState, WorkflowStatus } from '../types/workflow';

interface RunHistoryViewProps {
  runs: WorkflowState[];
  activeRunId: string;
  onSelectRun: (run: WorkflowState) => void;
  onCloneRun: (run: WorkflowState) => void;
  onDeleteRun: (runId: string) => void;
  onCreateNewRun: () => void;
}

export function RunHistoryView({
  runs,
  activeRunId,
  onSelectRun,
  onCloneRun,
  onDeleteRun,
  onCreateNewRun,
}: RunHistoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkflowStatus>('all');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return runs.filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;
      if (!q) return true;
      return (
        run.title.toLowerCase().includes(q) ||
        run.topic.toLowerCase().includes(q) ||
        run.framework.toLowerCase().includes(q)
      );
    });
  }, [runs, searchQuery, statusFilter]);

  return (
    <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Saved Workflow Runs</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
            {runs.length} total checkpoint(s) stored in your workspace
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by topic or framework…"
              aria-label="Filter saved workflow runs"
              className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600 w-60"
            />
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg" role="group" aria-label="Filter runs by status">
            {(['all', 'awaiting_approval', 'completed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {st === 'all' ? 'All' : st === 'awaiting_approval' ? 'Pending Gate' : 'Completed'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center space-y-3">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No matching workflow runs</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Start a new autonomous research cycle in the Workbench or import an exported JSON checkpoint.
          </p>
          <button
            type="button"
            onClick={onCreateNewRun}
            className="inline-flex items-center px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors"
          >
            New Research Run
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                <th className="py-3 px-6">Workflow Title</th>
                <th className="py-3 px-4">Stack</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4 text-right">Cycles</th>
                <th className="py-3 px-4 text-right">Sources</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filtered.map((run) => {
                const isActive = run.id === activeRunId;
                return (
                  <tr
                    key={run.id}
                    className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      isActive ? 'bg-teal-50/40 dark:bg-teal-950/30' : ''
                    }`}
                  >
                    <td className="py-3 px-6 max-w-xs">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{run.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{run.topic}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {run.framework === 'langgraph' ? 'LangGraph' : 'CrewAI'} · {run.provider === 'google' ? 'Gemini' : 'Groq'}
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <span
                        className={
                          run.status === 'completed'
                            ? 'font-medium text-emerald-700 dark:text-emerald-400'
                            : run.status === 'awaiting_approval'
                              ? 'font-medium text-amber-700 dark:text-amber-400'
                              : run.status === 'error'
                                ? 'font-medium text-red-700 dark:text-red-400'
                                : 'font-medium text-slate-600 dark:text-slate-400'
                        }
                      >
                        {run.status === 'awaiting_approval'
                          ? 'Awaiting Approval'
                          : run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 text-right font-mono tabular-nums whitespace-nowrap">
                      {run.cycleCount}/{run.maxCycles}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 text-right font-mono tabular-nums whitespace-nowrap">
                      {run.sources.length}
                    </td>
                    <td className="py-3 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectRun(run)}
                          aria-label={`Open workflow ${run.title}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => onCloneRun(run)}
                          aria-label={`Clone workflow ${run.title}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <CopyPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          Clone
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRun(run.id)}
                          aria-label={`Delete workflow ${run.title}`}
                          className="inline-flex items-center p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
