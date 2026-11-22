import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Moon,
  Play,
  Plus,
  RotateCcw,
  Sun,
} from 'lucide-react';
import {
  auth,
  googleProvider,
  loadOrCreateUserProfile,
  listUserWorkflows,
  persistWorkflowRun,
  removeWorkflowRun,
  saveUserProfile,
  STUDIO_AVATARS,
  testFirestoreConnection,
} from './lib/firebase';
import {
  createInitialWorkflow,
  createSampleWorkflowRuns,
  generateRunId,
  sanitizeWorkflowTitle,
  STARTER_PROMPTS,
  transitionHumanDecision,
  transitionResearchResult,
  transitionWriterDecision,
} from './lib/workflowEngine';
import { sanitizeHttpUrl } from './lib/importExport';
import type {
  FrameworkOption,
  ProviderOption,
  SearchSource,
  UserProfileData,
  WorkflowState,
} from './types/workflow';
import { AvatarImage } from './components/AvatarImage';
import { WorkflowGraph } from './components/WorkflowGraph';
import { HumanApprovalGate } from './components/HumanApprovalGate';
import { PythonBlueprintView } from './components/PythonBlueprintView';
import { ProfileModal } from './components/ProfileModal';
import { ImportExportPanel } from './components/ImportExportPanel';
import { RunHistoryView } from './components/RunHistoryView';
import { AppLoadingScreen } from './components/AppLoadingScreen';

type ActiveTab = 'workbench' | 'python' | 'history' | 'import_export';

const LOCAL_RUNS_KEY = 'agentflow_local_runs_v1';
const LOCAL_PROFILE_KEY = 'agentflow_local_profile_v1';
const THEME_STORAGE_KEY = 'agentflow_theme';
const GENERIC_PROCESSING_ERROR = 'Something went wrong, try again';

const DEFAULT_GUEST_PROFILE: UserProfileData = {
  uid: 'local_guest',
  displayName: 'Guest Engineer',
  email: '',
  roleTitle: 'AI Systems Engineer',
  bio: 'Exploring cyclic LangGraph and CrewAI workflows with human-in-the-loop checkpoints.',
  avatarUrl: STUDIO_AVATARS[0].url,
  preferredFramework: 'langgraph',
  preferredProvider: 'google',
};

