import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { UserProfileData, WorkflowState } from '../types/workflow';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const STUDIO_AVATARS = [
  {
    id: 'researcher',
    label: 'Researcher Portrait',
    url: '/src/assets/images/avatar_ai_researcher_1794579082613.jpg',
  },
  {
    id: 'architect',
    label: 'Systems Architect Portrait',
    url: '/src/assets/images/avatar_systems_architect_1794579081960.jpg',
  },
  {
    id: 'lead',
    label: 'Technical Lead Portrait',
    url: '/src/assets/images/avatar_technical_lead_1794579083368.jpg',
  },
];

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export async function loadOrCreateUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}): Promise<UserProfileData> {
  const userPath = `users/${params.uid}`;
  const ref = doc(db, 'users', params.uid);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: String(data.uid || params.uid),
        displayName: String(data.displayName || params.displayName || 'Engineer'),
        email: String(data.email || params.email || ''),
        roleTitle: String(data.roleTitle || 'AI Systems Engineer'),
        bio: String(data.bio || ''),
        avatarUrl: String(data.avatarUrl || params.photoURL || STUDIO_AVATARS[0].url),
        preferredFramework: data.preferredFramework === 'crewai' ? 'crewai' : 'langgraph',
        preferredProvider: data.preferredProvider === 'groq' ? 'groq' : 'google',
        createdAt: toIsoString(data.createdAt),
        updatedAt: toIsoString(data.updatedAt),
      };
    }

    const freshProfile = {
      uid: params.uid,
      displayName: (params.displayName || params.email.split('@')[0] || 'AI Engineer').slice(0, 80),
      email: params.email.slice(0, 160),
      roleTitle: 'AI Systems Engineer',
      bio: 'Building stateful cyclic multi-agent pipelines with human-in-the-loop checkpoints.',
      avatarUrl: (params.photoURL || STUDIO_AVATARS[0].url).slice(0, 200000),
      preferredFramework: 'langgraph' as const,
      preferredProvider: 'google' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, freshProfile);
    return {
      ...freshProfile,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function saveUserProfile(profile: UserProfileData): Promise<void> {
  const userPath = `users/${profile.uid}`;
  const ref = doc(db, 'users', profile.uid);

  try {
    await updateDoc(ref, {
      displayName: profile.displayName.trim().slice(0, 80) || 'AI Engineer',
      roleTitle: profile.roleTitle.trim().slice(0, 80),
      bio: profile.bio.trim().slice(0, 400),
      avatarUrl: profile.avatarUrl.slice(0, 200000),
      preferredFramework: profile.preferredFramework,
      preferredProvider: profile.preferredProvider,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export async function listUserWorkflows(uid: string): Promise<WorkflowState[]> {
  const colPath = 'workflows';
  try {
    const q = query(collection(db, colPath), where('ownerId', '==', uid));
    const snapshot = await getDocs(q);
    const runs: WorkflowState[] = snapshot.docs.map((d) => {
      const data = d.data();
      const status =
        data.status === 'running' ||
        data.status === 'awaiting_approval' ||
        data.status === 'completed' ||
        data.status === 'error'
          ? data.status
          : 'idle';

      return {
        id: String(data.id || d.id),
        ownerId: String(data.ownerId || uid),
        title: String(data.title || 'Untitled Workflow'),
        topic: String(data.topic || ''),
        framework: data.framework === 'crewai' ? 'crewai' : 'langgraph',
        provider: data.provider === 'groq' ? 'groq' : 'google',
        status,
        activeNode:
          status === 'completed'
            ? 'final'
            : status === 'awaiting_approval'
              ? 'human_gate'
              : 'start',
        cycleCount: Number(data.cycleCount || 0),
        maxCycles: Number(data.maxCycles || 3),
        researchNotes: String(data.researchNotes || ''),
        draftMarkdown: String(data.draftMarkdown || ''),
        humanFeedback: String(data.humanFeedback || ''),
        sources: Array.isArray(data.sources) ? data.sources : [],
        steps: Array.isArray(data.steps) ? data.steps : [],
        createdAt: toIsoString(data.createdAt),
        updatedAt: toIsoString(data.updatedAt),
      };
    });

    return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function persistWorkflowRun(workflow: WorkflowState, uid: string): Promise<void> {
  const safeId = workflow.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const wfPath = `workflows/${safeId}`;
  const ref = doc(db, 'workflows', safeId);

  const sanitizedSources = workflow.sources.slice(0, 30).map((s) => ({
    id: String(s.id || '').slice(0, 80),
    title: String(s.title || '').slice(0, 180),
    url: String(s.url || '').slice(0, 400),
    snippet: String(s.snippet || '').slice(0, 400),
    query: String(s.query || '').slice(0, 160),
    cycle: Number(s.cycle || 1),
  }));

  const sanitizedSteps = workflow.steps.slice(0, 40).map((st) => ({
    id: String(st.id || '').slice(0, 80),
    agent: String(st.agent || 'State Router').slice(0, 60),
    action: String(st.action || '').slice(0, 160),
    summary: String(st.summary || '').slice(0, 320),
    cycle: Number(st.cycle || 0),
    timestamp: String(st.timestamp || new Date().toISOString()).slice(0, 40),
  }));

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        id: safeId,
        ownerId: uid,
        title: (workflow.title || 'Untitled Workflow').slice(0, 160),
        topic: (workflow.topic || 'Untitled Topic').slice(0, 500),
        framework: workflow.framework,
        provider: workflow.provider,
        status: workflow.status,
        cycleCount: Math.min(Math.max(Math.trunc(workflow.cycleCount), 0), 10),
        maxCycles: Math.min(Math.max(Math.trunc(workflow.maxCycles), 1), 5),
        researchNotes: workflow.researchNotes.slice(0, 40000),
        draftMarkdown: workflow.draftMarkdown.slice(0, 80000),
        humanFeedback: workflow.humanFeedback.slice(0, 4000),
        sources: sanitizedSources,
        steps: sanitizedSteps,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const existingData = existingSnap.data();
    if (existingData.status === 'completed') {
      return; // Terminal state lock respected
    }

    if (existingData.status === 'awaiting_approval' && workflow.status === 'completed') {
      await updateDoc(ref, {
        status: 'completed',
        draftMarkdown: workflow.draftMarkdown.slice(0, 80000),
        humanFeedback: workflow.humanFeedback.slice(0, 4000),
        steps: sanitizedSteps,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: (workflow.title || 'Untitled Workflow').slice(0, 160),
        topic: (workflow.topic || 'Untitled Topic').slice(0, 500),
        framework: workflow.framework,
        provider: workflow.provider,
        status: workflow.status === 'completed' ? 'awaiting_approval' : workflow.status,
        cycleCount: Math.min(Math.max(Math.trunc(workflow.cycleCount), 0), 10),
        maxCycles: Math.min(Math.max(Math.trunc(workflow.maxCycles), 1), 5),
        researchNotes: workflow.researchNotes.slice(0, 40000),
        draftMarkdown: workflow.draftMarkdown.slice(0, 80000),
        humanFeedback: workflow.humanFeedback.slice(0, 4000),
        sources: sanitizedSources,
        steps: sanitizedSteps,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, wfPath);
  }
}

export async function removeWorkflowRun(workflowId: string): Promise<void> {
  const safeId = workflowId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const wfPath = `workflows/${safeId}`;
  try {
    await deleteDoc(doc(db, 'workflows', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, wfPath);
  }
}
