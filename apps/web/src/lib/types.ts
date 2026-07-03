import type {
  Claim,
  Evidence,
  DecisionRecord,
  ModelReview,
  Critique,
  IdeaVersion,
  Project,
  ModelConfig,
  RunEvent,
  ContextManifest,
  ApiResponse,
} from '@repo/shared';

export type { ApiResponse, ContextManifest, RunEvent };

/** Project entity as returned by GET /projects/:id with Prisma includes. */
export interface ProjectWithRelations extends Project {
  ideaVersions?: IdeaVersion[];
  claims?: Claim[];
  evidence?: Evidence[];
  decisions?: DecisionRecord[];
  tasks?: unknown[];
  modelReviews?: ModelReview[];
  critiques?: Critique[];
}

export interface ProjectDashboard {
  project: ProjectWithRelations;
  currentIdeaVersion: IdeaVersion | null;
  latestDecision: DecisionRecord | null;
  claimCounts: {
    total: number;
    supported: number;
    contradicted: number;
    unverified: number;
  };
  evidenceCounts: {
    total: number;
    accepted: number;
    pending_review: number;
  };
  openCriticalIssues: unknown[];
  activeTasks: unknown[];
  nextBestAction: string | { action?: string; description?: string } | null;
}

export interface LatestRunSummary {
  runId: string;
  status: 'running' | 'completed';
  events?: RunEvent[];
}

export interface CreateProjectInput {
  title: string;
  goal: string;
  initialIdea: string;
}

export interface StartRunInput {
  projectId: string;
  modelIds: string[];
  searchProvider?: string;
  loopMode?: 'standard' | 'self_improving' | 'adversarial';
  maxRounds?: number;
  checkpointStages?: string[];
}

export interface CreateEvidenceInput {
  claimId?: string;
  sourceUrl?: string;
  title: string;
  publisher?: string;
  publishedAt?: string;
  sourceType: string;
  excerpt?: string;
  summary?: string;
  stalenessRisk?: 'low' | 'medium' | 'high';
}

export interface CreateDecisionInput {
  decisionStatus: string;
  decisionText: string;
  ideaVersionId: string;
}

export interface ModelCallSummary {
  id: string;
  modelConfigId: string;
  provider: string;
  model: string;
  status: string;
  error?: string | null;
  usage?: unknown;
  createdAt: string;
  completedAt?: string | null;
  contextManifestId?: string | null;
  contextManifest?: ContextManifest | null;
  messages?: { role: string; content: string }[];
  responseText?: string | null;
  responseJson?: unknown;
}

export interface ResearchTask {
  id: string;
  projectId: string;
  title?: string;
  objective?: string;
  status: string;
  role?: string;
  priority?: string;
}

export type {
  Claim,
  Evidence,
  DecisionRecord,
  ModelReview,
  Critique,
  IdeaVersion,
  Project,
  ModelConfig,
};