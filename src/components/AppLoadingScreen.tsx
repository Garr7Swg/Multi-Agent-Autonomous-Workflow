import { Clock } from 'lucide-react';
import { motion } from 'motion/react';

export function AppLoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading AgentFlow Studio"
      className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4 py-8 transition-colors"
    >
      <div className="w-full max-w-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <motion.svg
              viewBox="0 0 64 64"
              className="w-16 h-16"
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
            >
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-slate-200 dark:text-slate-800"
              />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray="56 112"
                className="text-teal-700 dark:text-teal-400"
              />
              <circle
                cx="32"
                cy="6"
                r="3.5"
                className="fill-teal-700 dark:fill-teal-400"
              />
            </motion.svg>
            <motion.span
              aria-hidden="true"
              animate={{ scale: [0.9, 1.12, 0.9], opacity: [0.75, 1, 0.75] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute w-3.5 h-3.5 rounded-full bg-teal-700 dark:bg-teal-400"
            />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
              AgentFlow Studio
            </h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Loading multi-agent workbench &amp; syncing session…
            </p>
          </div>

          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <motion.div
              className="h-full w-2/5 rounded-full bg-teal-700 dark:bg-teal-400"
              animate={{ x: ['-100%', '260%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>

        <div
          role="note"
          aria-label="Free-tier hardware and API notice"
          className="rounded-xl border-2 border-amber-300 dark:border-amber-700/80 bg-amber-50/90 dark:bg-amber-950/40 px-4 py-4 flex items-start gap-3.5 text-left"
        >
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700/70 shrink-0 mt-0.5">
            <Clock className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm sm:text-base font-bold text-amber-950 dark:text-amber-100 leading-snug">
              Notice: Running on Free-Tier Hardware &amp; Public APIs
            </h2>
            <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-200/90 leading-relaxed">
              Loading the app and running autonomous multi-agent workflows may take extra time because it runs exclusively on free-tier hardware and free public APIs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