function readLocalRuns(): WorkflowState[] {
  try {
    const raw = localStorage.getItem(LOCAL_RUNS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkflowState[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Fallback to seed runs
  }
  return createSampleWorkflowRuns('local_guest');
}

function readLocalProfile(): UserProfileData {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
    if (raw) {
      return { ...DEFAULT_GUEST_PROFILE, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore storage error
  }
  return DEFAULT_GUEST_PROFILE;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workbench');
  const [runs, setRuns] = useState<WorkflowState[]>(() => readLocalRuns());
  const [activeRunId, setActiveRunId] = useState<string>(() => readLocalRuns()[0]?.id ?? '');

  // Composer inputs
  const [topicInput, setTopicInput] = useState<string>(STARTER_PROMPTS[0].topic);
  const [framework, setFramework] = useState<FrameworkOption>('langgraph');
  const [provider, setProvider] = useState<ProviderOption>('google');
  const [maxCycles, setMaxCycles] = useState<number>(2);

  // Auth & Profile state
  const [authReady, setAuthReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [profile, setProfile] = useState<UserProfileData>(() => readLocalProfile());
  const [profileOpen, setProfileOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [rightPaneTab, setRightPaneTab] = useState<'report' | 'sources' | 'trace'>('report');

  // Theme state (pre-hydrated on <html> in index.html)
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', next);
      }
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }

  const activeWorkflow =
    runs.find((r) => r.id === activeRunId) ?? runs[0] ?? createSampleWorkflowRuns('local_guest')[0];

  // Keep localStorage synced when in guest mode
  useEffect(() => {
    if (!isSignedIn) {
      try {
        localStorage.setItem(LOCAL_RUNS_KEY, JSON.stringify(runs.slice(0, 20)));
      } catch {
        // Ignore quota errors
      }
    }
  }, [runs, isSignedIn]);

  // Firebase bootstrap & auth listener
  useEffect(() => {
    testFirestoreConnection().catch(() => {});

    const fallbackTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 3500);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsSignedIn(true);
        try {
          const loadedProfile = await loadOrCreateUserProfile({
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'AI Engineer',
            photoURL: user.photoURL || STUDIO_AVATARS[0].url,
          });
          setProfile(loadedProfile);
          setFramework(loadedProfile.preferredFramework);
          setProvider(loadedProfile.preferredProvider);

          const cloudRuns = await listUserWorkflows(user.uid);
          if (cloudRuns.length > 0) {
            setRuns(cloudRuns);
            setActiveRunId(cloudRuns[0].id);
          } else {
            const starter = createSampleWorkflowRuns(user.uid);
            setRuns(starter);
            setActiveRunId(starter[0].id);
            await persistWorkflowRun(starter[0], user.uid).catch(() => {});
          }
        } catch {
          setAuthError(GENERIC_PROCESSING_ERROR);
        }
      } else {
        setIsSignedIn(false);
        setProfile(readLocalProfile());
        const local = readLocalRuns();
        setRuns(local);
        setActiveRunId(local[0]?.id ?? '');
      }
      window.clearTimeout(fallbackTimer);
      setAuthReady(true);
    });

    return () => {
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  async function saveWorkflowToStore(updated: WorkflowState) {
    setRuns((prev) => {
      const exists = prev.some((item) => item.id === updated.id);
      if (exists) {
        return prev.map((item) => (item.id === updated.id ? updated : item));
      }
      return [updated, ...prev];
    });
    setActiveRunId(updated.id);

    if (isSignedIn && auth.currentUser) {
      try {
        await persistWorkflowRun(updated, auth.currentUser.uid);
      } catch {
        setExecutionError(GENERIC_PROCESSING_ERROR);
      }
    }
  }

  async function runCyclicPipeline(initialState: WorkflowState, initialFollowUpQuery?: string) {
    setIsExecuting(true);
    setExecutionError(null);
    let currentState: WorkflowState = {
      ...initialState,
      status: 'running',
      activeNode: 'researcher',
    };
    await saveWorkflowToStore(currentState);

    let followUpQuery = initialFollowUpQuery;

    const failGracefully = async () => {
      setExecutionError(GENERIC_PROCESSING_ERROR);
      const erroredState: WorkflowState = {
        ...currentState,
        status: 'error',
        updatedAt: new Date().toISOString(),
      };
      await saveWorkflowToStore(erroredState);
    };

    try {
      while (currentState.cycleCount < currentState.maxCycles) {
        // 1. Researcher Agent step (DuckDuckGo Search + Synthesis)
        const researchRes = await fetch('/api/agent/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: currentState.topic,
            followUpQuery,
            cycleCount: currentState.cycleCount,
            priorNotes: currentState.researchNotes,
            humanFeedback: currentState.humanFeedback,
            provider: currentState.provider,
          }),
        });

        if (!researchRes.ok) {
          await failGracefully();
          return;
        }

        const researchData = (await researchRes.json()) as {
          queries?: string[];
          newSources?: SearchSource[];
          researchSummary?: string;
        };

        currentState = transitionResearchResult(currentState, {
          queries: researchData.queries ?? [currentState.topic],
          newSources: researchData.newSources ?? [],
          researchSummary: researchData.researchSummary ?? '',
        });
        await saveWorkflowToStore(currentState);

        // 2. Writer Agent step (Draft Markdown + Cyclic Gap Evaluation)
        const writeRes = await fetch('/api/agent/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: currentState.topic,
            framework: currentState.framework,
            provider: currentState.provider,
            cycleCount: currentState.cycleCount,
            maxCycles: currentState.maxCycles,
            researchNotes: currentState.researchNotes,
            sources: currentState.sources,
            humanFeedback: currentState.humanFeedback,
          }),
        });

        if (!writeRes.ok) {
          await failGracefully();
          return;
        }

        const writeData = (await writeRes.json()) as {
          draftMarkdown?: string;
          needsMoreResearch?: boolean;
          missingDataReason?: string;
          followUpQuery?: string;
        };

        currentState = transitionWriterDecision(currentState, {
          draftMarkdown: writeData.draftMarkdown ?? '',
          needsMoreResearch: Boolean(writeData.needsMoreResearch),
          missingDataReason: writeData.missingDataReason,
          followUpQuery: writeData.followUpQuery,
        });
        await saveWorkflowToStore(currentState);

        if (currentState.status === 'awaiting_approval') {
          break;
        }
        followUpQuery = writeData.followUpQuery || currentState.topic;
      }
    } catch {
      await failGracefully();
    } finally {
      setIsExecuting(false);
    }
  }

  async function handleStartWorkflow(e: FormEvent) {
    e.preventDefault();
    const cleanedTopic = topicInput.trim();
    if (!cleanedTopic) {
      setExecutionError('Enter a research topic before launching the workflow.');
      return;
    }

    const fresh = createInitialWorkflow({
      topic: cleanedTopic,
      framework,
      provider,
      ownerId: isSignedIn && auth.currentUser ? auth.currentUser.uid : 'local_guest',
      maxCycles,
    });

    await runCyclicPipeline(fresh);
  }

  async function handleApproveHitl(feedback: string, editedMarkdown: string) {
    try {
      const finalized = transitionHumanDecision(activeWorkflow, {
        approved: true,
        feedback,
        editedMarkdown,
      });
      await saveWorkflowToStore(finalized);
    } catch {
      setExecutionError(GENERIC_PROCESSING_ERROR);
    }
  }

  async function handleRejectHitl(feedback: string, editedMarkdown: string) {
    try {
      const revisionState = transitionHumanDecision(activeWorkflow, {
        approved: false,
        feedback,
        editedMarkdown,
      });
      await runCyclicPipeline(revisionState, feedback || activeWorkflow.topic);
    } catch {
      setExecutionError(GENERIC_PROCESSING_ERROR);
    }
  }

  async function handleSignInGoogle() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      setAuthError(GENERIC_PROCESSING_ERROR);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      setProfileOpen(false);
    } catch {
      setAuthError(GENERIC_PROCESSING_ERROR);
    }
  }

  async function handleSaveProfile(updated: UserProfileData) {
    setProfile(updated);
    setFramework(updated.preferredFramework);
    setProvider(updated.preferredProvider);
    if (isSignedIn && auth.currentUser) {
      await saveUserProfile(updated);
    } else {
      localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(updated));
    }
  }

  async function handleDeleteRun(runId: string) {
    const remaining = runs.filter((r) => r.id !== runId);
    setRuns(remaining);
    if (activeRunId === runId) {
      setActiveRunId(remaining[0]?.id ?? '');
    }
    if (isSignedIn && auth.currentUser) {
      await removeWorkflowRun(runId).catch(() => {});
    }
  }

  async function handleCloneRun(run: WorkflowState) {
    const now = new Date().toISOString();
    const cloned: WorkflowState = {
      ...run,
      id: generateRunId('wf'),
      ownerId: isSignedIn && auth.currentUser ? auth.currentUser.uid : 'local_guest',
      title: sanitizeWorkflowTitle(`${run.title} (Copy)`),
      status: 'idle',
      activeNode: 'start',
      createdAt: now,
      updatedAt: now,
    };
    await saveWorkflowToStore(cloned);
    setTopicInput(cloned.topic);
    setFramework(cloned.framework);
    setProvider(cloned.provider);
    setActiveTab('workbench');
  }

  function handleDownloadFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!authReady) {
    return <AppLoadingScreen />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      {/* Three-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="#workbench"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('workbench');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 font-display"
          >
            AgentFlow Studio
          </a>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['workbench', 'Workbench'],
                ['python', 'Python Export'],
                ['history', 'Run History'],
                ['import_export', 'Import & Export'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === key
                    ? 'border-teal-700 dark:border-teal-400 text-slate-900 dark:text-slate-100'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={isDark}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              aria-label={isSignedIn ? `Open profile settings for ${profile.displayName}` : 'Sign in and manage profile'}
              className="inline-flex items-center gap-2.5 pl-2 pr-3 sm:pr-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              <AvatarImage src={profile.avatarUrl} alt={profile.displayName} sizeClass="w-6 h-6" />
              <span className="max-w-[110px] sm:max-w-[140px] truncate">
                {isSignedIn || profile.displayName !== 'Guest Engineer' ? profile.displayName : 'Sign In'}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile navigation row */}
        <nav aria-label="Mobile navigation" className="flex md:hidden border-t border-slate-200 dark:border-slate-800 px-4 overflow-x-auto gap-4">
          {(
            [
              ['workbench', 'Workbench'],
              ['python', 'Python Export'],
              ['history', 'Run History'],
              ['import_export', 'Import & Export'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`py-2.5 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
                activeTab === key
                  ? 'border-teal-700 dark:border-teal-400 text-slate-900 dark:text-slate-100'
                  : 'border-transparent text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main id="workbench" className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <section
          role="note"
          aria-label="Free-tier hardware and API notice"
          className="rounded-xl border-2 border-amber-300 dark:border-amber-700/80 bg-amber-50/90 dark:bg-amber-950/40 px-5 py-4 sm:px-6 sm:py-5 flex items-start gap-4"
        >
          <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700/70 shrink-0 mt-0.5">
            <Clock className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-amber-950 dark:text-amber-100 leading-snug">
              Notice: Running on Free-Tier Hardware &amp; Public APIs
            </h2>
            <p className="text-sm sm:text-base text-amber-900 dark:text-amber-200/90 leading-relaxed">
              Loading the app and running autonomous multi-agent workflows may take extra time because it runs exclusively on free-tier hardware and free public APIs.
            </p>
          </div>
        </section>

        {activeTab === 'workbench' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Profile Summary + Prompt Launcher + Saved Runs */}
            <aside className="lg:col-span-4 space-y-5">
              {/* Launcher Card */}
              <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Autonomous Research Pipeline
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setTopicInput('');
                      setExecutionError(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Clear
                  </button>
                </div>

                <form onSubmit={handleStartWorkflow} className="space-y-4">
                  <div>
                    <label htmlFor="research-topic-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Research Objective
                    </label>
                    <textarea
                      id="research-topic-input"
                      rows={4}
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      placeholder="Describe the technical question for the Researcher & Writer agents..."
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Orchestrator</span>
                      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg" role="group" aria-label="Framework selection">
                        <button
                          type="button"
                          onClick={() => setFramework('langgraph')}
                          className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            framework === 'langgraph'
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          LangGraph
                        </button>
                        <button
                          type="button"
                          onClick={() => setFramework('crewai')}
                          className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            framework === 'crewai'
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          CrewAI
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">LLM Provider</span>
                      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg" role="group" aria-label="Provider selection">
                        <button
                          type="button"
                          onClick={() => setProvider('google')}
                          className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            provider === 'google'
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          Gemini
                        </button>
                        <button
                          type="button"
                          onClick={() => setProvider('groq')}
                          className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            provider === 'groq'
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          Groq
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <label htmlFor="max-cycles-select" className="font-medium text-slate-700 dark:text-slate-300">
                        Max Cyclic Iterations
                      </label>
                      <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">{maxCycles} loops</span>
                    </div>
                    <select
                      id="max-cycles-select"
                      value={maxCycles}
                      onChange={(e) => setMaxCycles(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-500"
                    >
                      <option value={1}>1 cycle (Single-pass Research → Write)</option>
                      <option value={2}>2 cycles (Allows Writer → Researcher gap loop)</option>
                      <option value={3}>3 cycles (Deep iterative verification)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isExecuting}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-700 dark:bg-teal-600 rounded-lg hover:bg-teal-800 dark:hover:bg-teal-500 disabled:opacity-60 transition-colors"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        Executing Multi-Agent Loop…
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" aria-hidden="true" />
                        Run Workflow
                      </>
                    )}
                  </button>
                </form>

                {/* Starter Topics */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Starter Prompts</p>
                  <div className="space-y-1.5">
                    {STARTER_PROMPTS.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => {
                          setTopicInput(sp.topic);
                          setFramework(sp.framework);
                          setProvider(sp.provider);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{sp.title}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Recent Runs Sidebar List */}
              <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Recent Checkpoints</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300"
                  >
                    View All ({runs.length})
                  </button>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {runs.slice(0, 6).map((run) => {
                    const selected = run.id === activeWorkflow.id;
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => setActiveRunId(run.id)}
                        className={`w-full text-left px-5 py-3 transition-colors ${
                          selected ? 'bg-teal-50/60 dark:bg-teal-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{run.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                          {run.framework === 'langgraph' ? 'LangGraph' : 'CrewAI'} · {run.status.replace('_', ' ')} · Cycle {run.cycleCount}/{run.maxCycles}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            </aside>

            {/* Right Main Viewport: Graph + HITL Gate + Report/Sources/Trace */}
            <div className="lg:col-span-8 space-y-5">
              {executionError && (
                <div role="alert" className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <span>{executionError}</span>
                  <button
                    type="button"
                    onClick={() => setExecutionError(null)}
                    className="text-xs font-medium underline shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Active Workflow Summary Header */}
              <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>{activeWorkflow.framework === 'langgraph' ? 'LangGraph' : 'CrewAI'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeWorkflow.provider === 'google' ? 'Google AI Studio' : 'Groq'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeWorkflow.sources.length} sources</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        activeWorkflow.status === 'completed'
                          ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                          : activeWorkflow.status === 'awaiting_approval'
                            ? 'text-amber-700 dark:text-amber-400 font-medium'
                            : 'text-slate-700 dark:text-slate-300 font-medium'
                      }
                    >
                      {activeWorkflow.status === 'awaiting_approval'
                        ? 'Paused at Approval Gate'
                        : activeWorkflow.status.charAt(0).toUpperCase() + activeWorkflow.status.slice(1)}
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1 truncate">
                    {activeWorkflow.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeWorkflow.status === 'completed' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      Finalized
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCloneRun(activeWorkflow)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Clone &amp; Re-run
                  </button>
                </div>
              </div>

              {/* Cyclic Graph Visualization */}
              <WorkflowGraph
                activeNode={activeWorkflow.activeNode}
                status={activeWorkflow.status}
                framework={activeWorkflow.framework}
                cycleCount={activeWorkflow.cycleCount}
                maxCycles={activeWorkflow.maxCycles}
                missingDataReason={activeWorkflow.missingDataReason}
                isDark={isDark}
              />

              {/* Human-in-the-Loop Gate */}
              {activeWorkflow.status === 'awaiting_approval' && (
                <HumanApprovalGate
                  draftMarkdown={activeWorkflow.draftMarkdown}
                  cycleCount={activeWorkflow.cycleCount}
                  maxCycles={activeWorkflow.maxCycles}
                  busy={isExecuting}
                  onApprove={handleApproveHitl}
                  onRequestRevision={handleRejectHitl}
                />
              )}

              {/* Tabbed Output Area: Markdown Report / DuckDuckGo Sources / Execution Trace */}
              <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg" role="tablist" aria-label="Workflow output views">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightPaneTab === 'report'}
                      onClick={() => setRightPaneTab('report')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        rightPaneTab === 'report'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      Markdown Report
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightPaneTab === 'sources'}
                      onClick={() => setRightPaneTab('sources')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                        rightPaneTab === 'sources'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      DuckDuckGo Sources ({activeWorkflow.sources.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightPaneTab === 'trace'}
                      onClick={() => setRightPaneTab('trace')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                        rightPaneTab === 'trace'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      State &amp; Memory Trace ({activeWorkflow.steps.length})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('import_export')}
                    className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 whitespace-nowrap"
                  >
                    Export Formats →
                  </button>
                </div>

                <div className="p-6">
                  {rightPaneTab === 'report' && (
                    <div>
                      {activeWorkflow.status === 'error' ? (
                        <div className="py-10 text-center space-y-2">
                          <p className="text-sm font-medium text-red-700 dark:text-red-300">
                            {GENERIC_PROCESSING_ERROR}
                          </p>
                        </div>
                      ) : activeWorkflow.draftMarkdown ? (
                        <article className="space-y-4 text-sm text-slate-800 dark:text-slate-200 leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-slate-900 dark:[&_h1]:text-slate-100 [&_h1]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_h2]:pt-2 [&_h3]:text-sm [&_h3]:font-semibold dark:[&_h3]:text-slate-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-200 dark:[&_td]:border-slate-700 [&_td]:px-3 [&_td]:py-2 [&_code]:font-mono [&_code]:text-xs [&_code]:bg-slate-100 dark:[&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_a]:text-teal-700 dark:[&_a]:text-teal-400 [&_a]:underline">
                          <Markdown remarkPlugins={[remarkGfm]}>
                            {activeWorkflow.draftMarkdown}
                          </Markdown>
                        </article>
                      ) : (
                        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                          {isExecuting
                            ? 'Agents are executing DuckDuckGo searches and drafting the Markdown report…'
                            : 'No Markdown draft generated yet. Click "Run Workflow" to begin.'}
                        </div>
                      )}
                    </div>
                  )}

                  {rightPaneTab === 'sources' && (
                    <div>
                      {activeWorkflow.sources.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                          No DuckDuckGo search citations recorded for this run yet.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-200 dark:divide-slate-800">
                          {activeWorkflow.sources.map((src) => {
                            const safeHref = sanitizeHttpUrl(src.url);
                            return (
                              <div key={src.id} className="py-3.5 first:pt-0 last:pb-0">
                                <div className="flex items-start justify-between gap-4">
                                  {safeHref ? (
                                    <a
                                      href={safeHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm font-medium text-teal-800 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                                    >
                                      <span>{src.title}</span>
                                      <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                    </a>
                                  ) : (
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                      {src.title}
                                    </span>
                                  )}
                                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                                    Cycle {src.cycle}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{src.snippet}</p>
                                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">
                                  Query: {src.query} · {safeHref || 'Unverified source URL removed'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {rightPaneTab === 'trace' && (
                    <div>
                      {activeWorkflow.steps.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                          State execution trace will appear here step by step.
                        </p>
                      ) : (
                        <ol className="divide-y divide-slate-200 dark:divide-slate-800">
                          {activeWorkflow.steps.map((step, idx) => (
                            <li key={step.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                                  <span className="font-mono text-slate-400 dark:text-slate-500 mr-2 tabular-nums">
                                    {String(idx + 1).padStart(2, '0')}.
                                  </span>
                                  {step.agent} · {step.action}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{step.summary}</p>
                              </div>
                              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                                Cycle {step.cycle}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'python' && (
          <PythonBlueprintView
            framework={framework}
            provider={provider}
            topic={topicInput || activeWorkflow.topic}
            maxCycles={maxCycles}
            onChangeFramework={setFramework}
            onChangeProvider={setProvider}
            onDownloadPython={(filename, code) =>
              handleDownloadFile(filename, code, 'text/x-python;charset=utf-8')
            }
          />
        )}

        {activeTab === 'history' && (
          <RunHistoryView
            runs={runs}
            activeRunId={activeWorkflow.id}
            onSelectRun={(run) => {
              setActiveRunId(run.id);
              setTopicInput(run.topic);
              setFramework(run.framework);
              setProvider(run.provider);
              setActiveTab('workbench');
            }}
            onCloneRun={handleCloneRun}
            onDeleteRun={handleDeleteRun}
            onCreateNewRun={() => setActiveTab('workbench')}
          />
        )}

        {activeTab === 'import_export' && (
          <ImportExportPanel
            workflow={activeWorkflow}
            ownerId={isSignedIn && auth.currentUser ? auth.currentUser.uid : 'local_guest'}
            onImportWorkflow={async (imported) => {
              await saveWorkflowToStore(imported);
              setTopicInput(imported.topic);
              setFramework(imported.framework);
              setProvider(imported.provider);
            }}
            onDownloadFile={handleDownloadFile}
          />
        )}
      </main>

      <ProfileModal
        key={`${profile.uid}_${profile.updatedAt ?? ''}_${profileOpen ? 'open' : 'closed'}`}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        isSignedIn={isSignedIn}
        profile={profile}
        authBusy={authBusy || !authReady}
        authError={authError}
        onSignInGoogle={handleSignInGoogle}
        onSignOut={handleSignOut}
        onSaveProfile={handleSaveProfile}
      />
    </div>
  );
}
