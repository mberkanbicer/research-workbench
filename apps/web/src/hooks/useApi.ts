/**
 * Barrel re-export — all API hooks are now in domain-specific files:
 *
 *   useProjects.ts        Project CRUD, portfolio, templates, export
 *   useRuns.ts            Run lifecycle, comparison, model calls, tasks
 *   useClaims.ts          Claims, dependencies, confidence history, version comparison
 *   useEvidence.ts        Evidence CRUD, search, quality, staleness, provenance
 *   useModels.ts          Model CRUD, test, key management
 *   useHypotheses.ts      Hypothesis CRUD
 *   useSettings.ts        Search provider settings
 *   usePrompts.ts         Prompt management
 *   useLiterature.ts      Literature reviews
 *   useAnnotations.ts     Annotations + search
 *   useEvaluationCriteria.ts Evaluation criteria + scores
 *   useGraph.ts           Citation graph, calibration, cross-project search, export
 *   usePresence.ts        Real-time presence
 */

export {
  useProjects,
  useProject,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useArchiveProject,
  usePortfolio,
  useTemplates,
  useCreateProjectFromTemplate,
  useIdeaVersions,
  useCreateIdeaVersion,
  useDecisions,
  useCreateDecision,
  useExport,
} from './useProjects';

export {
  useLatestRun,
  useStartRun,
  useRetryRun,
  useRunModelCalls,
  useRunContextManifests,
  useRunTask,
  useUpdateTask,
  useRunComparison,
} from './useRuns';

export {
  useClaims,
  useExtractClaims,
  useUpdateClaim,
  useClaimConfidenceHistory,
  useCompareVersions,
  useClaimDependencies,
  useProjectClaimDependencies,
  useAddClaimDependency,
  useAutoDetectDependencies,
} from './useClaims';

export {
  useEvidence,
  useCreateEvidence,
  useSearchEvidence,
  useSearchCounterEvidence,
  useAssessEvidence,
  useEvidenceQuality,
  useStaleEvidence,
  useVerifyEvidence,
  useEvidenceProvenance,
} from './useEvidence';

export {
  useModels,
  useCreateModel,
  useUpdateModel,
  useDeleteModel,
  useTestModel,
  useUpdateModelKey,
  useModelKey,
} from './useModels';

export {
  useHypotheses,
  useCreateHypothesis,
  useUpdateHypothesis,
  useDeleteHypothesis,
} from './useHypotheses';

export {
  useSearchProviderSettings,
  useUpdateSearchProviderSettings,
} from './useSettings';

export {
  usePromptRoles,
  usePromptHistory,
  useUpdatePrompt,
  useResetPrompt,
} from './usePrompts';

export {
  useLiteratureReviews,
  useCreateLiteratureReview,
  useLiteratureReview,
} from './useLiterature';

export {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useSearchAnnotations,
} from './useAnnotations';

export {
  useEvaluationCriteria,
  useCreateCriteria,
  useEvidenceScores,
  useAddEvidenceScore,
} from './useEvaluationCriteria';

export {
  useCitationGraph,
  useCalibration,
  useDatasetExport,
  useCrossProjectSearch,
  useRelatedProjects,
  useReproducibilityPack,
  useArgumentMap,
} from './useGraph';

export {
  usePresence,
  useUpdatePresence,
} from './usePresence';

export {
  useDocumentPermissions,
  useCheckDocumentAccess,
  useGrantDocumentPermission,
  useUpdateDocumentPermission,
  useRevokeDocumentPermission,
  useDocumentVersions,
  useDocumentVersion,
  useCreateDocumentVersion,
  useRestoreDocumentVersion,
  useDocumentComments,
  useCreateDocumentComment,
  useUpdateDocumentComment,
  useDeleteDocumentComment,
  useResolveDocumentComment,
  useReferences,
  useCreateReference,
  useDeleteReference,
  useImportReferences,
  useExportReferences,
  useMarketplaceTemplates,
  useMarketplaceTemplate,
  useMarketplaceCategories,
  usePublishTemplate,
  useUseMarketplaceTemplate,
  useCollaborators,
} from './useCollaboration';

export {
  useWebSocket,
} from './useWebSocket';
