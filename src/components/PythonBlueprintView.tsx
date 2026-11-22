import { useMemo, useState } from 'react';
import { Check, Copy, Download, Terminal } from 'lucide-react';
import { generatePythonBlueprint } from '../lib/pythonCodeGen';
import type { FrameworkOption, ProviderOption } from '../types/workflow';

interface PythonBlueprintViewProps {
  framework: FrameworkOption;
  provider: ProviderOption;
  topic: string;
  maxCycles: number;
  onChangeFramework: (f: FrameworkOption) => void;
  onChangeProvider: (p: ProviderOption) => void;
  onDownloadPython: (filename: string, code: string) => void;
}

export function PythonBlueprintView({
  framework,
  provider,
  topic,
  maxCycles,
  onChangeFramework,
  onChangeProvider,
  onDownloadPython,
}: PythonBlueprintViewProps) {
  const [copied, setCopied] = useState(false);

  const blueprint = useMemo(
    () => generatePythonBlueprint({ framework, provider, topic, maxCycles }),
    [framework, provider, topic, maxCycles],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(blueprint.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Runnable Python Pipeline Export
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Switch seamlessly between LangGraph and CrewAI orchestration, and toggle between Google AI Studio or Groq free-tier inference.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Code'}
            </button>
            <button
              type="button"
              onClick={() => onDownloadPython(blueprint.filename, blueprint.code)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Download {blueprint.filename}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-6 pt-5 border-t border-slate-200 dark:border-slate-800">
          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Orchestrator</span>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg" role="group" aria-label="Select Python Framework">
              <button
                type="button"
                onClick={() => onChangeFramework('langgraph')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  framework === 'langgraph'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                LangGraph (StateGraph)
              </button>
              <button
                type="button"
                onClick={() => onChangeFramework('crewai')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  framework === 'crewai'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                CrewAI (Process)
              </button>
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Free-Tier LLM Provider</span>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg" role="group" aria-label="Select LLM Provider">
              <button
                type="button"
                onClick={() => onChangeProvider('google')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  provider === 'google'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Google AI Studio (Gemini)
              </button>
              <button
                type="button"
                onClick={() => onChangeProvider('groq')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  provider === 'groq'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Groq (Llama 3.3 70B)
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-mono overflow-x-auto">
            <Terminal className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
            <span>{blueprint.installCommand}</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Env: {blueprint.envVarName}
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 dark:bg-slate-950 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 text-xs text-slate-300 font-mono">
            <span>{blueprint.filename}</span>
            <span>Python 3.11+ · DuckDuckGoSearchRun · HITL</span>
          </div>
          <pre className="p-4 text-xs leading-relaxed text-slate-100 font-mono overflow-x-auto max-h-[540px]">
            <code>{blueprint.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
