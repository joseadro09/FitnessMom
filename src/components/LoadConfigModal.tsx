import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Exercise,
  ReferenceRecord,
  Settings,
  WorkoutTemplateExercise,
} from '../types';
import {
  calculateExerciseLoads,
  estimate1RMFromSubmax,
  formatLocalDateSpanish,
  roundToOneDecimal,
} from '../utils/calculations';
import { Calculator, History, Info, Sliders, X } from 'lucide-react';

interface LoadConfigModalProps {
  open: boolean;
  exercise: Exercise;
  templateItem: WorkoutTemplateExercise | null;
  settings: Settings;
  onSave: (updatedExercise: Exercise) => void;
  onClose: () => void;
}

export const LoadConfigModal: React.FC<LoadConfigModalProps> = ({
  open,
  exercise,
  templateItem,
  settings,
  onSave,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [mode, setMode] = useState<'submax' | 'direct'>(
    exercise.referenceData?.type === 'direct_1rm' ? 'direct' : 'submax'
  );
  const [submaxWeight, setSubmaxWeight] = useState<string>(
    exercise.referenceData?.type === 'submax_set'
      ? String(exercise.referenceData.weight)
      : exercise.estimated1RM
      ? String(Math.round(exercise.estimated1RM * 0.75))
      : ''
  );
  const [submaxReps, setSubmaxReps] = useState<string>(
    exercise.referenceData?.reps ? String(exercise.referenceData.reps) : '10'
  );
  const [submaxRir, setSubmaxRir] = useState<string>(
    exercise.referenceData?.rir !== undefined
      ? String(exercise.referenceData.rir)
      : '2'
  );
  const [directRM, setDirectRM] = useState<string>(
    exercise.estimated1RM !== null ? String(exercise.estimated1RM) : ''
  );

  const [increment, setIncrement] = useState<string>(
    String(exercise.equipmentIncrement || settings.defaultIncrement)
  );
  const [minLoad, setMinLoad] = useState<string>(
    String(exercise.minEquipmentLoad ?? exercise.equipmentIncrement ?? 2.5)
  );
  const [targetRIR, setTargetRIR] = useState<string>(
    String(exercise.defaultTargetRIR ?? settings.defaultRIR)
  );

  const [useManualOverride, setUseManualOverride] = useState<boolean>(
    Boolean(
      exercise.manualLoads?.effective ||
        exercise.manualLoads?.approach ||
        exercise.manualLoads?.warmup
    )
  );
  const [manualEffective, setManualEffective] = useState<string>(
    exercise.manualLoads?.effective ? String(exercise.manualLoads.effective) : ''
  );
  const [manualApproach, setManualApproach] = useState<string>(
    exercise.manualLoads?.approach ? String(exercise.manualLoads.approach) : ''
  );
  const [manualWarmup, setManualWarmup] = useState<string>(
    exercise.manualLoads?.warmup ? String(exercise.manualLoads.warmup) : ''
  );

  useEffect(() => {
    if (open) {
      setMode(
        exercise.referenceData?.type === 'direct_1rm' ? 'direct' : 'submax'
      );
      setSubmaxWeight(
        exercise.referenceData?.type === 'submax_set'
          ? String(exercise.referenceData.weight)
          : ''
      );
      setSubmaxReps(
        exercise.referenceData?.reps ? String(exercise.referenceData.reps) : '10'
      );
      setSubmaxRir(
        exercise.referenceData?.rir !== undefined
          ? String(exercise.referenceData.rir)
          : '2'
      );
      setDirectRM(
        exercise.estimated1RM !== null ? String(exercise.estimated1RM) : ''
      );
      setIncrement(
        String(exercise.equipmentIncrement || settings.defaultIncrement)
      );
      setMinLoad(
        String(exercise.minEquipmentLoad ?? exercise.equipmentIncrement ?? 2.5)
      );
      setTargetRIR(String(exercise.defaultTargetRIR ?? settings.defaultRIR));
      setUseManualOverride(
        Boolean(
          exercise.manualLoads?.effective ||
            exercise.manualLoads?.approach ||
            exercise.manualLoads?.warmup
        )
      );
      setManualEffective(
        exercise.manualLoads?.effective
          ? String(exercise.manualLoads.effective)
          : ''
      );
      setManualApproach(
        exercise.manualLoads?.approach
          ? String(exercise.manualLoads.approach)
          : ''
      );
      setManualWarmup(
        exercise.manualLoads?.warmup ? String(exercise.manualLoads.warmup) : ''
      );
    }
  }, [open, exercise, settings]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const parsedSubmaxW = parseFloat(submaxWeight);
  const parsedSubmaxReps = parseInt(submaxReps, 10);
  const parsedSubmaxRir = parseFloat(submaxRir);
  const parsedDirectRM = parseFloat(directRM);

  const previewEstimatedRM: number | null =
    mode === 'submax'
      ? !isNaN(parsedSubmaxW) &&
        parsedSubmaxW > 0 &&
        !isNaN(parsedSubmaxReps) &&
        parsedSubmaxReps > 0
        ? estimate1RMFromSubmax(
            parsedSubmaxW,
            parsedSubmaxReps,
            isNaN(parsedSubmaxRir) ? 2 : parsedSubmaxRir,
            settings.estimationFormula
          )
        : exercise.estimated1RM
      : !isNaN(parsedDirectRM) && parsedDirectRM > 0
      ? roundToOneDecimal(parsedDirectRM)
      : null;

  const parsedIncrement = Math.max(0.5, parseFloat(increment) || 2.5);
  const parsedMinLoad = Math.max(0, parseFloat(minLoad) || parsedIncrement);
  const parsedTargetRIR = Math.min(4, Math.max(0, parseInt(targetRIR, 10) || 2));

  const previewExercise: Exercise = {
    ...exercise,
    estimated1RM: previewEstimatedRM,
    equipmentIncrement: parsedIncrement,
    minEquipmentLoad: parsedMinLoad,
    defaultTargetRIR: parsedTargetRIR,
    manualLoads: useManualOverride
      ? {
          effective:
            parseFloat(manualEffective) > 0 ? parseFloat(manualEffective) : null,
          approach:
            parseFloat(manualApproach) > 0 ? parseFloat(manualApproach) : null,
          warmup:
            parseFloat(manualWarmup) > 0 ? parseFloat(manualWarmup) : null,
        }
      : undefined,
  };

  const previewLoads = calculateExerciseLoads(
    previewExercise,
    templateItem,
    settings
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const nowIso = new Date().toISOString();
    let newRef: ReferenceRecord | null = exercise.referenceData;
    let newEstimatedRM: number | null = previewEstimatedRM;
    const history = [...(exercise.referenceHistory || [])];

    if (
      mode === 'submax' &&
      !isNaN(parsedSubmaxW) &&
      parsedSubmaxW > 0 &&
      !isNaN(parsedSubmaxReps) &&
      parsedSubmaxReps > 0
    ) {
      const calcRM = estimate1RMFromSubmax(
        parsedSubmaxW,
        parsedSubmaxReps,
        isNaN(parsedSubmaxRir) ? 2 : parsedSubmaxRir,
        settings.estimationFormula
      );
      newEstimatedRM = calcRM;
      if (exercise.referenceData) {
        history.unshift(exercise.referenceData);
      }
      newRef = {
        id: `ref_${Date.now()}`,
        type: 'submax_set',
        weight: parsedSubmaxW,
        reps: parsedSubmaxReps,
        rir: isNaN(parsedSubmaxRir) ? 2 : parsedSubmaxRir,
        estimated1RM: calcRM,
        updatedAt: nowIso,
      };
    } else if (mode === 'direct' && !isNaN(parsedDirectRM) && parsedDirectRM > 0) {
      newEstimatedRM = roundToOneDecimal(parsedDirectRM);
      if (
        !exercise.referenceData ||
        exercise.estimated1RM !== newEstimatedRM
      ) {
        if (exercise.referenceData) {
          history.unshift(exercise.referenceData);
        }
        newRef = {
          id: `ref_${Date.now()}`,
          type: 'direct_1rm',
          weight: newEstimatedRM,
          estimated1RM: newEstimatedRM,
          updatedAt: nowIso,
        };
      }
    }

    const updated: Exercise = {
      ...exercise,
      estimated1RM: newEstimatedRM,
      referenceData: newRef,
      referenceHistory: history.slice(0, 15),
      equipmentIncrement: parsedIncrement,
      minEquipmentLoad: parsedMinLoad,
      defaultTargetRIR: parsedTargetRIR,
      manualLoads: useManualOverride
        ? {
            effective:
              parseFloat(manualEffective) > 0
                ? parseFloat(manualEffective)
                : null,
            approach:
              parseFloat(manualApproach) > 0 ? parseFloat(manualApproach) : null,
            warmup:
              parseFloat(manualWarmup) > 0 ? parseFloat(manualWarmup) : null,
          }
        : undefined,
    };

    onSave(updated);
    onClose();
  };

  const handleClearRM = () => {
    const history = [...(exercise.referenceHistory || [])];
    if (exercise.referenceData) {
      history.unshift(exercise.referenceData);
    }
    onSave({
      ...exercise,
      estimated1RM: null,
      referenceData: null,
      referenceHistory: history.slice(0, 15),
      manualLoads: undefined,
    });
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="native-modal-dialog modal-large"
    >
      <form onSubmit={handleSave} className="modal-dialog-inner">
        <div className="modal-header-row">
          <h2 id={titleId} className="modal-title">
            <Calculator size={20} aria-hidden="true" /> Configurar carga:{' '}
            {exercise.name}
          </h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Cerrar configuración de carga"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="info-banner">
          <Info size={18} aria-hidden="true" className="info-icon" />
          <p>
            <strong>No necesitas probar un peso máximo (1RM real).</strong>{' '}
            Introduce una serie reciente que hayas hecho con buena técnica y la
            app estimará tus pesos de calentamiento, aproximación y trabajo.
            Recuerda que son estimaciones orientativas y cada máquina puede
            variar.
          </p>
        </div>

        <div className="segmented-control" role="group" aria-label="Método de cálculo">
          <button
            type="button"
            className={`segment-btn ${mode === 'submax' ? 'active' : ''}`}
            onClick={() => setMode('submax')}
          >
            Serie de referencia (Recomendado)
          </button>
          <button
            type="button"
            className={`segment-btn ${mode === 'direct' ? 'active' : ''}`}
            onClick={() => setMode('direct')}
          >
            1RM estimado directo
          </button>
        </div>

        {mode === 'submax' ? (
          <div className="form-grid-3">
            <div className="form-field">
              <label htmlFor="submax-weight">Peso usado (kg)</label>
              <input
                id="submax-weight"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                placeholder="Ej. 25"
                value={submaxWeight}
                onChange={(e) => setSubmaxWeight(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-field">
              <label htmlFor="submax-reps">Repeticiones hechas</label>
              <input
                id="submax-reps"
                type="number"
                inputMode="numeric"
                min="1"
                max="30"
                placeholder="Ej. 10"
                value={submaxReps}
                onChange={(e) => setSubmaxReps(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="submax-rir">RIR (en reserva)</label>
              <select
                id="submax-rir"
                value={submaxRir}
                onChange={(e) => setSubmaxRir(e.target.value)}
              >
                <option value="0">0 (al límite)</option>
                <option value="1">1 rep en reserva</option>
                <option value="2">2 reps en reserva (ideal)</option>
                <option value="3">3 reps en reserva</option>
                <option value="4">4 reps en reserva</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="form-field">
            <label htmlFor="direct-rm">1RM estimado (kg)</label>
            <input
              id="direct-rm"
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              placeholder="Ej. 35"
              value={directRM}
              onChange={(e) => setDirectRM(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="form-grid-3" style={{ marginTop: '0.75rem' }}>
          <div className="form-field">
            <label htmlFor="equip-inc">Salto de la máquina (kg)</label>
            <select
              id="equip-inc"
              value={increment}
              onChange={(e) => setIncrement(e.target.value)}
            >
              <option value="1">1 kg</option>
              <option value="1.25">1,25 kg</option>
              <option value="2">2 kg</option>
              <option value="2.5">2,5 kg</option>
              <option value="5">5 kg</option>
              <option value="10">10 kg</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="equip-min">Peso mínimo equipo (kg)</label>
            <input
              id="equip-min"
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              value={minLoad}
              onChange={(e) => setMinLoad(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="target-rir">RIR objetivo en efectivas</label>
            <select
              id="target-rir"
              value={targetRIR}
              onChange={(e) => setTargetRIR(e.target.value)}
            >
              <option value="1">RIR 1 (esfuerzo alto)</option>
              <option value="2">RIR 2 (recomendado)</option>
              <option value="3">RIR 3 (moderado / seguro)</option>
            </select>
          </div>
        </div>

        {/* Vista previa de sugerencias calculadas */}
        <div className="load-preview-box">
          <div className="load-preview-header">
            <span>Sugerencias calculadas (redondeadas hacia abajo)</span>
            {previewEstimatedRM ? (
              <span className="rm-pill">1RM est.: {previewEstimatedRM} kg</span>
            ) : (
              <span className="rm-pill muted">Sin RM aún</span>
            )}
          </div>
          {previewLoads.hasConfiguredLoad ? (
            <ul className="load-preview-list">
              <li>
                <span className="badge badge-warmup">Calentamiento</span>
                <strong>{previewLoads.warmupLoad} kg</strong> ×{' '}
                {exercise.prepConfig.warmupRepsLabel || '12–15 reps'}
              </li>
              <li>
                <span className="badge badge-approach">Aproximación</span>
                <strong>{previewLoads.approachLoad} kg</strong> ×{' '}
                {exercise.prepConfig.approachRepsLabel || '6–8 reps'}
              </li>
              <li>
                <span className="badge badge-effective">Serie Efectiva</span>
                <strong>{previewLoads.effectiveLoad} kg</strong> ×{' '}
                {templateItem?.repRangeLabel ?? exercise.repRangeLabel} (RIR{' '}
                {previewLoads.targetRIR})
              </li>
            </ul>
          ) : (
            <p className="muted-text">
              Introduce los datos arriba para ver las cargas sugeridas.
            </p>
          )}
        </div>

        {/* Opción para editar manualmente la carga sugerida */}
        <div className="manual-override-box">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useManualOverride}
              onChange={(e) => setUseManualOverride(e.target.checked)}
            />
            <Sliders size={16} aria-hidden="true" /> Ajustar manualmente las
            cargas sugeridas
          </label>

          {useManualOverride && (
            <div className="form-grid-3" style={{ marginTop: '0.5rem' }}>
              <div className="form-field">
                <label htmlFor="man-warmup">Calentamiento (kg)</label>
                <input
                  id="man-warmup"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  placeholder={
                    previewLoads.warmupLoad ? String(previewLoads.warmupLoad) : ''
                  }
                  value={manualWarmup}
                  onChange={(e) => setManualWarmup(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="man-approach">Aproximación (kg)</label>
                <input
                  id="man-approach"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  placeholder={
                    previewLoads.approachLoad
                      ? String(previewLoads.approachLoad)
                      : ''
                  }
                  value={manualApproach}
                  onChange={(e) => setManualApproach(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="man-effective">Efectiva (kg)</label>
                <input
                  id="man-effective"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  placeholder={
                    previewLoads.effectiveLoad
                      ? String(previewLoads.effectiveLoad)
                      : ''
                  }
                  value={manualEffective}
                  onChange={(e) => setManualEffective(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Historial de referencia */}
        {(exercise.referenceData ||
          (exercise.referenceHistory && exercise.referenceHistory.length > 0)) && (
          <div className="rm-history-box">
            <h4>
              <History size={15} aria-hidden="true" /> Historial de referencia
            </h4>
            {exercise.referenceData && (
              <p className="rm-current-meta">
                Actualizado el{' '}
                <strong>
                  {formatLocalDateSpanish(exercise.referenceData.updatedAt)}
                </strong>
                :{' '}
                {exercise.referenceData.type === 'submax_set'
                  ? `${exercise.referenceData.weight} kg × ${exercise.referenceData.reps} reps (RIR ${exercise.referenceData.rir}) → 1RM est. ${exercise.referenceData.estimated1RM} kg`
                  : `1RM directo ${exercise.referenceData.estimated1RM} kg`}
              </p>
            )}
            {exercise.referenceHistory && exercise.referenceHistory.length > 0 && (
              <ul className="rm-history-list">
                {exercise.referenceHistory.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    {formatLocalDateSpanish(item.updatedAt)}: 1RM est.{' '}
                    {item.estimated1RM} kg (
                    {item.type === 'submax_set'
                      ? `${item.weight} kg × ${item.reps} reps`
                      : 'Directo'}
                    )
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="modal-actions">
          {exercise.estimated1RM !== null && (
            <button
              type="button"
              className="btn btn-ghost-danger"
              onClick={handleClearRM}
            >
              Borrar RM
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Guardar carga
          </button>
        </div>
      </form>
    </dialog>
  );
};
