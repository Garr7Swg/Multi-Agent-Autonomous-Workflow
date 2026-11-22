import type { FrameworkOption, ProviderOption } from '../types/workflow';

export interface PythonBlueprintConfig {
  framework: FrameworkOption;
  provider: ProviderOption;
  topic: string;
  maxCycles: number;
}

export function generatePythonBlueprint(config: PythonBlueprintConfig): {
  filename: string;
  installCommand: string;
  envVarName: string;
  code: string;
} {
  const safeTopic = config.topic.trim().replace(/"/g, '\\"') || 'Autonomous Multi-Agent Research on Agentic AI';
  const maxCycles = Math.min(Math.max(config.maxCycles || 3, 1), 5);
  const envVarName = config.provider === 'google' ? 'GOOGLE_API_KEY' : 'GROQ_API_KEY';

  const llmImport =
    config.provider === 'google'
      ? 'from langchain_google_genai import ChatGoogleGenerativeAI'
      : 'from langchain_groq import ChatGroq';

  const llmInit =
    config.provider === 'google'
      ? `llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.2)`
      : `llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.2)`;

  const providerPkg =
    config.provider === 'google' ? 'langchain-google-genai' : 'langchain-groq';

  if (config.framework === 'langgraph') {
    const code = `"""
Multi-Agent Cyclic Research Pipeline (LangGraph + ${config.provider === 'google' ? 'Google AI Studio' : 'Groq'})
Features:
  1. Researcher Agent equipped with DuckDuckGoSearchRun
  2. Writer Agent with cyclic conditional feedback edge back to Researcher
  3. Persistent SqliteSaver / MemorySaver state + Human-in-the-Loop interrupt
"""

import os
from typing import Annotated, TypedDict, Literal
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_community.tools import DuckDuckGoSearchRun
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
${llmImport}

# Ensure ${envVarName} is exported in your environment before running
${llmInit}
search_tool = DuckDuckGoSearchRun()


class ResearchState(TypedDict):
    topic: str
    messages: Annotated[list[BaseMessage], add_messages]
    research_notes: str
    draft_markdown: str
    missing_info_query: str
    cycle_count: int
    max_cycles: int
    human_approved: bool
    human_feedback: str


def researcher_node(state: ResearchState) -> dict:
    query = state.get("missing_info_query") or state["topic"]
    search_results = search_tool.run(query)

    prompt = [
        SystemMessage(content=(
            "You are a senior Researcher Agent. Summarize concrete facts, benchmarks, "
            "and citations from the DuckDuckGo search results. Highlight any remaining gaps."
        )),
        HumanMessage(content=(
            f"Topic: {state['topic']}\\n"
            f"Current Query: {query}\\n"
            f"Human Feedback: {state.get('human_feedback', 'None')}\\n\\n"
            f"Search Results:\\n{search_results}"
        )),
    ]
    response = llm.invoke(prompt)
    next_cycle = state.get("cycle_count", 0) + 1
    combined_notes = (
        f"{state.get('research_notes', '')}\\n\\n### Cycle {next_cycle}\\n{response.content}"
    ).strip()

    return {
        "research_notes": combined_notes,
        "cycle_count": next_cycle,
        "missing_info_query": "",
        "messages": [response],
    }


def writer_node(state: ResearchState) -> dict:
    prompt = [
        SystemMessage(content=(
            "You are a Writer Agent. Synthesize research notes into a crisp Markdown report. "
            "If key empirical data points are missing AND cycle_count < max_cycles, start your "
            "response with 'MISSING_DATA: <specific search query>' followed by the partial draft."
        )),
        HumanMessage(content=(
            f"Topic: {state['topic']}\\n"
            f"Cycle: {state['cycle_count']} / {state['max_cycles']}\\n"
            f"Human Feedback: {state.get('human_feedback', 'None')}\\n\\n"
            f"Research Notes:\\n{state['research_notes']}"
        )),
    ]
    response = llm.invoke(prompt)
    text = str(response.content)

    missing_query = ""
    if text.startswith("MISSING_DATA:") and state["cycle_count"] < state["max_cycles"]:
        first_line, _, rest = text.partition("\\n")
        missing_query = first_line.replace("MISSING_DATA:", "").strip()
        draft = rest.strip() or text
    else:
        draft = text

    return {
        "draft_markdown": draft,
        "missing_info_query": missing_query,
        "messages": [response],
    }


def route_after_writer(state: ResearchState) -> Literal["researcher", "human_approval"]:
    if state.get("missing_info_query") and state["cycle_count"] < state["max_cycles"]:
        return "researcher"
    return "human_approval"


def human_approval_node(state: ResearchState) -> dict:
    # Execution pauses BEFORE this node via interrupt_before=["human_approval"]
    return {"human_approved": True}


def route_after_human(state: ResearchState) -> Literal["researcher", "__end__"]:
    if state.get("human_approved"):
        return "__end__"
    return "researcher"


def build_graph():
    builder = StateGraph(ResearchState)
    builder.add_node("researcher", researcher_node)
    builder.add_node("writer", writer_node)
    builder.add_node("human_approval", human_approval_node)

    builder.add_edge(START, "researcher")
    builder.add_edge("researcher", "writer")
    builder.add_conditional_edges("writer", route_after_writer)
    builder.add_conditional_edges("human_approval", route_after_human)

    checkpointer = MemorySaver()
    return builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["human_approval"],
    )


if __name__ == "__main__":
    graph = build_graph()
    thread_config = {"configurable": {"thread_id": "research-session-01"}}

    initial_state: ResearchState = {
        "topic": "${safeTopic}",
        "messages": [],
        "research_notes": "",
        "draft_markdown": "",
        "missing_info_query": "",
        "cycle_count": 0,
        "max_cycles": ${maxCycles},
        "human_approved": False,
        "human_feedback": "",
    }

    for event in graph.stream(initial_state, thread_config, stream_mode="values"):
        print(f"[Cycle {event.get('cycle_count', 0)}] Draft length: {len(event.get('draft_markdown', ''))}")

    snapshot = graph.get_state(thread_config)
    print("\\n--- PAUSED AT HUMAN APPROVAL GATE ---")
    print(snapshot.values["draft_markdown"][:1200])

    decision = input("\\nApprove final report? (y/n): ").strip().lower()
    if decision == "y":
        graph.update_state(thread_config, {"human_approved": True})
        for event in graph.stream(None, thread_config, stream_mode="values"):
            pass
        print("\\nWorkflow finalized and saved to checkpoint.")
    else:
        feedback = input("Enter revision instructions for Researcher Agent: ").strip()
        graph.update_state(
            thread_config,
            {"human_approved": False, "human_feedback": feedback, "missing_info_query": feedback},
        )
        for event in graph.stream(None, thread_config, stream_mode="values"):
            print(f"[Revision Cycle {event.get('cycle_count', 0)}] Updated draft.")
`;
    return {
      filename: `langgraph_${config.provider}_pipeline.py`,
      installCommand: `pip install langgraph langchain-community duckduckgo-search ${providerPkg}`,
      envVarName,
      code,
    };
  }

  // CrewAI blueprint
  const code = `"""
Multi-Agent Cyclic Research Crew (CrewAI + ${config.provider === 'google' ? 'Google AI Studio' : 'Groq'})
Features:
  1. Researcher Agent with DuckDuckGoSearchRun tool
  2. Writer Agent synthesizing findings into Markdown
  3. Iterative gap-check loop + Human-in-the-Loop approval gate (human_input=True)
"""

import os
from crewai import Agent, Task, Crew, Process
from crewai.tools import BaseTool
from langchain_community.tools import DuckDuckGoSearchRun
${llmImport}

# Ensure ${envVarName} is exported in your environment before running
${llmInit}
_ddg = DuckDuckGoSearchRun()


class DuckDuckGoTool(BaseTool):
    name: str = "duckduckgo_search"
    description: str = "Search the live web using DuckDuckGo for up-to-date technical facts."

    def _run(self, query: str) -> str:
        return _ddg.run(query)


researcher = Agent(
    role="Senior Technical Researcher",
    goal="Gather verified facts, metrics, and primary sources on the target topic.",
    backstory="You verify technical claims with DuckDuckGo searches before reporting.",
    tools=[DuckDuckGoTool()],
    llm=llm,
    verbose=True,
    allow_delegation=False,
)

writer = Agent(
    role="Principal Technical Writer",
    goal="Synthesize verified research into an executive-grade Markdown report.",
    backstory="You reject shallow drafts and flag missing benchmarks before publishing.",
    llm=llm,
    verbose=True,
    allow_delegation=True,
)


def run_research_crew(topic: str, max_cycles: int = ${maxCycles}):
    feedback_notes = ""
    final_output = ""

    for cycle in range(1, max_cycles + 1):
        research_task = Task(
            description=(
                f"Cycle {cycle}/{max_cycles}: Research '{topic}'. "
                f"Address any prior gaps or human feedback: {feedback_notes or 'None'}."
            ),
            expected_output="Structured bulleted research notes with source URLs.",
            agent=researcher,
        )

        writing_task = Task(
            description=(
                "Synthesize the research notes into a clean Markdown report with headings and tables. "
                "Pause for human approval before finalizing."
            ),
            expected_output="Polished Markdown technical report.",
            agent=writer,
            context=[research_task],
            human_input=True,
        )

        crew = Crew(
            agents=[researcher, writer],
            tasks=[research_task, writing_task],
            process=Process.sequential,
            memory=True,
            verbose=True,
        )

        result = crew.kickoff()
        final_output = str(result)

        approval = input("\\n[HITL Gate] Accept output or loop back to Researcher? (approve/revise): ").strip().lower()
        if approval.startswith("a"):
            break
        feedback_notes = input("Specify missing data points for next cycle: ").strip()

    return final_output


if __name__ == "__main__":
    report = run_research_crew("${safeTopic}", max_cycles=${maxCycles})
    with open("research_report.md", "w", encoding="utf-8") as f:
        f.write(report)
    print("Saved final report to research_report.md")
`;

  return {
    filename: `crewai_${config.provider}_pipeline.py`,
    installCommand: `pip install crewai langchain-community duckduckgo-search ${providerPkg}`,
    envVarName,
    code,
  };
}
