import React from 'react';
import {
  Exercise,
  SetLog,
  WorkoutSession,
  WorkoutTemplate,
} from '../types';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Coffee,
  Dumbbell,
  Play,
  RotateCcw,
  Sparkles,
  Download,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import {
  getDateForDayOfWeekInCurrentWeek,
  getDayOfWeek1To7,
  getMondayOfCurrentWeekISO,
} from '../utils/calculations';

interface HomeViewProps {
  templates: WorkoutTemplate[];
  exercises: Exercise[];
  sessions: WorkoutSession[];
  setLogs: SetLog[];
  onOpenDayRoutine: (template: WorkoutTemplate, targetDateISO: string) => void;
  canInstallPwa: boolean;
  onInstallPwa: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  templates,
  exercises,
  sessions,
  setLogs,
  onOpenDayRoutine,
  canInstallPwa,
  onInstallPwa,
}) => {
  const today = new Date();
  const todayDayNum = getDayOfWeek1To7(today);
  const currentWeekMonday = getMondayOfCurrentWeekISO(today);

  // Obtener la sesión de esta semana para un template dado
  const getWeekSessionForTemplate = (
    templateId: string
  ): WorkoutSession | undefined => {
    const matching = sessions.filter(
      (s) =>
        s.templateId === templateId && s.weekStartDate === currentWeekMonday
    );
    if (matching.length === 0) return undefined;
    return matching.sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt)
    )[0];
  };

  const todayTemplate =
    templates.find((t) => t.dayOfWeek === todayDayNum) || templates[0];
  const todayDateISO = getDateForDayOfWeekInCurrentWeek(
    todayTemplate.dayOfWeek,
    today
  );
  const todaySession = getWeekSessionForTemplate(todayTemplate.id);

  // Encontrar el siguiente día de entrenamiento
  const workoutTemplates = templates.filter((t) => !t.isRestDay);
  const nextWorkoutTemplate =
    workoutTemplates.find((t) => t.dayOfWeek > todayDayNum) ||
    workoutTemplates[0];

  // Calcular progreso semanal (de los 4 días de entrenamiento)
  const completedWorkoutsThisWeek = workoutTemplates.filter((t) => {
    const sess = getWeekSessionForTemplate(t.id);
    return sess?.status === 'completed';
  }).length;

  const inProgressWorkoutsThisWeek = workoutTemplates.filter((t) => {
    const sess = getWeekSessionForTemplate(t.id);
    return sess?.status === 'in_progress' || sess?.status === 'incomplete';
  }).length;

  const weekSessionIds = new Set(
    sessions
      .filter((s) => s.weekStartDate === currentWeekMonday)
      .map((s) => s.id)
  );
  const effectiveSetsThisWeek = setLogs.filter(
    (l) =>
      weekSessionIds.has(l.sessionId) &&
      l.status === 'completed' &&
      l.setType === 'effective'
  ).length;

  const renderStatusBadge = (
    tpl: WorkoutTemplate,
    sess: WorkoutSession | undefined
  ) => {
    if (tpl.isRestDay) {
      return <span className="status-pill rest">Descanso</span>;
    }
    if (!sess || sess.status === 'pending') {
      return <span className="status-pill pending">Pendiente</span>;
    }
    if (sess.status === 'in_progress') {
      return <span className="status-pill in-progress">En curso</span>;
    }
    if (sess.status === 'completed') {
      return <span className="status-pill completed">Completada</span>;
    }
    return <span className="status-pill incomplete">Sesión incompleta</span>;
  };

  return (
    <div className="view-container">
      {/* Banner de bienvenida y progreso semanal */}
      <section className="hero-card" aria-labelledby="hero-heading">
        <div className="hero-top-row">
          <div>
            <span className="eyebrow-tag">
              <Sparkles size={14} aria-hidden="true" /> Plan Upper / Lower •
              Énfasis Glúteos
            </span>
            <h1 id="hero-heading" className="hero-title">
              ¡Hola, mamá! Tu rutina de hoy
            </h1>
          </div>
          {canInstallPwa && (
            <button
              type="button"
              className="btn btn-install-pill"
              onClick={onInstallPwa}
            >
              <Download size={16} aria-hidden="true" /> Instalar App
            </button>
          )}
        </div>

        {/* Resumen de hoy */}
        <div className="today-highlight-box">
          <div className="today-meta-row">
            <span className="today-day-badge">Hoy • {todayTemplate.dayName}</span>
            {renderStatusBadge(todayTemplate, todaySession)}
          </div>

          <h2 className="today-routine-title">{todayTemplate.name}</h2>

          {todayTemplate.isRestDay ? (
            <div className="rest-day-callout">
              <Coffee size={22} aria-hidden="true" />
              <p>
                {todayTemplate.restMessage ||
                  'Día de descanso. Puedes descansar o hacer una caminata suave.'}
              </p>
            </div>
          ) : (
            <>
              <p className="today-routine-subtitle">
                {todayTemplate.subtitle} • {todayTemplate.exercises.length}{' '}
                ejercicios
              </p>
              <div className="today-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-lg btn-block"
                  onClick={() => onOpenDayRoutine(todayTemplate, todayDateISO)}
                >
                  {todaySession?.status === 'in_progress' ? (
                    <>
                      <Play size={20} aria-hidden="true" /> Continuar rutina de
                      hoy
                    </>
                  ) : todaySession?.status === 'completed' ? (
                    <>
                      <RotateCcw size={20} aria-hidden="true" /> Ver o editar
                      rutina completada
                    </>
                  ) : (
                    <>
                      <Play size={20} aria-hidden="true" /> Comenzar rutina de
                      hoy
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Estadísticas rápidas de la semana */}
        <div className="week-stats-grid">
          <div className="stat-mini-card">
            <span className="stat-value">
              {completedWorkoutsThisWeek} / {workoutTemplates.length}
            </span>
            <span className="stat-label">Rutinas cumplidas</span>
          </div>
          <div className="stat-mini-card">
            <span className="stat-value">{effectiveSetsThisWeek}</span>
            <span className="stat-label">Series efectivas</span>
          </div>
          <div className="stat-mini-card">
            <span className="stat-value">{nextWorkoutTemplate.dayName}</span>
            <span className="stat-label">
              Siguiente: {nextWorkoutTemplate.shortName}
            </span>
          </div>
        </div>
      </section>

      {/* Calendario Semanal Completo (7 días) */}
      <section className="section-block" aria-labelledby="calendar-heading">
        <div className="section-header">
          <h2 id="calendar-heading">
            <Calendar size={20} aria-hidden="true" /> Calendario semanal
          </h2>
          <p className="section-helper">
            Puedes abrir cualquier día para adelantar o recuperar una sesión
            pospuesta.
          </p>
        </div>

        <div className="weekly-calendar-list">
          {templates.map((tpl) => {
            const isToday = tpl.dayOfWeek === todayDayNum;
            const dateISO = getDateForDayOfWeekInCurrentWeek(
              tpl.dayOfWeek,
              today
            );
            const sess = getWeekSessionForTemplate(tpl.id);
            const completedSetsCount = sess
              ? setLogs.filter(
                  (l) => l.sessionId === sess.id && l.status === 'completed'
                ).length
              : 0;

            return (
              <div
                key={tpl.id}
                className={`calendar-day-card ${isToday ? 'is-today' : ''} ${
                  tpl.isRestDay ? 'is-rest' : 'is-workout'
                } ${sess?.status ? `status-${sess.status}` : ''}`}
              >
                <div className="calendar-day-main">
                  <div className="calendar-day-top">
                    <span className="calendar-day-name">
                      {tpl.dayName}
                      {isToday && <span className="today-dot">HOY</span>}
                    </span>
                    {renderStatusBadge(tpl, sess)}
                  </div>

                  <h3 className="calendar-routine-name">{tpl.name}</h3>

                  {tpl.isRestDay ? (
                    <p className="calendar-rest-text">
                      {tpl.restMessage ||
                        'Día de descanso. Puedes descansar o hacer una caminata suave.'}
                    </p>
                  ) : (
                    <>
                      <p className="calendar-routine-meta">
                        {tpl.subtitle} • {tpl.exercises.length} ejercicios
                        {completedSetsCount > 0 &&
                          ` • ${completedSetsCount} series registradas`}
                      </p>
                      <div className="calendar-exercise-chips">
                        {tpl.exercises.slice(0, 4).map((item) => {
                          const ex = exercises.find(
                            (e) => e.id === item.exerciseId
                          );
                          return ex ? (
                            <span key={item.order} className="ex-mini-chip">
                              {ex.name.split('(')[0].trim()}
                            </span>
                          ) : null;
                        })}
                        {tpl.exercises.length > 4 && (
                          <span className="ex-mini-chip more">
                            +{tpl.exercises.length - 4} más
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {!tpl.isRestDay && (
                  <div className="calendar-day-action">
                    <button
                      type="button"
                      className={`btn ${
                        isToday ? 'btn-primary' : 'btn-secondary'
                      } btn-sm`}
                      onClick={() => onOpenDayRoutine(tpl, dateISO)}
                    >
                      {sess?.status === 'in_progress' ? (
                        <>
                          <Clock size={16} aria-hidden="true" /> Retomar
                        </>
                      ) : sess?.status === 'completed' ? (
                        <>
                          <CheckCircle2 size={16} aria-hidden="true" /> Revisar
                        </>
                      ) : sess?.status === 'incomplete' ? (
                        <>
                          <AlertCircle size={16} aria-hidden="true" /> Completar
                        </>
                      ) : (
                        <>
                          <Dumbbell size={16} aria-hidden="true" /> Abrir rutina
                        </>
                      )}
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {inProgressWorkoutsThisWeek > 0 && (
          <p className="helper-note">
            Tienes una sesión iniciada esta semana. Puedes retomarla en
            cualquier momento sin perder tus series registradas.
          </p>
        )}
      </section>
    </div>
  );
};
