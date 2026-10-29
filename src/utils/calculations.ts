import {
  Exercise,
  SetLog,
  Settings,
  WorkoutSessionSummary,
  WorkoutTemplateExercise,
} from '../types';

/**
 * Redondea un número a 1 decimal para mostrar cargas limpias (ej. 12.5, 27.5).
 */
export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Estima el 1RM a partir de una serie submáxima con peso, repeticiones y RIR.
 * Fórmula de Epley por defecto: 1RM = peso * (1 + (repeticiones + RIR) / 30)
 */
export function estimate1RMFromSubmax(
  weight: number,
  reps: number,
  rir: number = 2,
  formula: 'epley' | 'brzycki' = 'epley'
): number {
  if (weight <= 0 || reps <= 0) return 0;
  const safeRir = Math.max(0, rir);
  const effectiveReps = reps + safeRir;

  if (effectiveReps === 1 && safeRir === 0) {
    return roundToOneDecimal(weight);
  }

  if (formula === 'brzycki') {
    const capped = Math.min(35, effectiveReps);
    const raw = weight * (36 / (37 - capped));
    return roundToOneDecimal(raw);
  }

  // Epley: 1RM_estimado = peso × (1 + (repeticiones + RIR) / 30)
  const raw = weight * (1 + effectiveReps / 30);
  return roundToOneDecimal(raw);
}

/**
 * Redondea hacia abajo al incremento disponible del equipo para nunca sugerir
 * una carga superior a la calculada. Si queda por debajo del mínimo del equipo,
 * devuelve el mínimo disponible.
 */
export function roundDownToIncrement(
  rawLoad: number,
  increment: number,
  minEquipmentLoad: number
): number {
  if (rawLoad <= 0) return Math.max(0, minEquipmentLoad);
  const safeIncrement = increment > 0 ? increment : 2.5;
  const safeMin = minEquipmentLoad >= 0 ? minEquipmentLoad : safeIncrement;

  // Pequeño epsilon para evitar errores de punto flotante (ej. 20 / 2.5 = 7.999999999999999)
  const steps = Math.floor((rawLoad + 1e-9) / safeIncrement);
  const rounded = roundToOneDecimal(steps * safeIncrement);

  if (rounded < safeMin) {
    return roundToOneDecimal(safeMin);
  }
  return rounded;
}

/**
 * Obtiene la cantidad de repeticiones objetivo dentro de un rango.
 */
export function getTargetRepsFromRange(
  minReps: number,
  maxReps: number,
  strategy: 'midpoint' | 'min' | 'max' = 'midpoint'
): number {
  if (strategy === 'min') return minReps;
  if (strategy === 'max') return maxReps;
  return Math.round((minReps + maxReps) / 2);
}

/**
 * Calcula la carga efectiva sugerida a partir del 1RM estimado, repeticiones objetivo y RIR objetivo.
 * Epley inversa: carga_efectiva = 1RM_estimado / (1 + (repeticiones_objetivo + RIR_objetivo) / 30)
 */
export function calculateRawEffectiveLoad(
  estimated1RM: number,
  targetReps: number,
  targetRIR: number,
  formula: 'epley' | 'brzycki' = 'epley'
): number {
  if (estimated1RM <= 0) return 0;
  const effectiveReps = Math.max(1, targetReps) + Math.max(0, targetRIR);

  if (formula === 'brzycki') {
    const capped = Math.min(35, effectiveReps);
    return estimated1RM * ((37 - capped) / 36);
  }

  return estimated1RM / (1 + effectiveReps / 30);
}

export interface CalculatedExerciseLoads {
  hasConfiguredLoad: boolean;
  estimated1RM: number | null;
  targetReps: number;
  targetRIR: number;
  warmupLoad: number | null;
  approachLoad: number | null;
  secondApproachLoad: number | null;
  effectiveLoad: number | null;
}

/**
 * Calcula las cargas sugeridas (calentamiento, aproximación y efectiva) para un ejercicio.
 * Si no existe RM ni carga manual configurada, devuelve null en todas las cargas (no inventa pesos).
 */
