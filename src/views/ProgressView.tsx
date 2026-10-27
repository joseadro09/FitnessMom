import React, { useState } from 'react';
import {
  Exercise,
  SetLog,
  Settings,
  WorkoutSession,
  WorkoutTemplate,
} from '../types';
import {
  estimate1RMFromSubmax,
  formatLocalDateSpanish,
  formatTimeSpanish,
} from '../utils/calculations';
import {
  Calendar,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Edit3,
  ExternalLink,
  History,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { LoadConfigModal } from '../components/LoadConfigModal';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface ProgressViewProps {
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  sessions: WorkoutSession[];
  setLogs: SetLog[];
  settings: Settings;
  onUpdateExercise: (updated: Exercise) => void;
  onUpsertSetLog: (updated: SetLog, undoDesc?: string) => void;
  onDeleteSetLog: (logId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenPastSession: (session: WorkoutSession) => void;
}

export const ProgressView: React.FC<ProgressViewProps> = ({
  exercises,
  sessions,
  setLogs,
  settings,
  onUpdateExercise,
  onUpsertSetLog,
  onDeleteSetLog,
  onDeleteSession,
  onOpenPastSession,
}) => {
  const strengthExercises = exercises.filter((e) => e.category !== 'cardio');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    strengthExercises.find((e) => e.id === 'hip-thrust-maquina')?.id ||
      strengthExercises[0]?.id ||
      ''
  );
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    sessions[0]?.id || null
  );
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState<string>('');
  const [editReps, setEditReps] = useState<string>('');
  const [configModalEx, setConfigModalEx] = useState<Exercise | null>(null);
  const [sessionToDelete, setSessionToDelete] =
    useState<WorkoutSession | null>(null);

  const selectedExercise =
    strengthExercises.find((e) => e.id === selectedExerciseId) ||
    strengthExercises[0];

  // Obtener evolución de series efectivas completadas para el ejercicio seleccionado
  const exerciseEffectiveLogs = setLogs
    .filter(
      (l) =>
        l.exerciseId === selectedExercise?.id &&
        l.status === 'completed' &&
        l.setType === 'effective' &&
        l.actualLoad !== null &&
        l.actualReps !== null
    )
    .map((l) => {
      const sess = sessions.find((s) => s.id === l.sessionId);
      const dateStr = sess?.date || (l.completedAt || '').split('T')[0];
      const est1RM = estimate1RMFromSubmax(
        l.actualLoad!,
        l.actualReps!,
        l.actualRIR ?? 2,
        settings.estimationFormula
      );
      return {
        ...l,
        sessionDate: dateStr,
        estimatedSet1RM: est1RM,
      };
    })
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

  // Agrupar mejor serie efectiva por fecha de sesión para la gráfica
  const chartPoints = React.useMemo(() => {
    const byDate = new Map<
      string,
      {
        date: string;
        bestWeight: number;
        bestReps: number;
        best1RM: number;
      }
    >();
    for (const log of exerciseEffectiveLogs) {
      const existing = byDate.get(log.sessionDate);
      if (!existing || log.actualLoad! >= existing.bestWeight) {
        byDate.set(log.sessionDate, {
          date: log.sessionDate,
          bestWeight: log.actualLoad!,
          bestReps: log.actualReps!,
          best1RM: log.estimatedSet1RM,
        });
      }
    }
    return Array.from(byDate.values());
  }, [exerciseEffectiveLogs]);

  const latestPerformance =
    exerciseEffectiveLogs.length > 0
      ? exerciseEffectiveLogs[exerciseEffectiveLogs.length - 1]
      : null;

  const sortedSessions = [...sessions].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt)
  );

  const startEditingSet = (log: SetLog) => {
    setEditingSetId(log.id);
    setEditWeight(log.actualLoad !== null ? String(log.actualLoad) : '');
    setEditReps(log.actualReps !== null ? String(log.actualReps) : '');
  };

  const saveEditedSet = (log: SetLog) => {
    const w = editWeight === '' ? null : parseFloat(editWeight);
    const r = editReps === '' ? null : parseInt(editReps, 10);
    onUpsertSetLog(
      {
        ...log,
        actualLoad: w !== null && !isNaN(w) ? w : null,
        actualReps: r !== null && !isNaN(r) ? r : null,
        missingDetails: w === null || r === null,
      },
      'Serie corregida en el historial'
    );
    setEditingSetId(null);
  };

  return (
    <div className="view-container">
      <header className="page-section-header">
        <h1>
          <TrendingUp size={24} aria-hidden="true" /> Progreso e Historial
        </h1>
        <p>
          Consulta cómo evolucionan tus cargas y revisa o corrige cualquier
          sesión pasada.
        </p>
      </header>

      {/* SECCIÓN 1: EVOLUCIÓN POR EJERCICIO */}
      {selectedExercise && (
        <section
          className="section-block card-panel"
          aria-labelledby="ex-evo-heading"
        >
          <div className="panel-header-row">
            <h2 id="ex-evo-heading">
              <Dumbbell size={19} aria-hidden="true" /> Evolución por ejercicio
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setConfigModalEx(selectedExercise)}
            >
              <Calculator size={15} aria-hidden="true" /> Configurar RM
            </button>
          </div>

          <div className="form-field" style={{ marginTop: '0.5rem' }}>
            <label htmlFor="select-progress-ex">Selecciona un ejercicio</label>
            <select
              id="select-progress-ex"
              value={selectedExercise.id}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
            >
              {strengthExercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tarjetas de estado de RM y Última Carga */}
          <div className="evo-metrics-grid">
            <div className="evo-metric-box">
              <span className="evo-metric-label">Último rendimiento</span>
              {latestPerformance ? (
                <>
                  <strong className="evo-metric-value">
                    {latestPerformance.actualLoad} kg ×{' '}
                    {latestPerformance.actualReps} reps
                  </strong>
                  <span className="evo-metric-sub">
                    Registrado el{' '}
                    {formatLocalDateSpanish(latestPerformance.sessionDate)}
                  </span>
                </>
              ) : (
                <>
                  <strong className="evo-metric-value muted">
                    Sin registros aún
                  </strong>
                  <span className="evo-metric-sub">
                    Se mostrará al registrar tu primera serie efectiva
                  </span>
                </>
              )}
            </div>

            <div className="evo-metric-box">
              <span className="evo-metric-label">1RM estimado de referencia</span>
              {selectedExercise.estimated1RM ? (
                <>
                  <strong className="evo-metric-value">
                    {selectedExercise.estimated1RM} kg
                  </strong>
                  <span className="evo-metric-sub">
                    {selectedExercise.referenceData
                      ? selectedExercise.referenceData.type === 'submax_set'
                        ? `Fuente: serie de ${selectedExercise.referenceData.weight} kg × ${selectedExercise.referenceData.reps} reps (RIR ${selectedExercise.referenceData.rir}) el ${formatLocalDateSpanish(selectedExercise.referenceData.updatedAt)}`
                        : `Fuente: 1RM directo el ${formatLocalDateSpanish(selectedExercise.referenceData.updatedAt)}`
                      : 'Estimación orientativa'}
                  </span>
                </>
              ) : (
                <>
                  <strong className="evo-metric-value muted">
                    No configurado
                  </strong>
                  <span className="evo-metric-sub">
                    Toca “Configurar RM” para calcular cargas sugeridas
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Gráfica SVG sencilla de evolución + Tabla accesible */}
          {chartPoints.length > 0 ? (
            <div className="chart-section">
              <figure className="evo-chart-figure">
                <figcaption className="chart-caption">
                  Evolución de carga efectiva máxima (kg) en{' '}
                  {selectedExercise.name}
                </figcaption>
                <svg
                  viewBox="0 0 420 150"
                  className="evo-svg-chart"
                  role="img"
                  aria-label={`Gráfica de evolución de peso para ${selectedExercise.name}`}
                >
                  <title>Evolución de peso en {selectedExercise.name}</title>
                  {(() => {
                    const maxW = Math.max(
                      ...chartPoints.map((p) => p.bestWeight),
                      10
                    );
                    const minW = Math.max(
                      0,
                      Math.min(...chartPoints.map((p) => p.bestWeight)) - 5
                    );
                    const range = Math.max(5, maxW - minW);

                    const coords = chartPoints.map((pt, i) => {
                      const x =
                        chartPoints.length === 1
                          ? 210
                          : 40 +
                            (i / (chartPoints.length - 1)) * (420 - 80);
                      const y =
                        115 - ((pt.bestWeight - minW) / range) * 80;
                      return { ...pt, x, y };
                    });

                    const polylinePoints = coords
                      .map((c) => `${c.x},${c.y}`)
                      .join(' ');

                    return (
                      <>
                        <line
                          x1="30"
                          y1="115"
                          x2="390"
                          y2="115"
                          stroke="#e2e8f0"
                          strokeWidth="1.5"
                        />
                        {coords.length > 1 && (
                          <polyline
                            fill="none"
                            stroke="#be185d"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={polylinePoints}
                          />
                        )}
                        {coords.map((c, idx) => (
                          <g key={idx}>
                            <circle
                              cx={c.x}
                              cy={c.y}
                              r="5"
                              fill="#be185d"
                              stroke="#ffffff"
                              strokeWidth="2"
                            />
                            <text
                              x={c.x}
                              y={c.y - 10}
                              textAnchor="middle"
                              fontSize="11"
                              fontWeight="700"
                              fill="#831843"
                            >
                              {c.bestWeight} kg
                            </text>
                            <text
                              x={c.x}
                              y="135"
                              textAnchor="middle"
                              fontSize="10"
                              fill="#64748b"
                            >
                              {formatLocalDateSpanish(c.date)}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </figure>

              <div className="table-responsive">
                <table className="accessible-data-table">
                  <caption>
                    Series efectivas registradas de {selectedExercise.name}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Serie</th>
                      <th scope="col">Carga × Reps</th>
                      <th scope="col">RIR</th>
                      <th scope="col">1RM est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exerciseEffectiveLogs
                      .slice()
                      .reverse()
                      .slice(0, 10)
                      .map((log) => (
                        <tr key={log.id}>
                          <td>{formatLocalDateSpanish(log.sessionDate)}</td>
                          <td>Efectiva {log.typeIndex}</td>
                          <td>
                            <strong>
                              {log.actualLoad} kg × {log.actualReps}
                            </strong>
                          </td>
                          <td>
                            {log.actualRIR !== null
                              ? `RIR ${log.actualRIR}`
                              : '—'}
                          </td>
                          <td>~{log.estimatedSet1RM} kg</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state-box">
              <p>
                Aún no hay series efectivas completadas para{' '}
                <strong>{selectedExercise.name}</strong>. Cuando registres tus
                series en la pestaña Rutina, verás aquí tu gráfica y tabla de
                evolución.
              </p>
            </div>
          )}

          {/* Historial de actualizaciones del RM de referencia */}
          {selectedExercise.referenceHistory &&
            selectedExercise.referenceHistory.length > 0 && (
              <div className="rm-past-history">
                <h3>Referencias de RM anteriores conservadas</h3>
                <ul>
                  {selectedExercise.referenceHistory.map((ref) => (
                    <li key={ref.id}>
                      <strong>{formatLocalDateSpanish(ref.updatedAt)}:</strong>{' '}
                      1RM estimado de {ref.estimated1RM} kg (
                      {ref.type === 'submax_set'
                        ? `serie de ${ref.weight} kg × ${ref.reps} reps @ RIR ${ref.rir}`
                        : '1RM directo'}
                      )
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </section>
      )}

      {/* SECCIÓN 2: HISTORIAL DE SESIONES */}
      <section className="section-block" aria-labelledby="sessions-hist-heading">
        <div className="section-header">
          <h2 id="sessions-hist-heading">
            <History size={20} aria-hidden="true" /> Sesiones registradas
          </h2>
          <p className="section-helper">
            Toca cualquier sesión para revisar o corregir series sin perder el
            resto de tu historial.
          </p>
        </div>

        {sortedSessions.length === 0 ? (
          <div className="empty-state-card">
            <Calendar size={36} aria-hidden="true" />
            <h3>Todavía no hay sesiones registradas</h3>
            <p>
              Ve a <strong>Inicio</strong> o <strong>Rutina</strong> para
              comenzar tu primer entrenamiento y registrar tus series.
            </p>
          </div>
        ) : (
          <div className="sessions-history-list">
            {sortedSessions.map((sess) => {
              const logsForSess = setLogs
                .filter((l) => l.sessionId === sess.id)
                .sort((a, b) => a.setNumber - b.setNumber);
              const completedLogs = logsForSess.filter(
                (l) => l.status === 'completed'
              );
              const effectiveCompleted = completedLogs.filter(
                (l) => l.setType === 'effective'
              );
              const isExpanded = expandedSessionId === sess.id;

              // Agrupar series por ejercicio
              const exIdsInSess = Array.from(
                new Set(completedLogs.map((l) => l.exerciseId))
              );

              return (
                <article key={sess.id} className="history-session-card">
                  <div
                    className="history-session-header"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedSessionId(isExpanded ? null : sess.id)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedSessionId(isExpanded ? null : sess.id);
                      }
                    }}
                  >
                    <div>
                      <div className="history-session-meta">
                        <span className="history-date">
                          {formatLocalDateSpanish(sess.date)}
                        </span>
                        {sess.status === 'completed' ? (
                          <span className="status-pill completed">
                            Completada
                          </span>
                        ) : sess.status === 'in_progress' ? (
                          <span className="status-pill in-progress">
                            En curso
                          </span>
                        ) : (
                          <span className="status-pill incomplete">
                            Sesión incompleta
                          </span>
                        )}
                      </div>
                      <h3 className="history-session-title">
                        {sess.templateName}
                      </h3>
                      <p className="history-session-sub">
                        {exIdsInSess.length} ejercicios con registro •{' '}
                        {effectiveCompleted.length} series efectivas (
                        {completedLogs.length} series totales)
                      </p>
                    </div>
                    <div className="history-chevron">
                      {isExpanded ? (
                        <ChevronUp size={20} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={20} aria-hidden="true" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="history-session-body">
                      <div className="history-session-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onOpenPastSession(sess)}
                        >
                          <ExternalLink size={15} aria-hidden="true" /> Abrir en
                          vista de entrenamiento
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost-danger btn-sm"
                          onClick={() => setSessionToDelete(sess)}
                        >
                          <Trash2 size={15} aria-hidden="true" /> Eliminar
                          sesión
                        </button>
                      </div>

                      {completedLogs.length === 0 ? (
                        <p className="muted-text">
                          No hay series marcadas como realizadas en esta sesión.
                        </p>
                      ) : (
                        <div className="history-exercises-breakdown">
                          {exIdsInSess.map((exId) => {
                            const exObj = exercises.find((e) => e.id === exId);
                            const exSets = completedLogs.filter(
                              (l) => l.exerciseId === exId
                            );
                            return (
                              <div
                                key={exId}
                                className="history-ex-group-card"
                              >
                                <h4>{exObj?.name || exId}</h4>
                                <ul className="history-sets-list">
                                  {exSets.map((log) => {
                                    const isEditingThis =
                                      editingSetId === log.id;
                                    const typeLbl =
                                      log.setType === 'warmup'
                                        ? 'Calentamiento'
                                        : log.setType === 'approach'
                                        ? `Aproximación ${log.typeIndex}`
                                        : `Efectiva ${log.typeIndex}`;

                                    return (
                                      <li
                                        key={log.id}
                                        className="history-set-item"
                                      >
                                        <div className="history-set-info">
                                          <span
                                            className={`badge badge-${log.setType}`}
                                          >
                                            {typeLbl}
                                          </span>
                                          {isEditingThis ? (
                                            <div className="inline-edit-set">
                                              <input
                                                type="number"
                                                step="0.5"
                                                aria-label="Peso en kg"
                                                value={editWeight}
                                                onChange={(e) =>
                                                  setEditWeight(e.target.value)
                                                }
                                                placeholder="kg"
                                              />
                                              <span>kg ×</span>
                                              <input
                                                type="number"
                                                aria-label="Repeticiones"
                                                value={editReps}
                                                onChange={(e) =>
                                                  setEditReps(e.target.value)
                                                }
                                                placeholder="reps"
                                              />
                                              <span>reps</span>
                                              <button
                                                type="button"
                                                className="btn btn-primary btn-xs"
                                                onClick={() =>
                                                  saveEditedSet(log)
                                                }
                                              >
                                                <CheckCircle2
                                                  size={14}
                                                  aria-hidden="true"
                                                />{' '}
                                                Guardar
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-secondary btn-xs"
                                                onClick={() =>
                                                  setEditingSetId(null)
                                                }
                                              >
                                                Cancelar
                                              </button>
                                            </div>
                                          ) : (
                                            <span className="history-set-values">
                                              {exObj?.category === 'cardio' ? (
                                                <strong>
                                                  {log.durationMinutes ??
                                                    log.actualReps ??
                                                    15}{' '}
                                                  min
                                                </strong>
                                              ) : (
                                                <strong>
                                                  {log.actualLoad ?? '—'} kg ×{' '}
                                                  {log.actualReps ?? '—'} reps
                                                </strong>
                                              )}
                                              {log.actualRIR !== null &&
                                                ` (RIR ${log.actualRIR})`}
                                              {log.completedAt && (
                                                <small className="time-muted">
                                                  {' '}
                                                  •{' '}
                                                  {formatTimeSpanish(
                                                    log.completedAt
                                                  )}
                                                </small>
                                              )}
                                            </span>
                                          )}
                                        </div>

                                        {!isEditingThis && (
                                          <div className="history-set-btns">
                                            <button
                                              type="button"
                                              className="icon-btn-sm"
                                              aria-label="Corregir serie"
                                              onClick={() =>
                                                startEditingSet(log)
                                              }
                                            >
                                              <Edit3
                                                size={14}
                                                aria-hidden="true"
                                              />
                                            </button>
                                            <button
                                              type="button"
                                              className="icon-btn-sm danger"
                                              aria-label="Eliminar registro de serie"
                                              onClick={() =>
                                                onDeleteSetLog(log.id)
                                              }
                                            >
                                              <Trash2
                                                size={14}
                                                aria-hidden="true"
                                              />
                                            </button>
                                          </div>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {configModalEx && (
        <LoadConfigModal
          open={Boolean(configModalEx)}
          exercise={configModalEx}
          templateItem={null}
          settings={settings}
          onSave={(updated) => {
            onUpdateExercise(updated);
            setConfigModalEx(null);
          }}
          onClose={() => setConfigModalEx(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(sessionToDelete)}
        title="¿Eliminar esta sesión del historial?"
        description={
          sessionToDelete
            ? `Se eliminará la sesión "${sessionToDelete.templateName}" del ${formatLocalDateSpanish(sessionToDelete.date)} y sus series asociadas. Esta acción no afectará las demás sesiones.`
            : ''
        }
        confirmLabel="Sí, eliminar sesión"
        cancelLabel="Conservar sesión"
        variant="danger"
        onConfirm={() => {
          if (sessionToDelete) {
            onDeleteSession(sessionToDelete.id);
            setSessionToDelete(null);
          }
        }}
        onCancel={() => setSessionToDelete(null)}
      />
    </div>
  );
};
