import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  INITIAL_EXERCISES,
  INITIAL_TEMPLATES,
} from '../data/initialData';
import {
  calculateExerciseLoads,
  computeSessionSummary,
  estimate1RMFromSubmax,
  generateInitialSetsForExercise,
  roundDownToIncrement,
} from '../utils/calculations';
import {
  createBackupData,
  loadInitialDatabase,
  validateBackupJson,
  writeFullSnapshotToDB,
} from '../db/storage';
import { extractYouTubeVideoId } from '../components/ExerciseDetailModal';

describe('Validaciones de Rutinas, Cálculo de RM y Persistencia', () => {
  it('1. El calendario semanal tiene los 7 días y los ejercicios correctos por sesión', () => {
    expect(INITIAL_TEMPLATES).toHaveLength(7);

    const lunes = INITIAL_TEMPLATES.find((t) => t.dayOfWeek === 1)!;
    const martes = INITIAL_TEMPLATES.find((t) => t.dayOfWeek === 2)!;
    const miercoles = INITIAL_TEMPLATES.find((t) => t.dayOfWeek === 3)!;
    const jueves = INITIAL_TEMPLATES.find((t) => t.dayOfWeek === 4)!;
    const viernes = INITIAL_TEMPLATES.find((t) => t.dayOfWeek === 5)!;
    const sabado = INITIAL_TEMPLATES.find((t) => t.dayOfWeek === 6)!;
    const domingo = INITIAL_TEMPLATES.find((t) => t.dayOfWeek === 7)!;

    expect(lunes.name).toContain('Upper A');
    expect(lunes.exercises).toHaveLength(9);

    expect(martes.name).toContain('Lower A');
    expect(martes.exercises).toHaveLength(6);

    expect(miercoles.isRestDay).toBe(true);
    expect(sabado.isRestDay).toBe(true);
    expect(domingo.isRestDay).toBe(true);

    expect(jueves.name).toContain('Upper B');
    expect(jueves.exercises).toHaveLength(9);

    expect(viernes.name).toContain('Lower B');
    expect(viernes.exercises).toHaveLength(7);
    // Hack Squat permite cambiar a Leg Press
    const hackSquatItem = viernes.exercises.find(
      (e) => e.exerciseId === 'hack-squat'
    );
    expect(hackSquatItem?.alternativeExerciseId).toBe('leg-press');
  });

  it('2. Si no hay RM configurado, no inventa ningún peso', () => {
    for (const ex of INITIAL_EXERCISES) {
      const loads = calculateExerciseLoads(ex, null, DEFAULT_SETTINGS);
      expect(loads.hasConfiguredLoad).toBe(false);
      expect(loads.warmupLoad).toBeNull();
      expect(loads.approachLoad).toBeNull();
      expect(loads.effectiveLoad).toBeNull();
    }
  });

  it('3. Calcula 1RM submáximo (Epley) y redondea cargas hacia abajo al incremento del equipo', () => {
    // 40 kg x 10 reps @ RIR 2 => 40 * (1 + 12/30) = 40 * 1.4 = 56 kg
    const rm = estimate1RMFromSubmax(40, 10, 2, 'epley');
    expect(rm).toBe(56);

    // Redondeo hacia abajo
    expect(roundDownToIncrement(22.4, 2.5, 5)).toBe(20);
    expect(roundDownToIncrement(22.5, 2.5, 5)).toBe(22.5);
    // Si cae por debajo del mínimo del equipo, devuelve el mínimo
    expect(roundDownToIncrement(3.2, 2.5, 5)).toBe(5);
  });

  it('4. Las cargas de calentamiento y aproximación son menores que la carga efectiva', () => {
    const hipThrust = {
      ...INITIAL_EXERCISES.find((e) => e.id === 'hip-thrust-maquina')!,
      estimated1RM: 70,
      equipmentIncrement: 5,
      minEquipmentLoad: 10,
    };

    const loads = calculateExerciseLoads(hipThrust, null, DEFAULT_SETTINGS);
    expect(loads.hasConfiguredLoad).toBe(true);
    expect(loads.effectiveLoad).not.toBeNull();
    expect(loads.approachLoad).not.toBeNull();
    expect(loads.warmupLoad).not.toBeNull();

    expect(loads.warmupLoad!).toBeLessThan(loads.approachLoad!);
    expect(loads.approachLoad!).toBeLessThan(loads.effectiveLoad!);
  });

  it('5. Las series de preparación no se contabilizan como series efectivas en el resumen', () => {
    const pressPecho = {
      ...INITIAL_EXERCISES.find((e) => e.id === 'press-pecho-maquina')!,
      estimated1RM: 45,
    };
    const lunesItem = INITIAL_TEMPLATES[0].exercises[3];

    const sets = generateInitialSetsForExercise(
      'sess_test',
      pressPecho,
      lunesItem,
      DEFAULT_SETTINGS
    );
    // Compuesto: 1 calentamiento + 1 aproximación + 2 efectivas = 4 series totales
    expect(sets).toHaveLength(4);
    expect(sets.filter((s) => s.setType === 'warmup')).toHaveLength(1);
    expect(sets.filter((s) => s.setType === 'approach')).toHaveLength(1);
    expect(sets.filter((s) => s.setType === 'effective')).toHaveLength(2);

    // Marcar todas como completadas
    const completedSets = sets.map((s) => ({
      ...s,
      status: 'completed' as const,
      completedAt: new Date().toISOString(),
    }));

    const summary = computeSessionSummary(
      new Date(Date.now() - 30 * 60000).toISOString(),
      new Date().toISOString(),
      9,
      1,
      completedSets
    );

    expect(summary.totalSetsCompleted).toBe(4);
    expect(summary.effectiveSetsCompleted).toBe(2);
  });

  it('6. Persistencia en IndexedDB y exportación/importación de copia de seguridad JSON', async () => {
    const initial = await loadInitialDatabase();
    expect(initial.exercises.length).toBeGreaterThanOrEqual(19);

    // Modificar RM de un ejercicio y guardar sesión
    const updatedExercises = initial.exercises.map((ex) =>
      ex.id === 'hip-thrust-maquina' ? { ...ex, estimated1RM: 80 } : ex
    );
    await writeFullSnapshotToDB({
      ...initial,
      exercises: updatedExercises,
    });

    const reloaded = await loadInitialDatabase();
    const ht = reloaded.exercises.find((e) => e.id === 'hip-thrust-maquina');
    expect(ht?.estimated1RM).toBe(80);

    // Exportar y validar JSON
    const backup = createBackupData(reloaded);
    const jsonStr = JSON.stringify(backup);
    const validation = validateBackupJson(jsonStr);
    expect(validation.valid).toBe(true);
    expect(
      validation.data?.exercises.find((e) => e.id === 'hip-thrust-maquina')
        ?.estimated1RM
    ).toBe(80);

    // Rechazar JSON inválido
    expect(validateBackupJson('{"app":"other"}').valid).toBe(false);
  });

  it('7. Todos los ejercicios tienen URL de video o búsqueda válida e instrucciones claras', () => {
    for (const ex of INITIAL_EXERCISES) {
      expect(ex.videoUrl).toMatch(/^https:\/\/www\.youtube\.com\//);
      expect(ex.instructions.length).toBeGreaterThanOrEqual(3);
      expect(ex.commonMistakes.length).toBeGreaterThanOrEqual(1);
      expect(ex.safetyTips.length).toBeGreaterThanOrEqual(1);
    }
    expect(
      extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ');
  });
});