export function calculateExerciseLoads(
  exercise: Exercise,
  templateItem: Pick<
    WorkoutTemplateExercise,
    'repRangeMin' | 'repRangeMax'
  > | null,
  settings: Settings
): CalculatedExerciseLoads {
  const minReps = templateItem?.repRangeMin ?? exercise.repRangeMin;
  const maxReps = templateItem?.repRangeMax ?? exercise.repRangeMax;
  const targetReps = getTargetRepsFromRange(
    minReps,
    maxReps,
    settings.targetRepStrategy
  );
  const targetRIR = exercise.defaultTargetRIR ?? settings.defaultRIR;

  if (exercise.category === 'cardio') {
    return {
      hasConfiguredLoad: false,
      estimated1RM: null,
      targetReps,
      targetRIR: 0,
      warmupLoad: null,
      approachLoad: null,
      secondApproachLoad: null,
      effectiveLoad: null,
    };
  }

  const increment =
    exercise.equipmentIncrement > 0
      ? exercise.equipmentIncrement
      : settings.defaultIncrement;
  const minLoad =
    exercise.minEquipmentLoad >= 0 ? exercise.minEquipmentLoad : increment;

  const hasRM =
    exercise.estimated1RM !== null &&
    exercise.estimated1RM !== undefined &&
    exercise.estimated1RM > 0;
  const hasManualEffective =
    exercise.manualLoads?.effective !== null &&
    exercise.manualLoads?.effective !== undefined &&
    exercise.manualLoads.effective > 0;

  if (!hasRM && !hasManualEffective) {
    return {
      hasConfiguredLoad: false,
      estimated1RM: null,
      targetReps,
      targetRIR,
      warmupLoad: null,
      approachLoad: null,
      secondApproachLoad: null,
      effectiveLoad: null,
    };
  }

  const rawEffective = hasRM
    ? calculateRawEffectiveLoad(
        exercise.estimated1RM!,
        targetReps,
        targetRIR,
        settings.estimationFormula
      )
    : exercise.manualLoads!.effective!;

  const autoEffective = roundDownToIncrement(rawEffective, increment, minLoad);
  const effectiveLoad = hasManualEffective
    ? roundToOneDecimal(exercise.manualLoads!.effective!)
    : autoEffective;

  // Calentamiento (por defecto 50%, configurable 45-55%)
  const warmupPct = Math.min(90, Math.max(20, settings.warmupPercentage)) / 100;
  let autoWarmup = roundDownToIncrement(
    effectiveLoad * warmupPct,
    increment,
    minLoad
  );
  if (autoWarmup >= effectiveLoad && effectiveLoad > minLoad) {
    autoWarmup = Math.max(
      minLoad,
      roundToOneDecimal(effectiveLoad - increment)
    );
  }

  // Aproximación 1 (por defecto 75%, configurable 70-80%)
  const approachPct =
    Math.min(95, Math.max(40, settings.approachPercentage)) / 100;
  let autoApproach = roundDownToIncrement(
    effectiveLoad * approachPct,
    increment,
    minLoad
  );
  if (autoApproach >= effectiveLoad && effectiveLoad > minLoad) {
    autoApproach = Math.max(
      minLoad,
      roundToOneDecimal(effectiveLoad - increment)
    );
  }
  if (
    autoApproach <= autoWarmup &&
    autoWarmup + increment < effectiveLoad
  ) {
    autoApproach = roundToOneDecimal(autoWarmup + increment);
  }

  // Aproximación 2 (si se configura una segunda aproximación)
  const secondApproachPct =
    Math.min(95, Math.max(50, settings.secondApproachPercentage || 85)) / 100;
  let autoSecondApproach = roundDownToIncrement(
    effectiveLoad * secondApproachPct,
    increment,
    minLoad
  );
  if (autoSecondApproach >= effectiveLoad && effectiveLoad > minLoad) {
    autoSecondApproach = Math.max(
      minLoad,
      roundToOneDecimal(effectiveLoad - increment)
    );
  }

  const warmupLoad =
    exercise.manualLoads?.warmup != null && exercise.manualLoads.warmup > 0
      ? roundToOneDecimal(exercise.manualLoads.warmup)
      : autoWarmup;

  const approachLoad =
    exercise.manualLoads?.approach != null && exercise.manualLoads.approach > 0
      ? roundToOneDecimal(exercise.manualLoads.approach)
      : autoApproach;

  return {
    hasConfiguredLoad: true,
    estimated1RM: exercise.estimated1RM,
    targetReps,
    targetRIR,
    warmupLoad,
    approachLoad,
    secondApproachLoad: autoSecondApproach,
    effectiveLoad,
  };
}

/**
 * Genera la lista de series planificadas para un ejercicio en una sesión.
 */
