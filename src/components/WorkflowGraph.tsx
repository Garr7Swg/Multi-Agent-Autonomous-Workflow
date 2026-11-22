import type { AgentNodeId, FrameworkOption, WorkflowStatus } from '../types/workflow';

interface WorkflowGraphProps {
  activeNode: AgentNodeId;
  status: WorkflowStatus;
  framework: FrameworkOption;
  cycleCount: number;
  maxCycles: number;
  missingDataReason?: string;
  isDark?: boolean;
}

export function WorkflowGraph({
  activeNode,
  status,
  framework,
  cycleCount,
  maxCycles,
  missingDataReason,
  isDark = false,
}: WorkflowGraphProps) {
  const isNodeActive = (id: AgentNodeId) => activeNode === id;

  const nodeStyle = (id: AgentNodeId) => {
    if (isNodeActive(id)) {
      if (status === 'awaiting_approval' && id === 'human_gate') {
        return isDark
          ? { fill: '#451A03', stroke: '#F59E0B', text: '#FEF3C7', subtext: '#FCD34D' }
          : { fill: '#FEF3C7', stroke: '#D97706', text: '#92400E', subtext: '#B45309' };
      }
      if (status === 'completed' && id === 'final') {
        return isDark
          ? { fill: '#052E16', stroke: '#22C55E', text: '#DCFCE7', subtext: '#86EFAC' }
          : { fill: '#DCFCE7', stroke: '#16A34A', text: '#14532D', subtext: '#15803D' };
      }
      return isDark
        ? { fill: '#042F2E', stroke: '#14B8A6', text: '#CCFBF1', subtext: '#5EEAD4' }
        : { fill: '#CCFBF1', stroke: '#0F766E', text: '#134E4A', subtext: '#0F766E' };
    }
    return isDark
      ? { fill: '#1E293B', stroke: '#334155', text: '#F1F5F9', subtext: '#94A3B8' }
      : { fill: '#FFFFFF', stroke: '#CBD5E1', text: '#0F172A', subtext: '#64748B' };
  };

  const researcherColors = nodeStyle('researcher');
  const writerColors = nodeStyle('writer');
  const gateColors = nodeStyle('human_gate');
  const finalColors = nodeStyle('final');
  const cyclicActive = Boolean(missingDataReason) || (activeNode === 'researcher' && cycleCount > 0);
  const edgeStroke = isDark ? '#64748B' : '#64748B';
  const mutedLabel = isDark ? '#94A3B8' : '#64748B';
  const tealAccent = isDark ? '#2DD4BF' : '#0F766E';
  const amberAccent = isDark ? '#F59E0B' : '#D97706';

  return (
    <div
      className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5"
      data-testid="workflow-graph"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {framework === 'langgraph' ? 'LangGraph Cyclic State Topology' : 'CrewAI Iterative Delegation Flow'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            Cycle {cycleCount} of {maxCycles} · State: {status.replace('_', ' ')}
          </p>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span>Active Node: </span>
          <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{activeNode}</span>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox="0 0 880 215"
          className="w-full min-w-[680px] h-auto select-none"
          role="img"
          aria-label="Multi-agent cyclic research graph showing Researcher Agent, Writer Agent, cyclic feedback edge, Human Approval Gate, and Final Report"
        >
          <defs>
            <marker id="arrow-slate" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill={edgeStroke} />
            </marker>
            <marker id="arrow-teal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill={tealAccent} />
            </marker>
            <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill={amberAccent} />
            </marker>
          </defs>

          {/* Forward edges */}
          <line x1="90" y1="88" x2="142" y2="88" stroke={edgeStroke} strokeWidth="1.75" markerEnd="url(#arrow-slate)" />
          <line x1="330" y1="88" x2="378" y2="88" stroke={edgeStroke} strokeWidth="1.75" markerEnd="url(#arrow-slate)" />
          <line x1="560" y1="88" x2="606" y2="88" stroke={edgeStroke} strokeWidth="1.75" markerEnd="url(#arrow-slate)" />
          <line x1="752" y1="88" x2="788" y2="88" stroke={edgeStroke} strokeWidth="1.75" markerEnd="url(#arrow-slate)" />

          {/* Cyclic edge: Writer -> Researcher */}
          <path
            d="M 468 124 C 468 178, 240 178, 240 128"
            fill="none"
            stroke={cyclicActive ? tealAccent : isDark ? '#475569' : '#94A3B8'}
            strokeWidth={cyclicActive ? '2.25' : '1.5'}
            strokeDasharray="5 4"
            markerEnd={cyclicActive ? 'url(#arrow-teal)' : 'url(#arrow-slate)'}
          />
          <text
            x="354"
            y="189"
            textAnchor="middle"
            className="text-[11px] font-mono"
            fill={cyclicActive ? tealAccent : mutedLabel}
          >
            missing data / revision cycle (max {maxCycles})
          </text>

          {/* Human Rejection edge: Human Gate -> Researcher */}
          <path
            d="M 679 52 C 679 16, 240 16, 240 48"
            fill="none"
            stroke={
              status === 'running' && activeNode === 'researcher' && cycleCount > 0
                ? amberAccent
                : isDark
                  ? '#334155'
                  : '#CBD5E1'
            }
            strokeWidth="1.5"
            strokeDasharray="4 4"
            markerEnd="url(#arrow-amber)"
          />
          <text x="460" y="20" textAnchor="middle" className="text-[11px] font-mono" fill={mutedLabel}>
            human revision loop (reject / feedback)
          </text>

          {/* Node 0: START */}
          <circle
            cx="56"
            cy="88"
            r="30"
            fill={
              activeNode === 'start'
                ? isDark
                  ? '#042F2E'
                  : '#CCFBF1'
                : isDark
                  ? '#1E293B'
                  : '#F8FAFC'
            }
            stroke={
              activeNode === 'start'
                ? tealAccent
                : isDark
                  ? '#334155'
                  : '#CBD5E1'
            }
            strokeWidth="1.75"
          />
          <text
            x="56"
            y="92"
            textAnchor="middle"
            className="text-[12px] font-semibold"
            fill={isDark ? '#F1F5F9' : '#0F172A'}
          >
            START
          </text>

          {/* Node 1: Researcher Agent */}
          <rect
            x="146"
            y="50"
            width="184"
            height="76"
            rx="10"
            fill={researcherColors.fill}
            stroke={researcherColors.stroke}
            strokeWidth="1.75"
          />
          <text x="238" y="80" textAnchor="middle" className="text-[13px] font-semibold" fill={researcherColors.text}>
            Researcher Agent
          </text>
          <text x="238" y="100" textAnchor="middle" className="text-[11px]" fill={researcherColors.subtext}>
            DuckDuckGo Search Tool
          </text>

          {/* Node 2: Writer Agent */}
          <rect
            x="382"
            y="50"
            width="178"
            height="76"
            rx="10"
            fill={writerColors.fill}
            stroke={writerColors.stroke}
            strokeWidth="1.75"
          />
          <text x="471" y="80" textAnchor="middle" className="text-[13px] font-semibold" fill={writerColors.text}>
            Writer Agent
          </text>
          <text x="471" y="100" textAnchor="middle" className="text-[11px]" fill={writerColors.subtext}>
            Markdown + Gap Check
          </text>

          {/* Node 3: Human Gate */}
          <rect
            x="610"
            y="50"
            width="142"
            height="76"
            rx="10"
            fill={gateColors.fill}
            stroke={gateColors.stroke}
            strokeWidth="1.75"
          />
          <text x="681" y="80" textAnchor="middle" className="text-[13px] font-semibold" fill={gateColors.text}>
            Human Gate
          </text>
          <text x="681" y="100" textAnchor="middle" className="text-[11px]" fill={gateColors.subtext}>
            {framework === 'langgraph' ? 'interrupt_before' : 'human_input=True'}
          </text>

          {/* Node 4: Final Report */}
          <rect
            x="792"
            y="56"
            width="78"
            height="64"
            rx="10"
            fill={finalColors.fill}
            stroke={finalColors.stroke}
            strokeWidth="1.75"
          />
          <text x="831" y="85" textAnchor="middle" className="text-[12px] font-semibold" fill={finalColors.text}>
            Final
          </text>
          <text x="831" y="102" textAnchor="middle" className="text-[11px]" fill={finalColors.subtext}>
            Saved
          </text>
        </svg>
      </div>
    </div>
  );
}
