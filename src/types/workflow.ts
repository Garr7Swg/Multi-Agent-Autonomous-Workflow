export type FrameworkOption = 'langgraph' | 'crewai';
export type ProviderOption = 'google' | 'groq';
export type WorkflowStatus = 'idle' | 'running' | 'awaiting_approval' | 'completed' | 'error';
export type AgentNodeId = 'start' | 'researcher' | 'writer' | 'human_gate' | 'final';

export interface SearchSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  query: string;
  cycle: number;
}

export interface ExecutionStep {
  id: string;
  agent: 'Researcher Agent' | 'Writer Agent' | 'State Router' | 'Human Reviewer';
  action: string;
  summary: string;
  cycle: number;
  timestamp: string;
}

export interface WorkflowState {
  id: string;
  ownerId: string;
  title: string;
  topic: string;
  framework: FrameworkOption;
  provider: ProviderOption;
  status: WorkflowStatus;
  activeNode: AgentNodeId;
  cycleCount: number;
  maxCycles: number;
  researchNotes: string;
  draftMarkdown: string;
  humanFeedback: string;
  missingDataReason?: string;
  sources: SearchSource[];
  steps: ExecutionStep[];
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileData {
  uid: string;
  displayName: string;
  email: string;
  roleTitle: string;
  bio: string;
  avatarUrl: string;
  preferredFramework: FrameworkOption;
  preferredProvider: ProviderOption;
  createdAt?: string;
  updatedAt?: string;
}

export interface StarterPrompt {
  id: string;
  title: string;
  topic: string;
  framework: FrameworkOption;
  provider: ProviderOption;
}