export function generateInitialSetsForExercise(
  sessionId: string,
  exercise: Exercise,
  templateItem: WorkoutTemplateExercise | null,
  settings: Settings
): SetLog[] {
  const loads = calculateExerciseLoads(exercise, templateItem, settings);
  const repRangeLabel = templateItem?.repRangeLabel ?? exercise.repRangeLabel;
  const targetRIR = exercise.defaultTargetRIR ?? settings.defaultRIR;

  if (exercise.category === 'cardio') {
    return [
      {
        id: `${sessionId}_${exercise.id}_effective_1`,
        sessionId,
        exerciseId: exercise.id,
        setType: 'effective',
        setNumber: 1,
        typeIndex: 1,
        suggestedLoad: null,
        actualLoad: null,
        targetRepsLabel: repRangeLabel,
        targetRepsMidpoint: loads.targetReps,
        actualReps: loads.targetReps,
        targetRIR: null,
        actualRIR: null,
        durationMinutes: loads.targetReps,
        speedKmh: 5.0,
        inclinePercent: 3.0,
        status: 'pending',
        completedAt: null,
      },
    ];
  }

  const warmupCount =
    templateItem?.warmupSets ?? exercise.prepConfig.warmupSets;
  const approachCount =
    templateItem?.approachSets ?? exercise.prepConfig.approachSets;
  const effectiveCount =
    templateItem?.defaultEffectiveSets ?? exercise.prepConfig.effectiveSets;

  const sets: SetLog[] = [];
  let setNumber = 1;

  for (let i = 1; i <= warmupCount; i++) {
    const currentSetNum = setNumber++;
    sets.push({
      id: `${sessionId}_${exercise.id}_warmup_${currentSetNum}`,
      sessionId,
      exerciseId: exercise.id,
      setType: 'warmup',
      setNumber: currentSetNum,
      typeIndex: i,
      suggestedLoad: loads.warmupLoad,
      actualLoad: loads.warmupLoad,
      targetRepsLabel: exercise.prepConfig.warmupRepsLabel || '12–15 reps',
      targetRepsMidpoint: 13,
      actualReps: 12,
      targetRIR: null,
      actualRIR: null,
      status: 'pending',
      completedAt: null,
    });
  }

  for (let i = 1; i <= approachCount; i++) {
    const currentSetNum = setNumber++;
    const suggested =
      i === 1
        ? loads.approachLoad
        : loads.secondApproachLoad ?? loads.approachLoad;
    sets.push({
      id: `${sessionId}_${exercise.id}_approach_${currentSetNum}`,
      sessionId,
      exerciseId: exercise.id,
      setType: 'approach',
      setNumber: currentSetNum,
      typeIndex: i,
      suggestedLoad: suggested,
      actualLoad: suggested,
      targetRepsLabel: exercise.prepConfig.approachRepsLabel || '6–8 reps',
      targetRepsMidpoint: 7,
      actualReps: 7,
      targetRIR: null,
      actualRIR: null,
      status: 'pending',
      completedAt: null,
    });
  }

  for (let i = 1; i <= effectiveCount; i++) {
    const currentSetNum = setNumber++;
    sets.push({
      id: `${sessionId}_${exercise.id}_effective_${currentSetNum}`,
      sessionId,
      exerciseId: exercise.id,
      setType: 'effective',
      setNumber: currentSetNum,
      typeIndex: i,
      suggestedLoad: loads.effectiveLoad,
      actualLoad: loads.effectiveLoad,
      targetRepsLabel: repRangeLabel,
      targetRepsMidpoint: loads.targetReps,
      actualReps: loads.targetReps,
      targetRIR,
      actualRIR: targetRIR,
      status: 'pending',
      completedAt: null,
    });
  }

  return sets;
}

/**
 * Calcula el resumen de una sesión de entrenamiento.
 * Nota: Las series de calentamiento y aproximación NO se contabilizan como series efectivas.
 */
export function computeSessionSummary(
  startedAt: string,
  finishedAt: string | null,
  totalExercisesCount: number,
  completedExercisesCount: number,
  sessionLogs: SetLog[]
): WorkoutSessionSummary {
  const startMs = new Date(startedAt).getTime();
  const endMs = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const rawMinutes = Math.round(Math.max(1, (endMs - startMs) / 60000));
  const durationMinutes = Math.min(240, Math.max(1, rawMinutes));

  const completedSets = sessionLogs.filter((s) => s.status === 'completed');
  const effectiveSets = completedSets.filter((s) => s.setType === 'effective');

  let totalVolumeKg = 0;
  for (const s of effectiveSets) {
    if (s.actualLoad && s.actualReps && s.actualLoad > 0 && s.actualReps > 0) {
      totalVolumeKg += s.actualLoad * s.actualReps;
    }
  }

  return {
    durationMinutes,
    completedExercisesCount,
    totalExercisesCount,
    effectiveSetsCompleted: effectiveSets.length,
    totalSetsCompleted: completedSets.length,
    totalVolumeKg: Math.round(totalVolumeKg),
  };
}

/**
 * Utilidades de fecha local (YYYY-MM-DD) y día de la semana (1 = Lunes ... 7 = Domingo)
 */
export function getLocalDateISO(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDayOfWeek1To7(date: Date = new Date()): number {
  const jsDay = date.getDay(); // 0 = Domingo, 1 = Lunes, ...
  return jsDay === 0 ? 7 : jsDay;
}

export function getMondayOfCurrentWeekISO(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = getDayOfWeek1To7(d);
  const diff = d.getDate() - day + 1;
  const monday = new Date(d.setDate(diff));
  return getLocalDateISO(monday);
}

export function getDateForDayOfWeekInCurrentWeek(
  dayOfWeek1To7: number,
  referenceDate: Date = new Date()
): string {
  const mondayISO = getMondayOfCurrentWeekISO(referenceDate);
  const [y, m, d] = mondayISO.split('-').map(Number);
  const target = new Date(y, m - 1, d + (dayOfWeek1To7 - 1));
  return getLocalDateISO(target);
}

export function formatLocalDateSpanish(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatTimeSpanish(isoString: string | null): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
