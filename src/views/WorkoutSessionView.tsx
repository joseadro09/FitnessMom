import React, { useState } from 'react';
import {
  Exercise,
  ExerciseSessionState,
  SetLog,
  SetType,
  Settings,
  UndoAction,
  WorkoutSession,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from '../types';
import {
  calculateExerciseLoads,
  computeSessionSummary,
  formatLocalDateSpanish,
  formatTimeSpanish,
  generateInitialSetsForExercise,
} from '../utils/calculations';
import {
  AlertTriangle,
  ArrowLeftRight,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  Dumbbell,
  History,
  Minus,
  PlayCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
  Undo2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadConfigModal } from '../components/LoadConfigModal';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';

interface WorkoutSessionViewProps {
  templates: WorkoutTemplate[];
  selectedTemplate: WorkoutTemplate;
  targetDateISO: string;
  exercises: Exercise[];
  session: WorkoutSession | null;
  sessionLogs: SetLog[];
  allSessions: WorkoutSession[];
  allSetLogs: SetLog[];
  settings: Settings;
  onSelectTemplateDay: (template: WorkoutTemplate) => void;
  onEnsureSessionStarted: () => WorkoutSession;
  onUpsertSetLog: (log: SetLog, undoDescription?: string) => void;
  onDeleteSetLog: (logId: string) => void;
  onUpdateSession: (updated: WorkoutSession) => void;
  onUpdateExercise: (updated: Exercise) => void;
  undoStack: UndoAction[];
  onUndoLast: () => void;
}

export const WorkoutSessionView: React.FC<WorkoutSessionViewProps> = ({
  templates,
  selectedTemplate,
  targetDateISO,
  exercises,
  session,
  sessionLogs,
  allSessions,
  allSetLogs,
  settings,
  onSelectTemplateDay,
  onEnsureSessionStarted,
  onUpsertSetLog,
  onDeleteSetLog,
  onUpdateSession,
  onUpdateExercise,
  undoStack,
  onUndoLast,
}) => {
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(
    null
  );
  const [configLoadExercise, setConfigLoadExercise] = useState<{
    exercise: Exercise;
    templateItem: WorkoutTemplateExercise | null;
  } | null>(null);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);

  // Confirmación para terminar un ejercicio con series pendientes
  const [incompleteExConfirm, setIncompleteExConfirm] = useState<{
    exerciseId: string;
    exerciseName: string;
    pendingCount: number;
  } | null>(null);

  // Confirmación para finalizar la rutina completa
  const [finishRoutineConfirmOpen, setFinishRoutineConfirmOpen] =
    useState(false);

  // Resolver ejercicio activo para un item de plantilla (considerando swap ej. Hack Squat <-> Leg Press)
  const getActiveExerciseForItem = (
    item: WorkoutTemplateExercise
  ): Exercise | undefined => {
    const swappedId = session?.exerciseSwaps?.[item.exerciseId];
    const targetId = swappedId || item.exerciseId;
    return exercises.find((e) => e.id === targetId);
  };

  // Obtener las series actuales de un ejercicio en la sesión (o su vista previa si aún no se ha iniciado)
  const getSetsForExercise = (
    exercise: Exercise,
    item: WorkoutTemplateExercise
  ): SetLog[] => {
    const existing = sessionLogs
      .filter((l) => l.exerciseId === exercise.id)
      .sort((a, b) => a.setNumber - b.setNumber);

    if (existing.length > 0) {
      return existing;
    }

    const previewSessionId = session?.id || 'preview';
    return generateInitialSetsForExercise(
      previewSessionId,
      exercise,
      item,
      settings
    );
  };

  // Obtener el último rendimiento histórico de un ejercicio en sesiones anteriores
  const getLastPerformanceForExercise = (
    exerciseId: string
  ): { weight: number; reps: number; date: string } | null => {
    const pastCompletedLogs = allSetLogs.filter(
      (l) =>
        l.exerciseId === exerciseId &&
        l.sessionId !== session?.id &&
        l.status === 'completed' &&
        l.setType === 'effective' &&
        l.actualLoad !== null &&
        l.actualReps !== null
    );
    if (pastCompletedLogs.length === 0) return null;

    pastCompletedLogs.sort((a, b) =>
      (b.completedAt || '').localeCompare(a.completedAt || '')
    );
    const latest = pastCompletedLogs[0];
    const pastSess = allSessions.find((s) => s.id === latest.sessionId);
    return {
      weight: latest.actualLoad!,
      reps: latest.actualReps!,
      date: pastSess?.date || (latest.completedAt || '').split('T')[0],
    };
  };

  // Asegurar que cuando la usuaria interactúa con una serie, existan todas las series del ejercicio en la BD
  const ensureExerciseSetsPersisted = (
    activeSession: WorkoutSession,
    exercise: Exercise,
    item: WorkoutTemplateExercise
  ): SetLog[] => {
    const existing = sessionLogs
      .filter((l) => l.exerciseId === exercise.id)
      .sort((a, b) => a.setNumber - b.setNumber);

    if (existing.length > 0) {
      return existing;
    }

    const generated = generateInitialSetsForExercise(
      activeSession.id,
      exercise,
      item,
      settings
    );
    for (const s of generated) {
      onUpsertSetLog(s);
    }
    return generated;
  };

  // Cambiar entre Hack Squat y Leg Press (o cualquier alternativa configurada)
  const handleSwapExercise = (item: WorkoutTemplateExercise) => {
    if (!item.alternativeExerciseId) return;
    const activeSess = session || onEnsureSessionStarted();
    const currentSwapped = activeSess.exerciseSwaps?.[item.exerciseId];
    const nextId =
      currentSwapped === item.alternativeExerciseId
        ? item.exerciseId
        : item.alternativeExerciseId;

    const updatedSwaps = {
      ...(activeSess.exerciseSwaps || {}),
      [item.exerciseId]: nextId,
    };

    onUpdateSession({
      ...activeSess,
      exerciseSwaps: updatedSwaps,
    });
    setExpandedExerciseId(nextId);
  };

  // Registrar o actualizar una serie
  const handleToggleSetStatus = (
    exercise: Exercise,
    item: WorkoutTemplateExercise,
    targetSet: SetLog
  ) => {
    const activeSess = session || onEnsureSessionStarted();
    const persistedSets = ensureExerciseSetsPersisted(
      activeSess,
      exercise,
      item
    );
    const currentSet =
      persistedSets.find((s) => s.setNumber === targetSet.setNumber) ||
      targetSet;

    const isCompleting = currentSet.status !== 'completed';
    const nowIso = new Date().toISOString();

    let actualLoad: number | null =
      targetSet.actualLoad ?? currentSet.suggestedLoad;
    let actualReps: number | null =
      targetSet.actualReps ?? currentSet.targetRepsMidpoint;
    let missingDetails = false;

    if (exercise.category !== 'cardio') {
      if (actualLoad === null || actualLoad === undefined || actualLoad <= 0) {
        actualLoad = null;
        if (isCompleting) missingDetails = true;
      }
      if (actualReps === null || actualReps === undefined || actualReps <= 0) {
        actualReps = null;
        if (isCompleting) missingDetails = true;
      }
    }

    const updatedSet: SetLog = {
      ...currentSet,
      ...targetSet,
      id: `${activeSess.id}_${exercise.id}_${currentSet.setType}_${currentSet.setNumber}`,
      sessionId: activeSess.id,
      status: isCompleting ? 'completed' : 'pending',
      actualLoad,
      actualReps,
      completedAt: isCompleting ? nowIso : null,
      missingDetails: isCompleting ? missingDetails : false,
    };

    const labelType =
      currentSet.setType === 'warmup'
        ? 'Calentamiento'
        : currentSet.setType === 'approach'
        ? `Aproximación ${currentSet.typeIndex}`
        : `Efectiva ${currentSet.typeIndex}`;

    onUpsertSetLog(
      updatedSet,
      isCompleting
        ? `${exercise.name.split('(')[0].trim()} — ${labelType} registrada`
        : `${exercise.name.split('(')[0].trim()} — ${labelType} desmarcada`
    );

    // Actualizar el estado del ejercicio en la sesión
    const otherSets = persistedSets.filter(
      (s) => s.setNumber !== currentSet.setNumber
    );
    const allUpdatedSets = [...otherSets, updatedSet];
    const completedCount = allUpdatedSets.filter(
      (s) => s.status === 'completed'
    ).length;

    const prevExState = activeSess.exerciseStates[exercise.id];
    let nextExStatus: ExerciseSessionState['status'] = 'in_progress';
    if (completedCount === 0) {
      nextExStatus = 'pending';
    } else if (
      prevExState?.status === 'completed' &&
      completedCount === allUpdatedSets.length
    ) {
      nextExStatus = 'completed';
    }

    onUpdateSession({
      ...activeSess,
      status:
        activeSess.status === 'completed' ? 'in_progress' : activeSess.status,
      exerciseStates: {
        ...activeSess.exerciseStates,
        [exercise.id]: {
          exerciseId: exercise.id,
          status: nextExStatus,
          completedAt:
            nextExStatus === 'completed'
              ? prevExState?.completedAt || nowIso
              : null,
        },
      },
    });
  };

  // Editar un campo numérico de una serie (en vivo, tanto pendiente como realizada)
  const handleFieldChange = (
    exercise: Exercise,
    item: WorkoutTemplateExercise,
    targetSet: SetLog,
    changes: Partial<SetLog>
  ) => {
    const activeSess = session || onEnsureSessionStarted();
    const persistedSets = ensureExerciseSetsPersisted(
      activeSess,
      exercise,
      item
    );
    const currentSet =
      persistedSets.find((s) => s.setNumber === targetSet.setNumber) ||
      targetSet;

    const nextLoad =
      changes.actualLoad !== undefined
        ? changes.actualLoad
        : currentSet.actualLoad;
    const nextReps =
      changes.actualReps !== undefined
        ? changes.actualReps
        : currentSet.actualReps;

    const stillMissing =
      currentSet.status === 'completed' &&
      exercise.category !== 'cardio' &&
      (nextLoad === null || nextLoad <= 0 || nextReps === null || nextReps <= 0);

    const updatedSet: SetLog = {
      ...currentSet,
      ...changes,
      id: `${activeSess.id}_${exercise.id}_${currentSet.setType}_${currentSet.setNumber}`,
      sessionId: activeSess.id,
      missingDetails: stillMissing,
    };

    onUpsertSetLog(updatedSet);
  };

  // Añadir una serie adicional (calentamiento, aproximación o efectiva)
  const handleAddSet = (
    exercise: Exercise,
    item: WorkoutTemplateExercise,
    setType: SetType
  ) => {
    const activeSess = session || onEnsureSessionStarted();
    const currentSets = ensureExerciseSetsPersisted(
      activeSess,
      exercise,
      item
    );
    const loads = calculateExerciseLoads(exercise, item, settings);

    const sameTypeSets = currentSets.filter((s) => s.setType === setType);
    const nextTypeIndex = sameTypeSets.length + 1;
    const nextSetNumber = currentSets.length + 1;

    const suggestedLoad =
      setType === 'warmup'
        ? loads.warmupLoad
        : setType === 'approach'
        ? nextTypeIndex > 1
          ? loads.secondApproachLoad ?? loads.approachLoad
          : loads.approachLoad
        : loads.effectiveLoad;

    const targetRepsLabel =
      setType === 'warmup'
        ? exercise.prepConfig.warmupRepsLabel || '12–15 reps'
        : setType === 'approach'
        ? exercise.prepConfig.approachRepsLabel || '6–8 reps'
        : item.repRangeLabel;

    const targetRepsMidpoint =
      setType === 'warmup'
        ? 12
        : setType === 'approach'
        ? 7
        : loads.targetReps;

    const newSet: SetLog = {
      id: `${activeSess.id}_${exercise.id}_${setType}_${Date.now()}`,
      sessionId: activeSess.id,
      exerciseId: exercise.id,
      setType,
      setNumber: nextSetNumber,
      typeIndex: nextTypeIndex,
      suggestedLoad,
      actualLoad: suggestedLoad,
      targetRepsLabel,
      targetRepsMidpoint,
      actualReps: targetRepsMidpoint,
      targetRIR: setType === 'effective' ? loads.targetRIR : null,
      actualRIR: setType === 'effective' ? loads.targetRIR : null,
      status: 'pending',
      completedAt: null,
    };

    onUpsertSetLog(newSet);
  };

  // Quitar la última serie pendiente si la usuaria añadió una de más
  const handleRemoveSet = (targetSet: SetLog) => {
    if (targetSet.status === 'completed') return;
    onDeleteSetLog(targetSet.id);
  };

  // Terminar ejercicio
  const handleRequestFinishExercise = (
    exercise: Exercise,
    sets: SetLog[]
  ) => {
    const pendingCount = sets.filter((s) => s.status !== 'completed').length;
    if (pendingCount > 0) {
      setIncompleteExConfirm({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        pendingCount,
      });
      return;
    }
    markExerciseFinished(exercise.id, 'completed');
  };

  const markExerciseFinished = (
    exerciseId: string,
    status: 'completed' | 'completed_incomplete'
  ) => {
    const activeSess = session || onEnsureSessionStarted();
    onUpdateSession({
      ...activeSess,
      exerciseStates: {
        ...activeSess.exerciseStates,
        [exerciseId]: {
          exerciseId,
          status,
          completedAt: new Date().toISOString(),
        },
      },
    });
    setIncompleteExConfirm(null);
  };

  const handleReopenExercise = (exerciseId: string) => {
    if (!session) return;
    onUpdateSession({
      ...session,
      status: session.status === 'completed' ? 'in_progress' : session.status,
      exerciseStates: {
        ...session.exerciseStates,
        [exerciseId]: {
          exerciseId,
          status: 'in_progress',
          completedAt: null,
        },
      },
    });
  };

  // Finalizar rutina completa
  const handleConfirmFinishRoutine = () => {
    const activeSess = session || onEnsureSessionStarted();
    const nowIso = new Date().toISOString();

    const activeExerciseIds = selectedTemplate.exercises.map((item) => {
      const ex = getActiveExerciseForItem(item);
      return ex ? ex.id : item.exerciseId;
    });

    const completedExCount = activeExerciseIds.filter((id) => {
      const st = activeSess.exerciseStates[id]?.status;
      if (st === 'completed' || st === 'completed_incomplete') return true;
      const exLogs = sessionLogs.filter(
        (l) => l.exerciseId === id && l.status === 'completed'
      );
      return exLogs.length > 0;
    }).length;

    const allCompleted =
      completedExCount >= selectedTemplate.exercises.length &&
      sessionLogs.some((l) => l.status === 'completed');

    const summary = computeSessionSummary(
      activeSess.startedAt,
      nowIso,
      selectedTemplate.exercises.length,
      completedExCount,
      sessionLogs
    );

    onUpdateSession({
      ...activeSess,
      status: allCompleted ? 'completed' : 'incomplete',
      finishedAt: nowIso,
      summary,
    });
    setFinishRoutineConfirmOpen(false);
  };

  // Reabrir sesión finalizada por error
  const handleReopenRoutine = () => {
    if (!session) return;
    onUpdateSession({
      ...session,
      status: 'in_progress',
      finishedAt: null,
    });
  };

  // Calcular métricas globales de la sesión actual
  const totalExercisesCount = selectedTemplate.exercises.length;
  const finishedExercisesCount = selectedTemplate.exercises.filter((item) => {
    const ex = getActiveExerciseForItem(item);
    if (!ex || !session) return false;
    const st = session.exerciseStates[ex.id]?.status;
    return st === 'completed' || st === 'completed_incomplete';
  }).length;

  const completedEffectiveSetsCount = sessionLogs.filter(
    (l) => l.status === 'completed' && l.setType === 'effective'
  ).length;
  const completedTotalSetsCount = sessionLogs.filter(
    (l) => l.status === 'completed'
  ).length;

  return (
    <div className="view-container">
      {/* Selector rápido de día de la semana */}
      <div className="day-selector-strip" role="tablist" aria-label="Días de la semana">
        {templates.map((tpl) => {
          const isSelected = tpl.id === selectedTemplate.id;
          return (
            <button
              key={tpl.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`day-tab-btn ${isSelected ? 'active' : ''} ${
                tpl.isRestDay ? 'rest-tab' : ''
              }`}
              onClick={() => onSelectTemplateDay(tpl)}
            >
              <span className="day-tab-short">{tpl.dayName.slice(0, 3)}</span>
              <span className="day-tab-sub">{tpl.shortName}</span>
            </button>
          );
        })}
      </div>

      {/* Cabecera de la sesión */}
      <section className="routine-header-card">
        <div className="routine-header-top">
          <div>
            <span className="routine-date-label">
              {selectedTemplate.dayName} •{' '}
              {formatLocalDateSpanish(session?.date || targetDateISO)}
            </span>
            <h1 className="routine-main-title">{selectedTemplate.name}</h1>
            <p className="routine-subtitle">{selectedTemplate.subtitle}</p>
          </div>
          {!selectedTemplate.isRestDay && (
            <div className="routine-status-box">
              {!session || session.status === 'pending' ? (
                <span className="status-pill pending">Pendiente</span>
              ) : session.status === 'in_progress' ? (
                <span className="status-pill in-progress">En curso</span>
              ) : session.status === 'completed' ? (
                <span className="status-pill completed">Completada</span>
              ) : (
                <span className="status-pill incomplete">Incompleta</span>
              )}
            </div>
          )}
        </div>

        {!selectedTemplate.isRestDay && (
          <div className="routine-progress-bar-wrap">
            <div className="routine-progress-stats">
              <span>
                <strong>{finishedExercisesCount}</strong> de{' '}
                <strong>{totalExercisesCount}</strong> ejercicios terminados
              </span>
              <span>
                <strong>{completedEffectiveSetsCount}</strong> series efectivas
                ({completedTotalSetsCount} totales)
              </span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={finishedExercisesCount}
              aria-valuemin={0}
              aria-valuemax={totalExercisesCount}
            >
              <div
                className="progress-fill"
                style={{
                  width: `${
                    totalExercisesCount > 0
                      ? Math.round(
                          (finishedExercisesCount / totalExercisesCount) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>

            {undoStack.length > 0 && (
              <div className="undo-bar" role="status" aria-live="polite">
                <span className="undo-text">
                  Última acción: <strong>{undoStack[0].description}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-undo"
                  onClick={onUndoLast}
                >
                  <Undo2 size={16} aria-hidden="true" /> Deshacer último registro
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Si es Día de Descanso */}
      {selectedTemplate.isRestDay ? (
        <section className="rest-day-card">
          <Coffee size={40} aria-hidden="true" className="rest-icon" />
          <h2>{selectedTemplate.name}</h2>
          <p className="rest-main-msg">
            {selectedTemplate.restMessage ||
              'Día de descanso. Puedes descansar o hacer una caminata suave.'}
          </p>
          <p className="rest-sub-msg">
            El descanso es cuando tus músculos y glúteos se recuperan y crecen.
            Este día no cuenta como rutina pendiente ni incumplida. Si hoy
            deseas recuperar el entrenamiento de otro día, selecciónalo en la
            barra superior.
          </p>
        </section>
      ) : (
        <>
          {/* Tarjeta de Resumen cuando la rutina está finalizada */}
          {session &&
            (session.status === 'completed' ||
              session.status === 'incomplete') && (
              <section
                className="routine-completed-banner"
                aria-labelledby="completed-banner-title"
              >
                <div className="completed-banner-header">
                  <Trophy size={28} aria-hidden="true" />
                  <div>
                    <h2 id="completed-banner-title">
                      {session.status === 'completed'
                        ? '¡Rutina completada! Excelente trabajo'
                        : 'Sesión finalizada (parcial)'}
                    </h2>
                    <p>
                      Tus registros están guardados de forma segura en tu
                      dispositivo.
                    </p>
                  </div>
                </div>

                <div className="completed-summary-grid">
                  <div className="summary-stat">
                    <span className="val">
                      {session.summary?.durationMinutes ?? 45} min
                    </span>
                    <span className="lbl">Duración</span>
                  </div>
                  <div className="summary-stat">
                    <span className="val">
                      {finishedExercisesCount} / {totalExercisesCount}
                    </span>
                    <span className="lbl">Ejercicios</span>
                  </div>
                  <div className="summary-stat">
                    <span className="val">{completedEffectiveSetsCount}</span>
                    <span className="lbl">Series efectivas</span>
                  </div>
                  <div className="summary-stat">
                    <span className="val">
                      {session.summary?.totalVolumeKg ?? 0} kg
                    </span>
                    <span className="lbl">Volumen efectivo</span>
                  </div>
                </div>

                <div className="completed-banner-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    onClick={handleReopenRoutine}
                  >
                    <RotateCcw size={18} aria-hidden="true" /> Reabrir sesión
                    para corregir o añadir series
                  </button>
                </div>
              </section>
            )}

          {/* Lista de Ejercicios de la Rutina */}
          <div className="exercise-cards-list">
            {selectedTemplate.exercises.map((item) => {
              const exercise = getActiveExerciseForItem(item);
              if (!exercise) return null;

              const sets = getSetsForExercise(exercise, item);
              const completedSetsInEx = sets.filter(
                (s) => s.status === 'completed'
              ).length;
              const effectiveSetsInEx = sets.filter(
                (s) => s.setType === 'effective'
              );
              const exState = session?.exerciseStates[exercise.id];
              const isExFinished =
                exState?.status === 'completed' ||
                exState?.status === 'completed_incomplete';

              const isExpanded =
                expandedExerciseId === null
                  ? item.order === 1
                  : expandedExerciseId === exercise.id;

              const loads = calculateExerciseLoads(exercise, item, settings);
              const lastPerf = getLastPerformanceForExercise(exercise.id);

              const altExercise = item.alternativeExerciseId
                ? exercises.find(
                    (e) =>
                      e.id ===
                      (exercise.id === item.alternativeExerciseId
                        ? item.exerciseId
                        : item.alternativeExerciseId)
                  )
                : null;

              return (
                <article
                  key={`${item.order}-${exercise.id}`}
                  className={`exercise-session-card ${
                    isExFinished ? 'is-finished' : ''
                  } ${isExpanded ? 'is-expanded' : ''}`}
                >
                  {/* Cabecera del Ejercicio */}
                  <div className="exercise-card-header">
                    <div
                      className="exercise-header-Trigger"
                      onClick={() =>
                        setExpandedExerciseId(isExpanded ? '' : exercise.id)
                      }
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedExerciseId(isExpanded ? '' : exercise.id);
                        }
                      }}
                    >
                      <div className="exercise-order-badge">{item.order}</div>
                      <div className="exercise-title-col">
                        <div className="exercise-title-row">
                          <h2 className="exercise-card-title">
                            {exercise.name}
                          </h2>
                        </div>
                        <div className="exercise-meta-pills">
                          {exercise.category === 'cardio' ? (
                            <span className="meta-pill">
                              Objetivo: {item.repRangeLabel}
                            </span>
                          ) : (
                            <>
                              <span className="meta-pill">
                                {item.effectiveSetsMin === item.effectiveSetsMax
                                  ? `${item.effectiveSetsMin} series efectivas`
                                  : `${item.effectiveSetsMin}–${item.effectiveSetsMax} series efectivas`}
                              </span>
                              <span className="meta-pill">
                                {item.repRangeLabel}
                              </span>
                            </>
                          )}
                          <span
                            className={`progress-pill ${
                              isExFinished
                                ? 'done'
                                : completedSetsInEx > 0
                                ? 'active'
                                : ''
                            }`}
                          >
                            {isExFinished
                              ? `Terminado (${completedSetsInEx}/${sets.length})`
                              : `${completedSetsInEx} de ${sets.length} series registradas`}
                          </span>
                        </div>
                      </div>
                      <div className="exercise-chevron">
                        {isExpanded ? (
                          <ChevronUp size={22} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={22} aria-hidden="true" />
                        )}
                      </div>
                    </div>

                    {/* Barra rápida de botones del ejercicio: Video, Configurar RM y Alternativa */}
                    <div className="exercise-quick-toolbar">
                      <button
                        type="button"
                        className="btn btn-toolbar"
                        onClick={() => setDetailExercise(exercise)}
                      >
                        <PlayCircle size={16} aria-hidden="true" /> Técnica y
                        video
                      </button>

                      {exercise.category !== 'cardio' && (
                        <button
                          type="button"
                          className={`btn btn-toolbar ${
                            !loads.hasConfiguredLoad ? 'highlight-config' : ''
                          }`}
                          onClick={() =>
                            setConfigLoadExercise({
                              exercise,
                              templateItem: item,
                            })
                          }
                        >
                          <Calculator size={16} aria-hidden="true" />{' '}
                          {loads.hasConfiguredLoad
                            ? `RM: ${loads.estimated1RM ?? 'Manual'} kg`
                            : 'Configurar carga'}
                        </button>
                      )}

                      {altExercise && (
                        <button
                          type="button"
                          className="btn btn-toolbar"
                          onClick={() => handleSwapExercise(item)}
                        >
                          <ArrowLeftRight size={15} aria-hidden="true" /> Cambiar
                          a {altExercise.name.split('(')[0].trim()}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Cuerpo desplegable del ejercicio */}
                  {isExpanded && (
                    <div className="exercise-card-body">
                      {/* Aviso de seguridad si aplica (RDL / Hack Squat) */}
                      {exercise.avoidFailureWarning && (
                        <div className="safety-inline-alert">
                          <AlertTriangle size={16} aria-hidden="true" />
                          <span>
                            <strong>Esfuerzo controlado:</strong> Mantén RIR 2–3
                            con técnica limpia. Evita llegar al fallo muscular en
                            este ejercicio.
                          </span>
                        </div>
                      )}

                      {/* Último rendimiento registrado */}
                      {lastPerf && (
                        <div className="last-performance-bar">
                          <History size={15} aria-hidden="true" />
                          <span>
                            Última vez:{' '}
                            <strong>
                              {lastPerf.weight} kg × {lastPerf.reps} reps
                            </strong>{' '}
                            ({formatLocalDateSpanish(lastPerf.date)})
                          </span>
                        </div>
                      )}

                      {/* Resumen claro de cargas sugeridas */}
                      {exercise.category !== 'cardio' && (
                        <div className="suggested-summary-box">
                          {loads.hasConfiguredLoad ? (
                            <div className="suggested-summary-pills">
                              {sets.some((s) => s.setType === 'warmup') && (
                                <span className="summary-chip warmup">
                                  Calentamiento: <strong>{loads.warmupLoad} kg</strong> ×{' '}
                                  {exercise.prepConfig.warmupRepsLabel ||
                                    '12–15 reps'}{' '}
                                  (sugerido)
                                </span>
                              )}
                              {sets.some((s) => s.setType === 'approach') && (
                                <span className="summary-chip approach">
                                  Aproximación: <strong>{loads.approachLoad} kg</strong> ×{' '}
                                  {exercise.prepConfig.approachRepsLabel ||
                                    '6–8 reps'}{' '}
                                  (sugerido)
                                </span>
                              )}
                              {effectiveSetsInEx.map((ef, idx) => (
                                <span
                                  key={ef.id}
                                  className="summary-chip effective"
                                >
                                  Efectiva {idx + 1}:{' '}
                                  <strong>{loads.effectiveLoad} kg</strong> ×{' '}
                                  {item.repRangeLabel}; objetivo RIR{' '}
                                  {loads.targetRIR}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="no-rm-callout">
                              <div>
                                <strong>Sin RM o carga configurada.</strong>{' '}
                                Puedes escribir el peso manualmente en cada
                                serie o configurar tu serie de referencia para
                                calcular sugerencias automáticas.
                              </div>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  setConfigLoadExercise({
                                    exercise,
                                    templateItem: item,
                                  })
                                }
                              >
                                <Calculator size={15} aria-hidden="true" />{' '}
                                Configurar carga
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Lista de Series */}
                      <div className="sets-list">
                        {sets.map((s) => {
                          const isCompleted = s.status === 'completed';
                          const stepInc =
                            exercise.equipmentIncrement ||
                            settings.defaultIncrement;

                          if (exercise.category === 'cardio') {
                            return (
                              <div
                                key={s.id}
                                className={`set-row-card cardio-row ${
                                  isCompleted ? 'completed' : 'pending'
                                }`}
                              >
                                <div className="set-row-top">
                                  <span className="set-badge effective">
                                    Caminata • Objetivo {item.repRangeLabel}
                                  </span>
                                  {isCompleted && s.completedAt && (
                                    <span className="set-time-tag">
                                      <Clock size={13} aria-hidden="true" />{' '}
                                      {formatTimeSpanish(s.completedAt)}
                                    </span>
                                  )}
                                </div>

                                <div className="set-inputs-grid">
                                  <div className="set-input-group">
                                    <label htmlFor={`dur-${s.id}`}>
                                      Duración (min)
                                    </label>
                                    <input
                                      id={`dur-${s.id}`}
                                      type="number"
                                      inputMode="numeric"
                                      min="1"
                                      max="120"
                                      value={
                                        s.durationMinutes ?? s.actualReps ?? 15
                                      }
                                      onChange={(e) => {
                                        const val =
                                          parseFloat(e.target.value) || null;
                                        handleFieldChange(exercise, item, s, {
                                          durationMinutes: val,
                                          actualReps: val,
                                        });
                                      }}
                                    />
                                  </div>
                                  <div className="set-input-group">
                                    <label htmlFor={`spd-${s.id}`}>
                                      Velocidad (km/h)
                                    </label>
                                    <input
                                      id={`spd-${s.id}`}
                                      type="number"
                                      inputMode="decimal"
                                      step="0.5"
                                      min="1"
                                      max="20"
                                      value={s.speedKmh ?? ''}
                                      placeholder="Opcional"
                                      onChange={(e) =>
                                        handleFieldChange(exercise, item, s, {
                                          speedKmh:
                                            parseFloat(e.target.value) || null,
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="set-input-group">
                                    <label htmlFor={`inc-${s.id}`}>
                                      Inclinación (%)
                                    </label>
                                    <input
                                      id={`inc-${s.id}`}
                                      type="number"
                                      inputMode="decimal"
                                      step="0.5"
                                      min="0"
                                      max="20"
                                      value={s.inclinePercent ?? ''}
                                      placeholder="Opcional"
                                      onChange={(e) =>
                                        handleFieldChange(exercise, item, s, {
                                          inclinePercent:
                                            parseFloat(e.target.value) || null,
                                        })
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="set-row-action">
                                  <button
                                    type="button"
                                    className={`btn btn-set-toggle ${
                                      isCompleted ? 'done' : 'pending'
                                    }`}
                                    onClick={() =>
                                      handleToggleSetStatus(exercise, item, s)
                                    }
                                  >
                                    {isCompleted ? (
                                      <>
                                        <Check size={18} aria-hidden="true" />{' '}
                                        Caminata realizada (toca para desmarcar)
                                      </>
                                    ) : (
                                      <>
                                        <Dumbbell
                                          size={18}
                                          aria-hidden="true"
                                        />{' '}
                                        Marcar caminata como realizada
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          const typeLabel =
                            s.setType === 'warmup'
                              ? `Calentamiento ${
                                  sets.filter((x) => x.setType === 'warmup')
                                    .length > 1
                                    ? s.typeIndex
                                    : ''
                                }`.trim()
                              : s.setType === 'approach'
                              ? `Aproximación ${
                                  sets.filter((x) => x.setType === 'approach')
                                    .length > 1
                                    ? s.typeIndex
                                    : ''
                                }`.trim()
                              : `Efectiva ${s.typeIndex}`;

                          return (
                            <div
                              key={s.id}
                              className={`set-row-card type-${s.setType} ${
                                isCompleted ? 'completed' : 'pending'
                              }`}
                            >
                              <div className="set-row-top">
                                <div className="set-badges-left">
                                  <span className={`set-badge ${s.setType}`}>
                                    Serie #{s.setNumber} • {typeLabel}
                                  </span>
                                  <span className="set-suggested-hint">
                                    {s.suggestedLoad !== null
                                      ? `Sugerido: ${s.suggestedLoad} kg × ${s.targetRepsLabel}`
                                      : `Objetivo: ${s.targetRepsLabel}`}
                                    {s.setType === 'effective' &&
                                      s.targetRIR !== null &&
                                      ` • RIR ${s.targetRIR}`}
                                  </span>
                                </div>

                                <div className="set-top-right">
                                  {isCompleted && s.completedAt && (
                                    <span className="set-time-tag">
                                      <CheckCircle2
                                        size={13}
                                        aria-hidden="true"
                                      />{' '}
                                      {formatTimeSpanish(s.completedAt)}
                                    </span>
                                  )}
                                  {!isCompleted && sets.length > 1 && (
                                    <button
                                      type="button"
                                      className="icon-delete-set"
                                      aria-label={`Quitar ${typeLabel}`}
                                      onClick={() => handleRemoveSet(s)}
                                    >
                                      <Trash2 size={15} aria-hidden="true" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Controles táctiles de Peso, Repeticiones y RIR */}
                              <div className="set-inputs-grid">
                                {/* Peso (kg) */}
                                <div className="set-input-group">
                                  <label htmlFor={`weight-${s.id}`}>
                                    Peso usado (kg)
                                  </label>
                                  <div className="stepper-control">
                                    <button
                                      type="button"
                                      className="stepper-btn"
                                      aria-label="Disminuir peso"
                                      onClick={() => {
                                        const base =
                                          s.actualLoad ??
                                          s.suggestedLoad ??
                                          exercise.minEquipmentLoad ??
                                          stepInc;
                                        const next = Math.max(
                                          0,
                                          Math.round((base - stepInc) * 100) /
                                            100
                                        );
                                        handleFieldChange(exercise, item, s, {
                                          actualLoad: next,
                                        });
                                      }}
                                    >
                                      <Minus size={16} aria-hidden="true" />
                                    </button>
                                    <input
                                      id={`weight-${s.id}`}
                                      type="number"
                                      inputMode="decimal"
                                      step="0.5"
                                      min="0"
                                      placeholder={
                                        s.suggestedLoad !== null
                                          ? String(s.suggestedLoad)
                                          : 'kg'
                                      }
                                      value={
                                        s.actualLoad !== null &&
                                        s.actualLoad !== undefined
                                          ? s.actualLoad
                                          : ''
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const parsed =
                                          raw === '' ? null : parseFloat(raw);
                                        handleFieldChange(exercise, item, s, {
                                          actualLoad:
                                            parsed !== null && !isNaN(parsed)
                                              ? parsed
                                              : null,
                                        });
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="stepper-btn"
                                      aria-label="Aumentar peso"
                                      onClick={() => {
                                        const base =
                                          s.actualLoad ??
                                          s.suggestedLoad ??
                                          0;
                                        const next =
                                          Math.round((base + stepInc) * 100) /
                                          100;
                                        handleFieldChange(exercise, item, s, {
                                          actualLoad: next,
                                        });
                                      }}
                                    >
                                      <Plus size={16} aria-hidden="true" />
                                    </button>
                                  </div>
                                </div>

                                {/* Repeticiones */}
                                <div className="set-input-group">
                                  <label htmlFor={`reps-${s.id}`}>
                                    Repeticiones
                                  </label>
                                  <div className="stepper-control">
                                    <button
                                      type="button"
                                      className="stepper-btn"
                                      aria-label="Disminuir repeticiones"
                                      onClick={() => {
                                        const base =
                                          s.actualReps ?? s.targetRepsMidpoint;
                                        const next = Math.max(1, base - 1);
                                        handleFieldChange(exercise, item, s, {
                                          actualReps: next,
                                        });
                                      }}
                                    >
                                      <Minus size={16} aria-hidden="true" />
                                    </button>
                                    <input
                                      id={`reps-${s.id}`}
                                      type="number"
                                      inputMode="numeric"
                                      min="0"
                                      placeholder={String(s.targetRepsMidpoint)}
                                      value={
                                        s.actualReps !== null &&
                                        s.actualReps !== undefined
                                          ? s.actualReps
                                          : ''
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const parsed =
                                          raw === ''
                                            ? null
                                            : parseInt(raw, 10);
                                        handleFieldChange(exercise, item, s, {
                                          actualReps:
                                            parsed !== null && !isNaN(parsed)
                                              ? parsed
                                              : null,
                                        });
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="stepper-btn"
                                      aria-label="Aumentar repeticiones"
                                      onClick={() => {
                                        const base =
                                          s.actualReps ?? s.targetRepsMidpoint;
                                        handleFieldChange(exercise, item, s, {
                                          actualReps: base + 1,
                                        });
                                      }}
                                    >
                                      <Plus size={16} aria-hidden="true" />
                                    </button>
                                  </div>
                                </div>

                                {/* RIR real (opcional) */}
                                <div className="set-input-group rir-col">
                                  <label htmlFor={`rir-${s.id}`}>
                                    RIR (reserva)
                                  </label>
                                  <select
                                    id={`rir-${s.id}`}
                                    value={
                                      s.actualRIR !== null &&
                                      s.actualRIR !== undefined
                                        ? String(s.actualRIR)
                                        : ''
                                    }
                                    onChange={(e) => {
                                      const val =
                                        e.target.value === ''
                                          ? null
                                          : Number(e.target.value);
                                      handleFieldChange(exercise, item, s, {
                                        actualRIR: val,
                                      });
                                    }}
                                  >
                                    <option value="">Opcional</option>
                                    <option value="0">RIR 0</option>
                                    <option value="1">RIR 1</option>
                                    <option value="2">RIR 2</option>
                                    <option value="3">RIR 3</option>
                                    <option value="4">RIR 4+</option>
                                  </select>
                                </div>
                              </div>

                              {isCompleted && s.missingDetails && (
                                <p className="missing-details-note">
                                  Serie marcada como realizada. Falta indicar el
                                  peso o las repeticiones cuando quieras.
                                </p>
                              )}

                              {/* Botón grande Registrar / Desmarcar serie */}
                              <div className="set-row-action">
                                <button
                                  type="button"
                                  className={`btn btn-set-toggle ${
                                    isCompleted ? 'done' : 'pending'
                                  }`}
                                  onClick={() =>
                                    handleToggleSetStatus(exercise, item, s)
                                  }
                                >
                                  {isCompleted ? (
                                    <>
                                      <Check size={18} aria-hidden="true" />{' '}
                                      Serie realizada (toca para desmarcar)
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2
                                        size={18}
                                        aria-hidden="true"
                                      />{' '}
                                      Registrar serie
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Controles para añadir series de preparación o efectivas */}
                      {exercise.category !== 'cardio' && (
                        <div className="add-sets-toolbar">
                          <span className="add-sets-label">
                            Añadir serie a esta sesión:
                          </span>
                          <div className="add-sets-buttons">
                            <button
                              type="button"
                              className="btn btn-chip warmup"
                              onClick={() =>
                                handleAddSet(exercise, item, 'warmup')
                              }
                            >
                              <Plus size={14} aria-hidden="true" />{' '}
                              Calentamiento
                            </button>
                            <button
                              type="button"
                              className="btn btn-chip approach"
                              onClick={() =>
                                handleAddSet(exercise, item, 'approach')
                              }
                            >
                              <Plus size={14} aria-hidden="true" /> Aproximación
                            </button>
                            <button
                              type="button"
                              className="btn btn-chip effective"
                              onClick={() =>
                                handleAddSet(exercise, item, 'effective')
                              }
                            >
                              <Plus size={14} aria-hidden="true" /> Serie
                              efectiva
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Pie del Ejercicio: Terminar o Reabrir ejercicio */}
                      <div className="exercise-card-footer">
                        {isExFinished ? (
                          <div className="ex-finished-row">
                            <span className="ex-finished-badge">
                              <CheckCircle2 size={18} aria-hidden="true" />{' '}
                              {exState?.status === 'completed_incomplete'
                                ? 'Ejercicio finalizado (incompleto)'
                                : 'Ejercicio completado'}
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleReopenExercise(exercise.id)}
                            >
                              <RotateCcw size={15} aria-hidden="true" /> Reabrir
                              ejercicio
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-finish-exercise btn-block"
                            onClick={() =>
                              handleRequestFinishExercise(exercise, sets)
                            }
                          >
                            <CheckCircle2 size={18} aria-hidden="true" />{' '}
                            Terminar ejercicio ({completedSetsInEx} de{' '}
                            {sets.length} series)
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Botón Principal para Finalizar Rutina del Día */}
          {(!session ||
            (session.status !== 'completed' &&
              session.status !== 'incomplete')) && (
            <div className="finish-routine-footer">
              <button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                onClick={() => setFinishRoutineConfirmOpen(true)}
              >
                <Sparkles size={20} aria-hidden="true" /> Finalizar rutina del
                día
              </button>
              <p className="footer-helper">
                Tu progreso se guarda automáticamente en cada toque. Puedes
                salir y retomar después cuando lo necesites.
              </p>
            </div>
          )}
        </>
      )}

      {/* Diálogo: Confirmar terminar ejercicio con series pendientes */}
      <ConfirmDialog
        open={Boolean(incompleteExConfirm)}
        title="¿Terminar ejercicio con series pendientes?"
        description={
          incompleteExConfirm
            ? `Aún quedan ${incompleteExConfirm.pendingCount} series pendientes en "${incompleteExConfirm.exerciseName}". Las series pendientes NO se marcarán como realizadas automáticamente. ¿Deseas finalizar el ejercicio así o volver a las series?`
            : ''
        }
        confirmLabel="Finalizar incompleto"
        cancelLabel="Volver a las series"
        variant="warning"
        onConfirm={() => {
          if (incompleteExConfirm) {
            markExerciseFinished(
              incompleteExConfirm.exerciseId,
              'completed_incomplete'
            );
          }
        }}
        onCancel={() => setIncompleteExConfirm(null)}
      />

      {/* Diálogo: Confirmar finalizar rutina del día */}
      <ConfirmDialog
        open={finishRoutineConfirmOpen}
        title="¿Finalizar la rutina del día?"
        description={
          finishedExercisesCount < totalExercisesCount
            ? `Has terminado ${finishedExercisesCount} de ${totalExercisesCount} ejercicios (${completedEffectiveSetsCount} series efectivas registradas). ¿Confirmas que deseas finalizar la sesión de hoy? Podrás reabrirla después si lo necesitas.`
            : `¡Has completado los ${totalExercisesCount} ejercicios de hoy con ${completedEffectiveSetsCount} series efectivas! ¿Confirmas finalizar y guardar el resumen de la rutina?`
        }
        confirmLabel="Sí, finalizar rutina"
        cancelLabel="Seguir entrenando"
        variant="primary"
        onConfirm={handleConfirmFinishRoutine}
        onCancel={() => setFinishRoutineConfirmOpen(false)}
      />

      {/* Modal de configuración de RM / Cargas */}
      {configLoadExercise && (
        <LoadConfigModal
          open={Boolean(configLoadExercise)}
          exercise={configLoadExercise.exercise}
          templateItem={configLoadExercise.templateItem}
          settings={settings}
          onSave={onUpdateExercise}
          onClose={() => setConfigLoadExercise(null)}
        />
      )}

      {/* Modal de Video e Instrucciones del Ejercicio */}
      {detailExercise && (
        <ExerciseDetailModal
          open={Boolean(detailExercise)}
          exercise={detailExercise}
          onSaveExercise={(updated) => {
            onUpdateExercise(updated);
            setDetailExercise(updated);
          }}
          onClose={() => setDetailExercise(null)}
        />
      )}
    </div>
  );
};
