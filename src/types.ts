export type ExerciseCategory = 'compound' | 'isolation' | 'cardio';

export type SetType = 'warmup' | 'approach' | 'effective';

export interface ReferenceRecord {
  id: string;
  type: 'direct_1rm' | 'submax_set';
  weight: number;
  reps?: number;
  rir?: number;
  estimated1RM: number;
  updatedAt: string; // ISO string
  note?: string;
}

export interface PrepSeriesConfig {
  warmupSets: number;
  approachSets: number;
  effectiveSets: number;
  warmupRepsLabel: string;
  approachRepsLabel: string;
}

export interface ManualSuggestedLoads {
  warmup?: number | null;
  approach?: number | null;
  effective?: number | null;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  category: ExerciseCategory;
  instructions: string[];
  commonMistakes: string[];
  safetyTips: string[];
  videoUrl: string;
  youtubeSearchQuery: string;
  isUnilateral?: boolean;
  avoidFailureWarning?: boolean;
  repRangeMin: number;
  repRangeMax: number;
  repRangeLabel: string;
  targetEffectiveSetsMin: number;
  targetEffectiveSetsMax: number;
  defaultTargetRIR: number;
  estimated1RM: number | null;
  referenceData: ReferenceRecord | null;
  referenceHistory: ReferenceRecord[];
  equipmentIncrement: number;
  minEquipmentLoad: number;
  manualLoads?: ManualSuggestedLoads;
  prepConfig: PrepSeriesConfig;
}

export interface WorkoutTemplateExercise {
  exerciseId: string;
  order: number;
  effectiveSetsMin: number;
  effectiveSetsMax: number;
  defaultEffectiveSets: number;
  repRangeMin: number;
  repRangeMax: number;
  repRangeLabel: string;
  warmupSets: number;
  approachSets: number;
  alternativeExerciseId?: string;
  notes?: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  dayOfWeek: number; // 1 = Lunes, ..., 7 = Domingo
  dayName: string;
  isRestDay: boolean;
  restMessage?: string;
  exercises: WorkoutTemplateExercise[];
}

export type SetStatus = 'pending' | 'completed';

export interface SetLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  setType: SetType;
  setNumber: number; // 1-based index across all sets of the exercise
  typeIndex: number; // 1-based index within the same setType (e.g., Efectiva 1, Efectiva 2)
  suggestedLoad: number | null;
  actualLoad: number | null;
  targetRepsLabel: string;
  targetRepsMidpoint: number;
  actualReps: number | null;
  targetRIR: number | null;
  actualRIR: number | null;
  // Cardio specific fields (e.g., Caminadora)
  durationMinutes?: number | null;
  speedKmh?: number | null;
  inclinePercent?: number | null;
  status: SetStatus;
  completedAt: string | null;
  missingDetails?: boolean;
  notes?: string;
}

export type ExerciseCompletionStatus = 'pending' | 'in_progress' | 'completed' | 'completed_incomplete';

export interface ExerciseSessionState {
  exerciseId: string;
  status: ExerciseCompletionStatus;
  completedAt: string | null;
}

export type SessionStatus = 'pending' | 'in_progress' | 'completed' | 'incomplete';

export interface WorkoutSessionSummary {
  durationMinutes: number;
  completedExercisesCount: number;
  totalExercisesCount: number;
  effectiveSetsCompleted: number;
  totalSetsCompleted: number;
  totalVolumeKg: number;
}

export interface WorkoutSession {
  id: string;
  date: string; // YYYY-MM-DD
  weekStartDate: string; // YYYY-MM-DD (Monday of that week)
  templateId: string;
  templateName: string;
  dayOfWeek: number;
  status: SessionStatus;
  startedAt: string; // ISO string
  finishedAt: string | null; // ISO string
  exerciseStates: Record<string, ExerciseSessionState>;
  /** Maps template exerciseId -> chosen alternativeExerciseId for this session */
  exerciseSwaps?: Record<string, string>;
  summary?: WorkoutSessionSummary;
  notes?: string;
}

export interface Settings {
  units: 'kg';
  estimationFormula: 'epley' | 'brzycki';
  warmupPercentage: number; // default 50 (45-55%)
  approachPercentage: number; // default 75 (70-80%)
  secondApproachPercentage: number; // default 85
  defaultRIR: number; // default 2 (1-3)
  defaultIncrement: number; // default 2.5 kg
  targetRepStrategy: 'midpoint' | 'min' | 'max';
  largeText: boolean;
}

export interface UndoAction {
  id: string;
  description: string;
  timestamp: number;
  previousSetLog: SetLog;
  previousExerciseState?: ExerciseSessionState;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  app: 'fitness-mom-pwa';
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  sessions: WorkoutSession[];
  setLogs: SetLog[];
  settings: Settings;
}
